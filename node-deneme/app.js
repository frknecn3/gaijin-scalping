import fs from 'fs';
import dotenv from 'dotenv';
import { calculateLiquidityScore, getPairStat } from './helpers.js';
dotenv.config();
// Node 18+ (native fetch)

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}


try {
    let allItems = [];
    let skip = 0;
    const COUNT = 100;

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

    const PRICE = 1

    allItems = allItems
        .map((item) => {

            const newPrice = (item.price / 100000000) * 0.85
            const newSellPrice = item.buy_price / 100000000

            return {
                ...item,
                price: newPrice,
                buy_price: newSellPrice,
                profit: (newPrice - 0.01) - (newSellPrice + 0.01)
            }
        })
        .filter((item) => item.buy_price <= PRICE && item.buy_depth + item.depth > 10 && item.profit > 0.05 && !item.tags.includes("type:key") && item.buy_depth > 0 && item.buy_price > 0)
        

    console.log("Tüm itemlar: ", allItems.length)

    const enrichedItems = [];

    for (const item of allItems) {
        try {
            console.log(item.hash_name);

            const stat1d = await getPairStat(item.hash_name);
            if (!stat1d) continue;

            const liquidity = calculateLiquidityScore(stat1d, item);

            enrichedItems.push({
                ...item,
                ...liquidity
            });

            // rate-limit safety
            await sleep(10);

        } catch (err) {
            console.log("HATA:", item.name);
        }
    }


    const jsonItems = JSON.stringify(enrichedItems.sort((a, b) => a.last2Volume - b.last2Volume));

    fs.writeFileSync('./data/items.json', jsonItems)

} catch (err) {
    console.error(err);
}