import * as fs from 'fs';
import dotenv from 'dotenv';
import { post, marketPost, waitForAssetIdByMarketId, sellerShouldGet, getWalletBalance } from './helpers/helpers.js';
import express, { json } from 'express';
import cors from 'cors';
import { startRenewOrders } from './helpers/renewOrders.js';
import { scanMarketForOpportunities } from './modules/scanner.js';
import { performNightlyAudit } from './modules/audit.js';
import db from './db/database.js';
import snipeBuyRouter from "./routers/snipeBuy.route.js";
import { startGuardLoop } from './guard.js';
import { getBotSettings, updateBotSettings, isItemLiquidated, addLiquidateItem, removeLiquidateItem, getLiquidateItems } from './helpers/settingsManager.js';
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

app.get('/api/liquidate', (req, res) => {
    try {
        const items = getLiquidateItems();
        res.status(200).json({ success: true, items });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message });
    }
});

app.post('/api/liquidate/toggle', (req, res) => {
    try {
        const { market } = req.body;
        if (!market) {
            return res.status(400).json({ success: false, error: "Market name required" });
        }

        const currentlyLiquidated = isItemLiquidated(market);
        if (currentlyLiquidated) {
            removeLiquidateItem(market);
            res.status(200).json({
                success: true,
                liquidated: false,
                market,
                message: `${market} normal moda döndürüldü.`
            });
        } else {
            addLiquidateItem(market);
            res.status(200).json({
                success: true,
                liquidated: true,
                market,
                message: `${market} LİKİDASYON moduna alındı! (Guard kârsızlığa bakılmaksızın en ucuz satıcıya undercut atacaktır).`
            });
        }
    } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message });
    }
});

app.post('/api/liquidate/dump', async (req, res) => {
    try {
        const { market } = req.body;
        if (!market) {
            return res.status(400).json({ success: false, error: "Market name required" });
        }

        const token = process.env.TOKEN;
        if (!token) {
            return res.status(500).json({ success: false, error: "TOKEN not configured" });
        }

        // 1. Check for active orders for this market
        const liveOrders = await syncOpenOrders();

        // Cancel active BUY orders if any
        const activeBuys = liveOrders.filter(o => o.market === market && o.type === "BUY");
        for (const buy of activeBuys) {
            db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)').run(buy.id);
            await marketPost({
                action: "cancel_order",
                pairId: buy.pairId,
                orderId: buy.id,
                token
            });
        }

        // Cancel active SELL order if any so the item returns to inventory
        const activeSell = liveOrders.find(o => o.market === market && o.type === "SELL");
        if (activeSell) {
            console.log(`[DUMP] Cancelling active SELL order ${activeSell.id} for ${market}...`);
            db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)').run(activeSell.id);
            const cancelRes = await marketPost({
                action: "cancel_order",
                pairId: activeSell.pairId,
                orderId: activeSell.id,
                token
            });
            if (!cancelRes?.response?.success) {
                return res.status(500).json({ success: false, error: "Mevcut satış emri iptal edilemedi, işlem durduruldu." });
            }
            // Allow Gaijin inventory a moment to release the asset
            await new Promise(r => setTimeout(r, 1200));
        }

        // 2. Resolve normal ID for asset lookup
        const row = db.prepare('SELECT asset_id FROM IdMap WHERE market_name = ?').get(market) as { asset_id: number } | undefined;
        let normalID = row?.asset_id;
        if (!normalID) {
            const match = market.match(/(?:^id|^ugcitem_)(\d+)/);
            if (match) normalID = Number(match[1]);
        }

        if (!normalID) {
            return res.status(400).json({ success: false, error: `Bu ürün için market/asset ID (${market}) tespit edilemedi.` });
        }

        // 3. Find asset in inventory
        console.log(`[DUMP] Waiting for asset ID in inventory for normalID: ${normalID}...`);
        const assetId = await waitForAssetIdByMarketId(normalID, 15000);
        if (!assetId) {
            return res.status(400).json({ success: false, error: `Envanterde satılacak eşya (${market}) bulunamadı. Lütfen birkaç saniye sonra tekrar deneyin.` });
        }

        // 4. Fetch live order book to get the highest BUY bid
        const marketBooks = await post({
            action: "cln_books_brief",
            market_name: market,
            appid: 1067,
            token
        });

        const highestBidRaw = marketBooks?.response?.BUY?.[0]?.[0];
        if (!highestBidRaw || highestBidRaw <= 0) {
            return res.status(400).json({ success: false, error: `Tahtada bu eşyayı alacak hiçbir aktif BUY emri (alış teklifi) bulunmuyor.` });
        }

        const sellPrice = highestBidRaw;
        console.log(`[DUMP] Dumping ${market} at highest BUY bid: ${(sellPrice / 10000).toFixed(2)} GJN directly into buyer!`);

        // 5. Sell directly into highest BUY bid
        const sellRes = await post({
            action: "cln_market_sell",
            token: process.env.SELLTOKEN || token,
            transactid: Math.round(Math.random() * 100000),
            reqstamp: Date.now(),
            appid: 1067,
            contextid: 1,
            assetid: assetId,
            amount: 1,
            currencyid: "gjn",
            price: sellPrice,
            seller_should_get: sellerShouldGet(sellPrice),
            agree_stamp: Date.now(),
            market_name: market,
            privateMode: true
        });

        if (!sellRes?.response?.success) {
            return res.status(500).json({
                success: false,
                error: sellRes?.response?.error || "Gaijin market satışı başarısız oldu",
                details: sellRes
            });
        }

        // Remove from liquidation list since it's now sold/dumped
        removeLiquidateItem(market);

        // Re-sync user history and open orders
        try {
            const { syncUserHistory } = await import('./helpers/orderSync.js');
            await syncUserHistory();
            await syncOpenOrders();
        } catch {}

        const grossPrice = sellPrice / 10000;
        const netIncome = (sellPrice * 0.85) / 10000;

        res.status(200).json({
            success: true,
            market,
            sellPrice: grossPrice,
            netIncome,
            message: `${market} başarıyla ${grossPrice.toFixed(2)} GJN fiyatına anında nakde çevrildi! (Net hesabınıza geçen: +${netIncome.toFixed(2)} GJN)`
        });
    } catch (err: any) {
        console.error("[LIQUIDATE-DUMP] Error:", err);
        res.status(500).json({ success: false, error: err?.message || "Bilinmeyen bir hata oluştu" });
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

// Auto-seed recent trophy items (e.g. WTCS VI) so new items have full metadata
(async function seedRecentTrophyItems() {
    try {
        const row = db.prepare('SELECT hash_name FROM Items WHERE hash_name = ?').get('ugcitem_1002502');
        if (!row && process.env.TOKEN) {
            console.log("[ITEMS] Seeding recent WTCS items into Items table...");
            const res = await post({
                action: 'cln_market_search',
                appId: 1067,
                count: 100,
                tags: 'eventName:wtcs_trophy_6',
                token: process.env.TOKEN
            });
            if (res?.response?.assets) {
                const stmt = db.prepare('INSERT OR REPLACE INTO Items (hash_name, data) VALUES (?, ?)');
                for (const a of res.response.assets) {
                    stmt.run(a.hash_name, JSON.stringify(a));
                }
                console.log(`[ITEMS] Successfully seeded ${res.response.assets.length} items.`);
            }
        }
    } catch (e) {
        console.error("[ITEMS] Failed to seed recent trophy items:", e);
    }
})();

app.get('/orders', async (req, res) => {
    // 1. Always do a live sync of open orders & trade history from Gaijin!
    const liveOrders = await syncOpenOrders();

    // 2. Query items from database
    const itemsQuery = db.prepare('SELECT data FROM Items').all() as { data: string }[];
    let items = itemsQuery.map(row => JSON.parse(row.data));

    if (req.query.category) {
        const cat = String(req.query.category).toLowerCase();
        items = items.filter((item: any) => {
            if (!item.tags) return false;
            return item.tags.includes(`type:${cat}`) || item.tags.includes(`vehicleType:${cat}`);
        });
    }

    // 3. Map live active orders & liquidation state to items
    const liquidatedSet = new Set(getLiquidateItems());
    const itemMarketSet = new Set(items.map((i: any) => i.hash_name));

    const findItemInDb = (hashName: string) => {
        const row = db.prepare('SELECT data FROM Items WHERE hash_name = ?').get(hashName) as { data: string } | undefined;
        if (row?.data) {
            try { return JSON.parse(row.data); } catch {}
        }
        return null;
    };

    items = items.map((item: any) => {
        return {
            ...item,
            isLiquidated: liquidatedSet.has(item.hash_name),
            active_orders: liveOrders.filter((o: any) => o.market === item.hash_name)
        };
    });

    // 4. Ensure ALL active orders are present in the list with full metadata
    for (const order of liveOrders) {
        if (!itemMarketSet.has(order.market)) {
            itemMarketSet.add(order.market);
            const dbItem = findItemInDb(order.market);
            if (dbItem) {
                items.unshift({
                    ...dbItem,
                    isLiquidated: liquidatedSet.has(order.market),
                    active_orders: liveOrders.filter((o: any) => o.market === order.market)
                });
            } else {
                items.unshift({
                    hash_name: order.market,
                    name: order.market,
                    price: order.localPrice / 10000,
                    buy_price: order.localPrice / 10000,
                    profit: 0,
                    last2Volume: 0,
                    liquidityScore: 0,
                    tags: [],
                    isLiquidated: liquidatedSet.has(order.market),
                    active_orders: liveOrders.filter((o: any) => o.market === order.market)
                });
            }
        }
    }

    // 5. Ensure ALL liquidated items are present in the list even if not in liveOrders or category filtered
    for (const marketName of liquidatedSet) {
        if (!itemMarketSet.has(marketName)) {
            itemMarketSet.add(marketName);
            const dbItem = findItemInDb(marketName);
            const active = liveOrders.filter((o: any) => o.market === marketName);
            if (dbItem) {
                items.unshift({
                    ...dbItem,
                    isLiquidated: true,
                    active_orders: active
                });
            } else {
                items.unshift({
                    hash_name: marketName,
                    name: marketName,
                    price: active[0] ? (active[0].localPrice / 10000) : 0,
                    buy_price: 0,
                    profit: 0,
                    last2Volume: 0,
                    liquidityScore: 0,
                    tags: [],
                    isLiquidated: true,
                    active_orders: active
                });
            }
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

    const walletBalance = await getWalletBalance();

    const rawTxs = db.prepare(`
        SELECT 
            p.id,
            p.market,
            ROUND(p.sellPrice, 2) as sellPrice,
            ROUND(p.sellPrice * 0.85, 2) as netIncome,
            ROUND(p.basis, 2) as basis,
            ROUND(p.profit, 2) as profit,
            p.timestamp,
            TIME(p.timestamp, '+3 hours') as timeStr,
            DATE(p.timestamp, '+3 hours') as dateStr
        FROM Profits p
        ORDER BY p.id DESC
        LIMIT 10
    `).all() as any[];

    const recentTransactions = rawTxs.map(t => {
        const itemRow = db.prepare('SELECT data FROM Items WHERE hash_name = ?').get(t.market) as { data: string } | undefined;
        let displayName = t.market;
        let icon: string | undefined;
        if (itemRow?.data) {
            try {
                const parsed = JSON.parse(itemRow.data);
                displayName = parsed.name || displayName;
                icon = parsed.icon;
            } catch {}
        }
        return {
            ...t,
            name: displayName,
            icon
        };
    });

    res.status(200).send({
        success: true,
        data: items,
        liquidatedCount: liquidatedSet.size,
        totals: {
            buy: totalBuy,
            sell: totalSell,
            profit: totalProfit,
            todayProfit: todayProfit,
            walletBalance: walletBalance ?? 0
        },
        recentTransactions,
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