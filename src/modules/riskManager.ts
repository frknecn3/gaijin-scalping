import db from '../db/database.js';
import { getWalletBalance } from '../helpers/helpers.js';
import { getBotSettings } from '../helpers/settingsManager.js';

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

export function acquireBuyLock(marketName: string, durationSeconds = 60): boolean {
    const now = Date.now();
    const existing = db.prepare('SELECT locked_until FROM BuyLocks WHERE market_name = ?').get(marketName) as { locked_until: number } | undefined;
    if (existing && existing.locked_until > now) {
        return false;
    }
    const lockedUntil = now + (durationSeconds * 1000);
    db.prepare('INSERT OR REPLACE INTO BuyLocks (market_name, locked_until) VALUES (?, ?)').run(marketName, lockedUntil);
    return true;
}

export function releaseBuyLock(marketName: string): void {
    db.prepare('DELETE FROM BuyLocks WHERE market_name = ?').run(marketName);
}

export function isBuyLocked(marketName: string): boolean {
    const row = db.prepare('SELECT locked_until FROM BuyLocks WHERE market_name = ?').get(marketName) as { locked_until: number } | undefined;
    return !!(row && row.locked_until > Date.now());
}

export async function canBuyItem(marketName: string, estimatedPrice: number): Promise<{ allowed: boolean, reason?: string, availableBalance?: number }> {
    if (CIRCUIT_BREAKER_ACTIVE) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Circuit breaker is active.`);
        return { allowed: false, reason: 'circuit_breaker' };
    }

    // 0. Duplicate Buy Lock check
    if (isBuyLocked(marketName)) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Item has an active buy lock (duplicate prevention).`);
        return { allowed: false, reason: 'already_locked' };
    }

    // 1. Exposure and Open Order check
    const ordersQuery = db.prepare('SELECT market, type FROM Orders').all() as { market: string, type: string }[];
    
    let hasOpenBuyOrder = false;

    for (const order of ordersQuery) {
        if (order.type === 'BUY' && order.market === marketName) {
            hasOpenBuyOrder = true;
            break;
        }
    }

    // STRICT CHECK: If an open BUY order already exists for this item, never place another one!
    // (Prevents competing with ourselves or multiple buy bids at the same price)
    if (hasOpenBuyOrder) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Already buying this item (open BUY order exists).`);
        return { allowed: false, reason: 'already_buying' };
    }

    // Determine current inventory owned (unlisted + listed for sale)
    let ownedCount = 0;
    const basisQuery = db.prepare('SELECT basis_prices FROM Basis WHERE market_name = ?').get(marketName) as { basis_prices: string } | undefined;
    if (basisQuery?.basis_prices) {
        try {
            const prices = JSON.parse(basisQuery.basis_prices);
            ownedCount = prices.length;
        } catch {}
    } else {
        ownedCount = ordersQuery.filter(o => o.type === 'SELL' && o.market === marketName).length;
    }

    // Query 48h volume to check if item qualifies as Ultra-Liquid
    let itemVolume = 0;
    try {
        const itemRow = db.prepare('SELECT data FROM Items WHERE hash_name = ?').get(marketName) as { data: string } | undefined;
        if (itemRow?.data) {
            const parsed = JSON.parse(itemRow.data);
            itemVolume = parsed.last2Volume || 0;
        }
    } catch {}

    const settings = getBotSettings();
    const isUltraLiquid = itemVolume >= settings.ultraLiquidVolumeThreshold;
    const maxAllowedExposure = isUltraLiquid ? settings.ultraLiquidMaxExposure : settings.maxItemExposure;

    if (ownedCount >= maxAllowedExposure) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Max exposure limit reached (${ownedCount}/${maxAllowedExposure}, Ultra-Liquid: ${isUltraLiquid}, Vol: ${itemVolume})`);
        return { allowed: false, reason: 'max_exposure' };
    }

    // 1.5 Hard Maximum Item Price Cap
    if (settings.maxItemPrice > 0 && estimatedPrice > settings.maxItemPrice) {
        console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Estimated price (${estimatedPrice.toFixed(2)} GJN) exceeds maxItemPrice ceiling (${settings.maxItemPrice.toFixed(2)} GJN).`);
        return { allowed: false, reason: 'max_price_exceeded' };
    }

    // 2. Real-time Gaijin Wallet Balance Check & Bankroll Allocation Cap
    const liveBalance = await getWalletBalance();
    if (liveBalance !== null) {
        console.log(`[RISK MANAGER] Live Gaijin Wallet Balance: ${liveBalance.toFixed(2)} GJN. Required: ${estimatedPrice.toFixed(2)} GJN`);
        if (estimatedPrice > liveBalance) {
            console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Insufficient live balance (Price: ${estimatedPrice.toFixed(2)} GJN, Balance: ${liveBalance.toFixed(2)} GJN)`);
            return { allowed: false, reason: 'budget_exceeded', availableBalance: liveBalance };
        }

        // Single item bankroll percentage cap (prevent crippling cashflow)
        if (settings.maxWalletPercentPerItem > 0) {
            const maxAllowedForSingleItem = liveBalance * (settings.maxWalletPercentPerItem / 100);
            if (estimatedPrice > maxAllowedForSingleItem) {
                console.warn(`[RISK MANAGER] Blocked buy for ${marketName}: Price (${estimatedPrice.toFixed(2)} GJN) exceeds ${settings.maxWalletPercentPerItem}% of wallet (${maxAllowedForSingleItem.toFixed(2)} GJN).`);
                return { allowed: false, reason: 'bankroll_risk', availableBalance: liveBalance };
            }
        }
    } else {
        console.warn(`[RISK MANAGER] Could not fetch live wallet balance, proceeding with safety check.`);
    }

    return { allowed: true };
}
