import React, { useState } from 'react'
import type { HashType } from '../utils/types'
import { hexToRgba } from '../utils/helpers'
import axios from 'axios'
import SnipeBuyButton from './SnipeBuyButton'

type Props = {
    item: HashType
}

const ItemCard = ({ item }: Props) => {

    const clr = hexToRgba(item.color?.toString().toLowerCase() || "#FF0000", 0.2)

    const [updatedVal, setUpdatedVal] = useState<{ buy: number, sell: number } | null>(null);

    // When global refresh updates item prices, reset local single-item override
    React.useEffect(() => {
        setUpdatedVal(null);
    }, [item.price, item.hash_name]);

    const handleRefresh = async () => {
        const res = await axios.get(`/item/${item.hash_name}`);

        console.log(res)

        setUpdatedVal({ buy: res.data.data.BUY, sell: res.data.data.SELL })
    }

    const [isLiquidated, setIsLiquidated] = useState<boolean>(!!item.isLiquidated);
    const [isToggling, setIsToggling] = useState<boolean>(false);
    const [isDumping, setIsDumping] = useState<boolean>(false);
    const [dumpStatus, setDumpStatus] = useState<string | null>(null);

    React.useEffect(() => {
        setIsLiquidated(!!item.isLiquidated);
    }, [item.isLiquidated]);

    const handleToggleLiquidate = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsToggling(true);
        try {
            const res = await axios.post('/api/liquidate/toggle', { market: item.hash_name });
            if (res.data?.success) {
                setIsLiquidated(res.data.liquidated);
            }
        } catch (err: any) {
            alert(err?.response?.data?.error || "Likidasyon modu güncellenemedi.");
        } finally {
            setIsToggling(false);
        }
    };

    const handleInstantDump = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = window.confirm(
            `"${item.name}" eşyası tahtadaki en yüksek alıcı teklifine (BUY bid) derhal satılacak ve anında nakde çevrilecektir.\n\nMevcut satış emri iptal edilip doğrudan alıcıya verilecektir. Emin misiniz?`
        );
        if (!confirmed) return;

        setIsDumping(true);
        setDumpStatus(null);
        try {
            const res = await axios.post('/api/liquidate/dump', { market: item.hash_name });
            if (res.data?.success) {
                setDumpStatus(`✅ Satıldı: +${res.data.netIncome.toFixed(2)} GJN nakit`);
                setIsLiquidated(false);
                setTimeout(() => {
                    handleRefresh();
                }, 1000);
            }
        } catch (err: any) {
            alert(err?.response?.data?.error || "Anında satış başarısız oldu.");
        } finally {
            setIsDumping(false);
        }
    };

    const buyOrders = item.active_orders?.filter(o => o.type === "BUY") || [];
    const sellOrders = item.active_orders?.filter(o => o.type === "SELL") || [];
    const hasBuy = buyOrders.length > 0;
    const hasSell = sellOrders.length > 0;

    return (
        <a className={`relative border-2 min-h-[300px] rounded-xl pb-5 bg-[${clr}20]`} style={{
            borderColor: clr,
            backgroundColor: clr,
        }}>
            
            {hasBuy && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold shadow-md z-10">
                    Buying ({buyOrders.length})
                </div>
            )}
            
            {hasSell && (
                <div className={`absolute ${hasBuy ? 'top-10' : 'top-2'} right-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold shadow-md z-10`}>
                    Selling ({sellOrders.length})
                </div>
            )}

            {isLiquidated && (
                <div className={`absolute ${hasBuy && hasSell ? 'top-[4.5rem]' : (hasBuy || hasSell) ? 'top-10' : 'top-2'} right-2 bg-gradient-to-r from-red-600 to-amber-600 text-white px-2 py-1 rounded text-xs font-black shadow-md z-10 animate-pulse border border-red-400`}>
                    🔥 LİKİDASYON
                </div>
            )}

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

                {item.highestOfLast10 ? (
                    <span className='text-sm text-gray-400'>
                        recent high: <span className='text-white font-bold'>{item.highestOfLast10.toFixed(2)} GJN</span>
                    </span>
                ) : null}

                {/* Liquidation Controls */}
                <div className='flex items-center justify-between gap-2 pt-2 border-t border-white/10'>
                    <button
                        type="button"
                        disabled={isToggling}
                        onClick={handleToggleLiquidate}
                        className={`text-xs px-2.5 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 shadow ${
                            isLiquidated
                                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400 animate-pulse'
                                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                        }`}
                        title={isLiquidated ? "Likidasyon modunu kapat" : "Zararına/maliyete bakılmaksızın en ucuz fiyata undercut atma modu"}
                    >
                        <span>🔥</span>
                        <span>{isLiquidated ? 'Likidasyonda' : 'Likidasyon'}</span>
                    </button>

                    {(hasSell || isLiquidated) && (
                        <button
                            type="button"
                            disabled={isDumping}
                            onClick={handleInstantDump}
                            className="text-xs px-2.5 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 shadow bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 active:scale-95"
                            title="Tahtadaki mevcut en yüksek alıcı teklifine doğrudan satıp anında nakde çevirir"
                        >
                            <span>⚡</span>
                            <span>{isDumping ? 'Satılıyor...' : 'Anında Sat'}</span>
                        </button>
                    )}
                </div>

                {dumpStatus && (
                    <div className="text-xs font-semibold p-2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 text-center">
                        {dumpStatus}
                    </div>
                )}

                <div className='flex justify-between items-center pt-2'>
                    <button className='bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-md font-semibold text-sm transition' onClick={() => { handleRefresh() }}>REFRESH</button>
                    <SnipeBuyButton item={item} />
                </div>
            </div>
        </a>
    )
}

export default ItemCard
