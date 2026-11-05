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
    enableBuying: boolean;               // Master switch for automated BUY orders
    enableSelling: boolean;              // Master switch for automated SELL order updates & undercuts
    operatingCapitalTarget: number;      // Minimum total capital required to run bot without bottleneck (default: 75.00 GJN)
    externalSpentGJN: number;            // Total GJN spent externally on Gaijin Store / in-game (default: 116.00 GJN)
    microQuotaLimit: number;             // Base quota for open buy orders < 1.00 GJN (default: 20)
    enableDynamicMicroQuota: boolean;    // Smart dynamic mode: expands micro quota when overall book has idle slots (default: true)
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
    ultraLiquidMaxExposure: 2,
    enableBuying: true,
    enableSelling: true,
    operatingCapitalTarget: 75.00,
    externalSpentGJN: 116.00,
    microQuotaLimit: 20,
    enableDynamicMicroQuota: true
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
            enableBuying: typeof map.enableBuying === 'boolean' ? map.enableBuying : DEFAULT_SETTINGS.enableBuying,
            enableSelling: typeof map.enableSelling === 'boolean' ? map.enableSelling : DEFAULT_SETTINGS.enableSelling,
            operatingCapitalTarget: typeof map.operatingCapitalTarget === 'number' ? map.operatingCapitalTarget : DEFAULT_SETTINGS.operatingCapitalTarget,
            externalSpentGJN: typeof map.externalSpentGJN === 'number' ? map.externalSpentGJN : DEFAULT_SETTINGS.externalSpentGJN,
            microQuotaLimit: typeof map.microQuotaLimit === 'number' ? map.microQuotaLimit : DEFAULT_SETTINGS.microQuotaLimit,
            enableDynamicMicroQuota: typeof map.enableDynamicMicroQuota === 'boolean' ? map.enableDynamicMicroQuota : DEFAULT_SETTINGS.enableDynamicMicroQuota,
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
        enableBuying: partial.enableBuying !== undefined ? Boolean(partial.enableBuying) : current.enableBuying,
        enableSelling: partial.enableSelling !== undefined ? Boolean(partial.enableSelling) : current.enableSelling,
        operatingCapitalTarget: partial.operatingCapitalTarget !== undefined ? Number(partial.operatingCapitalTarget) : current.operatingCapitalTarget,
        externalSpentGJN: partial.externalSpentGJN !== undefined ? Number(partial.externalSpentGJN) : current.externalSpentGJN,
        microQuotaLimit: partial.microQuotaLimit !== undefined ? Number(partial.microQuotaLimit) : current.microQuotaLimit,
        enableDynamicMicroQuota: partial.enableDynamicMicroQuota !== undefined ? Boolean(partial.enableDynamicMicroQuota) : current.enableDynamicMicroQuota,
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

export function isItemIgnored(marketName: string): boolean {
    try {
        const row = db.prepare('SELECT market_name FROM IgnoredItems WHERE market_name = ?').get(marketName);
        return !!row;
    } catch {
        return false;
    }
}

export function addIgnoredItem(marketName: string): void {
    try {
        db.prepare('INSERT OR IGNORE INTO IgnoredItems (market_name) VALUES (?)').run(marketName);
        console.log(`[IGNORE] Added ${marketName} to ignored list.`);
    } catch (e) {
        console.error(`[IGNORE] Error adding ${marketName} to ignored list:`, e);
    }
}

export function removeIgnoredItem(marketName: string): void {
    try {
        db.prepare('DELETE FROM IgnoredItems WHERE market_name = ?').run(marketName);
        console.log(`[IGNORE] Removed ${marketName} from ignored list.`);
    } catch (e) {
        console.error(`[IGNORE] Error removing ${marketName} from ignored list:`, e);
    }
}

export function getIgnoredItems(): string[] {
    try {
        const rows = db.prepare('SELECT market_name FROM IgnoredItems ORDER BY created_at DESC').all() as { market_name: string }[];
        return rows.map(r => r.market_name);
    } catch {
        return [];
    }
}

export interface TargetBuyItem {
    market_name: string;
    max_price: number;
    active: boolean;
    status: string;
    created_at?: string;
    acquired_at?: string;
    acquired_price?: number;
}

export function getTargetBuys(): TargetBuyItem[] {
    try {
        const rows = db.prepare('SELECT market_name, max_price, active, status, created_at, acquired_at, acquired_price FROM TargetBuys ORDER BY created_at DESC').all() as any[];
        return rows.map(r => ({
            market_name: r.market_name,
            max_price: Number(r.max_price),
            active: Boolean(r.active),
            status: r.status || (r.active ? 'ACTIVE' : 'PAUSED'),
            created_at: r.created_at,
            acquired_at: r.acquired_at,
            acquired_price: typeof r.acquired_price === 'number' ? Number(r.acquired_price) : undefined
        }));
    } catch {
        return [];
    }
}

export function isTargetBuy(marketName: string): boolean {
    try {
        const row = db.prepare('SELECT active, status FROM TargetBuys WHERE market_name = ?').get(marketName) as { active: number; status: string } | undefined;
        return !!row && Boolean(row.active);
    } catch {
        return false;
    }
}

export function isAnyTargetBuy(marketName: string): boolean {
    try {
        const row = db.prepare('SELECT market_name FROM TargetBuys WHERE market_name = ?').get(marketName) as { market_name: string } | undefined;
        return !!row;
    } catch {
        return false;
    }
}

export function getTargetBuyConfig(marketName: string): TargetBuyItem | undefined {
    try {
        const row = db.prepare('SELECT market_name, max_price, active, status, created_at, acquired_at, acquired_price FROM TargetBuys WHERE market_name = ?').get(marketName) as any;
        if (!row) return undefined;
        return {
            market_name: row.market_name,
            max_price: Number(row.max_price),
            active: Boolean(row.active),
            status: row.status || (row.active ? 'ACTIVE' : 'PAUSED'),
            created_at: row.created_at,
            acquired_at: row.acquired_at,
            acquired_price: typeof row.acquired_price === 'number' ? Number(row.acquired_price) : undefined
        };
    } catch {
        return undefined;
    }
}

export function addOrUpdateTargetBuy(marketName: string, maxPrice: number): void {
    try {
        db.prepare(`
            INSERT INTO TargetBuys (market_name, max_price, active, status)
            VALUES (?, ?, 1, 'ACTIVE')
            ON CONFLICT(market_name) DO UPDATE SET max_price = excluded.max_price, active = 1, status = 'ACTIVE'
        `).run(marketName, maxPrice);
        console.log(`[TARGET-BUY] Configured target buy for ${marketName} (Max: ${maxPrice.toFixed(2)} GJN)`);
    } catch (e) {
        console.error(`[TARGET-BUY] Error configuring target buy for ${marketName}:`, e);
    }
}

export function removeTargetBuy(marketName: string): void {
    try {
        db.prepare('DELETE FROM TargetBuys WHERE market_name = ?').run(marketName);
        console.log(`[TARGET-BUY] Removed target buy for ${marketName}`);
    } catch (e) {
        console.error(`[TARGET-BUY] Error removing target buy for ${marketName}:`, e);
    }
}

export function toggleTargetBuy(marketName: string, active: boolean): void {
    try {
        const status = active ? 'ACTIVE' : 'PAUSED';
        db.prepare('UPDATE TargetBuys SET active = ?, status = ? WHERE market_name = ?').run(active ? 1 : 0, status, marketName);
        console.log(`[TARGET-BUY] Toggled target buy for ${marketName} -> active: ${active}`);
    } catch (e) {
        console.error(`[TARGET-BUY] Error toggling target buy for ${marketName}:`, e);
    }
}

export function markTargetBuyAcquired(marketName: string, acquiredPrice?: number): void {
    try {
        if (acquiredPrice !== undefined && acquiredPrice > 0) {
            db.prepare("UPDATE TargetBuys SET active = 0, status = 'ACQUIRED', acquired_at = datetime('now'), acquired_price = ? WHERE market_name = ?").run(acquiredPrice, marketName);
            console.log(`[TARGET-BUY] 🏆 Marked ${marketName} as ACQUIRED at ${acquiredPrice.toFixed(2)} GJN!`);
            return;
        }

        // If acquiredPrice is not provided, try to find it from Basis or Orders
        const existing = db.prepare('SELECT acquired_price FROM TargetBuys WHERE market_name = ?').get(marketName) as { acquired_price?: number } | undefined;
        if (!existing?.acquired_price) {
            const bRow = db.prepare('SELECT basis_prices FROM Basis WHERE market_name = ?').get(marketName) as { basis_prices: string } | undefined;
            let foundPrice: number | undefined;
            if (bRow?.basis_prices) {
                try {
                    const arr = JSON.parse(bRow.basis_prices);
                    if (Array.isArray(arr) && arr.length > 0) foundPrice = arr[0];
                } catch {}
            }
            if (foundPrice && foundPrice > 0) {
                db.prepare("UPDATE TargetBuys SET active = 0, status = 'ACQUIRED', acquired_at = datetime('now'), acquired_price = ? WHERE market_name = ?").run(foundPrice, marketName);
                console.log(`[TARGET-BUY] 🏆 Marked ${marketName} as ACQUIRED at ${foundPrice.toFixed(2)} GJN (resolved from Basis)!`);
                return;
            }
        }

        db.prepare("UPDATE TargetBuys SET active = 0, status = 'ACQUIRED', acquired_at = datetime('now') WHERE market_name = ?").run(marketName);
        console.log(`[TARGET-BUY] 🏆 Marked ${marketName} as ACQUIRED!`);
    } catch (e) {
        console.error(`[TARGET-BUY] Error marking ${marketName} as acquired:`, e);
    }
}


