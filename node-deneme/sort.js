import fs from 'fs';

let items = JSON.parse(fs.readFileSync('./data/items.json', 'utf-8'))

const sortFilter = 'profit'

const PRICE = 1

items = items
    .filter((item) => item.buy_price <= PRICE && item.buy_depth + item.depth > 10 && item.profit > 0.05 && !item.tags.includes("type:key") && item.buy_depth > 0 && item.buy_price > 0)
    .filter((item) => item.last2Volume > 40 && item.buy_depth > 50)
    .sort((a, b) => a[sortFilter] - b[sortFilter]);

fs.writeFileSync('./data/sorted.json', JSON.stringify(items));