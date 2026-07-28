import { Router } from "express";
import { placeTopBuyOrder } from "../helpers/snipeBuy.js";

const snipeBuyRouter = Router();

snipeBuyRouter.post("/snipeBuy", async (req, res) => {
  const { market_name, maxPrice, minProfit, dryRun } = req.body ?? {};
  console.log(req.body)
  if (!market_name) return res.status(400).json({ ok: false, reason: "market_name gerekli" });

  try {
    res.json(await placeTopBuyOrder({ market_name, maxPrice, minProfit, dryRun }));
  } catch (err: any) {
    console.error("snipeBuy error:", err);
    res.status(500).json({ ok: false, reason: err.message });
  }
});

export default snipeBuyRouter;