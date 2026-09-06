import dotenv from "dotenv";
import fs from 'fs';
import path from 'path'
import { marketPost, post, sellerShouldGet, waitForAssetIdByMarketId, getInvAssets } from "./helpers/helpers.js";
import { getAvailableBases, addBasis } from "./helpers/basisTracker.js";
import { syncOpenOrders } from "./helpers/orderSync.js";
import db from "./db/database.js";
dotenv.config();

// ================= CONFIG =================

const MIN_PROFIT = 0.01;     // %8 net kâr
const FEE = 0.3;            // %15 Gaijin komisyonu
const COOLDOWN = 60_000;     // 60 saniye
const DRY_RUN = true;        // true = sadece log
const token = process.env.TOKEN;

let standingOrders: any[] = [];
const ignore: string[] = [];
const ignoreBasisItems: string[] = []; // Items in this list will be sold regardless of profitability
const IGNORE_ALL_BASIS = true; // Set to true to bypass basis checks for all items (liquidate mode)
function isCancelled(orderId: number): boolean {
    const row = db.prepare('SELECT id FROM CancelledOrders WHERE id = ?').get(orderId);
    return !!row;
}

function recordCancelled(orderId: number) {
    db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)').run(orderId);
}

function sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}



const checkStandingOrders = async () => {

    const fetchedOrders = await syncOpenOrders();

    let pendingItems: any[] = [...fetchedOrders];
    const newSellOrdersCount: Record<string, number> = {};
    const activeOrdersTracker: any[] = [...pendingItems];

    const assignedBasesIndex: Record<string, number> = {};

    for (let i in pendingItems) {
        const item = pendingItems[i]

        if (ignore.includes(item.market)) {
            continue
        };

        const userBid = item.localPrice / 10000

        const market = await post({
            action: "cln_books_brief",
            market_name: item.market,
            appid: 1067,
            token,
        })

        let trueHighestCompetitorBuy: number | null = null;
        for (const [priceStr, amount] of market.response.BUY) {
            const price = priceStr / 10000;
            const ourOrdersCount = activeOrdersTracker.filter(o => o.type === "BUY" && o.market === item.market && o.localPrice / 10000 === price).length;
            if (amount > ourOrdersCount) {
                trueHighestCompetitorBuy = price;
                break;
            }
        }
        if (trueHighestCompetitorBuy === null) trueHighestCompetitorBuy = 0;

        let trueLowestCompetitorSell: number | null = null;
        for (const [priceStr, amount] of market.response.SELL) {
            const price = priceStr / 10000;
            const ourOrdersCount = activeOrdersTracker.filter(o => o.type === "SELL" && o.market === item.market && o.localPrice / 10000 === price).length;
            if (amount > ourOrdersCount) {
                trueLowestCompetitorSell = price;
                break;
            }
        }
        if (trueLowestCompetitorSell === null) trueLowestCompetitorSell = (market.response.BUY[0]?.[0] / 10000) + 0.01 || 0;

        const highestBid = trueHighestCompetitorBuy;
        const lowestSell = trueLowestCompetitorSell;



        if (item.type == "BUY") {
            console.log("BUY:", item.market)

            const unnecessarilyHighBuy = (item.localPrice / 10000) > (trueHighestCompetitorBuy + 0.01) + 0.005;

            console.log("unnecessarily high? ", unnecessarilyHighBuy)
            console.log(item.localPrice / 10000, trueHighestCompetitorBuy)

            const unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT

            console.log("profit ölçer:", lowestSell * 0.85, highestBid, unprofitable)

            if (unprofitable) {
                continue;
            }


            if (userBid < highestBid && (lowestSell * 0.85 - highestBid) > MIN_PROFIT || unnecessarilyHighBuy) {

                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                })

                if (!res1?.response?.success) {
                    console.log("Failed to cancel BUY order, skipping relist.");
                    continue;
                }

                console.log("BUY:", item.market)

                const priceToSet = Math.round((trueHighestCompetitorBuy + 0.01) * 10000);

                const res = await post({
                    action: "cln_market_buy",
                    orderId: item.id,
                    pairId: item.pairId,
                    price: priceToSet,
                    privateMode: true,
                    appid: 1067,
                    market_name: item.market,
                    currencyid: "gjn",
                    amount: 1,
                    transactid: Math.round(Math.random() * 100000),
                    reqstamp: Date.now(),
                    token
                })

                if (res?.response?.success) {
                    activeOrdersTracker.push({
                        type: "BUY",
                        market: item.market,
                        localPrice: priceToSet
                    });
                }
            }
        }
        else {

            console.log("Sell tipi işlem")

            const unnecessarilyLowSell = (item.localPrice / 10000) < (trueLowestCompetitorSell - 0.01) - 0.005;

            if (unnecessarilyLowSell) console.log("çok uCUZA SATIYOZ")

            const basisIndex = assignedBasesIndex[item.market] || 0;
            assignedBasesIndex[item.market] = basisIndex + 1;
            const availableBases = getAvailableBases(item.market);
            const trueBasis = availableBases[basisIndex] || highestBid; // Fallback to highestBid if not found

            const unprofitable = !IGNORE_ALL_BASIS && !ignoreBasisItems.includes(item.market) && (lowestSell * 0.85 - trueBasis < MIN_PROFIT);


            function extractMarketId(marketName: string) {
                const match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
                return match ? Number(match[1]) : null;
            }

            console.log("SELL:", item.market)
            let normalID = extractMarketId(item.market)
            if (!normalID) {
                console.log("market ID hatalı")
                console.log(item)
                continue;
            };

            if (userBid - lowestSell > 0.50) {
                continue;
            }

            if (unnecessarilyLowSell || userBid > lowestSell) {

                console.log("işlemi başlat")

                if (!unnecessarilyLowSell && unprofitable) {
                    console.log("artık kârsız")
                    continue;
                };

                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                })

                console.log(res1)

                if (!res1?.response?.success) {
                    console.log("Failed to cancel order, skipping relist to avoid orphaned items.");
                    continue;
                }

                if (!normalID) continue;

                const assetID = await waitForAssetIdByMarketId(normalID)

                if (!assetID) {
                    console.log("Failed to get assetID, orphaned item possibly generated.");
                    continue;
                }

                console.log("satılacak itemın assetIDsi:", assetID)

                console.log({
                    orderId: item.id,
                    pairId: item.pairId,
                    market_name: item.market
                })

                const price = Math.round((trueLowestCompetitorSell - 0.01) * 10000);

                const res = await post({
                    action: "cln_market_sell",
                    token: process.env.SELLTOKEN,
                    transactid: Math.round(Math.random() * 100000),
                    reqstamp: Date.now(),
                    appid: 1067,
                    contextid: 1,
                    assetid: assetID,
                    amount: 1,
                    currencyid: "gjn",
                    price,
                    seller_should_get: sellerShouldGet(price),
                    agree_stamp: Date.now(),
                    market_name: item.market,
                    privateMode: false,
                })

                if (res?.response?.error == "WRONG_PRICE") {
                    console.log("\n\nyanlış fiyat\n\n")
                } else if (res?.response?.success) {
                    newSellOrdersCount[item.market] = (newSellOrdersCount[item.market] || 0) + 1;
                    activeOrdersTracker.push({
                        type: "SELL",
                        market: item.market,
                        localPrice: price
                    });
                }
            }
        }

    }

    // ==========================================
    // INVENTORY AUTO-LISTER
    // ==========================================
    try {
        const inv = await getInvAssets();

        let idMap: Record<string, number> = {};
        const idMapRows = db.prepare('SELECT market_name, asset_id FROM IdMap').all() as { market_name: string, asset_id: number }[];
        for (const row of idMapRows) {
            idMap[row.market_name] = row.asset_id;
        }
        const normalIdToMarketName: { [id: string]: string } = {};
        for (const [marketName, normalId] of Object.entries(idMap)) {
            normalIdToMarketName[normalId] = marketName;
        }

        const invByMarket: { [market: string]: any[] } = {};
        for (const item of inv) {
            const market = normalIdToMarketName[item.id];
            if (market) {
                if (!invByMarket[market]) invByMarket[market] = [];
                invByMarket[market].push(item);
            }
        }

        const activeSellOrdersByMarket: Record<string, number> = {};
        for (const item of pendingItems) {
            if (item.type === "SELL" && !isCancelled(item.id)) {
                activeSellOrdersByMarket[item.market] = (activeSellOrdersByMarket[item.market] || 0) + 1;
            }
        }

        for (const market in invByMarket) {
            if (ignore.includes(market)) continue;

            const idleItems = invByMarket[market];
            const activeSellOrdersCount = (activeSellOrdersByMarket[market] || 0) + (newSellOrdersCount[market] || 0);
            const availableBases = getAvailableBases(market);

            if (idleItems.length > 0) {
                const marketBooks = await post({
                    action: "cln_books_brief",
                    market_name: market,
                    appid: 1067,
                    token
                });

                if (!marketBooks?.response?.SELL || !marketBooks?.response?.BUY) continue;
                const lowestSell = marketBooks.response.SELL[0]?.[0] / 10000;
                const highestBid = marketBooks.response.BUY[0]?.[0] / 10000;

                for (let i = 0; i < idleItems.length; i++) {
                    const unassignedBaseIndex = activeSellOrdersCount + i;
                    const basis = availableBases[unassignedBaseIndex] || highestBid; // FALLBACK BASIS
                    const targetPrice = lowestSell - 0.01;
                    const profit = targetPrice * 0.85 - basis;

                    if (profit >= MIN_PROFIT || IGNORE_ALL_BASIS || ignoreBasisItems.includes(market)) {
                        const assetId = idleItems[i].assetId;
                        console.log(`[Auto-Lister] Listing ${market} from inventory! Basis: ${basis} (Fallback: ${!availableBases[unassignedBaseIndex]}, Ignored: ${IGNORE_ALL_BASIS || ignoreBasisItems.includes(market)}), Sell Price: ${targetPrice.toFixed(2)}, Profit: ${profit.toFixed(2)}`);
                        const price = Math.round(targetPrice * 10000);
                        await post({
                            action: "cln_market_sell",
                            token: process.env.SELLTOKEN || token,
                            transactid: Math.round(Math.random() * 100000),
                            reqstamp: Date.now(),
                            appid: 1067,
                            contextid: 1,
                            assetid: assetId,
                            amount: 1,
                            currencyid: "gjn",
                            price,
                            seller_should_get: sellerShouldGet(price),
                            agree_stamp: Date.now(),
                            market_name: market,
                            privateMode: false
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error("⚠️ Auto-Lister error:", err);
    }
}

checkStandingOrders();

function scheduleNextRun() {
    const x = 3
    const delaySec = Math.floor(Math.random() * (x - 1 + 1)) + 1; // 50–150
    const delayMs = delaySec * 1000;

    console.log(`⏱️ Next run in ${delaySec}s`);

    setTimeout(async () => {
        const ACTION_PROBABILITY = 0.5; // %65 ihtimalle sadece bak

        try {
            if (Math.random() > ACTION_PROBABILITY) {
                console.log("👀 sadece izleme turu");
            } else {
                await checkStandingOrders();
            }
        } catch (err) {
            console.error("⚠️ checkStandingOrders error:", err);
        } finally {
            scheduleNextRun();
        }
    }, delayMs);
}


scheduleNextRun();
