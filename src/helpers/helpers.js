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
Object.defineProperty(exports, "__esModule", { value: true });
exports.findItemOrder = exports.getInvAssets = void 0;
exports.getPairStat = getPairStat;
exports.calculateLiquidityScore = calculateLiquidityScore;
exports.waitForAssetIdByMarketId = waitForAssetIdByMarketId;
exports.post = post;
exports.marketPost = marketPost;
exports.sellerShouldGet = sellerShouldGet;
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var token = process.env.TOKEN;
var getInvAssets = function () { return __awaiter(void 0, void 0, void 0, function () {
    function assetAPI(body) {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetch("https://market-proxy.gaijin.net/assetAPI", {
                            method: "POST",
                            headers: { "content-type": "application/x-www-form-urlencoded" },
                            body: new URLSearchParams(body)
                        })];
                    case 1:
                        res = _a.sent();
                        return [2 /*return*/, res.json()];
                }
            });
        });
    }
    var res, assets;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, assetAPI({
                    action: "GetContextContents",
                    token: token,
                    appid: 1067,
                    contextid: 1
                })];
            case 1:
                res = _a.sent();
                assets = res.result.assets;
                assets = assets.flatMap(function (a) {
                    return a.class.map(function (c) { return ({
                        assetId: a.id,
                        id: c.value
                    }); });
                });
                return [2 /*return*/, assets];
        }
    });
}); };
exports.getInvAssets = getInvAssets;
function sleep(ms) {
    return new Promise(function (res) { return setTimeout(res, ms); });
}
function calculateLiquidityScore(stat1d, item) {
    var last2 = stat1d.slice(-2);
    var last2Volume = last2.reduce(function (s, d) { return s + d[2]; }, 0);
    var prev5 = stat1d.slice(-7, -2);
    var prev5Avg = prev5.reduce(function (s, d) { return s + d[2]; }, 0) / Math.max(prev5.length, 1);
    var momentum = last2Volume / Math.max(prev5Avg, 1);
    var depthScore = Math.log(item.buy_depth + 1);
    var liquidityScore = (last2Volume * 5) + // 🔥 en önemli
        (momentum * 4) + // trend
        (depthScore * 3) + // anında satılabilirlik
        (item.profit * 10); // ama abartma
    return {
        liquidityScore: liquidityScore,
        last2Volume: last2Volume,
        momentum: momentum
    };
}
function getPairStat(marketName) {
    return __awaiter(this, void 0, void 0, function () {
        var body, res, json;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!process.env.TOKEN)
                        return [2 /*return*/];
                    body = new URLSearchParams({
                        action: "cln_get_pair_stat",
                        appid: "1067",
                        market_name: marketName,
                        currencyid: "gjn",
                        token: process.env.TOKEN
                    });
                    return [4 /*yield*/, fetch("https://market-proxy.gaijin.net/web", {
                            method: "POST",
                            headers: {
                                "content-type": "application/x-www-form-urlencoded"
                            },
                            body: body
                        })];
                case 1:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    json = _b.sent();
                    if (!((_a = json.response) === null || _a === void 0 ? void 0 : _a.success) || !json.response["1d"]) {
                        console.log("Veri alınamadı.", json);
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, json.response["1d"]];
            }
        });
    });
}
function waitForAssetIdByMarketId(normalID_1) {
    return __awaiter(this, arguments, void 0, function (normalID, timeoutMs) {
        var start, inv, match;
        if (timeoutMs === void 0) { timeoutMs = 15000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    start = Date.now();
                    _a.label = 1;
                case 1:
                    if (!(Date.now() - start < timeoutMs)) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, exports.getInvAssets)()];
                case 2:
                    inv = _a.sent();
                    match = inv.find(function (x) { return Number(x.id) === Number(normalID); });
                    if (match === null || match === void 0 ? void 0 : match.assetId) {
                        return [2 /*return*/, match.assetId];
                    }
                    return [4 /*yield*/, sleep(700)];
                case 3:
                    _a.sent(); // kısa polling
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
function post(body) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("https://market-proxy.gaijin.net/web", {
                        method: "POST",
                        headers: { "content-type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams(body)
                    })];
                case 1:
                    res = _a.sent();
                    return [2 /*return*/, res.json()];
            }
        });
    });
}
function marketPost(body) {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch("https://market-proxy.gaijin.net/market", {
                        method: "POST",
                        headers: { "content-type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams(body)
                    })];
                case 1:
                    res = _a.sent();
                    return [2 /*return*/, res.json()];
            }
        });
    });
}
function sellerShouldGet(price) {
    var afterFee = price * 0.85;
    return Math.floor(afterFee / 100) * 100;
}
function extractMarketId(marketName) {
    var match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
    return match ? Number(match[1]) : null;
}
var findItemOrder = function (id, array) {
    return array.find(function (i) { return extractMarketId(i.market) == id; });
};
exports.findItemOrder = findItemOrder;
