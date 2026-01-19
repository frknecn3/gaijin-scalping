import React from 'react'
import type { HashType } from '../utils/types'
import { hexToRgba } from '../utils/helpers'

type Props = {
    item: HashType
}

const ItemCard = ({ item }: Props) => {
    const clr = hexToRgba(item.color.toString().toLowerCase(), 0.2)


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
                        {item.price.toFixed(2)} GJN
                    </span>
                </span>

                <span>
                    buying at
                    <span className='text-2xl pt-5 text-green-400 ml-1'>
                        {item.buy_price.toFixed(2)} GJN
                    </span>
                </span>

                <span>
                    <span className='text-xl font-bold mr-1'>
                        {item.last2Volume}
                    </span>
                    sold in 2 days
                </span>
            </div>
        </a>
    )
}

export default ItemCard