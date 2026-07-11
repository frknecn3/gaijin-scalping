import React, { useState } from 'react'
import type { HashType } from '../utils/types'
import { hexToRgba } from '../utils/helpers'
import axios from 'axios'

type Props = {
    item: HashType
}

const ItemCard = ({ item }: Props) => {

    const clr = hexToRgba(item.color?.toString().toLowerCase() || "#FF0000", 0.2)

    const [updatedVal, setUpdatedVal] = useState<{ buy: number, sell: number } | null>(null);

    const handleRefresh = async () => {
        const res = await axios.get(`http://localhost:4000/item/${item.hash_name}`);

        console.log(res)

        setUpdatedVal({ buy: res.data.data.BUY, sell: res.data.data.SELL })
    }

    return (
        <a className={`border-2 min-h-[300px] rounded-xl pb-5 bg-[${clr}20]`} style={{
            borderColor: clr,
            backgroundColor: clr,
        }}>
            <div className='bg-black rounded-t-xl'>
                <img className='aspect-[9/5] w-full rounded-t-xl' src={item.icon} alt="" />
            </div>
            <div className='px-10 py-4 flex flex-col gap-4'>
                <h4 className='truncate font-bold'>
                    {item.name}
                </h4>

                <span>
                    selling at
                    <span className='text-2xl pt-5 text-red-600 ml-1'>
                        {updatedVal?.sell ? (updatedVal.sell / 10000).toFixed(2) : item.price?.toFixed(2)} GJN
                    </span>
                </span>

                <span>
                    buying at
                    <span className='text-2xl pt-5 text-blue-400 ml-1'>
                        {updatedVal?.buy ? (updatedVal.buy / 10000).toFixed(2) : item.buy_price?.toFixed(2)} GJN
                    </span>
                </span>

                <span>
                    net profit
                    <span className='text-2xl pt-5 text-green-400 ml-1'>
                        {(Number(updatedVal?.sell ? (updatedVal.sell / 10000).toFixed(2) : item.price?.toFixed(2)) * 0.85
                            -
                            Number(updatedVal?.buy ? (updatedVal.buy / 10000).toFixed(2) : item.buy_price?.toFixed(2))).toFixed(2)} GJN
                    </span>
                </span>

                <span>
                    <span className='text-xl font-bold mr-1'>
                        {item.last2Volume}
                    </span>
                    sold in 2 days
                </span>

                <div>
                    <button className='bg-yellow-600 px-4 py-2 rounded-md' onClick={() => { handleRefresh() }}>REFRESH</button>
                </div>
            </div>
        </a>
    )
}

export default ItemCard