import db from '../db/database.js';
import { getInvAssets } from '../helpers/helpers.js';

export async function performNightlyAudit() {
    console.log("[AUDIT] Starting nightly inventory audit...");
    
    try {
        const inv = await getInvAssets();
        let orphanCount = 0;
        
        // Find items in inventory that don't have a basis in our local database
        const basisQuery = db.prepare('SELECT market_name FROM Basis').all() as { market_name: string }[];
        const basisMarkets = new Set(basisQuery.map(b => b.market_name));
        
        // We need id_map to map inventory assetId back to market_name
        const idMapQuery = db.prepare('SELECT market_name, asset_id FROM IdMap').all() as { market_name: string, asset_id: number }[];
        const assetToMarketMap = new Map<number, string>();
        for (const row of idMapQuery) {
            assetToMarketMap.set(row.asset_id, row.market_name);
        }

        for (const item of inv) {
            const marketName = assetToMarketMap.get(item.id);
            if (marketName && !basisMarkets.has(marketName)) {
                // This item is in our inventory but we have no basis for it. It's an orphan!
                orphanCount++;
                console.warn(`[AUDIT] Orphan detected: ${marketName} (AssetID: ${item.assetId})`);
                
                // We don't know the exact buy price, so we rely on the guard's fallback mechanism 
                // which will use highestBid when it gets picked up by Auto-Lister.
                // But we log it to keep track.
            }
        }
        
        console.log(`[AUDIT] Audit complete. Found ${orphanCount} orphaned items in inventory.`);
    } catch (e) {
        console.error("[AUDIT] Failed to perform nightly audit:", e);
    }
}
