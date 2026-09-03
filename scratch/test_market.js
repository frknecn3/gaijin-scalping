import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TOKEN;

async function testApi() {
  const body = new URLSearchParams({
    action: "cln_get_pair_stat",
    appid: "1067",
    market_name: "Type-62",
    currencyid: "gjn",
    token: token
  });

  const res = await fetch("https://market-proxy.gaijin.net/web", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await res.json();
  console.log("cln_get_pair_stat:", Object.keys(json.response));
  if (json.response["1h"]) console.log("1h:", json.response["1h"].slice(-10));
}

testApi();
