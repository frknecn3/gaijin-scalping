export type HashType = {
  appid: number,
  asset_class: { name: string, value: number }[],
  buy_depth: number,
  buy_price: number,
  color: string,
  commodity: boolean,
  depth: number,
  hash_name: string,
  icon: string,
  last2Volume: number,
  liquidityScore: number,
  momentum: number,
  name: string,
  orgPrice: number,
  price: number,
  profit: number,
  tags: string[],
  active_orders?: { type: string, localPrice: number, market: string }[],
  highestOfLast10?: number,
  isLiquidated?: boolean,
  isIgnored?: boolean
}

export type TransactionType = {
  id: number;
  market: string;
  name?: string;
  icon?: string;
  sellPrice: number;
  netIncome: number;
  basis: number;
  profit: number;
  timestamp: string;
  timeStr: string;
  dateStr: string;
};

export type DailySummaryType = {
  day: string;
  trades: number;
  totalProfit: number;
  totalVolume: number;
  wins: number;
  losses: number;
  winRatePercent: number;
};

export type TotalsType = {
  buy: number;
  sell: number;
  profit?: number;
  todayProfit?: number;
  yesterdayProfit?: number;
  walletBalance?: number;
  rawWalletBalance?: number;
  inFlightCash?: number;
  totalEquity?: number;
  operatingCapitalTarget?: number;
  excessEquity?: number;
  spendableCash?: number;
  externalSpentGJN?: number;
  targetBuysValue?: number;
  lifetimeTotalCreated?: number;
};

export type DailyItemBreakdown = {
  market: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
  totalProfit: number;
  avgProfit: number;
  totalVolume: number;
  totalBasis: number;
  wins: number;
  losses: number;
  breakeven: number;
  lastTimestamp: string;
};
