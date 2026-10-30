const failedAssetCooldown = new Map<string | number, number>();
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path'
import { marketPost, post, sellerShouldGet, waitForAssetIdByMarketId, getInvAssets, getWalletBalance } from "./helpers/helpers.js";
import { getAvailableBases, addBasis } from "./helpers/basisTracker.js";
import { syncOpenOrders } from "./helpers/orderSync.js";
import db from "./db/database.js";
import { getBotSettings, isItemLiquidated, getTargetBuys, getTargetBuyConfig, isTargetBuy, isAnyTargetBuy, markTargetBuyAcquired } from "./helpers/settingsManager.js";
dotenv.config();

// ================= CONFIG =================

const FEE = 0.3;            // %15 Gaijin komisyonu
const COOLDOWN = 60_000;     // 60 saniye
const token = process.env.TOKEN;

let standingOrders: any[] = [];
const ignore: string[] = [];
const ignoreBasisItems: string[] = []; // Items in this list will be sold regardless of profitability
function isCancelled(orderId: number | string): boolean {
    try {
        const row = db.prepare('SELECT id FROM CancelledOrders WHERE id = ?').get(String(orderId));
        return !!row;
    } catch {
        return false;
    }
}

function recordCancelled(orderId: number | string) {
    try {
        db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)').run(String(orderId));
    } catch (e) {
        console.error("[GUARD] Error in recordCancelled:", e);
    }
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

        if (item.type === 'SELL' && !settings.enableSelling) {
            // User turned off autonomous SELL management
            continue;
        }

        const userBid = item.localPrice / 10000

        const market = await post({
            action: "cln_books_brief",
            market_name: item.market,
            appid: 1067,
            token,
        })

        if (!Array.isArray(market?.response?.BUY) || !Array.isArray(market?.response?.SELL)) {
            console.warn(`[GUARD] Invalid market response for ${item.market}:`, market?.response || market);
            continue;
        }

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

            // TARGET-BUY (Sniper / Personal Buy) Handler:
            // User wants this item (e.g. KV-220) at the lowest price up to max_price.
            // 1. NEVER cancel for "unprofitable" / "no margin"!
            // 2. Outbid competitors by +0.01 up to max_price.
            // 3. Step down if competitor drops to save money.
            // 4. Never cancel for TTL.
            const targetBuyConfig = getTargetBuyConfig(item.market);
            if (targetBuyConfig && targetBuyConfig.active) {
                const maxAllowedPrice = targetBuyConfig.max_price;
                const idealBid = Number((trueHighestCompetitorBuy + 0.01).toFixed(2));
                const unnecessarilyHigh = userBid > (idealBid + 0.005);
                const isOutbid = userBid < highestBid;

                let needsTargetRelist = false;
                if (isOutbid) {
                    if (idealBid <= maxAllowedPrice) {
                        console.log(`[TARGET-BUY] Outbid on ${item.market}! Relisting: ${userBid.toFixed(2)} -> ${idealBid.toFixed(2)} GJN (Max budget: ${maxAllowedPrice.toFixed(2)} GJN)`);
                        needsTargetRelist = true;
                    } else {
                        console.warn(`[TARGET-BUY] Outbid on ${item.market} (${highestBid.toFixed(2)} GJN), but competitor exceeds max budget (${maxAllowedPrice.toFixed(2)} GJN). Holding bid at ${userBid.toFixed(2)} GJN.`);
                        continue;
                    }
                } else if (unnecessarilyHigh && idealBid <= maxAllowedPrice) {
                    console.log(`[TARGET-BUY] Bid for ${item.market} is unnecessarily high (${userBid.toFixed(2)} vs ideal ${idealBid.toFixed(2)} GJN). Stepping down to save money.`);
                    needsTargetRelist = true;
                }

                if (needsTargetRelist) {
                    recordCancelled(item.id);
                    const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                    if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                    const res1 = await marketPost({
                        action: "cancel_order",
                        pairId: item.pairId,
                        orderId: item.id,
                        token
                    });

                    if (!res1?.response?.success) {
                        console.log("[TARGET-BUY] Failed to cancel order, skipping relist.");
                        continue;
                    }

                    await new Promise(r => setTimeout(r, 400));

                    const priceToSet = Math.round(idealBid * 10000);
                    const buyParams: any = {
                        action: "cln_market_buy",
                        price: priceToSet,
                        privateMode: true,
                        appid: 1067,
                        market_name: item.market,
                        currencyid: "gjn",
                        amount: 1,
                        token
                    };
                    if (item.pairId) buyParams.pairId = item.pairId;

                    const res = await post(buyParams);
                    if (res?.response?.success) {
                        const newOrderId = res.response.orderId?.toString() || `pending_${Date.now()}`;
                        activeOrdersTracker.push({
                            id: newOrderId,
                            type: "BUY",
                            market: item.market,
                            localPrice: priceToSet
                        });
                        db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
                            newOrderId,
                            item.pairId || '',
                            item.market,
                            'BUY',
                            priceToSet
                        );
                        console.log(`[TARGET-BUY] ✅ Successfully placed/relisted top bid for ${item.market} at ${idealBid.toFixed(2)} GJN!`);
                    } else {
                        console.error(`[TARGET-BUY] ❌ Failed to relist BUY for ${item.market}:`, res?.response?.error || res?.error || res);
                    }
                }
                continue;
            }

            const isOutbid = userBid < highestBid;
            const isProfitableToRelist = (lowestSell * 0.85 - (highestBid + 0.01)) > MIN_PROFIT;

            // True Falling Knife Safeguard:
            // Only cancel if lowest sell price dropped below our actual bid price after fee (guaranteed loss if filled).
            const isFallingKnife = (lowestSell * 0.85) < userBid;
            if (isFallingKnife) {
                console.warn(`[GUARD] Cancelling FALLING KNIFE BUY order for ${item.market}: Net sell ${(lowestSell * 0.85).toFixed(2)} < User bid ${userBid.toFixed(2)} GJN.`);
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

            // Unnecessarily High Bid:
            // Only consider stepping down if our bid is top bid AND there is an active competitor buy order (trueHighestCompetitorBuy > 0)
            // AND our bid is strictly more than 0.02 GJN above them.
            const isTopBid = userBid >= highestBid;
            const unnecessarilyHighBuy = isTopBid && (trueHighestCompetitorBuy > 0) && (userBid > (trueHighestCompetitorBuy + 0.02));

            // Check if this order needs relisting (competitor outbid us AND it is profitable to outbid them, OR our bid is unnecessarily high)
            const shouldRelist = (isOutbid && isProfitableToRelist) || unnecessarilyHighBuy;

            if (shouldRelist) {
                recordCancelled(item.id);
                const idx = activeOrdersTracker.findIndex(o => o.id === item.id);
                if (idx !== -1) activeOrdersTracker.splice(idx, 1);

                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                });

                if (!res1?.response?.success) {
                    console.log("[GUARD] Failed to cancel BUY order, skipping relist.");
                    continue;
                }

                // Short sleep so Gaijin's balance reservation releases cleanly
                await new Promise(r => setTimeout(r, 400));

                // Guard check: make sure another BUY order for this market hasn't appeared
                const anotherBuyExists = activeOrdersTracker.some(o => o.type === "BUY" && o.market === item.market);
                if (anotherBuyExists) {
                    console.warn(`[GUARD] Skipped relisting BUY for ${item.market}: Another BUY order already exists for this market.`);
                    continue;
                }

                const priceToSet = Math.round((trueHighestCompetitorBuy + 0.01) * 10000);
                console.log(`[GUARD] Relisting BUY: ${item.market} at ${(priceToSet / 10000).toFixed(2)} GJN`);

                const buyParams: any = {
                    action: "cln_market_buy",
                    price: priceToSet,
                    privateMode: true,
                    appid: 1067,
                    market_name: item.market,
                    currencyid: "gjn",
                    amount: 1,
                    token
                };
                if (item.pairId) buyParams.pairId = item.pairId;

                const res = await post(buyParams);

                if (res?.response?.success) {
                    console.log(`[GUARD] ✅ Successfully relisted BUY order for ${item.market} at ${(priceToSet / 10000).toFixed(2)} GJN`);
                    try {
                        await syncOpenOrders();
                    } catch {}
                } else {
                    console.error(`[GUARD] ❌ Failed to relist BUY for ${item.market}:`, res?.response?.error || res?.error || res);
                }
                continue;
            }

            // Check Buy Order TTL:
            // 1. If outbid: cancel after buyOrderTtlMinutes
            // 2. If top of book but unfulfilled for 2x TTL (e.g. 50 mins): cancel to rotate capital into active markets!
            let orderCreatedAt = item.created_at ? new Date(item.created_at.includes('Z') ? item.created_at : item.created_at + 'Z').getTime() : 0;
            if (!orderCreatedAt || isNaN(orderCreatedAt)) {
                if (typeof item.id === 'string' && item.id.startsWith('pending_')) {
                    orderCreatedAt = Number(item.id.split('_')[1]) || Date.now();
                } else if (item.time) {
                    orderCreatedAt = Number(item.time) * 1000;
                } else {
                    orderCreatedAt = Date.now();
                }
            }

            const orderAgeMinutes = (Date.now() - orderCreatedAt) / (60 * 1000);
            const isOutbidExpired = (userBid < highestBid) && (orderAgeMinutes >= settings.buyOrderTtlMinutes);
            const isStagnantTopBidExpired = (orderAgeMinutes >= settings.buyOrderTtlMinutes * 2);

            if (isOutbidExpired || isStagnantTopBidExpired) {
                console.warn(`[GUARD] Cancelling STALE BUY order for ${item.market} (Age: ${orderAgeMinutes.toFixed(1)}m, Outbid: ${userBid < highestBid}, Stagnant: ${isStagnantTopBidExpired}).`);
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

            // Queue-depth & volume analysis for dynamic safe liquidation
            let queueAhead = 0;
            for (const [pStr, amount] of (market.response?.SELL || [])) {
                const p = pStr / 10000;
                if (p < userBid - 0.001) {
                    queueAhead += amount;
                } else {
                    break;
                }
            }

            let dailyVolume = 10;
            let parsedItemData: any = null;
            try {
                const itemRow = db.prepare('SELECT data FROM Items WHERE hash_name = ?').get(item.market) as { data: string } | undefined;
                if (itemRow?.data) {
                    parsedItemData = JSON.parse(itemRow.data);
                    if (typeof parsedItemData.last2Volume === 'number') {
                        dailyVolume = Math.max(parsedItemData.last2Volume / 2, 0.5);
                    }
                }
            } catch {}

            // Robust Basis Resolution (Problem 1 Fix):
            // If trueBasis is missing from local DB (e.g. external item, unboxed, or DB reset),
            // estimate realistic cost basis so the item is NEVER frozen forever:
            // 1. If 24h avg trade price is available, use that as benchmark.
            // 2. Otherwise assume break-even basis based on current listed price (userBid * 0.85).
            const effectiveBasis = trueBasis !== undefined
                ? trueBasis
                : (parsedItemData?.avgPrice24h && parsedItemData.avgPrice24h > 0
                    ? parsedItemData.avgPrice24h
                    : (userBid * 0.85));

            const isBasisEstimated = trueBasis === undefined;
            if (isBasisEstimated) {
                console.log(`[SELL-GUARD] ${item.market} basis unknown. Using benchmark: ${effectiveBasis.toFixed(2)} GJN (Age: ${sellAgeHours.toFixed(1)}h).`);
            }

            const clearanceTimeHours = (queueAhead / dailyVolume) * 24;

            let isSoftStopLoss = false;
            let isEmergencyDump = false;
            let targetSellPrice = targetUndercutPrice;

            // Safe Gradual Escalation Ladder:
            if (!isLiquidated && settings.enableDynamicLiquidation) {
                const projectedSoftLoss = effectiveBasis - (targetUndercutPrice * 0.85);
                const maxAllowedSoftLoss = effectiveBasis * (settings.softStopLossMaxPercent / 100);

                // Stage 2: Soft Stop-Loss
                // Criteria: Held >= softStopLossMinAgeHours (4.5h), queue ahead >= 2 items, clearance >= queueClearanceThresholdHours (16h)
                // And loss is within softStopLossMaxPercent (5%)
                if (
                    sellAgeHours >= settings.softStopLossMinAgeHours &&
                    queueAhead >= 2 &&
                    clearanceTimeHours >= settings.queueClearanceThresholdHours &&
                    targetUndercutPrice > 0 &&
                    projectedSoftLoss > 0 &&
                    projectedSoftLoss <= maxAllowedSoftLoss
                ) {
                    isSoftStopLoss = true;
                    targetSellPrice = targetUndercutPrice;
                    console.log(`[SAFE-STOP-LOSS] ${item.market} eligible for soft stop-loss! Age: ${sellAgeHours.toFixed(1)}h >= ${settings.softStopLossMinAgeHours}h, Queue: ${queueAhead}, Clearance: ${clearanceTimeHours.toFixed(1)}h >= ${settings.queueClearanceThresholdHours}h. Projected loss: ${projectedSoftLoss.toFixed(2)} GJN (${((projectedSoftLoss / effectiveBasis) * 100).toFixed(1)}% <= ${settings.softStopLossMaxPercent}%). Undercutting to ${targetUndercutPrice.toFixed(2)} GJN.`);
                }

                // Stage 3: Emergency Dump (Last Resort)
                // Criteria: Held >= emergencyDumpMinAgeHours (14h), queue ahead >= 3 items, clearance >= 24h,
                // Soft stop-loss couldn't trigger (e.g. ask price too far crashed or queue completely stuck),
                // And highest BUY bid gives loss within emergencyDumpMaxLossPercent
                const emergencyLoss = effectiveBasis - (highestBid * 0.85);
                const maxEmergencyLoss = effectiveBasis * (settings.emergencyDumpMaxLossPercent / 100);

                if (
                    !isSoftStopLoss &&
                    sellAgeHours >= settings.emergencyDumpMinAgeHours &&
                    queueAhead >= 3 &&
                    clearanceTimeHours >= 24 &&
                    highestBid > 0 &&
                    emergencyLoss > 0 &&
                    emergencyLoss <= maxEmergencyLoss
                ) {
                    isEmergencyDump = true;
                    targetSellPrice = highestBid;
                    console.log(`[EMERGENCY-DUMP] ${item.market} triggers emergency dump to highest BUY! Age: ${sellAgeHours.toFixed(1)}h >= ${settings.emergencyDumpMinAgeHours}h, Queue: ${queueAhead}, Clearance: ${clearanceTimeHours.toFixed(1)}h. Highest bid: ${highestBid.toFixed(2)} GJN, Loss: ${emergencyLoss.toFixed(2)} GJN (${((emergencyLoss / effectiveBasis) * 100).toFixed(1)}% <= ${settings.emergencyDumpMaxLossPercent}%).`);
                }

                // Stage 4: Dead Stock Auto-Clearance (Prolonged Stale Inventory Escalation)
                // CRITICAL SAFETY RULE: Under NO circumstances should an item EVER be dumped
                // at a loss exceeding emergencyDumpMaxLossPercent (15%)! No unconstrained blind dumping!
                if (!isLiquidated && settings.enableDynamicLiquidation) {
                    if (!isSoftStopLoss && !isEmergencyDump) {
                        const hardLossPercent = settings.emergencyDumpMaxLossPercent || 15.0;
                        const minNetAllowed = effectiveBasis * (1 - (hardLossPercent / 100));
                        const hardLossFloorPrice = Number((minNetAllowed / 0.85).toFixed(2));

                        if (sellAgeHours >= 24 && highestBid > 0 && highestBid >= hardLossFloorPrice) {
                            // >= 24h: If highest BUY bid is within the loss cap, dump to it cleanly
                            isEmergencyDump = true;
                            targetSellPrice = highestBid;
                            console.log(`[DEAD-STOCK-DUMP] ${item.market} stuck for ${sellAgeHours.toFixed(1)}h (>= 24h). Dumping to highest BUY: ${highestBid.toFixed(2)} GJN (Within ${hardLossPercent}% loss floor: ${hardLossFloorPrice.toFixed(2)} GJN).`);
                        } else if (sellAgeHours >= 16 && targetUndercutPrice > 0) {
                            // >= 16h: Undercut, but NEVER undercut below the hard loss floor price!
                            const safeUndercutPrice = Math.max(targetUndercutPrice, hardLossFloorPrice);
                            const projectedLoss = effectiveBasis - (safeUndercutPrice * 0.85);
                            if (projectedLoss <= maxEmergencyLoss) {
                                isSoftStopLoss = true;
                                targetSellPrice = safeUndercutPrice;
                                console.log(`[DEAD-STOCK-UNDERCUT] ${item.market} stuck for ${sellAgeHours.toFixed(1)}h (>= 16h). Undercutting to ${safeUndercutPrice.toFixed(2)} GJN (Hard loss floor: ${hardLossFloorPrice.toFixed(2)} GJN, Max Loss: ${maxEmergencyLoss.toFixed(2)} GJN).`);
                            } else {
                                console.log(`[DEAD-STOCK-GUARD] ${item.market} stuck for ${sellAgeHours.toFixed(1)}h, but undercut price (${targetUndercutPrice.toFixed(2)}) would breach hard loss floor (${hardLossFloorPrice.toFixed(2)} GJN). Holding at safe price.`);
                            }
                        } else if (sellAgeHours >= 24 && highestBid > 0 && highestBid < hardLossFloorPrice) {
                            console.warn(`[DEAD-STOCK-GUARD] 🛡️ PREVENTED disastrous dump for ${item.market}! Highest bid (${highestBid.toFixed(2)} GJN) is far below hard loss floor (${hardLossFloorPrice.toFixed(2)} GJN, Basis: ${effectiveBasis.toFixed(2)} GJN). Holding to protect capital.`);
                        }
                    }
                }
            }

            // CRITICAL SAFEGUARD:
            // If an item is NOT in liquidation / stop-loss:
            // 1. If trueBasis is known, check that (netIncome - basis >= effectiveMinProfit).
            // 2. If trueBasis is UNKNOWN, check effectiveBasis / hold timeout.
            const basisUnprofitable = (!isLiquidated && !isSoftStopLoss && !isEmergencyDump)
                ? (trueBasis !== undefined
                    ? (targetUndercutPrice * 0.85 - trueBasis < effectiveMinProfit)
                    : (isHoldTimedOut ? false : (targetUndercutPrice * 0.85 - effectiveBasis < effectiveMinProfit))
                  )
                : false;

            const unprofitable = basisUnprofitable || targetSellPrice <= 0;

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

            const shouldRelist = isLiquidated
                ? (Math.abs(userBid - targetUndercutPrice) > 0.005 && targetUndercutPrice > 0)
                : isEmergencyDump
                ? (highestBid > 0 && Math.abs(userBid - highestBid) > 0.005)
                : isSoftStopLoss
                ? (targetUndercutPrice > 0 && Math.abs(userBid - targetUndercutPrice) > 0.005)
                : (unnecessarilyLowSell || userBid > lowestSell);

            if (shouldRelist) {

                console.log("işlemi başlat")

                if (!isLiquidated && !isSoftStopLoss && !isEmergencyDump && !unnecessarilyLowSell && unprofitable) {
                    console.log(`[SELL-GUARD] ${item.market} undercut kârsız olduğu için yapılmadı. (Kâr: ${(targetUndercutPrice * 0.85 - (trueBasis || 0)).toFixed(2)}, Basis: ${trueBasis ?? 'yok'}, Queue: ${queueAhead}, Clearance: ${clearanceTimeHours.toFixed(1)}h, Age: ${sellAgeHours.toFixed(1)}h)`);
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

                const price = Math.round(targetSellPrice * 10000);

                const res = await post({
                    action: "cln_market_sell",
                    token: process.env.SELLTOKEN || token,
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

                if (res?.response?.error) {
                    failedAssetCooldown.set(assetID, Date.now() + 3600_000); // 1 hour cooldown on failed asset
                    console.warn(`[Auto-Lister] Listing ${item.market} failed (${res.response.error}). Cooldown set for 1h.`);
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
    // TARGET-BUY AUTOMATED PLACEMENT (Initial Bid)
    // ==========================================
    try {
        await checkAndPlaceTargetBuys(activeOrdersTracker);
    } catch (tbErr) {
        console.error("[TARGET-BUY] Error in checkAndPlaceTargetBuys:", tbErr);
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

            // Skip commodity trophies / crates with zero profit potential that trigger WRONG_PRICE spam
            if (market.includes('trophy') || market.includes('chest') || market.includes('crate')) {
                continue;
            }

            // Target Buy items (e.g. KV-220) are personal purchases and MUST NOT be auto-sold!
            if (isAnyTargetBuy(market)) {
                console.log(`[Auto-Lister] 🛡️ Target Buy item ${market} found in inventory! Keeping for user (will NOT auto-sell).`);
                markTargetBuyAcquired(market);
                continue;
            }

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
                    let targetPrice = lowestSell - 0.01;
                    if (targetPrice <= 0) continue;

                    const isLiquidated = isItemLiquidated(market);
                    let effectiveBasis = basis;
                    let basisOk = false;

                    if (isLiquidated) {
                        basisOk = true;
                    } else if (effectiveBasis !== undefined) {
                        if (targetPrice * 0.85 - effectiveBasis >= MIN_PROFIT) {
                            basisOk = true;
                        } else {
                            // Current top price is slightly below MIN_PROFIT.
                            // Instead of leaving the item unlisted and idle in inventory:
                            // List at the safe breakeven price that covers cost basis (+0.01 GJN)!
                            const safePrice = Number(((effectiveBasis + 0.01) / 0.85).toFixed(2));
                            targetPrice = Math.max(targetPrice, safePrice);
                            basisOk = true;
                            console.log(`[Auto-Lister] ℹ️ Listing ${market} at safe price ${targetPrice.toFixed(2)} GJN (Basis: ${effectiveBasis.toFixed(2)} GJN) to enter queue and prevent idle inventory.`);
                        }
                    } else {
                        // Orphan item without basis (e.g. from chest/trophy drop)
                        if (lowestSell <= 0.50) {
                            console.log(`[Auto-Lister] ℹ️ Listing low-value orphan ${market} at ${targetPrice.toFixed(2)} GJN (LowestSell <= 0.50).`);
                            basisOk = true;
                        } else {
                            // High-value orphan: auto-adopt by assigning fair market basis (highest bid or 80% of lowest sell)
                            // so it enters active market management instead of sitting permanently frozen!
                            const autoAssignedBasis = Number((Math.min(highestBid, lowestSell * 0.80) || 1.00).toFixed(2));
                            addBasis(market, autoAssignedBasis);
                            effectiveBasis = autoAssignedBasis;
                            basisOk = true;
                            console.log(`[Auto-Lister] 🚀 Auto-adopting high-value orphan ${market}: Assigned basis ${autoAssignedBasis.toFixed(2)} GJN. Listing at ${targetPrice.toFixed(2)} GJN.`);
                        }
                    }

                    if (basisOk) {
                        const assetId = idleItems[i].assetId;
                        if (failedAssetCooldown.get(assetId) && failedAssetCooldown.get(assetId)! > Date.now()) {
                            continue;
                        }
                        console.log(`[Auto-Lister] Listing ${market} from inventory! Target Price: ${targetPrice.toFixed(2)}, Basis: ${basis ?? 'yok'}`);
                        const price = Math.round(targetPrice * 10000);
                        const sellRes = await post({
                            action: "cln_market_sell",
                            token: process.env.SELLTOKEN || token,
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
                        if (sellRes?.response?.error) {
                            failedAssetCooldown.set(assetId, Date.now() + 3600_000);
                            console.warn(`[Auto-Lister] Listing ${market} failed (${sellRes.response.error}). Cooldown set for 1h.`);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("⚠️ Auto-Lister error:", err);
    }
}

/**
 * Automates initial BUY order placement for any active Target Buy items
 * that don't currently have an open BUY order.
 */
async function checkAndPlaceTargetBuys(activeOrdersTracker: any[]) {
    const activeTargets = getTargetBuys().filter(tb => tb.active);
    if (activeTargets.length === 0) return;

    for (const tb of activeTargets) {
        const hasOpenBuy = activeOrdersTracker.some(o => o.type === "BUY" && o.market === tb.market_name);
        if (hasOpenBuy) continue;

        try {
            const books = await post({
                action: "cln_books_brief",
                market_name: tb.market_name,
                appid: 1067,
                token
            });

            if (!books?.response?.BUY) continue;

            const highestCompetitorBid = (books.response.BUY[0]?.[0] || 0) / 10000;
            const targetBid = Number((highestCompetitorBid + 0.01).toFixed(2));

            if (targetBid > tb.max_price) {
                console.warn(`[TARGET-BUY] Initial bid for ${tb.market_name} (${targetBid.toFixed(2)} GJN) exceeds max price (${tb.max_price.toFixed(2)} GJN).`);
                continue;
            }

            const rawWallet = await getWalletBalance();
            if (rawWallet !== null && rawWallet < targetBid) {
                console.warn(`[TARGET-BUY] Cannot place initial BUY for ${tb.market_name}: Wallet cash (${rawWallet.toFixed(2)} GJN) < required (${targetBid.toFixed(2)} GJN).`);
                continue;
            }

            const priceToSet = Math.round(targetBid * 10000);
            console.log(`[TARGET-BUY] Placing initial TOP BID for ${tb.market_name} at ${targetBid.toFixed(2)} GJN (Max budget: ${tb.max_price.toFixed(2)} GJN)...`);

            const buyParams: any = {
                action: "cln_market_buy",
                price: priceToSet,
                privateMode: true,
                appid: 1067,
                market_name: tb.market_name,
                currencyid: "gjn",
                amount: 1,
                token
            };

            const res = await post(buyParams);
            if (res?.response?.success) {
                const newOrderId = res.response.orderId?.toString() || `pending_${Date.now()}`;
                const pairId = res.response.pairId?.toString() || '';
                activeOrdersTracker.push({
                    id: newOrderId,
                    pairId,
                    type: "BUY",
                    market: tb.market_name,
                    localPrice: priceToSet
                });
                db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (?, ?, ?, ?, ?)').run(
                    newOrderId,
                    pairId,
                    tb.market_name,
                    'BUY',
                    priceToSet
                );
                console.log(`[TARGET-BUY] ✅ Successfully placed initial TOP BID for ${tb.market_name} at ${targetBid.toFixed(2)} GJN!`);
            } else {
                console.error(`[TARGET-BUY] ❌ Failed to place initial BUY for ${tb.market_name}:`, res?.response?.error || res?.error || res);
            }
        } catch (err) {
            console.error(`[TARGET-BUY] Error in checkAndPlaceTargetBuys for ${tb.market_name}:`, err);
        }
    }
}

export function startGuardLoop() {
    console.log("[GUARD] Guard service started (Standing Orders & Auto-Lister active).");
    checkStandingOrders();

    function scheduleNextRun() {
        const delaySec = Math.floor(Math.random() * 5) + 6; // 6-10s
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
