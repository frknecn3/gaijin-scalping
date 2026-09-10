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
    dynamicMinVolume: 25
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
