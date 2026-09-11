import axios from 'axios';
import React, { useEffect, useMemo, useState } from 'react'
import type { HashType } from '../utils/types';
import ItemCard from './ItemCard';
import SettingsModal from './SettingsModal';

type Props = {}



const Core = (props: Props) => {

  const [items, setItems] = useState<HashType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [minVolume, setMinVolume] = useState<number>(0);
  const [minProfit, setMinProfit] = useState<number>(0);
  const [isRenewingOrders, setIsRenewingOrders] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [category, setCategory] = useState('')
  const [totals, setTotals] = useState<{buy: number, sell: number, profit?: number, todayProfit?: number}>({buy: 0, sell: 0, profit: 0, todayProfit: 0});
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showUpdatedBadge, setShowUpdatedBadge] = useState<boolean>(false);
  const [filterLiquidatedOnly, setFilterLiquidatedOnly] = useState<boolean>(false);

  const getItems = async (): Promise<void> => {
    // Add cache-busting timestamp to prevent browser from caching stale /orders responses
    const catQuery = filterLiquidatedOnly ? '' : (category ? `category=${category}&` : '');
    axios.get(`/orders?${catQuery}_t=${Date.now()}`)
      .then(res => {
        console.log(res);
        setTotals(res.data.totals || {buy: 0, sell: 0});
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
    console.log("cat:", category, "filterLiquidatedOnly:", filterLiquidatedOnly);
    getItems();

    // Auto-sync totals & profits every 10 seconds so profits appear automatically
    const pollInterval = setInterval(() => {
      getItems();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [category, filterLiquidatedOnly])


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
  }, [items, minVolume, minProfit, filterLiquidatedOnly])

  return (
    <div className=''>
      <div className="pt-20 btn-panel flex flex-col sm:flex-row justify-center items-center gap-8">
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
            onClick={() => setFilterLiquidatedOnly(!filterLiquidatedOnly)}
            className={`px-3 py-2.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 shadow ${
              filterLiquidatedOnly
                ? 'bg-red-600 hover:bg-red-500 text-white border-2 border-red-300'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
            }`}
            title="Sadece likidasyona alınmış eşyaları filtreler"
          >
            <span>🔥</span>
            <span>Likidasyon ({items.filter(i => i.isLiquidated).length})</span>
          </button>
        </div>

        <div className="flex flex-col ml-auto bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-md">
          <div className="text-xs text-gray-400 font-bold uppercase mb-1">Total Invested</div>
          <div className="flex gap-4">
            <span className="text-blue-400 font-semibold" title="Total active BUY orders">BUY: {totals.buy.toFixed(2)} GJN</span>
            <span className="text-red-400 font-semibold" title="Total active SELL orders (x0.85)">SELL: {totals.sell.toFixed(2)} GJN</span>
            <span className="text-white font-bold ml-2">TOTAL: {(totals.buy + totals.sell).toFixed(2)} GJN</span>
          </div>
          <div className="text-xs text-gray-400 font-bold uppercase mt-2 mb-1 flex items-center justify-between">
            <span>Realized Profit</span>
            {lastUpdated && (
              <span className="text-[10px] text-gray-400 lowercase font-mono">
                🕒 {lastUpdated}
              </span>
            )}
          </div>
          <div className="flex gap-3 items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-emerald-400 font-extrabold text-sm" title="Bugün gerçekleşen satışlardan kazanılan net kâr">
                <span className="text-xs text-gray-400 font-normal">Bugün: </span>+{totals.todayProfit?.toFixed(2) || "0.00"} GJN
              </span>
              <span className="text-gray-500 font-bold">|</span>
              <span className="text-gray-300 font-semibold text-xs" title="Tüm zamanlar toplam net kâr">
                <span className="text-gray-400 font-normal">Toplam: </span>+{totals.profit?.toFixed(2) || "0.00"} GJN
              </span>
            </div>
            {showUpdatedBadge && (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded animate-pulse">
                ✓ Güncellendi
              </span>
            )}
          </div>
        </div>

      </div>

      {showUpdatedBadge && (
        <div className="text-center py-2 bg-emerald-500/10 border-y border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide">
          ✓ Veriler başarıyla yenilendi ({lastUpdated}) — {filteredItems.length} ürün listeleniyor
        </div>
      )}

      <div>
        <div className="grid gap-[40px] md:gap-[20px] grid-cols-[repeat(auto-fit,minmax(250px,1fr))] py-10 px-[5vw]">
          {
            loading ?
              "Yükleniyor"
              :
              items.length == 0 ?
                "Görüntülenecek eşya yok"
                :
                filteredItems.map((item: HashType, i: number) => {
                  return (
                    <ItemCard item={item} key={`${item.hash_name}-${item.price}-${item.buy_price}-${lastUpdated}`} />
                  )
                })
          }
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default Core
