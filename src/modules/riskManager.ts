import db from '../db/database.js';

const GLOBAL_BUDGET = 50.0; // Max 50 GJN invested at any time
const MAX_ITEM_EXPOSURE = 1; // Max 1 copy of the same item at any time
let CIRCUIT_BREAKER_ACTIVE = false;
let CONSECUTIVE_LOSSES = 0;

export function isCircuitBreakerActive(): boolean {
    return CIRCUIT_BREAKER_ACTIVE;
}

export function activateCircuitBreaker(reason: string) {
    if (!CIRCUIT_BREAKER_ACTIVE) {
        CIRCUIT_BREAKER_ACTIVE = true;
        console.warn(`[RISK MANAGER] CIRCUIT BREAKER ACTIVATED: ${reason}. All automatic buying is paused.`);
        // TODO: Send Discord Webhook
    }
}

export function resetCircuitBreaker() {
    CIRCUIT_BREAKER_ACTIVE = false;
    CONSECUTIVE_LOSSES = 0;
    console.info('[RISK MANAGER] Circuit breaker reset. Trading resumed.');
}

export function recordTradeResult(profit: number) {
    if (profit < 0) {
        CONSECUTIVE_LOSSES++;
        if (CONSECUTIVE_LOSSES >= 3) {
            activateCircuitBreaker('3 consecutive losses detected');
        }
    } else {
        CONSECUTIVE_LOSSES = 0;
    }
}

export function canBuyItem(marketName: string, estimatedPrice: number): { allowed: boolean, reason?: string, currentInvested?: number } {
    if (CIRCUIT_BREAKER_ACTIVE) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Circuit breaker is active.`);
        return { allowed: false, reason: 'circuit_breaker' };
    }

    // 1. Calculate current global exposure
    const ordersQuery = db.prepare('SELECT market, type, localPrice FROM Orders').all() as { market: string, type: string, localPrice: number }[];
    
    let totalInvested = 0;
    let itemExposureCount = 0;

    for (const order of ordersQuery) {
        if (order.type === 'BUY') {
            totalInvested += (order.localPrice / 10000);
            if (order.market === marketName) itemExposureCount++;
        } else if (order.type === 'SELL') {
            // Money locked in an item waiting to sell
            totalInvested += (order.localPrice / 10000) * 0.85; // rough estimate of locked capital
            if (order.market === marketName) itemExposureCount++;
        }
    }

    // Add inventory basis to exposure
    const basisQuery = db.prepare('SELECT market_name, basis_prices FROM Basis').all() as { market_name: string, basis_prices: string }[];
    for (const row of basisQuery) {
        const prices: number[] = JSON.parse(row.basis_prices);
        for (const p of prices) {
            totalInvested += p;
            if (row.market_name === marketName) {
                itemExposureCount++;
            }
        }
    }

    // 2. Add leeway limit (Reserve 20% of global budget for outbidding leeway)
    const MAX_ALLOWED_INVESTMENT = GLOBAL_BUDGET * 0.80;
    if (totalInvested + estimatedPrice > MAX_ALLOWED_INVESTMENT) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Leeway budget exceeded (Invested + New: ${(totalInvested + estimatedPrice).toFixed(2)}, Max Allowed: ${MAX_ALLOWED_INVESTMENT.toFixed(2)})`);
        return { allowed: false, reason: 'budget_exceeded', currentInvested: totalInvested };
    }

    // 3. Prevent spending too much on a single item (Max 30% of global budget)
    const MAX_SINGLE_ITEM_COST = GLOBAL_BUDGET * 0.30;
    if (estimatedPrice > MAX_SINGLE_ITEM_COST) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Item is too expensive (${estimatedPrice.toFixed(2)}), exceeds 30% of global budget (${MAX_SINGLE_ITEM_COST.toFixed(2)})`);
        return { allowed: false, reason: 'item_too_expensive' };
    }

    if (itemExposureCount >= MAX_ITEM_EXPOSURE) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Max exposure limit reached (${itemExposureCount}/${MAX_ITEM_EXPOSURE})`);
        return { allowed: false, reason: 'max_exposure' };
    }

    return { allowed: true };
}
