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

        // Optional query filters: limit, day ('today' | 'yesterday' | 'YYYY-MM-DD'), market
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 0;
        const dayFilter = req.query.day as string | undefined;
        const marketFilter = req.query.market as string | undefined;

        let query = `
            SELECT 
                id, 
                market, 
                ROUND(sellPrice, 4) as sellPrice, 
                ROUND(sellPrice * 0.85, 4) as netIncome,
                ROUND(basis, 4) as basis, 
                ROUND(profit, 4) as profit,
                CASE 
                    WHEN basis > 0 THEN ROUND((profit / basis) * 100, 2)
                    ELSE 0 
                END as roiPercent,
                CASE 
                    WHEN profit > 0.0001 THEN 'WIN'
                    WHEN profit < -0.0001 THEN 'LOSS'
                    ELSE 'BREAKEVEN'
                END as status,
                timestamp,
                DATE(timestamp, '+3 hours') as localDate,
                TIME(timestamp, '+3 hours') as localTime
            FROM Profits
        `;

        const params: any[] = [];
        const conditions: string[] = [];

        if (dayFilter === 'today') {
            conditions.push("DATE(timestamp, '+3 hours') = DATE('now', '+3 hours')");
        } else if (dayFilter === 'yesterday') {
            conditions.push("DATE(timestamp, '+3 hours') = DATE('now', '+3 hours', '-1 day')");
        } else if (dayFilter && /^\d{4}-\d{2}-\d{2}$/.test(dayFilter)) {
            conditions.push("DATE(timestamp, '+3 hours') = ?");
            params.push(dayFilter);
        }

        if (marketFilter) {
            conditions.push("market LIKE ?");
            params.push(`%${marketFilter}%`);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY id DESC";

        if (limit > 0) {
            query += ` LIMIT ${limit}`;
        }

        const rows = db.prepare(query).all(...params);

        // Compute Lifetime Totals
        const lifetime = db.prepare(`
            SELECT 
                ROUND(SUM(profit), 4) as totalProfit,
                ROUND(SUM(sellPrice), 4) as totalVolume,
                ROUND(SUM(basis), 4) as totalBasis,
                COUNT(*) as totalDeals,
                SUM(CASE WHEN profit > 0.0001 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN profit < -0.0001 THEN 1 ELSE 0 END) as losses,
                SUM(CASE WHEN ABS(profit) <= 0.0001 THEN 1 ELSE 0 END) as breakeven
            FROM Profits
        `).get() as any;

        // Today's total (UTC+3)
        const todayRow = db.prepare(`
            SELECT 
                ROUND(SUM(profit), 4) as profit,
                ROUND(SUM(sellPrice), 4) as volume,
                COUNT(*) as count,
                SUM(CASE WHEN profit > 0.0001 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN profit < -0.0001 THEN 1 ELSE 0 END) as losses
            FROM Profits 
            WHERE DATE(timestamp, '+3 hours') = DATE('now', '+3 hours')
        `).get() as any;

        // Yesterday's total (UTC+3)
        const yesterdayRow = db.prepare(`
            SELECT 
                ROUND(SUM(profit), 4) as profit,
                ROUND(SUM(sellPrice), 4) as volume,
                COUNT(*) as count,
                SUM(CASE WHEN profit > 0.0001 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN profit < -0.0001 THEN 1 ELSE 0 END) as losses
            FROM Profits 
            WHERE DATE(timestamp, '+3 hours') = DATE('now', '+3 hours', '-1 day')
        `).get() as any;

        // Daily breakdown summary
        const dailySummary = db.prepare(`
            SELECT 
                DATE(timestamp, '+3 hours') as day,
                COUNT(*) as trades,
                ROUND(SUM(profit), 4) as totalProfit,
                ROUND(SUM(sellPrice), 4) as totalVolume,
                ROUND(SUM(basis), 4) as totalBasis,
                SUM(CASE WHEN profit > 0.0001 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN profit < -0.0001 THEN 1 ELSE 0 END) as losses,
                SUM(CASE WHEN ABS(profit) <= 0.0001 THEN 1 ELSE 0 END) as breakeven,
                ROUND((CAST(SUM(CASE WHEN profit > 0.0001 THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) * 100, 1) as winRatePercent
            FROM Profits 
            GROUP BY day 
            ORDER BY day DESC
        `).all();

        const totalDeals = lifetime?.totalDeals || 0;
        const totalWins = lifetime?.wins || 0;
        const winRate = totalDeals > 0 ? Number(((totalWins / totalDeals) * 100).toFixed(1)) : 0;

        res.status(200).json({
            success: true,
            total: lifetime?.totalProfit || 0,
            today: todayRow?.profit || 0,
            yesterday: yesterdayRow?.profit || 0,
            stats: {
                totalDeals,
                totalVolume: lifetime?.totalVolume || 0,
                totalBasis: lifetime?.totalBasis || 0,
                totalProfit: lifetime?.totalProfit || 0,
                wins: totalWins,
                losses: lifetime?.losses || 0,
                breakeven: lifetime?.breakeven || 0,
                winRatePercent: winRate,
                today: {
                    trades: todayRow?.count || 0,
                    profit: todayRow?.profit || 0,
                    volume: todayRow?.volume || 0,
                    wins: todayRow?.wins || 0,
                    losses: todayRow?.losses || 0
                },
                yesterday: {
                    trades: yesterdayRow?.count || 0,
                    profit: yesterdayRow?.profit || 0,
                    volume: yesterdayRow?.volume || 0,
                    wins: yesterdayRow?.wins || 0,
                    losses: yesterdayRow?.losses || 0
                }
            },
            dailySummary,
            count: rows.length,
            profits: rows,
            transactions: rows
        });
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
    const todayProfitQuery = db.prepare("SELECT SUM(profit) as today FROM Profits WHERE DATE(timestamp, '+3 hours') = DATE('now', '+3 hours')").get() as { today: number };
    const todayProfit = todayProfitQuery.today || 0;

    res.status(200).send({
        success: true,
        data: items,
        totals: {
            buy: totalBuy,
            sell: totalSell,
            profit: totalProfit,
            todayProfit: todayProfit
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