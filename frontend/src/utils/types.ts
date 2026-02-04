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
  tags: string[]
}