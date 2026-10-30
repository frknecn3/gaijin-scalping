import { post } from './helpers.js';
import db from '../db/database.js';
import { getTargetBuys, addOrUpdateTargetBuy, removeTargetBuy } from './settingsManager.js';

export interface ResolvedTargetItem {
    market_name: string;
    display_name: string;
    icon?: string;
    lowest_sell?: number;
    highest_bid?: number;
    recommended_bid?: number;
    tags?: string[];
    source: 'url' | 'db' | 'gaijin';
}

/**
 * Extracts the exact market hash name from a Gaijin Market URL or returns cleaned string.
 * Supports:
 * - https://trade.gaijin.net/?n=KV-220
 * - https://trade.gaijin.net/?n=ugcitem_1002542&view=actions
 * - https://trade.gaijin.net/item?name=KV-220
 * - plain text / hash
 */
export function extractMarketFromInput(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';

    // Check if it's a URL
    if (trimmed.includes('trade.gaijin.net') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            // Fix relative or missing scheme
            const urlString = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
            const url = new URL(urlString);
            const nParam = url.searchParams.get('n');
            if (nParam) return decodeURIComponent(nParam).trim();

            const nameParam = url.searchParams.get('name');
            if (nameParam) return decodeURIComponent(nameParam).trim();
        } catch {
            // Fallback regex match for ?n=...
            const match = trimmed.match(/[?&]n=([^&#]+)/);
            if (match && match[1]) {
                return decodeURIComponent(match[1]).trim();
            }
        }
    }

    return trimmed;
}

/**
 * Searches items in both the local DB and via Gaijin's market search API.
 */
export async function searchTargetItems(query: string, token?: string): Promise<ResolvedTargetItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: ResolvedTargetItem[] = [];
    const seenMarkets = new Set<string>();

    // 1. Search in local SQLite Items table
    try {
        const rows = db.prepare('SELECT hash_name, data FROM Items').all() as { hash_name: string; data: string }[];
        for (const r of rows) {
            try {
                const item = JSON.parse(r.data);
                const name = item.name || r.hash_name;
                const hash = r.hash_name;

                if (hash.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
                    if (!seenMarkets.has(hash)) {
                        seenMarkets.add(hash);
                        results.push({
                            market_name: hash,
                            display_name: name,
                            icon: item.icon,
                            lowest_sell: item.price ? Number(item.price.toFixed(2)) : undefined,
                            highest_bid: item.buy_price ? Number(item.buy_price.toFixed(2)) : undefined,
                            tags: item.tags,
                            source: 'db'
                        });
                    }
                }
                if (results.length >= 10) break;
            } catch {}
        }
    } catch (e) {
        console.error('[TARGET-SEARCH] Error searching local DB:', e);
    }

    // 2. Search on Gaijin Market via cln_market_search
    const activeToken = token || process.env.TOKEN;
    if (activeToken && results.length < 10) {
        try {
            const res = await post({
                action: 'cln_market_search',
                appId: '1067',
                text: query.trim(),
                count: '10',
                token: activeToken
            });

            if (res?.response?.assets && Array.isArray(res.response.assets)) {
                for (const asset of res.response.assets) {
                    const market = asset.market_name || asset.hash_name;
                    if (market && !seenMarkets.has(market)) {
                        seenMarkets.add(market);
                        const sellPrice = asset.price ? Number((asset.price / 100000000).toFixed(2)) : undefined;
                        results.push({
                            market_name: market,
                            display_name: asset.name || market,
                            icon: asset.icon || asset.image,
                            lowest_sell: sellPrice,
                            tags: asset.tags,
                            source: 'gaijin'
                        });
                    }
                    if (results.length >= 15) break;
                }
            }
        } catch (e) {
            console.error('[TARGET-SEARCH] Error querying Gaijin search API:', e);
        }
    }

    return results;
}

/**
 * Validates any market identifier or URL with Gaijin API orderbook and returns live pricing.
 */
export async function validateAndGetMarketDetails(input: string, token?: string): Promise<{
    valid: boolean;
    market_name: string;
    display_name: string;
    icon?: string;
    highest_bid: number;
    lowest_sell: number;
    recommended_bid: number;
    error?: string;
}> {
    const rawMarket = extractMarketFromInput(input);
    if (!rawMarket) {
        return {
            valid: false,
            market_name: '',
            display_name: '',
            highest_bid: 0,
            lowest_sell: 0,
            recommended_bid: 0,
            error: 'Boş pazar adı veya geçersiz link.'
        };
    }

    // Find local metadata if available
    let displayName = rawMarket;
    let icon: string | undefined;

    try {
        const row = db.prepare('SELECT data FROM Items WHERE hash_name = ?').get(rawMarket) as { data: string } | undefined;
        if (row?.data) {
            const parsed = JSON.parse(row.data);
            displayName = parsed.name || displayName;
            icon = parsed.icon;
        }
    } catch {}

    const activeToken = token || process.env.TOKEN;
    if (!activeToken) {
        return {
            valid: false,
            market_name: rawMarket,
            display_name: displayName,
            icon,
            highest_bid: 0,
            lowest_sell: 0,
            recommended_bid: 0,
            error: 'Gaijin API Token bulunamadı.'
        };
    }

    // Call Gaijin orderbook
    try {
        const books = await post({
            action: 'cln_books_brief',
            market_name: rawMarket,
            appid: 1067,
            token: activeToken
        });

        if (!books || books.success === false || !books.response || !Array.isArray(books.response.BUY)) {
            const errStr = books?.error || books?.response?.error || 'Gaijin pazarında bu ürün bulunamadı.';
            return {
                valid: false,
                market_name: rawMarket,
                display_name: displayName,
                icon,
                highest_bid: 0,
                lowest_sell: 0,
                recommended_bid: 0,
                error: `Gaijin Hatası: ${errStr}`
            };
        }

        const highestBidRaw = books.response.BUY[0]?.[0] || 0;
        const lowestSellRaw = books.response.SELL?.[0]?.[0] || 0;

        const highestBid = Number((highestBidRaw / 10000).toFixed(2));
        const lowestSell = Number((lowestSellRaw / 10000).toFixed(2));
        const recommendedBid = Number((highestBid + 0.01).toFixed(2));

        // If no icon found yet, try searching Gaijin to get image
        if (!icon) {
            try {
                const searchRes = await post({
                    action: 'cln_market_search',
                    appId: '1067',
                    text: rawMarket,
                    count: '5',
                    token: activeToken
                });
                const asset = searchRes?.response?.assets?.find((a: any) => (a.market_name || a.hash_name) === rawMarket);
                if (asset) {
                    displayName = asset.name || displayName;
                    icon = asset.icon || asset.image;
                }
            } catch {}
        }

        return {
            valid: true,
            market_name: rawMarket,
            display_name: displayName,
            icon,
            highest_bid: highestBid,
            lowest_sell: lowestSell,
            recommended_bid: recommendedBid
        };
    } catch (e: any) {
        return {
            valid: false,
            market_name: rawMarket,
            display_name: displayName,
            icon,
            highest_bid: 0,
            lowest_sell: 0,
            recommended_bid: 0,
            error: e?.message || 'Gaijin API bağlantı hatası.'
        };
    }
}

/**
 * Places an immediate TOP BID for a target buy item on Gaijin.
 */
export async function executeImmediateTargetBuy(marketName: string, maxPrice: number, token?: string): Promise<{
    success: boolean;
    orderPlaced: boolean;
    orderId?: string;
    orderPrice?: number;
    highestCompetitorBid?: number;
    message: string;
}> {
    const activeToken = token || process.env.TOKEN;
    if (!activeToken) {
        return { success: false, orderPlaced: false, message: 'Gaijin API Token tanımlı değil.' };
    }

    try {
        const books = await post({
            action: 'cln_books_brief',
            market_name: marketName,
            appid: 1067,
            token: activeToken
        });

        if (!books?.response?.BUY || !Array.isArray(books.response.BUY)) {
            return {
                success: false,
                orderPlaced: false,
                message: `Pazar emir defteri alınamadı (${books?.response?.error || books?.error || 'Bilinmeyen hata'}).`
            };
        }

        const highestCompetitorBid = (books.response.BUY[0]?.[0] || 0) / 10000;
        const targetBid = Number((highestCompetitorBid + 0.01).toFixed(2));

        if (targetBid > maxPrice) {
            return {
                success: true,
                orderPlaced: false,
                highestCompetitorBid,
                message: `🎯 Hedef alım kaydedildi! Ancak piyasadaki en yüksek teklif (${highestCompetitorBid.toFixed(2)} GJN) belirlediğin tavan bütçeden (${maxPrice.toFixed(2)} GJN) yüksek. Fiyat bütçene inince bot otomatik en tepeye oturacak.`
            };
        }

        const priceToSet = Math.round(targetBid * 10000);
        console.log(`[TARGET-BUY] Immediately executing TOP BID for ${marketName} at ${targetBid.toFixed(2)} GJN (Max: ${maxPrice.toFixed(2)} GJN)...`);

        const buyParams: any = {
            action: 'cln_market_buy',
            price: priceToSet,
            privateMode: true,
            appid: 1067,
            market_name: marketName,
            currencyid: 'gjn',
            amount: 1,
            transactid: Math.round(Math.random() * 100000),
            reqstamp: Date.now(),
            token: activeToken
        };

        const res = await post(buyParams);
        if (res?.response?.success) {
            const newOrderId = res.response.orderId?.toString() || `pending_${Date.now()}`;
            const pairId = res.response.pairId?.toString() || '';

            db.prepare('INSERT OR REPLACE INTO Orders (id, pairId, market, type, localPrice) VALUES (?, ?, ?, ?, ?)').run(
                newOrderId,
                pairId,
                marketName,
                'BUY',
                priceToSet
            );

            return {
                success: true,
                orderPlaced: true,
                orderId: newOrderId,
                orderPrice: targetBid,
                highestCompetitorBid,
                message: `✅ Başarılı! ${marketName} için ${targetBid.toFixed(2)} GJN ile anında en tepe alım emri açıldı! (Emir ID: ${newOrderId})`
            };
        } else {
            const err = res?.response?.error || res?.error || JSON.stringify(res);
            return {
                success: true, // TargetBuy is saved, but immediate order failed (e.g. low cash)
                orderPlaced: false,
                highestCompetitorBid,
                message: `🎯 Hedef alım kaydedildi, ancak anlık sipariş verilemedi (${err}). Kasa uygun olunca Guard tekrar deneyecektir.`
            };
        }
    } catch (e: any) {
        return {
            success: true,
            orderPlaced: false,
            message: `🎯 Hedef alım kaydedildi. (Emir verme uyarısı: ${e?.message})`
        };
    }
}
