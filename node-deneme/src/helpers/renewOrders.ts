import { calculateLiquidityScore, getPairStat } from "./helpers.js"
import fs from 'fs';




export async function startRenewOrders(jobState:JobState) {
    jobState.running = true
    jobState.percent = 0

    try {
        let allItems = []
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

        const enrichedItems = []

        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i]

            try {
                const stat1d = await getPairStat(item.hash_name)
                if (!stat1d) continue

                const liquidity = calculateLiquidityScore(stat1d, item)

                enrichedItems.push({
                    ...item,
                    ...liquidity
                })

                jobState.percent = Math.round(((i + 1) / allItems.length) * 100)

                if (i % 5 === 0) {
                    await new Promise(res => setTimeout(res, 0))
                }

            } catch (err) {
                console.log("HATA:", item.name)
            }
        }


        const jsonItems = JSON.stringify(
            enrichedItems.sort((a, b) => a.last2Volume - b.last2Volume)
        )

        // ❗ make async
        await fs.promises.writeFile('./src/data/items.json', jsonItems)

    } catch (err) {
        console.error(err)
    } finally {
        jobState.percent = 100
        jobState.running = false
    }
}
