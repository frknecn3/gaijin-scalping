import db from '../db/database.js';
import { getWalletBalance } from '../helpers/helpers.js';

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

export async function canBuyItem(marketName: string, estimatedPrice: number): Promise<{ allowed: boolean, reason?: string, availableBalance?: number }> {
    if (CIRCUIT_BREAKER_ACTIVE) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Circuit breaker is active.`);
        return { allowed: false, reason: 'circuit_breaker' };
    }

    // 1. Exposure and Open Order check
    const ordersQuery = db.prepare('SELECT market, type FROM Orders').all() as { market: string, type: string }[];
    
    let itemExposureCount = 0;
    let hasOpenBuyOrder = false;

    for (const order of ordersQuery) {
        if (order.type === 'BUY') {
            if (order.market === marketName) {
                itemExposureCount++;
                hasOpenBuyOrder = true;
            }
        } else if (order.type === 'SELL') {
            if (order.market === marketName) itemExposureCount++;
        }
    }

    // STRICT CHECK: If an open BUY order already exists for this item, never place another one!
    if (hasOpenBuyOrder) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Already buying this item (open BUY order exists).`);
        return { allowed: false, reason: 'already_buying' };
    }

    // Add inventory basis to exposure
    const basisQuery = db.prepare('SELECT market_name, basis_prices FROM Basis WHERE market_name = ?').get(marketName) as { market_name: string, basis_prices: string } | undefined;
    if (basisQuery) {
        const prices: number[] = JSON.parse(basisQuery.basis_prices);
        itemExposureCount += prices.length;
    }

    if (itemExposureCount >= MAX_ITEM_EXPOSURE) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Max exposure limit reached (${itemExposureCount}/${MAX_ITEM_EXPOSURE})`);
        return { allowed: false, reason: 'max_exposure' };
    }

    // 2. Real-time Gaijin Wallet Balance Check
    const liveBalance = await getWalletBalance();
    if (liveBalance !== null) {
        console.log(`[RISK MANAGER] Live Gaijin Wallet Balance: ${liveBalance.toFixed(2)} GJN. Required: ${estimatedPrice.toFixed(2)} GJN`);
        if (estimatedPrice > liveBalance) {
            console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Insufficient live balance (Price: ${estimatedPrice.toFixed(2)} GJN, Balance: ${liveBalance.toFixed(2)} GJN)`);
            return { allowed: false, reason: 'budget_exceeded', availableBalance: liveBalance };
        }
    } else {
        console.warn(`[RISK MANAGER] Could not fetch live wallet balance, proceeding with safety check.`);
    }

    return { allowed: true };
}
