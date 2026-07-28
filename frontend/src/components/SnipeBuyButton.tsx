import axios from "axios";
import { useState } from "react";
import type { HashType } from "../utils/types";

type SnipeResult = {
  ok: boolean;
  reason?: string;
  error?: string | null;
  myPrice?: number;
  highestBid?: number;
  dryRun?: boolean;
};

type Props = { item: HashType; dryRun?: boolean; minProfit?: number };

const SnipeBuyButton = ({ item, dryRun = false, minProfit = 0.05 }: Props) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SnipeResult | null>(null);

  const snipe = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await axios.post("http://localhost:4000/snipeBuy", {
        market_name: item.hash_name,
        minProfit,
        dryRun,
      });
      setResult(res.data);
    } catch (err: any) {
      setResult({ ok: false, reason: err?.response?.data?.reason ?? "İstek başarısız" });
      console.log(err)
    } finally {
      setBusy(false);
    }
  };

  const label = busy
    ? "Placing order..."
    : result
      ? result.ok
        ? `${result.dryRun ? "🧪" : "✅"} ${(result.myPrice! / 10000).toFixed(2)} GJN`
        : `❌ ${result.reason ?? result.error}`
      : "BUY";

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={snipe}
        disabled={busy}
        className={`${
          busy ? "bg-yellow-600" : result?.ok ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"
        } px-4 py-2 rounded-md`}
      >
        {label}
      </button>
      {result?.highestBid != null && (
        <span className="text-[11px] opacity-70">
          Bid: {(result.highestBid / 10000).toFixed(2)} → {(result.myPrice! / 10000).toFixed(2)}
        </span>
      )}
    </div>
  );
};

export default SnipeBuyButton;