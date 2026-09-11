import dotenv from "dotenv";
import fs from 'fs';
import path from 'path'
import { marketPost, post, sellerShouldGet, waitForAssetIdByMarketId, getInvAssets } from "./helpers/helpers.js";
import { getAvailableBases, addBasis } from "./helpers/basisTracker.js";
import { syncOpenOrders } from "./helpers/orderSync.js";
import db from "./db/database.js";
import { getBotSettings, isItemLiquidated } from "./helpers/settingsManager.js";
dotenv.config();

// ================= CONFIG =================

const FEE = 0.3;            // %15 Gaijin komisyonu
const COOLDOWN = 60_000;     // 60 saniye
const token = process.env.TOKEN;

let standingOrders: any[] = [];
const ignore: string[] = [];
const ignoreBasisItems: string[] = []; // Items in this list will be sold regardless of profitability
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
    const settings = getBotSettings();
    const MIN_PROFIT = settings.guardMinProfit;
    const IGNORE_ALL_BASIS = settings.ignoreAllBasis;

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

            // Per-Item Liquidation Safeguard:
            // If item is marked for liquidation, do NOT keep buy orders active! Cancel immediately.
            if (isItemLiquidated(item.market)) {
                console.warn(`[GUARD] Cancelling BUY order for ${item.market}: Item is in LIQUIDATION mode.`);
                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                });
                continue;
            }

            const unnecessarilyHighBuy = (item.localPrice / 10000) > (trueHighestCompetitorBuy + 0.01) + 0.005;

            console.log("unnecessarily high? ", unnecessarilyHighBuy)
            console.log(item.localPrice / 10000, trueHighestCompetitorBuy)

            const unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT;

            if (unprofitable) {
                // If the market price dropped and this buy order is no longer profitable:
                // CANCEL IT IMMEDIATELY to prevent getting dumped on by a falling knife!
                console.warn(`[GUARD] Cancelling UNPROFITABLE BUY order for ${item.market} (Spread: ${(lowestSell * 0.85 - highestBid).toFixed(3)} < ${MIN_PROFIT}).`);
                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                });
                continue;
            }

            // Check Buy Order TTL:
            // If our buy order is outbid (userBid < highestBid) and has been sitting for > buyOrderTtlMinutes
            const orderCreatedAt = item.created_at ? new Date(item.created_at + 'Z').getTime() : Date.now();
            const orderAgeMinutes = (Date.now() - orderCreatedAt) / (60 * 1000);
            const isBuyTtlExpired = (userBid < highestBid) && (orderAgeMinutes >= settings.buyOrderTtlMinutes);

            if (isBuyTtlExpired) {
                console.warn(`[GUARD] Cancelling TTL-EXPIRED BUY order for ${item.market} (Age: ${orderAgeMinutes.toFixed(1)}m >= ${settings.buyOrderTtlMinutes}m).`);
                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                });
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

                // Guard check: make sure another BUY order for this market hasn't appeared
                const anotherBuyExists = activeOrdersTracker.some(o => o.type === "BUY" && o.market === item.market);
                if (anotherBuyExists) {
                    console.warn(`[GUARD] Skipped relisting BUY for ${item.market}: Another BUY order already exists for this market.`);
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
                    const newOrderId = res.response.orderId?.toString() || `pending_${Date.now()}`;
                    activeOrdersTracker.push({
                        id: newOrderId,
                        type: "BUY",
                        market: item.market,
                        localPrice: priceToSet
                    });
                    db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (?, ?, ?, ?, ?)').run(
                        newOrderId,
                        item.pairId || '',
                        item.market,
                        'BUY',
                        priceToSet
                    );
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
            const trueBasis = availableBases[basisIndex];

            const targetUndercutPrice = trueLowestCompetitorSell - 0.01;

            // Inventory Hold Timeout / Auto-Breakeven check:
            // Calculate how long this sell order has been active
            const sellCreatedAt = item.created_at ? new Date(item.created_at + 'Z').getTime() : Date.now();
            const sellAgeHours = (Date.now() - sellCreatedAt) / (60 * 60 * 1000);
            const isHoldTimedOut = sellAgeHours >= settings.inventoryHoldTimeoutHours;

            // If held longer than inventoryHoldTimeoutHours, target breakeven (0.00 GJN profit) to recover capital
            const effectiveMinProfit = isHoldTimedOut ? 0.00 : MIN_PROFIT;

            if (isHoldTimedOut) {
                console.log(`[SELL-GUARD] ${item.market} listed for ${sellAgeHours.toFixed(1)}h >= ${settings.inventoryHoldTimeoutHours}h. Auto-breakeven active.`);
            }

            const isLiquidated = isItemLiquidated(item.market);
            if (isLiquidated) {
                console.log(`[SELL-GUARD] ${item.market} is in PER-ITEM LIQUIDATION mode. Disregarding basis & profit.`);
            }

            const basisUnprofitable = (!IGNORE_ALL_BASIS && !isLiquidated && !ignoreBasisItems.includes(item.market) && trueBasis !== undefined)
                ? (targetUndercutPrice * 0.85 - trueBasis < effectiveMinProfit)
                : false;

            const unprofitable = basisUnprofitable || targetUndercutPrice <= 0;

            function extractMarketId(marketName: string): number | null {
                const row = db.prepare('SELECT asset_id FROM IdMap WHERE market_name = ?').get(marketName) as { asset_id: number } | undefined;
                if (row?.asset_id) return row.asset_id;
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

            if (unnecessarilyLowSell || userBid > lowestSell) {

                console.log("işlemi başlat")

                if (!unnecessarilyLowSell && unprofitable) {
                    console.log(`[SELL-GUARD] ${item.market} undercut kârsız olduğu için yapılmadı. (Kâr: ${(targetUndercutPrice * 0.85 - (trueBasis || 0)).toFixed(2)}, Basis: ${trueBasis ?? 'yok'})`);
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
                    token: process.env.SELLTOKEN || token,
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
                    privateMode: true,
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
                    const basis = availableBases[unassignedBaseIndex];
                    const targetPrice = lowestSell - 0.01;
                    if (targetPrice <= 0) continue;

                    const isLiquidated = isItemLiquidated(market);
                    const basisOk = (IGNORE_ALL_BASIS || isLiquidated || ignoreBasisItems.includes(market) || basis === undefined)
                        ? true
                        : (targetPrice * 0.85 - basis >= MIN_PROFIT);

                    if (basisOk) {
                        const assetId = idleItems[i].assetId;
                        console.log(`[Auto-Lister] Listing ${market} from inventory! Target Price: ${targetPrice.toFixed(2)}, Basis: ${basis ?? 'yok'}`);
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
                            privateMode: true
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error("⚠️ Auto-Lister error:", err);
    }
}

export function startGuardLoop() {
    console.log("[GUARD] Guard service started (Standing Orders & Auto-Lister active).");
    checkStandingOrders();

    function scheduleNextRun() {
        const x = 3;
        const delaySec = Math.floor(Math.random() * (x - 1 + 1)) + 1; // 1-3s
        const delayMs = delaySec * 1000;

        setTimeout(async () => {
            const ACTION_PROBABILITY = 0.5;

            try {
                if (Math.random() > ACTION_PROBABILITY) {
                    // Watch-only cycle
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
}

// If run directly (e.g. node dist/guard.js)
if (process.argv[1]?.includes('guard')) {
    startGuardLoop();
}
