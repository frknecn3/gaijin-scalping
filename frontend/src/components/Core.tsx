import axios from 'axios';
import React, { useEffect, useMemo, useState } from 'react'
import type { HashType, TransactionType, TotalsType, DailySummaryType } from '../utils/types';
import ItemCard from './ItemCard';
import SettingsModal from './SettingsModal';
import { TargetBuyModal } from './TargetBuyModal';
import { DailyModal } from './DailyModal';

type Props = {
  onNavigateToOperations?: () => void;
}



const Core = (props: Props) => {

  const [items, setItems] = useState<HashType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [minVolume, setMinVolume] = useState<number>(0);
  const [minProfit, setMinProfit] = useState<number>(0);
  const [isRenewingOrders, setIsRenewingOrders] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [category, setCategory] = useState('')
  const [totals, setTotals] = useState<TotalsType>({
    buy: 0,
    sell: 0,
    profit: 0,
    todayProfit: 0,
    yesterdayProfit: 0,
    walletBalance: 0,
    totalEquity: 0,
    operatingCapitalTarget: 75.0,
    excessEquity: 0,
    spendableCash: 0,
    externalSpentGJN: 116.0,
    lifetimeTotalCreated: 0
  });
  const [dailySummary, setDailySummary] = useState<DailySummaryType[]>([]);
  const [isDailyModalOpen, setIsDailyModalOpen] = useState<boolean>(false);
  const [isTargetBuyModalOpen, setIsTargetBuyModalOpen] = useState<boolean>(false);
  const [recentTransactions, setRecentTransactions] = useState<TransactionType[]>([]);
  const [txCount, setTxCount] = useState<number>(5);
  const [showTransactions, setShowTransactions] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showUpdatedBadge, setShowUpdatedBadge] = useState<boolean>(false);
  const [filterLiquidatedOnly, setFilterLiquidatedOnly] = useState<boolean>(false);
  const [filterIgnoredOnly, setFilterIgnoredOnly] = useState<boolean>(false);
  const [enableBuying, setEnableBuying] = useState<boolean>(true);
  const [enableSelling, setEnableSelling] = useState<boolean>(true);
  const [showItems, setShowItems] = useState<boolean>(false);

  const fetchBotSwitches = async (): Promise<void> => {
    try {
      const res = await axios.get('/settings');
      if (res.data?.settings) {
        if (typeof res.data.settings.enableBuying === 'boolean') {
          setEnableBuying(res.data.settings.enableBuying);
        }
        if (typeof res.data.settings.enableSelling === 'boolean') {
          setEnableSelling(res.data.settings.enableSelling);
        }
      }
    } catch (e) {
      console.error("Error fetching bot switches", e);
    }
  };

  const handleToggleBuying = async () => {
    const nextVal = !enableBuying;
    setEnableBuying(nextVal);
    try {
      await axios.post('/settings', { enableBuying: nextVal });
    } catch (e) {
      console.error("Failed to update buying switch", e);
      setEnableBuying(!nextVal);
    }
  };

  const handleToggleSelling = async () => {
    const nextVal = !enableSelling;
    setEnableSelling(nextVal);
    try {
      await axios.post('/settings', { enableSelling: nextVal });
    } catch (e) {
      console.error("Failed to update selling switch", e);
      setEnableSelling(!nextVal);
    }
  };

  const getItems = async (): Promise<void> => {
    // Add cache-busting timestamp to prevent browser from caching stale /orders responses
    const catQuery = (filterLiquidatedOnly || filterIgnoredOnly) ? '' : (category ? `category=${category}&` : '');
    axios.get(`/orders?${catQuery}_t=${Date.now()}`)
      .then(res => {
        console.log(res);
        if (res.data.totals) {
          setTotals(res.data.totals);
        }
        if (res.data.dailySummary) {
          setDailySummary(res.data.dailySummary);
        }
        if (res.data.recentTransactions) {
          setRecentTransactions(res.data.recentTransactions);
        }
        setItems(res.data.data
          .filter((item: HashType) => !item?.tags?.includes('type:key'))
          .sort((a: HashType, b: HashType) => b.last2Volume - a.last2Volume));

        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        setLastUpdated(timeStr);
        setShowUpdatedBadge(true);
        setTimeout(() => setShowUpdatedBadge(false), 4000);
      })
      .catch(err => console.log(err))
      .finally(() => setLoading(false))
  }


  useEffect(() => {
    console.log("cat:", category, "filterLiquidatedOnly:", filterLiquidatedOnly, "filterIgnoredOnly:", filterIgnoredOnly);
    getItems();
    fetchBotSwitches();

    // Auto-sync totals, profits & switches every 10 seconds so state stays synchronized
    const pollInterval = setInterval(() => {
      getItems();
      fetchBotSwitches();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [category, filterLiquidatedOnly, filterIgnoredOnly])


  useEffect(() => {
    // Initial check on mount: if already running in background, show progress!
    axios.get('/progress').then(res => {
      if (res.data.running) {
        setIsRenewingOrders(true);
        setProgress(res.data.percent);
      }
    }).catch(err => console.log(err));
  }, []);

  useEffect(() => {
    if (!isRenewingOrders) return

    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/progress')
        console.log("durum res:", res)
        setProgress(res.data.percent)

        if (!res.data.running) {
          clearInterval(interval)
          setIsRenewingOrders(false)
          getItems() // Refresh items once the scan finishes!
        }
      } catch (err) {
        console.log(err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isRenewingOrders])


  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterIgnoredOnly) {
        return !!item.isIgnored;
      }
      if (filterLiquidatedOnly) {
        // When in liquidation filter mode, display ALL liquidated items regardless of volume/profit!
        return !!item.isLiquidated;
      }
      // Never hide active liquidated items from the general list
      if (item.isLiquidated) return true;
      if (item.last2Volume <= minVolume) return false;
      if (item.profit <= minProfit) return false;
      return true;
    }).sort((a: HashType, b: HashType) => {
      // Prioritize liquidated items so user can monitor them easily at the top
      if (a.isLiquidated && !b.isLiquidated) return -1;
      if (!a.isLiquidated && b.isLiquidated) return 1;
      return b.profit - a.profit;
    });
  }, [items, minVolume, minProfit, filterLiquidatedOnly, filterIgnoredOnly]);

  return (
    <div className=''>
      <div className="pt-20 btn-panel flex lg:flex-row flex-col justify-center items-center gap-8">
        <button className={`${isRenewingOrders ? "bg-yellow-600 cursor-not-allowed" : "bg-green-500"} px-5 py-3 rounded-xl uppercase font-bold hover:${isRenewingOrders ? "bg-yellow-600" : "bg-green-600"} transition border-2 border-transparent hover:border-white`}
          disabled={isRenewingOrders}
          onClick={async () => {
            setIsRenewingOrders(true);
            setProgress(0);
            axios
              .get('/renewOrders')
              .catch(err => {
                console.log(err);
                // Even if 400 (already running in backend), stay in renewing state so user sees progress
                setIsRenewingOrders(true);
              });
          }}
        >
          {!isRenewingOrders ? "Yenile" : `%${progress}`}
        </button>

        <button className={`${isRenewingOrders ? "bg-yellow-600 cursor-not-allowed" : "bg-red-500"} px-5 py-3 rounded-xl uppercase font-bold hover:${isRenewingOrders ? "bg-yellow-600" : "bg-red-600"} transition border-2 border-transparent hover:border-white`}
          disabled={isRenewingOrders}
          title="Yavaş, daha kapsamlı yenileme"
          onClick={async () => {
            setIsRenewingOrders(true);
            setProgress(0);
            axios
              .get('/renewOrders?hard=true')
              .catch(err => {
                console.log(err);
                // Even if 400 (already running in backend), stay in renewing state so user sees progress
                setIsRenewingOrders(true);
              });
          }}
        >
          {!isRenewingOrders ? "Hard Refresh" : `%${progress}`}
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="bg-[#242b38] hover:bg-[#2f384a] text-cyan-400 hover:text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 px-5 py-3 rounded-xl uppercase font-bold transition flex items-center gap-2 shadow-lg shadow-cyan-950/30 active:scale-95"
          title="Guard kâr marjı, confirmation streak ve bot ayarlarını düzenle"
        >
          <span>⚙️</span> Bot Ayarları
        </button>

        {/* Master Buy & Sell Switches */}
        <div className="flex items-center gap-2 bg-[#12161f] p-1.5 rounded-xl border border-[#2e3646] shadow-md">
          <button
            type="button"
            onClick={handleToggleBuying}
            className={`px-3 py-2.5 rounded-lg text-xs font-black uppercase transition flex items-center gap-1.5 shadow active:scale-95 ${enableBuying
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 border border-emerald-400/40'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40 border border-red-400/40 animate-pulse'
              }`}
            title={enableBuying ? "Alış botu aktif. Durdurmak için tıklayın." : "Alış botu DURDURULDU. Başlatmak için tıklayın."}
          >
            <span>🛒</span>
            <span>Alış: {enableBuying ? 'AÇIK' : 'KAPALI'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleSelling}
            className={`px-3 py-2.5 rounded-lg text-xs font-black uppercase transition flex items-center gap-1.5 shadow active:scale-95 ${enableSelling
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 border border-emerald-400/40'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/40 border border-red-400/40 animate-pulse'
              }`}
            title={enableSelling ? "Satış botu aktif. Durdurmak için tıklayın." : "Satış botu DURDURULDU. Başlatmak için tıklayın."}
          >
            <span>🏷️</span>
            <span>Satış: {enableSelling ? 'AÇIK' : 'KAPALI'}</span>
          </button>
        </div>

        {/* min hacim */}
        <div className="flex flex-col">
          <label htmlFor="">Min Volume</label>
          <input type="number" className='p-2 rounded-md' placeholder='Enter volume...' onChange={(e) => setMinVolume(Number(e.target.value))} />
        </div>

        {/* min fiyat */}
        <div className="flex flex-col">
          <label htmlFor="">Min Profit</label>
          <input type="number" className='p-2 rounded-md' min={0.1} defaultValue={0.1} placeholder='Profit...' onChange={(e) => setMinProfit(Number(e.target.value))} />
        </div>

        <div className='flex flex-col'>
          <label htmlFor="">Type</label>
          <select name="category" id="category" onChange={(e) => setCategory(e.currentTarget.value)}>
            <option defaultChecked disabled value='skin'>Select category</option>
            <option value=''>All</option>
            <option value='tank'>Tank</option>
            <option value='aircraft'>Aircraft</option>
            <option value='ship'>Ship</option>
            <option value='skin'>Skin</option>
          </select>
        </div>

        <div className='flex flex-col justify-end'>
          <button
            type="button"
            onClick={() => {
              setFilterLiquidatedOnly(!filterLiquidatedOnly);
              if (!filterLiquidatedOnly) setFilterIgnoredOnly(false);
            }}
            className={`px-3 py-2.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow ${filterLiquidatedOnly
              ? 'bg-red-600 hover:bg-red-500 text-white border-2 border-red-300'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
              }`}
            title="Sadece likidasyona alınmış eşyaları filtreler"
          >
            <span>🔥</span>
            <span>Likidasyon ({items.filter(i => i.isLiquidated).length})</span>
          </button>
        </div>

        <div className='flex flex-col justify-end'>
          <button
            type="button"
            onClick={() => {
              setFilterIgnoredOnly(!filterIgnoredOnly);
              if (!filterIgnoredOnly) setFilterLiquidatedOnly(false);
            }}
            className={`px-3 py-2.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow ${filterIgnoredOnly
              ? 'bg-purple-700 hover:bg-purple-600 text-white border-2 border-purple-300'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
              }`}
            title="Sadece yoksayılan (kara listedeki) eşyaları filtreler"
          >
            <span>🚫</span>
            <span>Yoksayılanlar ({items.filter(i => i.isIgnored).length})</span>
          </button>
        </div>

        <div className='flex flex-col justify-end'>
          <button
            type="button"
            onClick={() => setIsTargetBuyModalOpen(true)}
            className="px-3.5 py-2.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-700 hover:from-indigo-600 hover:to-indigo-500 text-white border border-indigo-400/50 shadow-lg shadow-indigo-900/40"
            title="Kişisel kupon/tank alımları için hedef sniper modunu açar (Örn: KV-220)"
          >
            <span className="text-sm">🎯</span>
            <span>Hedef Alım (Sniper)</span>
          </button>
        </div>

        <div className="flex flex-col ml-auto bg-[#181d28] p-3.5 rounded-xl border border-gray-700/80 shadow-xl min-w-[320px]">
          {/* Toplam Portföy Varlığı */}
          <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase mb-1">
            <span>Toplam Portföy (Total Equity)</span>
            <span className="font-mono text-cyan-400 font-extrabold text-sm">
              {(totals.totalEquity ?? (totals.buy + totals.sell + (totals.walletBalance ?? 0))).toFixed(2)} GJN
            </span>
          </div>

          <div className="flex gap-2 text-[11px] font-mono text-gray-400 justify-between bg-black/30 px-2.5 py-1 rounded border border-gray-800 flex-wrap">
            <span className="text-blue-400" title="Aktif BUY emirlerinde kilitli tutar">BUY: {totals.buy.toFixed(2)}</span>
            <span className="text-red-400" title="Aktif SELL envanter net tutarı (x0.85)">SELL: {totals.sell.toFixed(2)}</span>
            {(totals.targetBuysValue ?? 0) > 0 && (
              <span className="text-purple-400 font-bold" title="Alınan Sniper/Target Buy Kuponları">KUPON: {(totals.targetBuysValue ?? 0).toFixed(2)}</span>
            )}
            <span className="text-emerald-400 font-bold" title="Kasadaki anlık saf nakit (Cüzdan)">
              KASA: {(totals.walletBalance ?? 0).toFixed(2)}
            </span>
          </div>

          {/* HARCANABİLİR BAKİYE (SAFE-TO-SPEND) HIGHLIGHT CARD */}
          <div className={`mt-2.5 p-2 rounded-lg border flex flex-col gap-1 transition ${(totals.excessEquity ?? 0) > 0
            ? 'bg-gradient-to-r from-emerald-950/60 via-teal-950/40 to-emerald-950/60 border-emerald-500/50 shadow-lg shadow-emerald-950/40'
            : 'bg-amber-950/20 border-amber-600/30'
            }`}>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-gray-200">
                <span>💎</span>
                <span>Harcanabilir Bakiye:</span>
              </span>
              <span className={`font-mono text-sm font-black tracking-wide ${(totals.excessEquity ?? 0) > 0 ? 'text-emerald-300' : 'text-amber-400'
                }`}>
                {(totals.excessEquity ?? 0) > 0
                  ? `+${totals.excessEquity?.toFixed(2)} GJN`
                  : '0.00 GJN'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
              <span>Hedef Rezerv: {totals.operatingCapitalTarget ?? 140.0} GJN</span>
              <span className="text-gray-300">
                Çekilebilir Nakit: <strong className="text-emerald-300 font-bold">{(totals.spendableCash ?? 0).toFixed(2)} GJN</strong>
              </span>
            </div>
          </div>

          {/* KÂR DETAYLARI: Bugün, Dün, Toplam, Store Harcaması */}
          <div className="mt-2.5 pt-2 border-t border-gray-700/60 flex flex-col gap-1.5">
            <div className="text-xs text-gray-400 font-bold uppercase flex items-center justify-between">
              <span>Realized Profits</span>
              <button
                type="button"
                onClick={() => setIsDailyModalOpen(true)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 font-semibold transition"
                title="Son 14 günün gün gün kâr ve işlem dökümü"
              >
                <span>📅 Günlük Döküm</span>
                <span>↗</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs flex-wrap gap-1 font-mono">
              <span className={`${(totals.todayProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-extrabold`} title="Bugün gerçekleşen net satış kârı/zararı">
                <span className="text-[11px] text-gray-400 font-normal">Bugün: </span>
                {(totals.todayProfit ?? 0) >= 0 ? `+${(totals.todayProfit ?? 0).toFixed(2)}` : (totals.todayProfit ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-600 font-bold">|</span>
              <span className="text-teal-400 font-semibold text-[11px]" title="Dünün satış kârı">
                <span className="text-gray-400 font-normal">Dün: </span>+{(totals.yesterdayProfit ?? 0).toFixed(2)}
              </span>
              <span className="text-gray-600 font-bold">|</span>
              <span className="text-gray-300 font-semibold text-[11px]" title="Pazarda kaydedilen tüm zamanlar kârı">
                <span className="text-gray-400 font-normal">Pazar: </span>+{(totals.profit ?? 0).toFixed(2)}
              </span>
            </div>

            {/* Kümülatif Üretilen Değer & Store Harcaması */}
            <div className="flex items-center justify-between text-[11px] bg-[#121620] px-2 py-1 rounded border border-gray-800 text-gray-400 font-mono mt-0.5">
              <span title="Gaijin Store'dan satın aldığınız paket/GE harcaması">Store Harcaması: <strong className="text-amber-400 font-bold">{totals.externalSpentGJN?.toFixed(2) || "116.00"} GJN</strong></span>
              <span title="Pazar Kârı + Store Harcamaları toplamı">Üretilen Değer: <strong className="text-cyan-300 font-bold">+{totals.lifetimeTotalCreated?.toFixed(2) || (Number(totals.profit || 0) + 116).toFixed(2)} GJN</strong></span>
            </div>
          </div>

          {props.onNavigateToOperations && (
            <button
              type="button"
              onClick={props.onNavigateToOperations}
              className="mt-2.5 w-full py-2 px-3 bg-gradient-to-r from-indigo-600/30 via-cyan-600/30 to-indigo-600/30 hover:from-indigo-600/50 hover:to-cyan-600/50 border border-cyan-500/40 hover:border-cyan-400 rounded-lg text-xs font-bold text-cyan-300 hover:text-white transition flex items-center justify-center gap-2 shadow-md shadow-indigo-950/40 group active:scale-[0.99]"
            >
              <span>💼</span>
              <span>Aktif İşlemler & Potansiyel Gelirler</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          )}
        </div>

      </div>

      {showUpdatedBadge && (
        <div className="text-center py-2 bg-emerald-500/10 border-y border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide">
          ✓ Veriler başarıyla yenilendi ({lastUpdated}) — {filteredItems.length} ürün listeleniyor
        </div>
      )}

      {/* Latest Transactions Section */}
      <div className="mx-auto max-w-[90vw] mt-6">
        <div className="bg-gray-850/80 border border-gray-700/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md bg-[#161c28]">
          <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-gray-800/80 border-b border-gray-700 gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">🧾</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">
                    Son İşlemler / Latest Transactions
                  </h3>
                  <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {recentTransactions.length} kayıt
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  Son satılan eşyalar, alış ve satış fiyatları ile gerçekleşen net kâr
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex bg-gray-900/90 rounded-lg p-0.5 border border-gray-700">
                <button
                  type="button"
                  onClick={() => setTxCount(5)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${txCount === 5
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                    }`}
                >
                  Son 5
                </button>
                <button
                  type="button"
                  onClick={() => setTxCount(10)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${txCount === 10
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                    }`}
                >
                  Son 10
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowTransactions(!showTransactions)}
                className="text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700/60 bg-gray-800/60 transition text-xs font-semibold"
                title={showTransactions ? "Listeyi Gizle" : "Listeyi Göster"}
              >
                {showTransactions ? "▲ Gizle" : "▼ Göster"}
              </button>
            </div>
          </div>

          {showTransactions && (
            <div className="overflow-x-auto">
              {recentTransactions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Henüz kaydedilmiş satış işlemi bulunmuyor.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60 text-gray-400 font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Eşya</th>
                      <th className="py-2.5 px-3">Alış (Maliyet)</th>
                      <th className="py-2.5 px-3">Satış (Brüt)</th>
                      <th className="py-2.5 px-3">Net Gelir (-15%)</th>
                      <th className="py-2.5 px-3">Net Kâr</th>
                      <th className="py-2.5 px-4 text-right">Tarih / Saat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {recentTransactions.slice(0, txCount).map((tx) => {
                      const isProfit = tx.profit >= 0;
                      return (
                        <tr key={tx.id} className="hover:bg-gray-800/40 transition">
                          <td className="py-2.5 px-4 flex items-center gap-3">
                            {tx.icon ? (
                              <img
                                src={tx.icon}
                                alt={tx.name || tx.market}
                                className="w-10 h-8 object-cover rounded bg-black/60 border border-gray-700 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-8 rounded bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                                📦
                              </div>
                            )}
                            <div className="truncate max-w-[260px] sm:max-w-xs md:max-w-md">
                              <div className="font-semibold text-gray-200 truncate" title={tx.name || tx.market}>
                                {tx.name || tx.market}
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono truncate">
                                {tx.market}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-blue-400 whitespace-nowrap">
                            {tx.basis ? `${tx.basis.toFixed(2)} GJN` : 'Bilinmiyor'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-red-400 whitespace-nowrap">
                            {tx.sellPrice.toFixed(2)} GJN
                          </td>
                          <td className="py-2.5 px-3 font-mono text-gray-300 whitespace-nowrap">
                            {tx.netIncome ? `${tx.netIncome.toFixed(2)} GJN` : `${(tx.sellPrice * 0.85).toFixed(2)} GJN`}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${isProfit
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-red-500/20 text-red-400 border border-red-500/40'
                                }`}
                            >
                              {isProfit ? `+${tx.profit.toFixed(2)}` : tx.profit.toFixed(2)} GJN
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-gray-400 text-[11px] whitespace-nowrap">
                            {tx.dateStr ? `${tx.dateStr} ${tx.timeStr}` : tx.timestamp}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="grid gap-[40px] md:gap-[20px] grid-cols-[repeat(auto-fit,minmax(250px,1fr))] py-10 px-[5vw]">
          {
            loading ?
              "Yükleniyor"
              :
              !showItems ?
                <button onClick={() => setShowItems(true)}>EŞYA GÖRÜNTÜLE</button>
                :
                items.length == 0 ?
                  "Görüntülenecek eşya yok"
                  : <>
                    <button onClick={() => setShowItems(false)}>GİZLE</button>
                    {filteredItems.map((item: HashType, i: number) => {
                      return (
                        <ItemCard item={item} key={`${item.hash_name}-${item.price}-${item.buy_price}-${lastUpdated}`} />
                      )
                    })}
                  </>

          }
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Daily Profits Breakdown Modal */}
      <DailyModal
        isOpen={isDailyModalOpen}
        onClose={() => setIsDailyModalOpen(false)}
        dailySummary={dailySummary}
      />

      {/* TARGET-BUY (SNIPER) MODAL */}
      <TargetBuyModal
        isOpen={isTargetBuyModalOpen}
        onClose={() => setIsTargetBuyModalOpen(false)}
        onRefreshOrders={getItems}
      />
    </div>
  )
}

export default Core
