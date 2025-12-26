import dotenv from "dotenv";
import { getInvAssets } from "./trial.js";
import { marketPost, post, sellerShouldGet, waitForAssetIdByMarketId } from "./helpers.js";
dotenv.config();

// ================= CONFIG =================

const MIN_PROFIT = 0.03;     // %8 net kâr
const FEE = 0.15;            // %15 Gaijin komisyonu
const COOLDOWN = 60_000;     // 60 saniye
const DRY_RUN = true;        // true = sadece log
const token = process.env.TOKEN;

let standingOrders = [];

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}



const checkStandingOrders = async () => {

    const json = await post({ action: "cln_get_user_open_orders", token })

    // console.log(json.response)

    const pendingItems = [...json.response];

    for (let item of pendingItems) {

        const userBid = item.localPrice / 10000

        const market = await post({
            action: "cln_books_brief",
            market_name: item.market,
            appid: 1067,
            token,
        })

        const highestBid = market.response.BUY[0][0] / 10000;
        const lowestSell = market.response.SELL[0][0] / 10000

        // console.log("market BUY: ", market.response.BUY)
        // console.log("market SELL: ", market.response.SELL)

        if (item.type == "BUY") {

            const unnecessarilyHigh = item.localPrice / 10000 - market.response.BUY[0][0] / 10000 > 0.01

            console.log(item.localPrice / 10000, market.response.BUY[0][0] / 10000)

            const unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT

            // console.log("profit ölçer:", lowestSell * 0.85, highestBid, unprofitable)

            if (unprofitable) {
                console.log("artık kârsız")
                continue;
            }


            if (userBid < highestBid && (lowestSell * 0.85 - highestBid) > MIN_PROFIT) {

                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                })

                if (res1.success) console.log("iptal")
                else console.log(res1)

                const res = await post({
                    action: "cln_market_buy",
                    orderId: item.id,
                    pairId: item.pairId,
                    price: (unnecessarilyHigh ? market.response.BUY[0][0] : market.response.BUY[1][0]) + 100,
                    privateMode: true,
                    appid: 1067,
                    market_name: item.market,
                    currencyid: "gjn",
                    amount: 1,
                    transactid: Math.round(Math.random() * 100000),
                    reqstamp: Date.now(),
                    token
                })

                // console.log(res.response)
                console.log("yeniden koyduk")
            }
            // else console.log("EN YÜKSEK BİD BİZİM")
        }
        else {
            const unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT

            function extractMarketId(marketName) {
                const match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
                return match ? Number(match[1]) : null;
            }


            // const inv = await getInvAssets();
            // console.log(item.market)
            const normalID = extractMarketId(item.market)



            if (unprofitable) {
                console.log("kârsız sell")
                continue;
            };

            if(userBid - lowestSell > 0.10){
                console.log("çok düştü geçiyorum")
                continue;
            }
            
            if (userBid > lowestSell) {
                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                })

                console.log(res1)


                const assetID = await waitForAssetIdByMarketId(normalID)

                console.log("satılacak itemın assetIDsi:", assetID)

                console.log({
                    orderId: item.id,
                    pairId: item.pairId,
                    market_name: item.market
                })


                const res = await post({
                    action: "cln_market_sell",
                    token: process.env.SELLTOKEN,
                    transactid: Math.round(Math.random() * 100000),
                    reqstamp: Date.now(),
                    appid: 1067,
                    contextid: 1,
                    assetid: assetID,
                    amount: 1,
                    currencyid: "gjn",
                    price: (lowestSell - 0.01) * 10000,
                    seller_should_get: sellerShouldGet((lowestSell - 0.01) * 10000),
                    agree_stamp: Date.now(),
                    market_name: item.market,
                    privateMode: false,
                })

                console.log("1res:", res)
            }

            const secondLowestSell = market.response.SELL[1][0] / 10000

            console.log("son ikinci sell: ", secondLowestSell)

            // TODO çok ucuza gitmeme kısmı
            if ((secondLowestSell - item.localPrice / 10000).toFixed(2) > 0.01) {

                const res1 = await marketPost({
                    action: "cancel_order",
                    pairId: item.pairId,
                    orderId: item.id,
                    token
                })

                console.log(res1)
                console.log("çok ucuza gidiyordu item: ", (secondLowestSell - item.localPrice/10000 ).toFixed(2))

                const assetID = await waitForAssetIdByMarketId(normalID).catch(err => console.log(err))

                const res = await post({
                    action: "cln_market_sell",
                    token: process.env.SELLTOKEN,
                    transactid: Math.round(Math.random() * 100000),
                    reqstamp: Date.now(),
                    appid: 1067,
                    contextid: 1,
                    assetid: assetID,
                    amount: 1,
                    currencyid: "gjn",
                    price: (secondLowestSell - 0.01) * 10000,
                    seller_should_get: sellerShouldGet((secondLowestSell - 0.01) * 10000),
                    agree_stamp: Date.now(),
                    market_name: item.market,
                    privateMode: true,
                })

                console.log(res)
            }
        }



    }

    console.log("bütün işlemleri dolaştım")
}

checkStandingOrders();

function scheduleNextRun() {
    const delaySec = Math.floor(Math.random() * (100 - 30 + 1)) + 30; // 50–150
    const delayMs = delaySec * 1000;

    console.log(`⏱️ Next run in ${delaySec}s`);

    setTimeout(async () => {
        const ACTION_PROBABILITY = 0.5; // %65 ihtimalle sadece bak

        try {
            if (Math.random() > ACTION_PROBABILITY) {
                console.log("👀 sadece izleme turu");
            } else {
                await checkStandingOrders();
            }
        } catch (err) {
            console.error("⚠️ checkStandingOrders error:", err);
        } finally {
            // 🔑 NE OLURSA OLSUN DEVAM
            scheduleNextRun();
        }
    }, delayMs);
}


// ilk başlatma
scheduleNextRun();
