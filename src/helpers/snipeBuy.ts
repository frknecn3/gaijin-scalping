import dotenv from "dotenv";
import { post, marketPost } from "./helpers.js";
dotenv.config();

const TICK = 100;              // 0.01 GJN
const APPID = 1067;
const FEE_MULTIPLIER = 0.85;

export type SnipeResult = {
  ok: boolean;
  reason?: string;
  error?: string | null;
  myPrice?: number;
  highestBid?: number;
  lowestSell?: number;
  expectedProfit?: number;
  dryRun?: boolean;
};

async function getBooks(market_name: string) {
  const res = await post({
    action: "cln_books_brief",
    market_name,
    appid: APPID,
    token: process.env.TOKEN,
  });
  if (!res?.response?.BUY) throw new Error("Order book alınamadı");
  return res.response as { BUY: [number, number][]; SELL: [number, number][] };
}

async function findOpenBuyOrder(market_name: string) {
  const open = await post({
    action: "cln_get_user_open_orders",
    token: process.env.TOKEN,
  });
  if (!Array.isArray(open.response)) return null;
  return open.response.find((o: any) => o.market === market_name && o.type === "BUY") ?? null;
}

/** En yüksek bid'in 1 tick üstüne alım emri koyar. */
export async function placeTopBuyOrder(opts: {
  market_name: string;
  maxPrice?: number;      // raw birim (25000 = 2.50 GJN)
  minProfit?: number;     // net kâr eşiği (GJN)
  dryRun?: boolean;
}): Promise<SnipeResult> {
  const { market_name, maxPrice, minProfit = 0.05, dryRun = false } = opts;

  const books = await getBooks(market_name);
  const highestBid = books.BUY?.[0]?.[0] ?? 0;
  const lowestSell = books.SELL?.[0]?.[0] ?? 0;
  const myPrice = highestBid + TICK;
  const expectedProfit = (lowestSell * FEE_MULTIPLIER - myPrice) / 10000;

  const base = { myPrice, highestBid, lowestSell, expectedProfit };

  if (expectedProfit < minProfit) return { ok: false, reason: "UNPROFITABLE", ...base };
  if (maxPrice && myPrice > maxPrice) return { ok: false, reason: "MAX_PRICE_EXCEEDED", ...base };
  if (dryRun) return { ok: true, dryRun: true, ...base };

  const existing = await findOpenBuyOrder(market_name);
  if (existing) {
    if (existing.localPrice >= myPrice) return { ok: false, reason: "ALREADY_TOP", ...base };
    await marketPost({
      action: "cancel_order",
      pairId: existing.pairId,
      orderId: existing.id,
      token: process.env.TOKEN,
    });
  }

  const res = await post({
    action: "cln_market_buy",
    ...(existing ? { pairId: existing.pairId } : {}),
    price: myPrice,
    privateMode: true,
    appid: APPID,
    market_name,
    currencyid: "gjn",
    amount: 1,
    transactid: Math.round(Math.random() * 100000),
    reqstamp: Date.now(),
    token: process.env.TOKEN,
  });

  return { ok: !res?.response?.error, error: res?.response?.error ?? null, ...base };
}