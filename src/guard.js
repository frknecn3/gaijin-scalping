"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
var fs_1 = require("fs");
var helpers_js_1 = require("./helpers/helpers.js");
dotenv_1.default.config();
// ================= CONFIG =================
var MIN_PROFIT = 0.2; // %8 net kâr
var FEE = 0.; // %15 Gaijin komisyonu
var COOLDOWN = 60000; // 60 saniye
var DRY_RUN = true; // true = sadece log
var token = process.env.TOKEN;
var standingOrders = [];
var ignore = [];
function sleep(ms) {
    return new Promise(function (res) { return setTimeout(res, ms); });
}
var checkStandingOrders = function () { return __awaiter(void 0, void 0, void 0, function () {
    // const unprofitable = lowestSell * 0.85 - highestBid < item.localPrice / 100000
    function extractMarketId(marketName) {
        var match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
        return match ? Number(match[1]) : null;
    }
    var json, pendingItems, _a, _b, _c, _i, i, item, userBid, market, highestBid, lowestSell, unnecessarilyHigh, unprofitable, res1, res, unprofitable, normalID, res1, assetID, price, res, secondLowestSell, res1, assetID, res;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                standingOrders = JSON.parse(fs_1.default.readFileSync('./data/orders.json', 'utf-8'));
                return [4 /*yield*/, (0, helpers_js_1.post)({ action: "cln_get_user_open_orders", token: token })
                    // console.log(json.response)
                ];
            case 1:
                json = _d.sent();
                // console.log(json.response)
                fs_1.default.writeFileSync('./data/orders.json', JSON.stringify(json.response));
                pendingItems = __spreadArray([], json.response, true);
                _a = pendingItems;
                _b = [];
                for (_c in _a)
                    _b.push(_c);
                _i = 0;
                _d.label = 2;
            case 2:
                if (!(_i < _b.length)) return [3 /*break*/, 16];
                _c = _b[_i];
                if (!(_c in _a)) return [3 /*break*/, 15];
                i = _c;
                item = pendingItems[i];
                // console.log(pendingItems.length, "curindex: ", i)
                if (ignore.includes(item.market)) {
                    console.log("item umursanmıyor");
                    return [3 /*break*/, 15];
                }
                ;
                userBid = item.localPrice / 10000;
                return [4 /*yield*/, (0, helpers_js_1.post)({
                        action: "cln_books_brief",
                        market_name: item.market,
                        appid: 1067,
                        token: token,
                    })];
            case 3:
                market = _d.sent();
                highestBid = market.response.BUY[0][0] / 10000;
                lowestSell = market.response.SELL[0][0] / 10000;
                console.log("market BUY: ", market.response.BUY);
                console.log("market SELL: ", market.response.SELL);
                if (!(item.type == "BUY")) return [3 /*break*/, 7];
                unnecessarilyHigh = item.localPrice / 10000 - market.response.BUY[0][0] / 10000 > 0.01;
                console.log(item.localPrice / 10000, market.response.BUY[0][0] / 10000);
                unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT;
                // console.log("profit ölçer:", lowestSell * 0.85, highestBid, unprofitable)
                if (unprofitable) {
                    return [3 /*break*/, 15];
                }
                if (!(userBid < highestBid && (lowestSell * 0.85 - highestBid) > MIN_PROFIT)) return [3 /*break*/, 6];
                return [4 /*yield*/, (0, helpers_js_1.marketPost)({
                        action: "cancel_order",
                        pairId: item.pairId,
                        orderId: item.id,
                        token: token
                    })
                    // if (res1.success) console.log("iptal")
                    // else console.log(res1)
                ];
            case 4:
                res1 = _d.sent();
                return [4 /*yield*/, (0, helpers_js_1.post)({
                        action: "cln_market_buy",
                        orderId: item.id,
                        pairId: item.pairId,
                        price: (!unnecessarilyHigh ? market.response.BUY[0][0] : market.response.BUY[1][0]) + 100,
                        privateMode: true,
                        appid: 1067,
                        market_name: item.market,
                        currencyid: "gjn",
                        amount: 1,
                        transactid: Math.round(Math.random() * 100000),
                        reqstamp: Date.now(),
                        token: token
                    })
                    // console.log(res.response)
                    // console.log("yeniden koyduk")
                ];
            case 5:
                res = _d.sent();
                _d.label = 6;
            case 6: return [3 /*break*/, 15];
            case 7:
                unprofitable = lowestSell * 0.85 - highestBid < MIN_PROFIT;
                normalID = extractMarketId(item.market);
                if (!normalID)
                    return [3 /*break*/, 15];
                if (unprofitable) {
                    return [3 /*break*/, 15];
                }
                ;
                if (userBid - lowestSell > 0.50) {
                    return [3 /*break*/, 15];
                }
                if (!(userBid > lowestSell)) return [3 /*break*/, 11];
                return [4 /*yield*/, (0, helpers_js_1.marketPost)({
                        action: "cancel_order",
                        pairId: item.pairId,
                        orderId: item.id,
                        token: token
                    })];
            case 8:
                res1 = _d.sent();
                console.log(res1);
                if (!normalID)
                    return [3 /*break*/, 15];
                return [4 /*yield*/, (0, helpers_js_1.waitForAssetIdByMarketId)(normalID)];
            case 9:
                assetID = _d.sent();
                console.log("satılacak itemın assetIDsi:", assetID);
                console.log({
                    orderId: item.id,
                    pairId: item.pairId,
                    market_name: item.market
                });
                price = Math.round((lowestSell - 0.01) * 10000);
                return [4 /*yield*/, (0, helpers_js_1.post)({
                        action: "cln_market_sell",
                        token: process.env.SELLTOKEN,
                        transactid: Math.round(Math.random() * 100000),
                        reqstamp: Date.now(),
                        appid: 1067,
                        contextid: 1,
                        assetid: assetID,
                        amount: 1,
                        currencyid: "gjn",
                        price: price,
                        seller_should_get: (0, helpers_js_1.sellerShouldGet)(price),
                        agree_stamp: Date.now(),
                        market_name: item.market,
                        privateMode: false,
                    })];
            case 10:
                res = _d.sent();
                if (res.response.error == "WRONG_PRICE") {
                    console.log("\n\n");
                    console.log("yanlış fiyat\n");
                    console.log("low-1: ".concat(lowestSell - 0.01, " \n\n                            designated: ").concat(price, "\n                            lowestSell: ").concat(lowestSell, "\n                            rawSell: ").concat(market.response.SELL[0][0], "\n                            rawBuy: ").concat(market.response.BUY[0][0], "\n                        "));
                    console.log("\n\n");
                }
                _d.label = 11;
            case 11:
                secondLowestSell = market.response.SELL[1][0] / 10000;
                if (!(Number((secondLowestSell - item.localPrice / 10000).toFixed(2)) != 0.00 && Number((secondLowestSell - item.localPrice / 10000).toFixed(2)) < 0.01)) return [3 /*break*/, 15];
                return [4 /*yield*/, (0, helpers_js_1.marketPost)({
                        action: "cancel_order",
                        pairId: item.pairId,
                        orderId: item.id,
                        token: token
                    })];
            case 12:
                res1 = _d.sent();
                return [4 /*yield*/, (0, helpers_js_1.waitForAssetIdByMarketId)(normalID).catch(function (err) { return console.log(err); })];
            case 13:
                assetID = _d.sent();
                return [4 /*yield*/, (0, helpers_js_1.post)({
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
                        seller_should_get: (0, helpers_js_1.sellerShouldGet)((secondLowestSell - 0.01) * 10000),
                        agree_stamp: Date.now(),
                        market_name: item.market,
                        privateMode: true,
                    })];
            case 14:
                res = _d.sent();
                _d.label = 15;
            case 15:
                _i++;
                return [3 /*break*/, 2];
            case 16: return [2 /*return*/];
        }
    });
}); };
checkStandingOrders();
function scheduleNextRun() {
    var _this = this;
    var x = 10;
    var delaySec = Math.floor(Math.random() * (x - 1 + 1)) + 1; // 50–150
    var delayMs = delaySec * 1000;
    console.log("\u23F1\uFE0F Next run in ".concat(delaySec, "s"));
    setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
        var ACTION_PROBABILITY, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ACTION_PROBABILITY = 0.5;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, 6, 7]);
                    if (!(Math.random() > ACTION_PROBABILITY)) return [3 /*break*/, 2];
                    console.log("👀 sadece izleme turu");
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, checkStandingOrders()];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 7];
                case 5:
                    err_1 = _a.sent();
                    console.error("⚠️ checkStandingOrders error:", err_1);
                    return [3 /*break*/, 7];
                case 6:
                    // 🔑 NE OLURSA OLSUN DEVAM
                    scheduleNextRun();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    }); }, delayMs);
}
// ilk başlatma
scheduleNextRun();
