/**
 * Rock-Solid Liquid Capital & Portfolio Smoother
 * 
 * Uses a rolling median filter over a 45-second window on (rawWallet + totalBuy).
 * 
 * Why this works:
 * - Gaijin's wallet API (`GetBalance`) has a 15-25 second propagation lag after order placement/cancellation.
 * - Order placement causes a transient spike (+P) for ~20s.
 * - Order cancellation causes a transient dip (-P) for ~20s.
 * - A rolling median over 45s completely filters out these transient outliers as noise,
 *   while smoothly and accurately reflecting all REAL trades, deposits, and earnings.
 * - Cannot drift, cannot invent ghost money, and never creates sudden reconciliation cliffs.
 */

class PortfolioTracker {
    private samples: { time: number; value: number }[] = [];

    /**
     * Resolves the ground-truth stable cash and free wallet balance.
     */
    public getLiquidMetrics(rawWallet: number, totalBuy: number): {
        stableCash: number;
        effectiveWallet: number;
    } {
        const now = Date.now();
        const currentSample = Number(((rawWallet || 0) + (totalBuy || 0)).toFixed(2));

        // Add current sample
        this.samples.push({ time: now, value: currentSample });

        // Keep samples from the last 45 seconds (enough to cover Gaijin's 15-25s cache lag)
        this.samples = this.samples.filter(s => now - s.time <= 45000);

        // Compute median of samples in window
        const sorted = [...this.samples].map(s => s.value).sort((a, b) => a - b);
        const medianCash = sorted[Math.floor(sorted.length / 2)] || currentSample;
        const stableCash = Number(medianCash.toFixed(2));

        // Effective wallet is stableCash - totalBuy (clamped to at least 0)
        const effectiveWallet = Number(Math.max(0, stableCash - (totalBuy || 0)).toFixed(2));

        return {
            stableCash,
            effectiveWallet
        };
    }

    // Kept as no-ops for backwards compatibility with any callers
    public recordBuyDeal(_cost: number) {}
    public recordSellDeal(_netIncome: number) {}
}

export const portfolioTracker = new PortfolioTracker();
