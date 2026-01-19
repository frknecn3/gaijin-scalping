import axios from 'axios';
import React, { useEffect, useMemo, useState } from 'react'
import type { HashType } from '../utils/types';
import ItemCard from './ItemCard';

type Props = {}



const Core = (props: Props) => {

  const [items, setItems] = useState<HashType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [minVolume, setMinVolume] = useState<number>(0);
  const [minProfit, setMinProfit] = useState<number>(0);
  const [isRenewingOrders, setIsRenewingOrders] = useState<boolean>(false);
  const [progress,setProgress] = useState<number>(0);


  const getItems = (): void => {
    axios.get('http://localhost:4000/orders')
      .then(res => {
        setItems(res.data.data
          .filter((item: HashType) => !item.tags.includes('type:key'))
          .filter(((item: HashType) => !item.tags.includes('type:tank')))
          .filter(((item: HashType) => !item.tags.includes('type:aircraft')))
          .sort((a: HashType, b: HashType) => b.last2Volume - a.last2Volume))

      })
      .catch(err => console.log(err))
      .finally(() => setLoading(false))
  }


  useEffect(() => {

    getItems()

  }, [])


  useEffect(() => {
    if (!isRenewingOrders) return

    const interval = setInterval(async () => {
      const res = await axios.get('http://localhost:4000/progress')
      console.log("durum res:", res)
      setProgress(res.data.percent)

      if (!res.data.running) {
        clearInterval(interval)
        setIsRenewingOrders(false)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isRenewingOrders])


  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (item.last2Volume <= minVolume) return false
      if (item.profit <= minProfit) return false
      return true
    }).sort((a:HashType,b:HashType)=>b.profit - a.profit)
  }, [items, minVolume, minProfit])

  return (
    <div className=''>
      <div className="pt-20 btn-panel flex flex-col sm:flex-row justify-center items-center gap-8">
        <button className={`${isRenewingOrders ? "bg-yellow-600":"bg-green-500"} px-5 py-3 rounded-xl uppercase font-bold hover:${isRenewingOrders ? "bg-yellow-600":"bg-green-600"} transition border-2 border-transparent hover:border-white`}
          disabled={isRenewingOrders}
          onClick={async () => {

            setIsRenewingOrders(true);

            axios
              .get('http://localhost:4000/renewOrders')
              .then((res) => getItems())
              .catch(err => console.log(err))
          }}
        >
          {!isRenewingOrders ? "Yenile" : `%${progress}`}
        </button>

        {/* min hacim */}
        <div className="flex flex-col">
          <label htmlFor="">Min Volume</label>
          <input type="number" className='p-2 rounded-md' placeholder='Enter volume...' onChange={(e) => setMinVolume(Number(e.target.value))} />
        </div>

        {/* min fiyat */}
        <div className="flex flex-col">
          <label htmlFor="">Min Profit</label>
          <input type="number" className='p-2 rounded-md' placeholder='Profit...' onChange={(e) => setMinProfit(Number(e.target.value))} />
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
    </div>
  )
}

export default Core