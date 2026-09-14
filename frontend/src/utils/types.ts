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
  isLiquidated?: boolean
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
