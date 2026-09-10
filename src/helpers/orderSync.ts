import { post, getInvAssets } from './helpers.js';
import db from '../db/database.js';
import { addBasis, consumeBasis, getAvailableBases } from './basisTracker.js';

function isCancelled(orderId: number | string): boolean {
    const row = db.prepare('SELECT id FROM CancelledOrders WHERE id = ?').get(orderId);
    return !!row;
}

export interface GaijinOpenOrder {
    id: number | string;
    pairId: string;
    market: string;
    type: 'BUY' | 'SELL';
    localPrice: number;
}

export interface GaijinHistoryEvent {
    id: string;
    ts: number;
    orderId: string;
    type: 'BUY' | 'SELL';
    currency: string;
    price: number;
    count: number;
    event: 'new' | 'deal' | 'cancel';
    appid: number;
    hashname: string;
    cancelReason?: string;
}

/**
 * Synchronizes recent trade history events from Gaijin.
 * - 'deal' on BUY: Confirmed purchase -> recorded to Basis.
 * - 'deal' on SELL: Confirmed sale -> computes realized profit and logs to Profits.
 * - 'cancel': Confirmed cancellation -> logs to CancelledOrders so it's never treated as a fill.
 */
export async function syncUserHistory(): Promise<void> {
    const token = process.env.TOKEN;
    if (!token) return;

    try {
        const json = await post({
            action: "cln_get_user_history",
            token,
            count: 100,
            skip: 0
        });

        if (!json?.response?.success || !Array.isArray(json.response.events)) {
            return;
        }

        const events: GaijinHistoryEvent[] = json.response.events;
        // Sort chronologically ascending so oldest new deals process first
        events.sort((a, b) => a.ts - b.ts);

        const checkProcessed = db.prepare('SELECT id FROM ProcessedEvents WHERE id = ?');
        const markProcessed = db.prepare('INSERT INTO ProcessedEvents (id) VALUES (?)');
        const insertCancelled = db.prepare('INSERT OR IGNORE INTO CancelledOrders (id) VALUES (?)');
        const insertProfit = db.prepare('INSERT INTO Profits (market, sellPrice, basis, profit) VALUES (@market, @sellPrice, @basis, @profit)');

        for (const ev of events) {
            const alreadyProcessed = checkProcessed.get(ev.id);
            if (alreadyProcessed) continue;

            if (ev.event === "cancel") {
                insertCancelled.run(ev.orderId);
            } else if (ev.event === "deal") {
                const dealPrice = ev.price / 10000;

                if (ev.type === "BUY") {
                    console.log(`[HISTORY] Confirmed BUY deal: ${ev.hashname} at ${dealPrice.toFixed(2)} GJN`);
                    addBasis(ev.hashname, dealPrice);
                } else if (ev.type === "SELL") {
                    const available = getAvailableBases(ev.hashname);
                    const basis = available.length > 0 ? available[0] : (dealPrice * 0.85); // fallback if basis unknown
                    consumeBasis(ev.hashname);
                    const netIncome = dealPrice * 0.85;
                    const profit = netIncome - basis;
                    console.log(`[HISTORY] Confirmed SELL deal: ${ev.hashname} at ${dealPrice.toFixed(2)} GJN (Net: ${netIncome.toFixed(2)}, Basis: ${basis.toFixed(2)}, Profit: ${profit.toFixed(2)} GJN)`);
                    insertProfit.run({
                        market: ev.hashname,
                        sellPrice: dealPrice,
                        basis,
                        profit
                    });
                }
            }

            markProcessed.run(ev.id);
        }
    } catch (err) {
        console.error("[SYNC-HISTORY] Error syncing user trade history:", err);
    }
}

/**
 * Synchronizes the local SQLite `Orders` table with Gaijin's active open orders.
 * Also runs syncUserHistory to ensure 100% accurate cost basis and real trade profit logging.
 * Returns the list of currently open orders.
 */
export async function syncOpenOrders(): Promise<GaijinOpenOrder[]> {
    const token = process.env.TOKEN;
    if (!token) {
        console.warn("[SYNC-ORDERS] No TOKEN provided. Reading local Orders table only.");
        return db.prepare('SELECT * FROM Orders').all() as GaijinOpenOrder[];
    }

    // Sync official trade history first to ensure basis and profits are perfectly up to date
    await syncUserHistory();

    try {
        const json = await post({ action: "cln_get_user_open_orders", token });
        if (!json || !Array.isArray(json.response)) {
            console.warn("[SYNC-ORDERS] Invalid response from cln_get_user_open_orders:", json);
            return db.prepare('SELECT * FROM Orders').all() as GaijinOpenOrder[];
        }

        const fetchedOrders: any[] = json.response;

        // Update database transactionally - overwrite confirmed orders while preserving in-flight pending orders
        const insertOrder = db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (@id, @pairId, @market, @type, @localPrice)');
        db.transaction(() => {
            // 1. Preserve recent pending orders in flight
            const pendingOrders = db.prepare("SELECT * FROM Orders WHERE id LIKE 'pending_%'").all() as GaijinOpenOrder[];

            // 2. Clear non-pending orders
            db.prepare("DELETE FROM Orders WHERE id NOT LIKE 'pending_%'").run();

            // 3. Insert fresh orders from Gaijin
            const fetchedMarkets = new Set<string>();
            for (const o of fetchedOrders) {
                fetchedMarkets.add(o.market);
                insertOrder.run({
                    id: o.id.toString(),
                    pairId: o.pairId ? o.pairId.toString() : '',
                    market: o.market,
                    type: o.type,
                    localPrice: Number(o.localPrice)
                });
            }

            // 4. Clean up pending orders if now confirmed by Gaijin or if expired (> 45s)
            const now = Date.now();
            for (const p of pendingOrders) {
                const parts = p.id.toString().split('_');
                const orderTs = Number(parts[1]) || 0;
                const isExpired = (now - orderTs) > 45000;
                if (fetchedMarkets.has(p.market) || isExpired) {
                    db.prepare('DELETE FROM Orders WHERE id = ?').run(p.id);
                }
            }
        })();

        // Reconcile Basis with ACTUAL inventory from Gaijin
        // If an item is NOT in the real Gaijin inventory, it MUST NOT exist in Basis!
        try {
            const realInv = await getInvAssets();
            const idMapRows = db.prepare('SELECT market_name, asset_id FROM IdMap').all() as { market_name: string, asset_id: number }[];
            const normalIdToMarket: Record<number, string> = {};
            for (const r of idMapRows) normalIdToMarket[r.asset_id] = r.market_name;

            const actualInvCounts: Record<string, number> = {};
            for (const asset of realInv) {
                const marketName = normalIdToMarket[Number(asset.id)];
                if (marketName) {
                    actualInvCounts[marketName] = (actualInvCounts[marketName] || 0) + 1;
                }
            }

            // Also count items currently listed as open SELL orders!
            // When an item is listed for sale on Gaijin Market, it temporarily leaves the user inventory.
            const openSellCounts: Record<string, number> = {};
            for (const o of fetchedOrders) {
                if (o.type === "SELL") {
                    openSellCounts[o.market] = (openSellCounts[o.market] || 0) + 1;
                }
            }

            const allBasis = db.prepare('SELECT market_name, basis_prices FROM Basis').all() as { market_name: string, basis_prices: string }[];
            for (const b of allBasis) {
                const totalOwned = (actualInvCounts[b.market_name] || 0) + (openSellCounts[b.market_name] || 0);
                let prices: number[] = JSON.parse(b.basis_prices);
                if (totalOwned === 0) {
                    // Item is no longer in inventory or on sale! Remove ghost basis
                    db.prepare('DELETE FROM Basis WHERE market_name = ?').run(b.market_name);
                } else if (prices.length > totalOwned) {
                    // Prune excess ghost bases down to the actual quantity owned + listed
                    prices = prices.slice(0, totalOwned);
                    db.prepare('UPDATE Basis SET basis_prices = ? WHERE market_name = ?').run(JSON.stringify(prices), b.market_name);
                }
            }
        } catch (invErr) {
            console.error("[SYNC-ORDERS] Error reconciling Basis with live inventory:", invErr);
        }

        return fetchedOrders.map(o => ({
            id: o.id.toString(),
            pairId: o.pairId ? o.pairId.toString() : '',
            market: o.market,
            type: o.type,
            localPrice: Number(o.localPrice)
        }));
    } catch (err) {
        console.error("[SYNC-ORDERS] Error syncing open orders:", err);
        return db.prepare('SELECT * FROM Orders').all() as GaijinOpenOrder[];
    }
}
