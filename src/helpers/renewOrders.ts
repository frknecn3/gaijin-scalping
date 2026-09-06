import { calculateLiquidityScore, getPairStat } from "./helpers.js";
import db from "../db/database.js";
import fs from 'fs';




export async function startRenewOrders(jobState: JobState, isHardRefresh: boolean = false) {
    jobState.running = true
    jobState.percent = 0

    try {
        let allItems: any[] = [];
        let skip = 0
        const COUNT = 100

        if (!process.env.TOKEN) {
            throw new Error("TOKEN is not defined")
        }

        while (true) {
            const body = new URLSearchParams({
                action: "cln_market_search",
                appId: "1067",
                count: String(COUNT),
                skip: String(skip),
                sort: "price",
                order: "asc",
                token: process.env.TOKEN,
            });

            const res = await fetch("https://market-proxy.gaijin.net/web", {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded"
                },
                body
            });

            const json = await res.json();

            if (!json.response.success) {
                throw new Error(json.response.error);
            }

            const assets = json.response.assets;

            if (!assets || assets.length === 0) {
                console.log("Pagination bitti.");
                break;
            }

            allItems.push(...assets);

            console.log(`Toplam: ${allItems.length}`);

            if (assets.length < COUNT) {
                console.log("Son sayfa alındı.");
                break;
            }

            skip += COUNT;
        }

        // Save an un-filtered map of market names to IDs so guard.ts never loses track of dead items
        const insertIdMap = db.prepare('INSERT OR REPLACE INTO IdMap (market_name, asset_id) VALUES (@market_name, @asset_id)');
        db.transaction(() => {
            for (const i of allItems) {
                const defIdObj = i.asset_class?.find((c: any) => c.name === "__itemdefid");
                if (defIdObj) {
                    insertIdMap.run({ market_name: i.hash_name, asset_id: Number(defIdObj.value) });
                }
            }
        })();
        allItems = allItems
            .map((item) => {
                const newPrice = (item.price / 100000000) * 0.85
                const newSellPrice = item.buy_price / 100000000

                return {
                    ...item,
                    orgPrice: item.price,
                    price: newPrice,
                    buy_price: newSellPrice,
                    profit: (newPrice - 0.01) - (newSellPrice + 0.01)
                }
            })
            .filter((item) => {
                if (isHardRefresh) return true; // Keep all items for a deep scan

                // Minimum requirements to even deserve an API call
                if (!item.buy_depth || item.buy_depth <= 5) return false;
                if (!item.depth || item.depth === 0) return false;
                if (item.buy_price === 0) return false;
                if (item.profit < 0) return false; // Must be at least slightly profitable mathematically

                return true;
            })

        const enrichedItems: any[] = []
        const CONCURRENCY = isHardRefresh ? 5 : 20; // Lower concurrency to prevent rate-limit crashes

        for (let i = 0; i < allItems.length; i += CONCURRENCY) {
            const chunk = allItems.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (item) => {
                try {
                    const pairStat = await getPairStat(item.hash_name);
                    if (!pairStat || !pairStat["1d"]) return;
                    
                    const stat1d = pairStat["1d"];
                    const stat1h = pairStat["1h"] || [];

                    const liquidity = calculateLiquidityScore(stat1d, item);

                    const last10 = stat1h.slice(-10);
                    const nowInSeconds = Math.floor(Date.now() / 1000);
                    const threeHoursInSeconds = 3 * 60 * 60;
                    const validRecentTransactions = last10.filter((d: any) => (nowInSeconds - d[0]) <= threeHoursInSeconds);

                    const highestOfLast10 = validRecentTransactions.length > 0 
                        ? Math.max(...validRecentTransactions.map((d: any) => d[1] / 10000))
                        : 0;

                    // Final hard-check: skip dead volume items, UNLESS it's a brand new item (<= 3 days of history)
                    if (!isHardRefresh && liquidity.last2Volume === 0 && stat1d.length > 3) return;

                    enrichedItems.push({
                        ...item,
                        ...liquidity,
                        highestOfLast10
                    });
                } catch (err) {
                    console.log("HATA:", item.name);
                }
            }));

            if (isHardRefresh) {
                await new Promise(res => setTimeout(res, 300)); // Rate limit protection for deep scans
            }

            jobState.percent = Math.round(((Math.min(i + CONCURRENCY, allItems.length)) / allItems.length) * 100);
        }

        const sortedItems = enrichedItems.sort((a, b) => a.last2Volume - b.last2Volume);

        const insertItem = db.prepare('INSERT OR REPLACE INTO Items (hash_name, data) VALUES (@hash_name, @data)');
        
        const getStreak = db.prepare('SELECT streak FROM ItemStreaks WHERE market_name = ?');
        const updateStreak = db.prepare('INSERT OR REPLACE INTO ItemStreaks (market_name, streak) VALUES (@market_name, @streak)');

        const MIN_PROFIT = 0.10; // GJN

        db.transaction(() => {
            // First clear all existing items so we don't keep stale ones
            db.prepare('DELETE FROM Items').run();
            for (const item of sortedItems) {
                // Determine streak
                let streak = 0;
                if (item.profit >= MIN_PROFIT) {
                    const row = getStreak.get(item.hash_name) as { streak: number } | undefined;
                    streak = (row ? row.streak : 0) + 1;
                }
                updateStreak.run({ market_name: item.hash_name, streak });

                // Attach streak to item data so frontend or scanner can easily read it
                const itemData = { ...item, profit_streak: streak };
                insertItem.run({ hash_name: item.hash_name, data: JSON.stringify(itemData) });
            }
        })();

    } catch (err) {
        console.error(err)
    } finally {
        jobState.percent = 100
        jobState.running = false
    }
}
