import * as fs from 'fs';
import dotenv from 'dotenv';
import { post } from './helpers/helpers.js';
import express, { json } from 'express';
import cors from 'cors';
import { startRenewOrders } from './helpers/renewOrders.js';
import { scanMarketForOpportunities } from './modules/scanner.js';
import { performNightlyAudit } from './modules/audit.js';
import db from './db/database.js';
import snipeBuyRouter from "./routers/snipeBuy.route.js";
import { startGuardLoop } from './guard.js';
import { getBotSettings, updateBotSettings } from './helpers/settingsManager.js';
import { syncOpenOrders } from './helpers/orderSync.js';
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

app.get('/settings', (req, res) => {
    const settings = getBotSettings();
    res.status(200).json({ success: true, settings });
});

app.post('/settings', (req, res) => {
    try {
        const updated = updateBotSettings(req.body);
        res.status(200).json({ success: true, settings: updated });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message });
    }
});

app.get('/api/profits', async (req, res) => {
    try {
        const { syncUserHistory } = await import('./helpers/orderSync.js');
        await syncUserHistory();
        const rows = db.prepare('SELECT * FROM Profits ORDER BY id DESC LIMIT 50').all();
        const total = db.prepare('SELECT SUM(profit) as total FROM Profits').get() as { total: number };
        res.status(200).json({ success: true, total: total.total || 0, profits: rows });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message });
    }
});

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
            
            // 1. Audit check every 100 scans
            if (scanCount % 100 === 0) {
                await performNightlyAudit();
            }

            const isHardScan = (scanCount % 10 === 0);
            
            console.log(`[AUTO-REFRESH] Triggering new data fetch (Scan #${scanCount}, Hard Scan: ${isHardScan})...`);
            
            // 2. Fetch market data
            await startRenewOrders(jobState, isHardScan);
            
            // 3. Scan the new data for opportunities
            await scanMarketForOpportunities();

            console.log(`[AUTO-REFRESH] Scan #${scanCount} complete. Waiting 5 seconds before next cycle...`);
        }
        await new Promise(res => setTimeout(res, 5000));
    }
}

// Start the engine
autoRefreshLoop();
startGuardLoop();

app.get('/orders', async (req, res) => {
    // 1. Always do a live sync of open orders & trade history from Gaijin!
    const liveOrders = await syncOpenOrders();

    // 2. Query items from database
    const itemsQuery = db.prepare('SELECT data FROM Items').all() as { data: string }[];
    let items = itemsQuery.map(row => JSON.parse(row.data));

    if (req.query.category) {
        items = items.filter((item: any) => {
            if (item.tags && item.tags.includes(`type:${req.query.category}`))
                return item;
        });
    }

    // 3. Map live active orders to items
    const itemMarketSet = new Set(items.map((i: any) => i.hash_name));

    items = items.map((item: any) => {
        return {
            ...item,
            active_orders: liveOrders.filter((o: any) => o.market === item.hash_name)
        };
    });

    // 4. If there are active orders for items not currently in the filtered Items table,
    // synthesize an entry so they never disappear or get orphaned in the UI!
    for (const order of liveOrders) {
        if (!itemMarketSet.has(order.market)) {
            itemMarketSet.add(order.market);
            items.unshift({
                hash_name: order.market,
                name: order.market,
                price: order.localPrice / 10000,
                buy_price: order.localPrice / 10000,
                profit: 0,
                last2Volume: 0,
                liquidityScore: 0,
                tags: [],
                active_orders: liveOrders.filter((o: any) => o.market === order.market)
            });
        }
    }

    let totalBuy = 0;
    let totalSell = 0;
    for (const o of liveOrders) {
        if (o.type === "BUY") totalBuy += (o.localPrice / 10000);
        if (o.type === "SELL") totalSell += (o.localPrice / 10000) * 0.85;
    }

    const totalProfitQuery = db.prepare('SELECT SUM(profit) as total FROM Profits').get() as { total: number };
    const totalProfit = totalProfitQuery.total || 0;

    res.status(200).send({
        success: true,
        data: items,
        totals: {
            buy: totalBuy,
            sell: totalSell,
            profit: totalProfit
        },
        message: "Ürünler gönderildi."
    });
});

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
                BUY: market.response?.BUY?.[0]?.[0] ?? 0,
                SELL: market.response?.SELL?.[0]?.[0] ?? 0
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

// Serve static frontend files
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.join(__dirname, '../frontend/dist');

app.use(express.static(frontendDistPath));

app.get('{*splat}', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunu dinlemeye başladı.`)
})