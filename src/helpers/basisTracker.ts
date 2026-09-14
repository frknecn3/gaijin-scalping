import db from '../db/database.js';

export function addBasis(market: string, price: number) {
    const row = db.prepare('SELECT basis_prices FROM Basis WHERE market_name = ?').get(market) as { basis_prices: string } | undefined;
    
    let prices: number[] = [];
    if (row && row.basis_prices) {
        prices = JSON.parse(row.basis_prices);
    }
    
    prices.push(price);
    prices.sort((a, b) => b - a); // highest cost basis first
    
    db.prepare(`
        INSERT INTO Basis (market_name, basis_prices)
        VALUES (@market, @prices)
        ON CONFLICT(market_name) DO UPDATE SET basis_prices = @prices
    `).run({ market, prices: JSON.stringify(prices) });
}

export function consumeBasis(market: string) {
    const row = db.prepare('SELECT basis_prices FROM Basis WHERE market_name = ?').get(market) as { basis_prices: string } | undefined;
    
    if (row && row.basis_prices) {
        const prices: number[] = JSON.parse(row.basis_prices);
        if (prices.length > 0) {
            prices.shift(); // consume highest
            
            if (prices.length === 0) {
                db.prepare('DELETE FROM Basis WHERE market_name = ?').run(market);
            } else {
                db.prepare('UPDATE Basis SET basis_prices = ? WHERE market_name = ?').run(JSON.stringify(prices), market);
            }
        }
    }
}

export function getAvailableBases(market: string): number[] {
    const row = db.prepare('SELECT basis_prices FROM Basis WHERE market_name = ?').get(market) as { basis_prices: string } | undefined;
    if (row && row.basis_prices) {
        return JSON.parse(row.basis_prices);
    }
    return [];
}
