import * as fs from 'fs';
import dotenv from 'dotenv';
import { calculateLiquidityScore, getPairStat, post } from './helpers/helpers.js';
import express from 'express';
import cors from 'cors';
import { Response } from 'express';
import { startRenewOrders } from './helpers/renewOrders.js';
import axios from 'axios';
dotenv.config();
// Node 18+ (native fetch)

// function sleep(ms:number) {
//     return new Promise(res => setTimeout(res, ms));
// }

const app = express();

app.use(cors())

let jobState: JobState = {
    running: false,
    percent: 0
}

app.get('/progress', async (req, res) => {
    res.status(200).send(jobState)
})


app.get('/renewOrders', (req, res): void => {
    if (jobState.running) {
        res.status(400).send({ message: 'Already running' })
        return  // ⬅️ stop here
    }
    startRenewOrders(jobState); // fire-and-forget
    res.send({ started: true })
})

app.get('/orders', async (req, res) => {
    let items = fs.existsSync('./data/items.json') ? JSON.parse(
        await fs.promises.readFile('./data/items.json', 'utf8')
    ) : []

    if (!items) {
        await fs.promises.writeFile('./data/items.json', JSON.stringify([]))
        items = [];

    }

    if (req.query.category) {
        items = items.filter((item: any) => {
            if (item.tags.includes(`type:${req.query.category}`))
                return item
        })
    }

    res.status(200).send({
        success: true,
        data: items,
        message: "Ürünler gönderildi."
    })

})

app.get('/item/:id', async (req, res) => {

    try {
        const { id } = req.params;

        const token = process.env.TOKEN;

        const market = await post({
            action: "cln_books_brief",
            market_name: id,
            appid: 1067,
            token,
        })

        // console.log("market: \n\n", market)

        res.status(200).send({
            success: true,
            data: {
                id: id,
                BUY: market.response.BUY[0][0],
                SELL: market.response.SELL[0][0]
            },
            message: "Ürünler gönderildi."
        })
    }
    catch (err) {
        console.log("ERR ITEM ID: ", err)
        res.status(500).send({
            success: false,
            err: err
        })
    }

})

app.listen(4000, () => {
    console.log('Sunucu 4000 portunu dinlemeye başladı.')
})