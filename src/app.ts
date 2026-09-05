import * as fs from 'fs';
import dotenv from 'dotenv';
import { post } from './helpers/helpers.js';
import express, { json } from 'express';
import cors from 'cors';
import { startRenewOrders } from './helpers/renewOrders.js';
import db from './db/database.js';
import snipeBuyRouter from "./routers/snipeBuy.route.js";
dotenv.config();
// Node 18+ (native fetch)

// function sleep(ms:number) {
//     return new Promise(res => setTimeout(res, ms));
// }

const app = express();

app.use(cors())
app.use(json())

let jobState: JobState = {
    running: false,
    percent: 0
}

app.get('/progress', async (req, res) => {
    res.status(200).send(jobState)
})


app.get('/renewOrders', (req, res): void => {
    if (jobState.running) {
        res.status(400).send({ message: 'Already running' })
        return  // ⬅️ stop here
    }
    const isHardRefresh = req.query.hard === 'true';
    startRenewOrders(jobState, isHardRefresh); // fire-and-forget
    res.send({ started: true })
})

// Continuous Autonomous Engine
async function autoRefreshLoop() {
    console.log("[AUTO-REFRESH] Autonomous engine started.");
    let scanCount = 0;
    while (true) {
        if (!jobState.running) {
            scanCount++;
            const isHardScan = (scanCount % 10 === 0);
            
            console.log(`[AUTO-REFRESH] Triggering new scan (Scan #${scanCount}, Hard Scan: ${isHardScan})...`);
            
            await startRenewOrders(jobState, isHardScan);
            
            console.log(`[AUTO-REFRESH] Scan #${scanCount} complete. Waiting 5 seconds before next cycle...`);
        }
        await new Promise(res => setTimeout(res, 5000));
    }
}

// Start the engine
autoRefreshLoop();

app.get('/orders', async (req, res) => {
    const itemsQuery = db.prepare('SELECT data FROM Items').all() as { data: string }[];
    let items = itemsQuery.map(row => JSON.parse(row.data));

    if (req.query.category) {
        items = items.filter((item: any) => {
            if (item.tags.includes(`type:${req.query.category}`))
                return item
        })
    }

    const ordersQuery = db.prepare('SELECT * FROM Orders').all() as any[];
    let openOrders = ordersQuery;

    items = items.map((item: any) => {
        return {
            ...item,
            active_orders: openOrders.filter((o: any) => o.market === item.hash_name)
        }
    });

    let totalBuy = 0;
    let totalSell = 0;
    for (const o of openOrders) {
        if (o.type === "BUY") totalBuy += (o.localPrice / 10000);
        if (o.type === "SELL") totalSell += (o.localPrice / 10000) * 0.85;
    }

    res.status(200).send({
        success: true,
        data: items,
        totals: {
            buy: totalBuy,
            sell: totalSell
        },
        message: "Ürünler gönderildi."
    })

})

app.get('/item/:id', async (req, res) => {

    try {
        const { id } = req.params;

        const token = process.env.TOKEN;

        const market = await post({
            action: "cln_books_brief",
            market_name: id,
            appid: 1067,
            token,
        })

        // let items = JSON.parse(await fs.promises.readFile('./data/items.json', 'utf-8'))

        // items = items.map((i) => i.hash_name !== market.response.hash_name)

        console.log("market: \n\n", market)

        res.status(200).send({
            success: true,
            data: {
                id: id,
                BUY: market.response.BUY[0][0],
                SELL: market.response.SELL[0][0]
            },
            message: "Ürünler gönderildi."
        })
    }
    catch (err) {
        console.log("ERR ITEM ID: ", err)
        res.status(500).send({
            success: false,
            err: err
        })
    }

})

app.use(snipeBuyRouter);

app.listen(4000, () => {
    console.log('Sunucu 4000 portunu dinlemeye başladı.')
})