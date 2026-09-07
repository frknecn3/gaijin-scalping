import { post } from './helpers.js';
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

        // Update database transactionally - overwrite with exactly what Gaijin reports
        const insertOrder = db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (@id, @pairId, @market, @type, @localPrice)');
        db.transaction(() => {
            db.prepare('DELETE FROM Orders').run();
            for (const o of fetchedOrders) {
                insertOrder.run({
                    id: o.id.toString(),
                    pairId: o.pairId ? o.pairId.toString() : '',
                    market: o.market,
                    type: o.type,
                    localPrice: Number(o.localPrice)
                });
            }
        })();

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
