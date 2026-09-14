import db from './dist/db/database.js';
import { getInvAssets, post } from './dist/helpers/helpers.js';
import dotenv from 'dotenv';
dotenv.config();
async function cleanGhostBases() {
    const inv = await getInvAssets();
    const token = process.env.TOKEN;
    const json = await post({ action: 'cln_get_user_open_orders', token });
    const activeOrders = json.response || [];
    const idMapQuery = db.prepare('SELECT market_name, asset_id FROM IdMap').all();
    const normalIdToMarketName = {};
    for (const row of idMapQuery) {
        normalIdToMarketName[row.asset_id] = row.market_name;
    }
    const actualCounts = {};
    for (const item of inv) {
        const market = normalIdToMarketName[item.id];
        if (market) actualCounts[market] = (actualCounts[market] || 0) + 1;
    }
    for (const o of activeOrders) {
        if (o.type === 'SELL') actualCounts[o.market] = (actualCounts[o.market] || 0) + 1;
    }
    const basisQuery = db.prepare('SELECT market_name, basis_prices FROM Basis').all();
    let totalRemoved = 0;
    for (const row of basisQuery) {
        const prices = JSON.parse(row.basis_prices);
        const actualCount = actualCounts[row.market_name] || 0;
        if (prices.length > actualCount) {
            console.log(`Mismatch for ${row.market_name}: Basis has ${prices.length}, but we only own ${actualCount}.`);
            const newPrices = prices.slice(0, actualCount);
            const removedValue = prices.slice(actualCount).reduce((a, b) => a + b, 0);
            totalRemoved += removedValue;
            if (newPrices.length === 0) {
                db.prepare('DELETE FROM Basis WHERE market_name = ?').run(row.market_name);
            } else {
                db.prepare('UPDATE Basis SET basis_prices = ? WHERE market_name = ?').run(JSON.stringify(newPrices), row.market_name);
            }
        }
    }
    console.log(`Cleanup complete. Removed ${totalRemoved.toFixed(2)} GJN worth of ghost basis records!`);
}
cleanGhostBases();
