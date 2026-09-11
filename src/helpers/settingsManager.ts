import db from '../db/database.js';

export interface BotSettings {
    guardMinProfit: number;       // e.g. 0.01 GJN
    scannerMinProfit: number;     // e.g. 0.10 GJN
    minStreak: number;            // e.g. 10 (consecutive profitable cycles required to buy)
    minVolume: number;            // e.g. 50 (sales in 48h)
    ignoreAllBasis: boolean;      // liquidate mode: ignore basis and undercut based on spread only
    maxItemExposure: number;      // max number of copies of the same item allowed
    dynamicProfitThreshold: number; // The price above which the dynamic ROI rule applies
    dynamicProfitPercentage: number; // The base minimum percentage profit required
    dynamicMinVolume: number;       // Min 48h volume required for items >= dynamicProfitThreshold
    fallingKnifeProtection: boolean;      // Enable downward trend safeguard
    fallingKnifeDropPercent: number;     // Drop % in last 30m (default: 8.0)
    fallingKnifeMinDelta: number;        // Minimum absolute GJN drop (default: 0.05)
    buyOrderTtlMinutes: number;          // Max lifetime for outbid/unfulfilled buy orders (default: 15)
    inventoryHoldTimeoutHours: number;   // Auto-breakeven threshold for slow inventory (default: 2)
    maxItemPrice: number;                // Absolute maximum price allowed for any purchase (default: 4.00 GJN)
    maxWalletPercentPerItem: number;     // Maximum percentage of wallet allowed for a single item (default: 20%)
}

const DEFAULT_SETTINGS: BotSettings = {
    guardMinProfit: 0.01,
    scannerMinProfit: 0.10,
    minStreak: 10,
    minVolume: 50,
    ignoreAllBasis: true,
    maxItemExposure: 1,
    dynamicProfitThreshold: 1.00,
    dynamicProfitPercentage: 5.0,
    dynamicMinVolume: 25,
    fallingKnifeProtection: true,
    fallingKnifeDropPercent: 8.0,
    fallingKnifeMinDelta: 0.05,
    buyOrderTtlMinutes: 15,
    inventoryHoldTimeoutHours: 2,
    maxItemPrice: 4.00,
    maxWalletPercentPerItem: 20.0
};

export function getBotSettings(): BotSettings {
    try {
        const rows = db.prepare('SELECT key, value FROM Settings').all() as { key: string, value: string }[];
        const map: Record<string, any> = {};
        for (const row of rows) {
            try {
                map[row.key] = JSON.parse(row.value);
            } catch {
                map[row.key] = row.value;
            }
        }

        return {
            guardMinProfit: typeof map.guardMinProfit === 'number' ? map.guardMinProfit : DEFAULT_SETTINGS.guardMinProfit,
            scannerMinProfit: typeof map.scannerMinProfit === 'number' ? map.scannerMinProfit : DEFAULT_SETTINGS.scannerMinProfit,
            minStreak: typeof map.minStreak === 'number' ? map.minStreak : DEFAULT_SETTINGS.minStreak,
            minVolume: typeof map.minVolume === 'number' ? map.minVolume : DEFAULT_SETTINGS.minVolume,
            ignoreAllBasis: typeof map.ignoreAllBasis === 'boolean' ? map.ignoreAllBasis : DEFAULT_SETTINGS.ignoreAllBasis,
            maxItemExposure: typeof map.maxItemExposure === 'number' ? map.maxItemExposure : DEFAULT_SETTINGS.maxItemExposure,
            dynamicProfitThreshold: typeof map.dynamicProfitThreshold === 'number' ? map.dynamicProfitThreshold : DEFAULT_SETTINGS.dynamicProfitThreshold,
            dynamicProfitPercentage: typeof map.dynamicProfitPercentage === 'number' ? map.dynamicProfitPercentage : DEFAULT_SETTINGS.dynamicProfitPercentage,
            dynamicMinVolume: typeof map.dynamicMinVolume === 'number' ? map.dynamicMinVolume : DEFAULT_SETTINGS.dynamicMinVolume,
            fallingKnifeProtection: typeof map.fallingKnifeProtection === 'boolean' ? map.fallingKnifeProtection : DEFAULT_SETTINGS.fallingKnifeProtection,
            fallingKnifeDropPercent: typeof map.fallingKnifeDropPercent === 'number' ? map.fallingKnifeDropPercent : DEFAULT_SETTINGS.fallingKnifeDropPercent,
            fallingKnifeMinDelta: typeof map.fallingKnifeMinDelta === 'number' ? map.fallingKnifeMinDelta : DEFAULT_SETTINGS.fallingKnifeMinDelta,
            buyOrderTtlMinutes: typeof map.buyOrderTtlMinutes === 'number' ? map.buyOrderTtlMinutes : DEFAULT_SETTINGS.buyOrderTtlMinutes,
            inventoryHoldTimeoutHours: typeof map.inventoryHoldTimeoutHours === 'number' ? map.inventoryHoldTimeoutHours : DEFAULT_SETTINGS.inventoryHoldTimeoutHours,
            maxItemPrice: typeof map.maxItemPrice === 'number' ? map.maxItemPrice : DEFAULT_SETTINGS.maxItemPrice,
            maxWalletPercentPerItem: typeof map.maxWalletPercentPerItem === 'number' ? map.maxWalletPercentPerItem : DEFAULT_SETTINGS.maxWalletPercentPerItem,
        };
    } catch (e) {
        console.error("[SETTINGS] Error reading settings from DB, using defaults:", e);
        return { ...DEFAULT_SETTINGS };
    }
}

export function updateBotSettings(partial: Partial<BotSettings>): BotSettings {
    const current = getBotSettings();
    const updated: BotSettings = {
        guardMinProfit: partial.guardMinProfit !== undefined ? Number(partial.guardMinProfit) : current.guardMinProfit,
        scannerMinProfit: partial.scannerMinProfit !== undefined ? Number(partial.scannerMinProfit) : current.scannerMinProfit,
        minStreak: partial.minStreak !== undefined ? Number(partial.minStreak) : current.minStreak,
        minVolume: partial.minVolume !== undefined ? Number(partial.minVolume) : current.minVolume,
        ignoreAllBasis: partial.ignoreAllBasis !== undefined ? Boolean(partial.ignoreAllBasis) : current.ignoreAllBasis,
        maxItemExposure: partial.maxItemExposure !== undefined ? Number(partial.maxItemExposure) : current.maxItemExposure,
        dynamicProfitThreshold: partial.dynamicProfitThreshold !== undefined ? Number(partial.dynamicProfitThreshold) : current.dynamicProfitThreshold,
        dynamicProfitPercentage: partial.dynamicProfitPercentage !== undefined ? Number(partial.dynamicProfitPercentage) : current.dynamicProfitPercentage,
        dynamicMinVolume: partial.dynamicMinVolume !== undefined ? Number(partial.dynamicMinVolume) : current.dynamicMinVolume,
        fallingKnifeProtection: partial.fallingKnifeProtection !== undefined ? Boolean(partial.fallingKnifeProtection) : current.fallingKnifeProtection,
        fallingKnifeDropPercent: partial.fallingKnifeDropPercent !== undefined ? Number(partial.fallingKnifeDropPercent) : current.fallingKnifeDropPercent,
        fallingKnifeMinDelta: partial.fallingKnifeMinDelta !== undefined ? Number(partial.fallingKnifeMinDelta) : current.fallingKnifeMinDelta,
        buyOrderTtlMinutes: partial.buyOrderTtlMinutes !== undefined ? Number(partial.buyOrderTtlMinutes) : current.buyOrderTtlMinutes,
        inventoryHoldTimeoutHours: partial.inventoryHoldTimeoutHours !== undefined ? Number(partial.inventoryHoldTimeoutHours) : current.inventoryHoldTimeoutHours,
        maxItemPrice: partial.maxItemPrice !== undefined ? Number(partial.maxItemPrice) : current.maxItemPrice,
        maxWalletPercentPerItem: partial.maxWalletPercentPerItem !== undefined ? Number(partial.maxWalletPercentPerItem) : current.maxWalletPercentPerItem,
    };

    const stmt = db.prepare('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
        for (const [k, v] of Object.entries(updated)) {
            stmt.run(k, JSON.stringify(v));
        }
    })();

    console.log("[SETTINGS] Updated bot settings:", updated);
    return updated;
}

export function isItemLiquidated(marketName: string): boolean {
    try {
        const row = db.prepare('SELECT market_name FROM LiquidateItems WHERE market_name = ?').get(marketName);
        return !!row;
    } catch {
        return false;
    }
}

export function addLiquidateItem(marketName: string): void {
    try {
        db.prepare('INSERT OR IGNORE INTO LiquidateItems (market_name) VALUES (?)').run(marketName);
        console.log(`[LIQUIDATE] Added ${marketName} to liquidation list.`);
    } catch (e) {
        console.error(`[LIQUIDATE] Error adding ${marketName}:`, e);
    }
}

export function removeLiquidateItem(marketName: string): void {
    try {
        db.prepare('DELETE FROM LiquidateItems WHERE market_name = ?').run(marketName);
        console.log(`[LIQUIDATE] Removed ${marketName} from liquidation list.`);
    } catch (e) {
        console.error(`[LIQUIDATE] Error removing ${marketName}:`, e);
    }
}

export function getLiquidateItems(): string[] {
    try {
        const rows = db.prepare('SELECT market_name FROM LiquidateItems').all() as { market_name: string }[];
        return rows.map(r => r.market_name);
    } catch {
        return [];
    }
}
