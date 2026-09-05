import db from '../db/database.js';
import { canBuyItem } from './riskManager.js';
import { post, getPairStat, calculateLiquidityScore } from '../helpers/helpers.js';
import dotenv from 'dotenv';
dotenv.config();

const MIN_PROFIT = 0.05; // 5% minimum profit
const MIN_VOLUME = 5; // Minimum 5 sales in 24 hours

export async function scanMarketForOpportunities() {
    console.log("[SCANNER] Starting market scan...");
    
    // 1. Get all highly liquid items from the database
    const itemsQuery = db.prepare('SELECT hash_name, data FROM Items').all() as { hash_name: string, data: string }[];
    
    for (const row of itemsQuery) {
        const item = JSON.parse(row.data);
        
        // Skip keys or explicitly ignored items
        if (item.tags?.includes('type:key')) continue;
        
        // Basic filter: liquid enough?
        if (item.last2Volume < MIN_VOLUME) continue;

        // STURDINESS GUARD: The "40 Rounds" rule.
        // The item must have been consistently profitable for at least 40 rounds (approx 6-7 minutes).
        if (!item.profit_streak || item.profit_streak < 40) {
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

            const estimatedProfit = (lowestSell * 0.85) - (highestBuy + 0.01);
            
            if (estimatedProfit >= MIN_PROFIT) {
                const targetBuyPrice = highestBuy + 0.01;

                // FACT-CHECK: Prevent whale traps.
                // If the required buy price is > 10% higher than the highest transaction 
                // in the last 3 hours, this is a manipulated spread. Do not buy!
                if (item.highestOfLast10 && targetBuyPrice > item.highestOfLast10 * 1.10) {
                    console.log(`[SCANNER] 🚩 FACT-CHECK FAILED for ${item.hash_name}. Target Buy (${targetBuyPrice}) is dangerously higher than recent max (${item.highestOfLast10}).`);
                    continue;
                }

                // Potential opportunity found!
                console.log(`[SCANNER] Opportunity found for ${item.hash_name}! Spread: ${highestBuy} -> ${lowestSell}. Estimated Profit: ${estimatedProfit.toFixed(2)} GJN`);
                
                // Let Risk Manager approve the trade
                
                if (canBuyItem(item.hash_name, targetBuyPrice)) {
                    console.log(`[SCANNER] Placing autonomous BUY order for ${item.hash_name} at ${targetBuyPrice.toFixed(2)} GJN`);
                    
                    // Actually place the order
                    /*
                    const res = await post({
                        action: "cln_market_buy",
                        price: Math.round(targetBuyPrice * 10000),
                        privateMode: true,
                        appid: 1067,
                        market_name: item.hash_name,
                        currencyid: "gjn",
                        amount: 1,
                        transactid: Math.round(Math.random() * 100000),
                        reqstamp: Date.now(),
                        token: process.env.TOKEN
                    });
                    
                    if (res?.response?.success) {
                        console.log(`[SCANNER] Successfully placed BUY order for ${item.hash_name}`);
                    }
                    */
                   console.log(`[SCANNER] (DRY RUN) Would have bought ${item.hash_name}`);
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
