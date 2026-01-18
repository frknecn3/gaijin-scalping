import fs from 'fs';
import dotenv from 'dotenv';
import { calculateLiquidityScore, getPairStat } from './helpers.js';
dotenv.config();
// Node 18+ (native fetch)

// ================== UTILS ==================
function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Controlled concurrency pool
async function parallelLimit(items, limit, worker) {
    const results = [];
    const executing = [];

    for (const item of items) {
        const p = Promise.resolve().then(() => worker(item));
        results.push(p);

        const e = p.then(() => {
            executing.splice(executing.indexOf(e), 1);
        });
        executing.push(e);

        if (executing.length >= limit) {
            await Promise.race(executing);
        }
    }

    return Promise.all(results);
}

// ================== MAIN ==================
try {
    let allItems = [];
    let skip = 0;
    const COUNT = 100;

    // ---------- PAGINATION (AYNI) ----------
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

    // ---------- PRICE NORMALIZATION (AYNI) ----------
    allItems = allItems.map(item => {
        const newPrice = (item.price / 100000000) * 0.85;
        const newSellPrice = item.buy_price / 100000000;

        return {
            ...item,
            orgPrice: item.price,
            price: newPrice,
            buy_price: newSellPrice,
            profit: (newPrice - 0.01) - (newSellPrice + 0.01)
        };
    });

    console.log("Tüm itemlar:", allItems.length);

    // ---------- 🔥 CONCURRENT ENRICHMENT ----------
    const CONCURRENCY = 20; // 15–25 güvenli
    let processed = 0;

    const enrichedItems = (
        await parallelLimit(allItems, CONCURRENCY, async (item) => {
            try {
                processed++;
                console.log(`[${processed}/${allItems.length}] ${item.hash_name}`);

                const stat1d = await getPairStat(item.hash_name);
                if (!stat1d) return null;

                const liquidity = calculateLiquidityScore(stat1d, item);

                return {
                    ...item,
                    ...liquidity
                };

            } catch (err) {
                console.log("HATA:", item.name);
                console.log(err)
                return null;
            }
        })
    ).filter(Boolean);

    // ---------- SORT + WRITE (AYNI YOL) ----------
    const jsonItems = JSON.stringify(
        enrichedItems.sort((a, b) => a.last2Volume - b.last2Volume)
    );

    fs.writeFileSync('./data/items.json', jsonItems);

    console.log("✅ İşlem tamamlandı");
    console.log("Kaydedilen item:", enrichedItems.length);

} catch (err) {
    console.error(err);
}
