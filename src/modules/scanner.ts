import db from '../db/database.js';
import { canBuyItem, acquireBuyLock, releaseBuyLock, isBuyLocked } from './riskManager.js';
import { post, marketPost, getPairStat, calculateLiquidityScore } from '../helpers/helpers.js';
import { syncOpenOrders } from '../helpers/orderSync.js';
import { getBotSettings, isItemLiquidated } from '../helpers/settingsManager.js';
import dotenv from 'dotenv';
dotenv.config();

export async function scanMarketForOpportunities() {
    console.log("[SCANNER] Starting market scan...");
    const settings = getBotSettings();
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

    // 2. Score and filter items based on ROI and Volume
    const scoredItems = [];
    for (const item of parsedItems) {
        // Skip keys or explicitly ignored items
        if (item.tags?.includes('type:key')) continue;

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
        // Items >= dynamicProfitThreshold use dynamicMinVolume, cheaper items use standard minVolume
        const isDynamicTier = (item.buy_price || 0) >= settings.dynamicProfitThreshold;
        const requiredVolume = isDynamicTier ? settings.dynamicMinVolume : settings.minVolume;

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

            // Check live book price tier against required volume
            const isLiveDynamicTier = highestBuy >= settings.dynamicProfitThreshold;
            const liveRequiredVolume = isLiveDynamicTier ? settings.dynamicMinVolume : settings.minVolume;
            if (item.last2Volume < liveRequiredVolume) continue;

            const estimatedProfit = (lowestSell * 0.85) - (highestBuy + 0.01);

            let requiredProfit = MIN_PROFIT;

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
