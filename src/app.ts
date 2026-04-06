import * as fs from 'fs';
import dotenv from 'dotenv';
import { calculateLiquidityScore, getPairStat } from './helpers/helpers.js';
import express from 'express';
import cors from 'cors';
import { Response } from 'express';
import { startRenewOrders } from './helpers/renewOrders.js';
dotenv.config();
// Node 18+ (native fetch)

// function sleep(ms:number) {
//     return new Promise(res => setTimeout(res, ms));
// }
console.log("SERVERRR")

const app = express();

app.use(cors())

let jobState: JobState = {
    running: false,
    percent: 0
}

app.get('/progress', async (req, res) => {
    res.status(200).send(jobState)
})


app.get('/renewOrders', (req, res):void => {




    if (jobState.running) {
        res.status(400).send({ message: 'Already running' })
    }

    startRenewOrders(jobState); // fire-and-forget
    res.send({ started: true })
})

app.get('/orders', async (req, res) => {
    console.log("istek geldi")
    let items = JSON.parse(
        await fs.promises.readFile('./src/data/items.json', 'utf8')
    )

    if(!items) {
        await fs.promises.writeFile('./src/data/items.json', JSON.stringify([]))
        items = [];

    }

    if(req.query.category) {
        items = items.filter((item:any) => {
            if(item.tags.includes(`type:${req.query.category}`))
                return item
        })
    }

    res.status(200).send({
        success: true,
        data: items,
        message: "Ürünler gönderildi."
    })

})

app.listen(4000, () => {
    console.log('Sunucu 4000 portunu dinlemeye başladı.')
})