import { post } from './helpers.js';
import db from '../db/database.js';
import { addBasis } from './basisTracker.js';

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

/**
 * Synchronizes the local SQLite `Orders` table with Gaijin's active open orders.
 * Also checks for fulfilled BUY orders to automatically track cost basis.
 * Returns the list of currently open orders.
 */
export async function syncOpenOrders(): Promise<GaijinOpenOrder[]> {
    const token = process.env.TOKEN;
    if (!token) {
        console.warn("[SYNC-ORDERS] No TOKEN provided. Reading local Orders table only.");
        return db.prepare('SELECT * FROM Orders').all() as GaijinOpenOrder[];
    }

    try {
        const json = await post({ action: "cln_get_user_open_orders", token });
        if (!json || !Array.isArray(json.response)) {
            console.warn("[SYNC-ORDERS] Invalid response from cln_get_user_open_orders:", json);
            return db.prepare('SELECT * FROM Orders').all() as GaijinOpenOrder[];
        }

        const fetchedOrders: any[] = json.response;
        const previousStandingOrders = db.prepare('SELECT * FROM Orders').all() as any[];

        // Update database transactionally
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

        // Check for fulfilled BUY orders to record cost basis
        for (const oldOrder of previousStandingOrders) {
            if (oldOrder.type === "BUY") {
                const stillOpen = fetchedOrders.find((o: any) => o.id.toString() === oldOrder.id.toString());
                if (!stillOpen && !isCancelled(oldOrder.id)) {
                    console.log(`[SYNC-ORDERS] BUY order fulfilled for ${oldOrder.market} at ${(oldOrder.localPrice / 10000).toFixed(2)} GJN`);
                    addBasis(oldOrder.market, oldOrder.localPrice / 10000);
                }
            }
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
