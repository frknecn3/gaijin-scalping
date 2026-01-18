import fs from 'fs';

let items = JSON.parse(fs.readFileSync('./data/items.json', 'utf-8'))

const sortFilter = 'profit'

const PRICE = 5

items = items
    .filter((item) => item.buy_price <= PRICE && item.buy_depth + item.depth > 10 && item.profit > 0.10 && !item.tags.includes("type:key") && item.buy_depth > 30 && item.buy_price > 0)
    .filter((item) => item.last2Volume > 50)
    // .filter((item => !item.tags.includes('eventName:camo_trophy_2_53')))
    .sort((a, b) => a[sortFilter] - b[sortFilter]);

fs.writeFileSync('./data/sorted.json', JSON.stringify(items));