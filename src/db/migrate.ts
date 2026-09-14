import fs from 'fs';
import path from 'path';
import db from './database.js';

console.log("Migrating JSON data to SQLite...");

// 1. Migrate Orders
const ordersPath = path.resolve(process.cwd(), 'data', 'orders.json');
if (fs.existsSync(ordersPath)) {
    try {
        const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
        if (Array.isArray(orders)) {
            const insertOrder = db.prepare('INSERT OR IGNORE INTO Orders (id, pairId, market, type, localPrice) VALUES (@id, @pairId, @market, @type, @localPrice)');
            
            db.transaction(() => {
                for (const order of orders) {
                    insertOrder.run({
                        id: order.id.toString(),
                        pairId: order.pairId,
                        market: order.market,
                        type: order.type,
                        localPrice: order.localPrice
                    });
                }
            })();
            console.log(`Migrated ${orders.length} orders.`);
        }
    } catch (e) {
        console.error("Failed to migrate orders:", e);
    }
}

// 2. Migrate Basis
const basisPath = path.resolve(process.cwd(), 'data', 'basis.json');
if (fs.existsSync(basisPath)) {
    try {
        const basisData = JSON.parse(fs.readFileSync(basisPath, 'utf8'));
        const insertBasis = db.prepare('INSERT OR IGNORE INTO Basis (market_name, basis_prices) VALUES (@market_name, @basis_prices)');
        
        db.transaction(() => {
            for (const [market, prices] of Object.entries(basisData)) {
                insertBasis.run({
                    market_name: market,
                    basis_prices: JSON.stringify(prices)
                });
            }
        })();
        console.log(`Migrated basis for ${Object.keys(basisData).length} markets.`);
    } catch (e) {
        console.error("Failed to migrate basis:", e);
    }
}

// 3. Migrate Items
const itemsPath = path.resolve(process.cwd(), 'data', 'items.json');
if (fs.existsSync(itemsPath)) {
    try {
        const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
        if (Array.isArray(items)) {
            const insertItem = db.prepare('INSERT OR REPLACE INTO Items (hash_name, data) VALUES (@hash_name, @data)');
            
            db.transaction(() => {
                for (const item of items) {
                    insertItem.run({
                        hash_name: item.hash_name,
                        data: JSON.stringify(item)
                    });
                }
            })();
            console.log(`Migrated ${items.length} items.`);
        }
    } catch (e) {
        console.error("Failed to migrate items:", e);
    }
}

// 4. Migrate IdMap
const idMapPath = path.resolve(process.cwd(), 'data', 'id_map.json');
if (fs.existsSync(idMapPath)) {
    try {
        const idMap = JSON.parse(fs.readFileSync(idMapPath, 'utf8'));
        const insertIdMap = db.prepare('INSERT OR IGNORE INTO IdMap (market_name, asset_id) VALUES (@market_name, @asset_id)');
        
        db.transaction(() => {
            for (const [market, assetId] of Object.entries(idMap)) {
                insertIdMap.run({
                    market_name: market,
                    asset_id: assetId
                });
            }
        })();
        console.log(`Migrated ${Object.keys(idMap).length} id maps.`);
    } catch (e) {
        console.error("Failed to migrate id_map:", e);
    }
}

console.log("Migration complete!");
