import db from '../db/database.js';
import { canBuyItem, acquireBuyLock, releaseBuyLock, isBuyLocked } from './riskManager.js';
import { post, marketPost, getPairStat, calculateLiquidityScore } from '../helpers/helpers.js';
import { syncOpenOrders } from '../helpers/orderSync.js';
import { getBotSettings, isItemLiquidated, isItemIgnored, getMatchingTierRule } from '../helpers/settingsManager.js';
import dotenv from 'dotenv';
dotenv.config();

export async function scanMarketForOpportunities() {
    const settings = getBotSettings();
    if (!settings.enableBuying) {
        console.log("[SCANNER] ⏸️ Autonomous BUY orders are currently TURNED OFF (enableBuying = false). Skipping purchase scan.");
        return;
    }

    console.log("[SCANNER] Starting market scan...");
    const MIN_PROFIT = settings.scannerMinProfit;
    const MIN_VOLUME = settings.minVolume;
    const MIN_STREAK = settings.minStreak;

    // 0. Live Sync open orders from Gaijin API into local SQLite Orders table
    const openOrders = await syncOpenOrders();
    const currentlyBuying = new Set(
        openOrders.filter(o => o.type === 'BUY').map(o => o.market)
    );

    // 1. Get all highly liquid items from the database
    const itemsQuery = db.prepare('SELECT hash_name, data FROM Items').all() as { hash_name: string, data: string }[];

    const parsedItems = itemsQuery.map(row => JSON.parse(row.data));

    // 2. Filter & score items
    const scoredItems: { item: any; score: number }[] = [];
    for (const item of parsedItems) {
        // Skip keys or explicitly ignored items
        if (item.tags?.includes('type:key')) continue;
        if (isItemIgnored(item.hash_name)) continue;

        // Skip items we are ALREADY buying (open BUY order exists or active buy lock)
        if (currentlyBuying.has(item.hash_name) || isBuyLocked(item.hash_name)) {
            continue;
        }

        // Skip items currently marked for LIQUIDATION
        if (isItemLiquidated(item.hash_name)) {
            continue;
        }

        // DYNAMIC DOWNWARD TREND SAFEGUARD (Falling Knife Protection)
        if (settings.fallingKnifeProtection && item.isFallingKnife) {
            console.warn(`[SCANNER] Falling knife detected for ${item.name || item.hash_name} (-${item.priceDrop30mPercent?.toFixed(1)}% / -$${item.priceDrop30mDelta?.toFixed(2)} in 30m). Skipping BUY.`);
            continue;
        }

        // Tier-specific volume requirement:
        // Check if a custom tier rule matches this item's price
        const candidateTierRule = getMatchingTierRule(item.buy_price || 0, settings);
        let requiredVolume = settings.minVolume;
        if (candidateTierRule) {
            requiredVolume = candidateTierRule.minVolume;
        } else {
            const isDynamicTier = (item.buy_price || 0) >= settings.dynamicProfitThreshold;
            requiredVolume = isDynamicTier ? settings.dynamicMinVolume : settings.minVolume;
        }

        if (item.last2Volume < requiredVolume) continue;

        // STURDINESS GUARD: The "40 Rounds" rule.
        if (!item.profit_streak || item.profit_streak < MIN_STREAK) {
            continue;
        }

        const cost = item.buy_price || 1; // avoid division by zero
        const profit = item.profit || 0;

        // ROI: Profit per invested GJN
        const roi = profit / cost;

        // Score: Prioritize highest ROI, with a boost for high volume
        const score = roi * Math.log10(item.last2Volume + 1);

        scoredItems.push({ item, score });
    }

    // 3. Sort by score descending (best opportunities first)
    scoredItems.sort((a, b) => b.score - a.score);

    for (const { item, score } of scoredItems) {
        // Double-check if this item became active during this scan iteration
        if (currentlyBuying.has(item.hash_name) || isBuyLocked(item.hash_name)) {
            continue;
        }

        try {
            // Check current order book
            const marketBooks = await post({
                action: "cln_books_brief",
                market_name: item.hash_name,
                appid: 1067,
                token: process.env.TOKEN
            });

            if (!marketBooks?.response?.SELL || !marketBooks?.response?.BUY) continue;

            const lowestSell = marketBooks.response.SELL[0]?.[0] / 10000;
            const highestBuy = marketBooks.response.BUY[0]?.[0] / 10000;

            if (!lowestSell || !highestBuy) continue;

            const liveBuyPrice = highestBuy + 0.01;
            const liveTierRule = getMatchingTierRule(liveBuyPrice, settings);

            let liveRequiredVolume = settings.minVolume;
            let requiredProfit = MIN_PROFIT;

            if (liveTierRule) {
                liveRequiredVolume = liveTierRule.minVolume;
                const minPercentProfit = (liveTierRule.minProfitPercent || 0) > 0
                    ? liveBuyPrice * (liveTierRule.minProfitPercent / 100)
                    : 0;
                const minAbsoluteProfit = typeof liveTierRule.minProfitGJN === 'number'
                    ? liveTierRule.minProfitGJN
                    : 0;

                // If both are given, take the higher one. If only one is given (> 0), use that one.
                requiredProfit = Math.max(minPercentProfit, minAbsoluteProfit, 0.01);
            } else {
                const isLiveDynamicTier = highestBuy >= settings.dynamicProfitThreshold;
                liveRequiredVolume = isLiveDynamicTier ? settings.dynamicMinVolume : settings.minVolume;

                // Apply dynamic ROI calculation if item price exceeds threshold
                if (highestBuy >= settings.dynamicProfitThreshold) {
                    let requiredPercentage = settings.dynamicProfitPercentage;
                    
                    // Scale requirement based on 48h volume
                    if (item.last2Volume >= 100) {
                        requiredPercentage = settings.dynamicProfitPercentage; // 1x
                    } else if (item.last2Volume >= 50) {
                        requiredPercentage = settings.dynamicProfitPercentage * 1.5; // 1.5x
                    } else {
                        requiredPercentage = settings.dynamicProfitPercentage * 2.0; // 2x
                    }

                    requiredProfit = Math.max(MIN_PROFIT, highestBuy * (requiredPercentage / 100));
                }
            }

            if (item.last2Volume < liveRequiredVolume) continue;

            const estimatedProfit = (lowestSell * 0.85) - (highestBuy + 0.01);

            if (estimatedProfit >= requiredProfit) {
                const targetBuyPrice = highestBuy + 0.01;

                // 1. FAIR-VALUE ANCHOR: Prevent Phantom Spreads (e.g. Chinese machine gun trap)
                // If lowestSell is > 35% higher than the 24h average actual trade price,
                // the current sell order is an empty book / outlier illusion. Do not buy!
                if (item.avgPrice24h && item.avgPrice24h > 0) {
                    const maxAllowedSell = item.avgPrice24h * 1.35;
                    if (lowestSell > maxAllowedSell) {
                        console.log(`[SCANNER] 🚩 PHANTOM SPREAD DETECTED for ${item.hash_name}. Lowest sell (${lowestSell.toFixed(2)}) is >35% above 24h avg trade price (${item.avgPrice24h.toFixed(2)}). Skipping.`);
                        continue;
                    }
                }

                // 2. FACT-CHECK: Prevent whale traps with 24h fallback.
                // If the required buy price is > 10% higher than recent transactions (last 3h or last 24h),
                // this is a manipulated spread. Do not buy!
                const referenceMaxPrice = item.highestOfLast10 || item.highestOfLast24h || item.avgPrice24h;
                if (referenceMaxPrice && referenceMaxPrice > 0 && targetBuyPrice > referenceMaxPrice * 1.10) {
                    console.log(`[SCANNER] 🚩 FACT-CHECK FAILED for ${item.hash_name}. Target Buy (${targetBuyPrice.toFixed(2)}) is dangerously higher than reference price (${referenceMaxPrice.toFixed(2)}).`);
                    continue;
                }

                // 3. DUAL-SIDED REAL EXECUTION PROOF (Anti-Fake Spread & Ghost Order Guard):
                // For items at or above dynamicProfitThreshold, ensure that real trades
                // have actually executed on BOTH sides of the order book in the last 24 hours:
                if (highestBuy >= settings.dynamicProfitThreshold) {
                    let lowTrade24h = item.lowestOfLast24h;
                    let highTrade24h = item.highestOfLast24h;

                    // If cached values are missing, fetch live pairStat on the fly
                    if (lowTrade24h === undefined || highTrade24h === undefined) {
                        try {
                            const stat = await getPairStat(item.hash_name);
                            if (stat && stat["1h"]) {
                                const nowSec = Math.floor(Date.now() / 1000);
                                const tx24h = stat["1h"].filter((d: any) => (nowSec - d[0]) <= 86400);
                                if (tx24h.length > 0) {
                                    const prices = tx24h.map((d: any) => d[1] / 10000);
                                    lowTrade24h = Math.min(...prices);
                                    highTrade24h = Math.max(...prices);
                                }
                            }
                        } catch {}
                    }

                    // A) Low-Side Fill Verification (BUY order execution proof):
                    // If lowest executed trade in 24h is >25% higher than targetBuyPrice,
                    // sellers never dump down here! Our buy bid would sit empty forever.
                    if (lowTrade24h && lowTrade24h > 0 && lowTrade24h > targetBuyPrice * 1.25) {
                        console.log(`[SCANNER] 🚩 GHOST BUY BID DETECTED for ${item.hash_name}. 24h lowest trade (${lowTrade24h.toFixed(2)}) is >25% above target buy (${targetBuyPrice.toFixed(2)}). Bid will never fill. Skipping.`);
                        continue;
                    }

                    // B) High-Side Fill Verification (SELL order execution proof):
                    // If highest executed trade in 24h is >25% below lowestSell,
                    // buyers never pay this inflated ask! We could never sell high.
                    if (highTrade24h && highTrade24h > 0 && highTrade24h < lowestSell * 0.75) {
                        console.log(`[SCANNER] 🚩 ILLUSION ASK DETECTED for ${item.hash_name}. 24h highest trade (${highTrade24h.toFixed(2)}) is >25% below lowest sell (${lowestSell.toFixed(2)}). Impossible to sell high. Skipping.`);
                        continue;
                    }
                }

                // Potential opportunity found!
                console.log(`[SCANNER] Opportunity found for ${item.hash_name}! Spread: ${highestBuy} -> ${lowestSell}. Estimated Profit: ${estimatedProfit.toFixed(2)} GJN`);

                // Let Risk Manager approve the trade
                const riskResult = await canBuyItem(item.hash_name, targetBuyPrice);

                if (riskResult.allowed) {
                    const bought = await placeBuyOrder(item.hash_name, targetBuyPrice);
                    if (bought) {
                        currentlyBuying.add(item.hash_name);
                    }
                } else if (riskResult.reason === 'budget_exceeded') {
                    console.log(`[SCANNER] Insufficient wallet balance for ${item.hash_name}. Attempting reallocation...`);
                    const reallocated = await attemptBudgetReallocation(item.hash_name, targetBuyPrice, score, parsedItems);
                    if (reallocated) {
                        // After successfully cancelling an inferior order, retry buying
                        const retryResult = await canBuyItem(item.hash_name, targetBuyPrice);
                        if (retryResult.allowed) {
                            console.log(`[SCANNER] Reallocation successful! Proceeding with buy for ${item.hash_name}.`);
                            const bought = await placeBuyOrder(item.hash_name, targetBuyPrice);
                            if (bought) {
                                currentlyBuying.add(item.hash_name);
                            }
                        } else {
                            console.log(`[SCANNER] Reallocation was not enough to fit ${item.hash_name} into budget.`);
                        }
                    }
                }
            }

            // Sleep slightly to prevent rate limits during the scan
            await new Promise(res => setTimeout(res, 500));

        } catch (e) {
            console.error(`[SCANNER] Error scanning ${item.hash_name}:`, e);
        }
    }

    console.log("[SCANNER] Market scan complete.");
}

async function placeBuyOrder(marketName: string, targetBuyPrice: number): Promise<boolean> {
    const locked = acquireBuyLock(marketName, 90); // 90 seconds protection lock
    if (!locked) {
        console.warn(`[SCANNER] Prevented duplicate buy order for ${marketName}: Buy lock already held.`);
        return false;
    }

    console.log(`[SCANNER] Placing autonomous BUY order for ${marketName} at ${targetBuyPrice.toFixed(2)} GJN`);

    const rawPrice = Math.round(targetBuyPrice * 10000);

    // Actually place the order
    const res = await post({
        action: "cln_market_buy",
        price: rawPrice,
        privateMode: true,
        appid: 1067,
        market_name: marketName,
        currencyid: "gjn",
        amount: 1,
        transactid: Math.round(Math.random() * 100000),
        reqstamp: Date.now(),
        token: process.env.TOKEN
    });

    if (res?.response?.success) {
        console.log(`[SCANNER] Successfully placed BUY order for ${marketName}`);

        // Immediately record into SQLite Orders table so all subsequent checks and risk manager see it
        const orderId = res.response.orderId?.toString() || `pending_${Date.now()}`;
        const pairId = res.response.pairId?.toString() || '';
        db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (?, ?, ?, ?, ?)').run(
            orderId,
            pairId,
            marketName,
            'BUY',
            rawPrice
        );
        return true;
    } else {
        console.log(`[SCANNER] Failed to place BUY order for ${marketName}:`, res?.response?.error || 'Unknown error');
        releaseBuyLock(marketName);
        return false;
    }
}

async function attemptBudgetReallocation(newMarketName: string, newPrice: number, newScore: number, parsedItems: any[]): Promise<boolean> {
    const activeOrders = db.prepare("SELECT id, pairId, market, type, localPrice FROM Orders WHERE type = 'BUY'").all() as { id: string, pairId: string, market: string, type: string, localPrice: number }[];

    if (activeOrders.length === 0) return false;

    // Map active orders to their ROI scores
    const activeOrdersScored = activeOrders.map(order => {
        const itemData = parsedItems.find(i => i.hash_name === order.market);
        let score = 0;
        if (itemData) {
            const cost = itemData.buy_price || 1;
            const profit = itemData.profit || 0;
            const roi = profit / cost;
            score = roi * Math.log10(itemData.last2Volume + 1);
        }
        return { ...order, score };
    });

    // Sort by score ascending (worst opportunities first)
    activeOrdersScored.sort((a, b) => a.score - b.score);

    const worstOrder = activeOrdersScored[0];

    // If the worst active order is still better or equal to the new one, don't reallocate
    if (worstOrder.score >= newScore) {
        console.log(`[SCANNER] Reallocation denied: The worst active order (${worstOrder.market} with score ${worstOrder.score.toFixed(2)}) is still better than the new opportunity (${newScore.toFixed(2)}).`);
        return false;
    }

    // We found an inferior order to cancel!
    console.log(`[SCANNER] REALLOCATION TRIGGERED: Cancelling ${worstOrder.market} (Score: ${worstOrder.score.toFixed(2)}) to afford ${newMarketName} (Score: ${newScore.toFixed(2)})`);

    // Cancel the order via API
    const res = await marketPost({
        action: "cancel_order",
        pairId: worstOrder.pairId,
        orderId: worstOrder.id,
        token: process.env.TOKEN
    });

    if (res?.response?.success) {
        console.log(`[SCANNER] Successfully cancelled ${worstOrder.market}.`);

        // Log to CancelledOrders so guard.ts ignores it
        db.prepare('INSERT INTO CancelledOrders (id) VALUES (?)').run(worstOrder.id);

        // Remove it from the local Orders table immediately so riskManager sees the freed budget
        db.prepare('DELETE FROM Orders WHERE id = ?').run(worstOrder.id);

        return true;
    } else {
        console.log(`[SCANNER] Failed to cancel ${worstOrder.market} for reallocation.`);
        return false;
    }
}
