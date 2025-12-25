import dotenv from "dotenv";
dotenv.config();

// ================= CONFIG =================

const MIN_PROFIT = 0.08;     // %8 net kâr
const FEE = 0.15;            // %15 Gaijin komisyonu
const COOLDOWN = 60_000;     // 60 saniye
const DRY_RUN = true;        // true = sadece log
const token = process.env.TOKEN;

let standingOrders = [];

async function post(body) {
    const res = await fetch("https://market-proxy.gaijin.net/web", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body)
    });
    return res.json();
}

async function marketPost(body) {
    const res = await fetch("https://market-proxy.gaijin.net/market", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body)
    });
    return res.json();
}

const checkStandingOrders = async () => {

    const json = await post({ action: "cln_get_user_open_orders", token })

    console.log(json.response)

    const pendingItems = [...json.response];

    for (let item of pendingItems) {

        const userBid = item.localPrice / 1000

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

        const unnecessarilyHigh = item.localPrice - market.response.BUY[0][1] / 10000 > 0.01

        console.log("unnecessarily high:", unnecessarilyHigh, "highestbid: ", highestBid, "2ndhighest: ", market.response.BUY[1][0] / 1000)

        const unprofitable = lowestSell * 0.85 - highestBid < 0.05

        console.log("profit ölçer:", lowestSell * 0.85 , highestBid, unprofitable)

        if (unprofitable) {
            console.log("artık kârsız")
            continue;
        }


        if (userBid < highestBid && (lowestSell * 0.85 - highestBid) > 0.05) {

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
                price: (unnecessarilyHigh ?  market.response.BUY[0][0] : market.response.BUY[1][0]) + 100,
                privateMode: true,
                appid: 1067,
                market_name: item.market,
                currencyid: "gjn",
                amount: 1,
                transactid: Math.round(Math.random() * 100000),
                reqstamp: Date.now(),
                token
            })

            console.log(res.response)
            console.log("yeniden koyduk")
        }
        else console.log("EN YÜKSEK BİD BİZİM")


    }
}

// checkStandingOrders();

setInterval(checkStandingOrders, 10000)