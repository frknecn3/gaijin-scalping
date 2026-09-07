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
  const [totals, setTotals] = useState<{buy: number, sell: number, profit?: number}>({buy: 0, sell: 0, profit: 0});
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const getItems = async (): Promise<void> => {
    axios.get(`/orders?category=${category}`)
      .then(res => {
        console.log(res);
        setTotals(res.data.totals || {buy: 0, sell: 0});
        setItems(res.data.data
          .filter((item: HashType) => !item?.tags?.includes('type:key'))
          .sort((a: HashType, b: HashType) => b.last2Volume - a.last2Volume))

      })
      .catch(err => console.log(err))
      .finally(() => setLoading(false))
  }


  useEffect(() => {
    console.log("cat:", category);

    getItems()

  }, [category])


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
      if (item.last2Volume <= minVolume) return false
      if (item.profit <= minProfit) return false
      return true
    }).sort((a: HashType, b: HashType) => b.profit - a.profit)
  }, [items, minVolume, minProfit])

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

        <div className="flex flex-col ml-auto bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-md">
          <div className="text-xs text-gray-400 font-bold uppercase mb-1">Total Invested</div>
          <div className="flex gap-4">
            <span className="text-blue-400 font-semibold" title="Total active BUY orders">BUY: {totals.buy.toFixed(2)} GJN</span>
            <span className="text-red-400 font-semibold" title="Total active SELL orders (x0.85)">SELL: {totals.sell.toFixed(2)} GJN</span>
            <span className="text-white font-bold ml-2">TOTAL: {(totals.buy + totals.sell).toFixed(2)} GJN</span>
          </div>
          <div className="text-xs text-gray-400 font-bold uppercase mt-2 mb-1">Realized Profit</div>
          <div className="flex gap-4">
            <span className="text-green-400 font-bold" title="Total accumulated profit from all fulfilled sales">+{totals.profit?.toFixed(2) || "0.00"} GJN</span>
          </div>
        </div>

      </div>
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

                  // i == 1 ? console.log(item) : ''

                  return (
                    <ItemCard item={item} key={i} />

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
