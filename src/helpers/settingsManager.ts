import db from '../db/database.js';

export interface ScannerTierRule {
    id: string;              // unique id for react keys
    minPrice: number;        // Start price (GJN) - e.g. 0, 3, 7, 15
    maxPrice: number | null; // End price (GJN) - e.g. 3, 7, 15, null for infinite
    minVolume: number;       // Min 48h volume required (e.g. 30, 18, 10, 4)
    minProfitPercent: number;// Min profit % (e.g. 8, 7, 6, 5)
    minProfitGJN: number;    // Min absolute net profit in GJN (e.g. 0.10, 0.25, 0.60, 1.00)
}

export const DEFAULT_SCANNER_TIER_RULES: ScannerTierRule[] = [
    {
        id: "tier-1",
        minPrice: 0.00,
        maxPrice: 3.00,
        minVolume: 30,
        minProfitPercent: 8.0,
        minProfitGJN: 0.10
    },
    {
        id: "tier-2",
        minPrice: 3.00,
        maxPrice: 7.00,
        minVolume: 18,
        minProfitPercent: 7.0,
        minProfitGJN: 0.25
    },
    {
        id: "tier-3",
        minPrice: 7.00,
        maxPrice: 15.00,
        minVolume: 10,
        minProfitPercent: 6.0,
        minProfitGJN: 0.60
    },
    {
        id: "tier-4",
        minPrice: 15.00,
        maxPrice: null,
        minVolume: 4,
        minProfitPercent: 5.0,
        minProfitGJN: 1.00
    }
];

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
    enableTierRules: boolean;       // Enable custom price-based tier rules matrix
    scannerTierRules: ScannerTierRule[]; // Custom rules list
    fallingKnifeProtection: boolean;      // Enable downward trend safeguard
    fallingKnifeDropPercent: number;     // Drop % in last 30m (default: 8.0)
    fallingKnifeMinDelta: number;        // Minimum absolute GJN drop (default: 0.05)
    buyOrderTtlMinutes: number;          // Max lifetime for outbid/unfulfilled buy orders (default: 15)
    inventoryHoldTimeoutHours: number;   // Auto-breakeven threshold for slow inventory (default: 2)
    maxItemPrice: number;                // Absolute maximum price allowed for any purchase (default: 4.00 GJN)
    maxWalletPercentPerItem: number;     // Maximum percentage of wallet allowed for a single item (default: 20%)
    enableDynamicLiquidation: boolean;   // Enable queue-depth & volume-aware safe liquidation ladder
    softStopLossMinAgeHours: number;     // Minimum age before soft stop-loss can trigger (default: 6h)
    softStopLossMaxPercent: number;      // Maximum allowed loss % in soft stop-loss (default: 5%)
    queueClearanceThresholdHours: number; // Queue clearance time required to consider queue stuck (default: 24h)
    emergencyDumpMinAgeHours: number;    // Minimum age before emergency dump to buy bid (default: 18h)
    emergencyDumpMaxLossPercent: number; // Maximum allowed loss % in emergency dump (default: 15%)
    ultraLiquidVolumeThreshold: number;  // 48h volume threshold to classify as ultra-liquid (default: 100)
    ultraLiquidMaxExposure: number;      // Maximum copies allowed for ultra-liquid items (default: 2)
}

const DEFAULT_SETTINGS: BotSettings = {
    guardMinProfit: 0.01,
    scannerMinProfit: 0.10,
    minStreak: 10,
    minVolume: 50,
    ignoreAllBasis: false, // Default is strictly false to protect cost basis and prevent losses
    maxItemExposure: 1,
    dynamicProfitThreshold: 1.00,
    dynamicProfitPercentage: 5.0,
    dynamicMinVolume: 25,
    enableTierRules: true,
    scannerTierRules: DEFAULT_SCANNER_TIER_RULES,
    fallingKnifeProtection: true,
    fallingKnifeDropPercent: 8.0,
    fallingKnifeMinDelta: 0.05,
    buyOrderTtlMinutes: 15,
    inventoryHoldTimeoutHours: 2,
    maxItemPrice: 4.00,
    maxWalletPercentPerItem: 20.0,
    enableDynamicLiquidation: true,
    softStopLossMinAgeHours: 4.5,
    softStopLossMaxPercent: 5.0,
    queueClearanceThresholdHours: 16.0,
    emergencyDumpMinAgeHours: 14.0,
    emergencyDumpMaxLossPercent: 15.0,
    ultraLiquidVolumeThreshold: 100,
    ultraLiquidMaxExposure: 2
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
            enableTierRules: typeof map.enableTierRules === 'boolean' ? map.enableTierRules : DEFAULT_SETTINGS.enableTierRules,
            scannerTierRules: Array.isArray(map.scannerTierRules) ? map.scannerTierRules : DEFAULT_SETTINGS.scannerTierRules,
            fallingKnifeProtection: typeof map.fallingKnifeProtection === 'boolean' ? map.fallingKnifeProtection : DEFAULT_SETTINGS.fallingKnifeProtection,
            fallingKnifeDropPercent: typeof map.fallingKnifeDropPercent === 'number' ? map.fallingKnifeDropPercent : DEFAULT_SETTINGS.fallingKnifeDropPercent,
            fallingKnifeMinDelta: typeof map.fallingKnifeMinDelta === 'number' ? map.fallingKnifeMinDelta : DEFAULT_SETTINGS.fallingKnifeMinDelta,
            buyOrderTtlMinutes: typeof map.buyOrderTtlMinutes === 'number' ? map.buyOrderTtlMinutes : DEFAULT_SETTINGS.buyOrderTtlMinutes,
            inventoryHoldTimeoutHours: typeof map.inventoryHoldTimeoutHours === 'number' ? map.inventoryHoldTimeoutHours : DEFAULT_SETTINGS.inventoryHoldTimeoutHours,
            maxItemPrice: typeof map.maxItemPrice === 'number' ? map.maxItemPrice : DEFAULT_SETTINGS.maxItemPrice,
            maxWalletPercentPerItem: typeof map.maxWalletPercentPerItem === 'number' ? map.maxWalletPercentPerItem : DEFAULT_SETTINGS.maxWalletPercentPerItem,
            enableDynamicLiquidation: typeof map.enableDynamicLiquidation === 'boolean' ? map.enableDynamicLiquidation : DEFAULT_SETTINGS.enableDynamicLiquidation,
            softStopLossMinAgeHours: typeof map.softStopLossMinAgeHours === 'number' ? map.softStopLossMinAgeHours : DEFAULT_SETTINGS.softStopLossMinAgeHours,
            softStopLossMaxPercent: typeof map.softStopLossMaxPercent === 'number' ? map.softStopLossMaxPercent : DEFAULT_SETTINGS.softStopLossMaxPercent,
            queueClearanceThresholdHours: typeof map.queueClearanceThresholdHours === 'number' ? map.queueClearanceThresholdHours : DEFAULT_SETTINGS.queueClearanceThresholdHours,
            emergencyDumpMinAgeHours: typeof map.emergencyDumpMinAgeHours === 'number' ? map.emergencyDumpMinAgeHours : DEFAULT_SETTINGS.emergencyDumpMinAgeHours,
            emergencyDumpMaxLossPercent: typeof map.emergencyDumpMaxLossPercent === 'number' ? map.emergencyDumpMaxLossPercent : DEFAULT_SETTINGS.emergencyDumpMaxLossPercent,
            ultraLiquidVolumeThreshold: typeof map.ultraLiquidVolumeThreshold === 'number' ? map.ultraLiquidVolumeThreshold : DEFAULT_SETTINGS.ultraLiquidVolumeThreshold,
            ultraLiquidMaxExposure: typeof map.ultraLiquidMaxExposure === 'number' ? map.ultraLiquidMaxExposure : DEFAULT_SETTINGS.ultraLiquidMaxExposure,
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
        enableTierRules: partial.enableTierRules !== undefined ? Boolean(partial.enableTierRules) : current.enableTierRules,
        scannerTierRules: Array.isArray(partial.scannerTierRules) ? partial.scannerTierRules : current.scannerTierRules,
        fallingKnifeProtection: partial.fallingKnifeProtection !== undefined ? Boolean(partial.fallingKnifeProtection) : current.fallingKnifeProtection,
        fallingKnifeDropPercent: partial.fallingKnifeDropPercent !== undefined ? Number(partial.fallingKnifeDropPercent) : current.fallingKnifeDropPercent,
        fallingKnifeMinDelta: partial.fallingKnifeMinDelta !== undefined ? Number(partial.fallingKnifeMinDelta) : current.fallingKnifeMinDelta,
        buyOrderTtlMinutes: partial.buyOrderTtlMinutes !== undefined ? Number(partial.buyOrderTtlMinutes) : current.buyOrderTtlMinutes,
        inventoryHoldTimeoutHours: partial.inventoryHoldTimeoutHours !== undefined ? Number(partial.inventoryHoldTimeoutHours) : current.inventoryHoldTimeoutHours,
        maxItemPrice: partial.maxItemPrice !== undefined ? Number(partial.maxItemPrice) : current.maxItemPrice,
        maxWalletPercentPerItem: partial.maxWalletPercentPerItem !== undefined ? Number(partial.maxWalletPercentPerItem) : current.maxWalletPercentPerItem,
        enableDynamicLiquidation: partial.enableDynamicLiquidation !== undefined ? Boolean(partial.enableDynamicLiquidation) : current.enableDynamicLiquidation,
        softStopLossMinAgeHours: partial.softStopLossMinAgeHours !== undefined ? Number(partial.softStopLossMinAgeHours) : current.softStopLossMinAgeHours,
        softStopLossMaxPercent: partial.softStopLossMaxPercent !== undefined ? Number(partial.softStopLossMaxPercent) : current.softStopLossMaxPercent,
        queueClearanceThresholdHours: partial.queueClearanceThresholdHours !== undefined ? Number(partial.queueClearanceThresholdHours) : current.queueClearanceThresholdHours,
        emergencyDumpMinAgeHours: partial.emergencyDumpMinAgeHours !== undefined ? Number(partial.emergencyDumpMinAgeHours) : current.emergencyDumpMinAgeHours,
        emergencyDumpMaxLossPercent: partial.emergencyDumpMaxLossPercent !== undefined ? Number(partial.emergencyDumpMaxLossPercent) : current.emergencyDumpMaxLossPercent,
        ultraLiquidVolumeThreshold: partial.ultraLiquidVolumeThreshold !== undefined ? Number(partial.ultraLiquidVolumeThreshold) : current.ultraLiquidVolumeThreshold,
        ultraLiquidMaxExposure: partial.ultraLiquidMaxExposure !== undefined ? Number(partial.ultraLiquidMaxExposure) : current.ultraLiquidMaxExposure,
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

export function getMatchingTierRule(price: number, settings: BotSettings): ScannerTierRule | null {
    if (!settings.enableTierRules || !Array.isArray(settings.scannerTierRules) || settings.scannerTierRules.length === 0) {
        return null;
    }
    const matching = settings.scannerTierRules.filter(r => {
        const minP = typeof r.minPrice === 'number' ? r.minPrice : 0;
        const maxP = typeof r.maxPrice === 'number' && r.maxPrice > 0 ? r.maxPrice : null;
        return price >= minP && (maxP === null || price < maxP);
    });

    if (matching.length === 0) return null;
    // Sort descending by minPrice to pick the most targeted tier
    matching.sort((a, b) => (b.minPrice || 0) - (a.minPrice || 0));
    return matching[0];
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
