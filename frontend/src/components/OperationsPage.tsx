import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';

interface SellOperation {
    orderId: string;
    pairId: string;
    market: string;
    name: string;
    icon: string;
    listedPrice: number;
    netRevenue: number;
    basis: number | null;
    potentialProfit: number | null;
    roiPercent: number | null;
    marketLowestSell: number | null;
    marketHighestBuy: number | null;
    isLowestSell: boolean;
    durationHours: number;
    isLiquidated: boolean;
    status: 'WINNING' | 'UNDERCUT' | 'LIQUIDATING';
}

interface BuyOperation {
    orderId: string;
    pairId: string;
    market: string;
    name: string;
    icon: string;
    bidPrice: number;
    marketHighestBuy: number | null;
    marketLowestSell: number | null;
    isHighestBid: boolean;
    targetSellPrice: number;
    projectedNetProfit: number;
    projectedRoiPercent: number;
    durationMinutes: number;
    status: 'TOP_BID' | 'OUTBID';
}

interface OperationsSummary {
    totalSellCount: number;
    totalBuyCount: number;
    totalPotentialRevenue: number;
    totalCostBasis: number;
    totalPotentialProfit: number;
    avgRoiPercent: number;
    knownBasisCount: number;
    committedBuyCapital: number;
    walletBalance: number;
    estimatedPortfolioValue: number;
}

interface OperationsResponse {
    success: boolean;
    summary: OperationsSummary;
    sells: SellOperation[];
    buys: BuyOperation[];
}

interface Props {
    onBackToDashboard: () => void;
}

const OperationsPage: React.FC<Props> = ({ onBackToDashboard }) => {
    const [data, setData] = useState<OperationsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<'sells' | 'buys'>('sells');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'WINNING' | 'UNDERCUT' | 'LIQUIDATING'>('ALL');
    const [lastRefreshed, setLastRefreshed] = useState<string>('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Sorting states
    type SellSortKey = 'name' | 'listedPrice' | 'basis' | 'netRevenue' | 'potentialProfit' | 'roiPercent' | 'durationHours';
    type BuySortKey = 'name' | 'bidPrice' | 'marketHighestBuy' | 'targetSellPrice' | 'projectedNetProfit' | 'projectedRoiPercent' | 'durationMinutes';
    type SortOrder = 'asc' | 'desc';

    const [sellSortKey, setSellSortKey] = useState<SellSortKey>('durationHours');
    const [sellSortOrder, setSellSortOrder] = useState<SortOrder>('desc');

    const [buySortKey, setBuySortKey] = useState<BuySortKey>('bidPrice');
    const [buySortOrder, setBuySortOrder] = useState<SortOrder>('desc');

    const handleSellSort = (key: SellSortKey) => {
        if (sellSortKey === key) {
            setSellSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSellSortKey(key);
            setSellSortOrder('desc');
        }
    };

    const handleBuySort = (key: BuySortKey) => {
        if (buySortKey === key) {
            setBuySortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setBuySortKey(key);
            setBuySortOrder('desc');
        }
    };

    const fetchOperations = async () => {
        try {
            const res = await axios.get<OperationsResponse>(`/api/operations?_t=${Date.now()}`);
            if (res.data && res.data.success) {
                setData(res.data);
                setLastRefreshed(new Date().toLocaleTimeString());
            }
        } catch (err) {
            console.error("Failed to fetch operations:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOperations();
        const interval = setInterval(fetchOperations, 8000);
        return () => clearInterval(interval);
    }, []);

    const handleLiquidateToggle = async (market: string) => {
        setActionLoading(market);
        try {
            await axios.post('/api/liquidate/toggle', { market });
            await fetchOperations();
        } catch (err) {
            console.error("Toggle liquidation failed:", err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDumpToHighestBid = async (market: string) => {
        if (!window.confirm(`${market} eşyasını tahtadaki en yüksek ALIŞ teklifine anında satıp nakde çevirmek istediğinize emin misiniz?`)) {
            return;
        }
        setActionLoading(market);
        try {
            const res = await axios.post('/api/liquidate/dump', { market });
            alert(res.data?.message || "Satış tamamlandı!");
            await fetchOperations();
        } catch (err: any) {
            alert(err?.response?.data?.error || "Acil satış başarısız oldu.");
        } finally {
            setActionLoading(null);
        }
    };

    const filteredSells = useMemo(() => {
        if (!data?.sells) return [];
        const list = data.sells.filter(s => {
            const matchesQuery = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.market.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesQuery) return false;
            if (statusFilter === 'ALL') return true;
            if (statusFilter === 'WINNING') return s.isLowestSell && !s.isLiquidated;
            if (statusFilter === 'UNDERCUT') return !s.isLowestSell && !s.isLiquidated;
            if (statusFilter === 'LIQUIDATING') return s.isLiquidated;
            return true;
        });

        return list.sort((a, b) => {
            if (sellSortKey === 'name') {
                const cmp = a.name.localeCompare(b.name);
                return sellSortOrder === 'asc' ? cmp : -cmp;
            }

            let valA: any = a[sellSortKey];
            let valB: any = b[sellSortKey];

            const nullVal = sellSortOrder === 'asc' ? Infinity : -Infinity;
            valA = (valA !== null && valA !== undefined) ? valA : nullVal;
            valB = (valB !== null && valB !== undefined) ? valB : nullVal;

            if (valA < valB) return sellSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sellSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data?.sells, searchQuery, statusFilter, sellSortKey, sellSortOrder]);

    const filteredBuys = useMemo(() => {
        if (!data?.buys) return [];
        const list = data.buys.filter(b => {
            return b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.market.toLowerCase().includes(searchQuery.toLowerCase());
        });

        return list.sort((a, b) => {
            if (buySortKey === 'name') {
                const cmp = a.name.localeCompare(b.name);
                return buySortOrder === 'asc' ? cmp : -cmp;
            }

            let valA: any = a[buySortKey];
            let valB: any = b[buySortKey];

            const nullVal = buySortOrder === 'asc' ? Infinity : -Infinity;
            valA = (valA !== null && valA !== undefined) ? valA : nullVal;
            valB = (valB !== null && valB !== undefined) ? valB : nullVal;

            if (valA < valB) return buySortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return buySortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data?.buys, searchQuery, buySortKey, buySortOrder]);

    const summary = data?.summary;

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-gray-200">
            {/* Top Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#262c3b]">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBackToDashboard}
                        className="px-3 py-1.5 bg-[#1a202c] hover:bg-[#252d3d] border border-[#2e3646] rounded-xl text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1.5 shadow-sm"
                    >
                        <span>←</span> Piyasa Tarayıcısına Dön
                    </button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide flex items-center gap-2">
                            <span>💼</span> Aktif İşlemler & Potansiyel Gelirler
                        </h1>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Satıştaki ve alıştaki tüm emirler, maliyetler ve gerçekleştiğinde kazanılacak net kârlar
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {lastRefreshed && (
                        <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            {lastRefreshed}
                        </span>
                    )}
                    <button
                        onClick={() => { setLoading(true); fetchOperations(); }}
                        disabled={loading}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-md shadow-indigo-950/40 flex items-center gap-1.5"
                    >
                        <span>↻</span> Yenile
                    </button>
                </div>
            </div>

            {/* Financial Summary KPI Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Potential Revenue */}
                    <div className="bg-[#12161f] border border-cyan-500/20 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition"></div>
                        <span className="text-[11px] font-semibold text-cyan-400 tracking-wider uppercase block">
                            💵 Potansiyel Net Gelir
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-white mt-1">
                            ${summary.totalPotentialRevenue.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                            {summary.totalSellCount} aktif satış emri
                        </div>
                    </div>

                    {/* Potential Profit */}
                    <div className="bg-[#12161f] border border-emerald-500/30 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group bg-gradient-to-br from-emerald-950/20 to-transparent">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition"></div>
                        <span className="text-[11px] font-semibold text-emerald-400 tracking-wider uppercase block">
                            🎯 Beklenen Net Kâr
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
                            +${summary.totalPotentialProfit.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-emerald-300/80 mt-1 font-medium">
                            ~%{summary.avgRoiPercent.toFixed(1)} ort. kâr marjı
                        </div>
                    </div>

                    {/* Cost Basis */}
                    <div className="bg-[#12161f] border border-amber-500/20 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition"></div>
                        <span className="text-[11px] font-semibold text-amber-400 tracking-wider uppercase block">
                            📦 Satıştaki Maliyet
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-white mt-1">
                            ${summary.totalCostBasis.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                            {summary.knownBasisCount} eşyanın alış maliyeti
                        </div>
                    </div>

                    {/* Committed Buy Capital */}
                    <div className="bg-[#12161f] border border-purple-500/20 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition"></div>
                        <span className="text-[11px] font-semibold text-purple-400 tracking-wider uppercase block">
                            🛒 Alış Taahhüdü
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-white mt-1">
                            ${summary.committedBuyCapital.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                            {summary.totalBuyCount} aktif BUY emri
                        </div>
                    </div>

                    {/* Free Wallet Balance */}
                    <div className="bg-[#12161f] border border-blue-500/20 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition"></div>
                        <span className="text-[11px] font-semibold text-blue-400 tracking-wider uppercase block">
                            💳 Serbest Nakit
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-white mt-1">
                            ${summary.walletBalance.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">
                            Cüzdanda hazır bakiye
                        </div>
                    </div>

                    {/* Total Estimated Portfolio Value */}
                    <div className="bg-[#12161f] border border-rose-500/30 p-3.5 rounded-2xl shadow-lg relative overflow-hidden group bg-gradient-to-br from-rose-950/20 to-transparent">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition"></div>
                        <span className="text-[11px] font-semibold text-rose-400 tracking-wider uppercase block">
                            💎 Toplam Varlık Değeri
                        </span>
                        <div className="text-xl sm:text-2xl font-black text-white mt-1">
                            ${summary.estimatedPortfolioValue.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-rose-300/80 mt-1 font-medium">
                            Nakit + Alışlar + Stok
                        </div>
                    </div>
                </div>
            )}

            {/* View Controls & Filter Bar */}
            <div className="bg-[#12161f] border border-[#262c3b] p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                {/* Tab switcher */}
                <div className="flex items-center gap-1.5 bg-[#181c24] p-1 rounded-xl border border-[#262c3b]">
                    <button
                        onClick={() => setActiveTab('sells')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'sells'
                                ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950/40'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>🏷️</span> Satış Pozisyonları ({data?.sells?.length || 0})
                    </button>
                    <button
                        onClick={() => setActiveTab('buys')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                            activeTab === 'buys'
                                ? 'bg-purple-500/20 border border-purple-500 text-purple-300 shadow-md shadow-purple-950/40'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>🛒</span> Açık Alış Emirleri ({data?.buys?.length || 0})
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {activeTab === 'sells' && (
                        <div className="flex items-center gap-1 bg-[#181c24] p-1 rounded-lg border border-[#262c3b] text-xs">
                            <button
                                onClick={() => setStatusFilter('ALL')}
                                className={`px-2.5 py-1 rounded transition ${statusFilter === 'ALL' ? 'bg-[#262c3b] text-white font-bold' : 'text-gray-400'}`}
                            >
                                Tümü
                            </button>
                            <button
                                onClick={() => setStatusFilter('WINNING')}
                                className={`px-2.5 py-1 rounded transition ${statusFilter === 'WINNING' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-gray-400'}`}
                            >
                                🟢 En Ucuz Satıcı
                            </button>
                            <button
                                onClick={() => setStatusFilter('UNDERCUT')}
                                className={`px-2.5 py-1 rounded transition ${statusFilter === 'UNDERCUT' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-gray-400'}`}
                            >
                                🟡 Undercut Yendi
                            </button>
                            <button
                                onClick={() => setStatusFilter('LIQUIDATING')}
                                className={`px-2.5 py-1 rounded transition ${statusFilter === 'LIQUIDATING' ? 'bg-rose-500/20 text-rose-300 font-bold' : 'text-gray-400'}`}
                            >
                                ⚡ Likidasyonda
                            </button>
                        </div>
                    )}

                    {/* Quick Sort Dropdown */}
                    {activeTab === 'sells' ? (
                        <div className="flex items-center gap-1.5 bg-[#181c24] px-2.5 py-1.5 rounded-lg border border-[#262c3b] text-xs">
                            <span className="text-gray-400 font-medium flex items-center gap-1">
                                <span>⇅</span> Sırala:
                            </span>
                            <select
                                value={`${sellSortKey}:${sellSortOrder}`}
                                onChange={e => {
                                    const [key, order] = e.target.value.split(':');
                                    setSellSortKey(key as SellSortKey);
                                    setSellSortOrder(order as SortOrder);
                                }}
                                className="bg-transparent text-cyan-300 font-semibold focus:outline-none cursor-pointer"
                            >
                                <option value="durationHours:desc" className="bg-[#181c24] text-white">⏳ En Uzun Süre Satılmayanlar</option>
                                <option value="durationHours:asc" className="bg-[#181c24] text-white">⏱️ En Yeni Satış İlanları</option>
                                <option value="potentialProfit:desc" className="bg-[#181c24] text-white">💰 En Çok Kâr Getirenler</option>
                                <option value="potentialProfit:asc" className="bg-[#181c24] text-white">📉 En Düşük Kâr / Zarar</option>
                                <option value="listedPrice:desc" className="bg-[#181c24] text-white">💎 En Pahalı Satış Fiyatı</option>
                                <option value="listedPrice:asc" className="bg-[#181c24] text-white">🪙 En Ucuz Satış Fiyatı</option>
                                <option value="roiPercent:desc" className="bg-[#181c24] text-white">🎯 En Yüksek ROI %</option>
                                <option value="basis:desc" className="bg-[#181c24] text-white">🏷️ En Yüksek Maliyet</option>
                                <option value="name:asc" className="bg-[#181c24] text-white">🔤 İsim (A-Z)</option>
                            </select>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 bg-[#181c24] px-2.5 py-1.5 rounded-lg border border-[#262c3b] text-xs">
                            <span className="text-gray-400 font-medium flex items-center gap-1">
                                <span>⇅</span> Sırala:
                            </span>
                            <select
                                value={`${buySortKey}:${buySortOrder}`}
                                onChange={e => {
                                    const [key, order] = e.target.value.split(':');
                                    setBuySortKey(key as BuySortKey);
                                    setBuySortOrder(order as SortOrder);
                                }}
                                className="bg-transparent text-purple-300 font-semibold focus:outline-none cursor-pointer"
                            >
                                <option value="bidPrice:desc" className="bg-[#181c24] text-white">💎 En Pahalı Alış Fiyatı</option>
                                <option value="bidPrice:asc" className="bg-[#181c24] text-white">🪙 En Ucuz Alış Fiyatı</option>
                                <option value="projectedNetProfit:desc" className="bg-[#181c24] text-white">💰 En Çok Hedef Kâr</option>
                                <option value="projectedNetProfit:asc" className="bg-[#181c24] text-white">📉 En Düşük Hedef Kâr</option>
                                <option value="projectedRoiPercent:desc" className="bg-[#181c24] text-white">🎯 En Yüksek Hedef ROI %</option>
                                <option value="durationMinutes:desc" className="bg-[#181c24] text-white">⏳ En Uzun Süre Bekleyen Alışlar</option>
                                <option value="durationMinutes:asc" className="bg-[#181c24] text-white">⏱️ En Yeni Alış Emirleri</option>
                                <option value="name:asc" className="bg-[#181c24] text-white">🔤 İsim (A-Z)</option>
                            </select>
                        </div>
                    )}

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Eşya adı ara..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-[#181c24] border border-[#262c3b] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-48"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Tables */}
            {loading && !data ? (
                <div className="py-20 text-center text-gray-400">
                    <div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm font-medium">İşlemler ve kâr tabloları hesaplanıyor...</p>
                </div>
            ) : activeTab === 'sells' ? (
                /* SELLS TABLE */
                <div className="bg-[#12161f] border border-[#262c3b] rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-[#262c3b] bg-[#181c24] text-gray-400 font-semibold uppercase tracking-wider text-[11px]">
                                    <th
                                        onClick={() => handleSellSort('name')}
                                        className="py-3 px-4 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Eşya & Bilgi</span>
                                            <span className={`text-[10px] ${sellSortKey === 'name' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'name' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th className="py-3 px-3">Durum</th>
                                    <th
                                        onClick={() => handleSellSort('listedPrice')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Satış Fiyatımız</span>
                                            <span className={`text-[10px] ${sellSortKey === 'listedPrice' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'listedPrice' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSellSort('basis')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Alış Maliyeti</span>
                                            <span className={`text-[10px] ${sellSortKey === 'basis' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'basis' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSellSort('netRevenue')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Net Gelir (-%15)</span>
                                            <span className={`text-[10px] ${sellSortKey === 'netRevenue' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'netRevenue' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSellSort('potentialProfit')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Beklenen Kâr</span>
                                            <span className={`text-[10px] ${sellSortKey === 'potentialProfit' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'potentialProfit' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSellSort('roiPercent')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Beklenen ROI</span>
                                            <span className={`text-[10px] ${sellSortKey === 'roiPercent' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'roiPercent' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th className="py-3 px-3">Tahta (Ask / Bid)</th>
                                    <th
                                        onClick={() => handleSellSort('durationHours')}
                                        className="py-3 px-3 cursor-pointer hover:text-cyan-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>İlan Süresi</span>
                                            <span className={`text-[10px] ${sellSortKey === 'durationHours' ? 'text-cyan-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {sellSortKey === 'durationHours' ? (sellSortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th className="py-3 px-4 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#181c24]">
                                {filteredSells.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="py-12 text-center text-gray-500">
                                            Kriterlere uygun satış emri bulunamadı.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSells.map((s) => {
                                        const isProfitable = (s.potentialProfit || 0) > 0;
                                        const isLoss = (s.potentialProfit || 0) < -0.001;

                                        return (
                                            <tr key={s.orderId} className="hover:bg-white/[0.02] transition">
                                                {/* Item */}
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-3">
                                                        {s.icon ? (
                                                            <img
                                                                src={s.icon}
                                                                alt={s.name}
                                                                className="w-10 h-10 object-cover rounded-lg border border-[#2e3646] bg-black/40 flex-shrink-0"
                                                                loading="lazy"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg border border-[#2e3646] bg-black/40 flex items-center justify-center text-base flex-shrink-0">
                                                                📦
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <a
                                                                    href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(s.market)}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="font-bold text-white hover:text-cyan-400 transition truncate block max-w-[200px]"
                                                                    title={s.name}
                                                                >
                                                                    {s.name}
                                                                </a>
                                                                <a
                                                                    href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(s.market)}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-gray-500 hover:text-cyan-400 transition flex-shrink-0"
                                                                    title="Gaijin Pazarında Aç"
                                                                >
                                                                    ↗
                                                                </a>
                                                            </div>
                                                            <span className="text-[10px] text-gray-500 font-mono block">
                                                                {s.market}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Status */}
                                                <td className="py-3 px-3">
                                                    {s.isLiquidated ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                                            <span>⚡</span> Likidasyon
                                                        </span>
                                                    ) : s.isLowestSell ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                            <span>🟢</span> En Ucuz Satıcı
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                            <span>🟡</span> Undercut Yendi
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Listed Price */}
                                                <td className="py-3 px-3 font-mono font-bold text-white text-sm">
                                                    ${s.listedPrice.toFixed(2)}
                                                </td>

                                                {/* Basis */}
                                                <td className="py-3 px-3 font-mono text-gray-300">
                                                    {s.basis !== null ? (
                                                        <span>${s.basis.toFixed(2)}</span>
                                                    ) : (
                                                        <span className="text-gray-500 italic">Bilinmiyor</span>
                                                    )}
                                                </td>

                                                {/* Net Revenue */}
                                                <td className="py-3 px-3 font-mono text-cyan-300 font-semibold">
                                                    ${s.netRevenue.toFixed(2)}
                                                </td>

                                                {/* Potential Profit */}
                                                <td className="py-3 px-3 font-mono font-bold text-sm">
                                                    {s.potentialProfit !== null ? (
                                                        <span className={isProfitable ? 'text-emerald-400' : (isLoss ? 'text-rose-400' : 'text-gray-400')}>
                                                            {s.potentialProfit >= 0 ? `+$${s.potentialProfit.toFixed(2)}` : `-$${Math.abs(s.potentialProfit).toFixed(2)}`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500 italic">—</span>
                                                    )}
                                                </td>

                                                {/* ROI % */}
                                                <td className="py-3 px-3 font-mono font-semibold">
                                                    {s.roiPercent !== null ? (
                                                        <span className={s.roiPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                            %{s.roiPercent.toFixed(1)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500 italic">—</span>
                                                    )}
                                                </td>

                                                {/* Market Lowest Ask / Highest Bid */}
                                                <td className="py-3 px-3 font-mono text-xs">
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-300" title="Tahtanın En Düşük Satış Fiyatı">
                                                            Ask: {s.marketLowestSell ? `$${s.marketLowestSell.toFixed(2)}` : '—'}
                                                        </span>
                                                        <span className="text-gray-500" title="Tahtanın En Yüksek Alış Teklifi">
                                                            Bid: {s.marketHighestBuy ? `$${s.marketHighestBuy.toFixed(2)}` : '—'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Duration */}
                                                <td className="py-3 px-3 font-mono text-gray-400">
                                                    <span className={s.durationHours >= 24 ? 'text-rose-400 font-bold' : (s.durationHours >= 12 ? 'text-amber-400' : 'text-gray-300')}>
                                                        {s.durationHours.toFixed(1)} sa
                                                    </span>
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <a
                                                            href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(s.market)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-1.5 bg-[#181c24] hover:bg-[#252c39] border border-[#2e3646] text-gray-400 hover:text-cyan-400 rounded-lg text-xs font-semibold transition inline-flex items-center"
                                                            title="Gaijin Pazarında Aç"
                                                        >
                                                            <span>🔗</span>
                                                        </a>
                                                        <button
                                                            onClick={() => handleLiquidateToggle(s.market)}
                                                            disabled={actionLoading === s.market}
                                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                                                                s.isLiquidated
                                                                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 hover:bg-rose-500/30'
                                                                    : 'bg-[#181c24] border-[#2e3646] text-gray-300 hover:text-white hover:border-gray-500'
                                                            }`}
                                                            title={s.isLiquidated ? "Likidasyon modundan çıkar" : "Fiyatı ne olursa olsun en ucuza çek (Likidite Et)"}
                                                        >
                                                            <span>⚡</span> {s.isLiquidated ? "Normal Mod" : "Likidite Et"}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDumpToHighestBid(s.market)}
                                                            disabled={actionLoading === s.market || !s.marketHighestBuy}
                                                            className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 rounded-lg text-xs font-bold transition flex items-center gap-1"
                                                            title="Tahtadaki en yüksek alış emrine anında sat (Anında Nakde Çevir)"
                                                        >
                                                            <span>💥</span> Sat
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* BUYS TABLE */
                <div className="bg-[#12161f] border border-[#262c3b] rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-[#262c3b] bg-[#181c24] text-gray-400 font-semibold uppercase tracking-wider text-[11px]">
                                    <th
                                        onClick={() => handleBuySort('name')}
                                        className="py-3 px-4 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Eşya & Bilgi</span>
                                            <span className={`text-[10px] ${buySortKey === 'name' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'name' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th className="py-3 px-3">Teklif Durumu</th>
                                    <th
                                        onClick={() => handleBuySort('bidPrice')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Alış Teklifimiz</span>
                                            <span className={`text-[10px] ${buySortKey === 'bidPrice' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'bidPrice' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleBuySort('marketHighestBuy')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Tahtanın En Yüksek Alışı</span>
                                            <span className={`text-[10px] ${buySortKey === 'marketHighestBuy' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'marketHighestBuy' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleBuySort('targetSellPrice')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Hedef Satış Fiyatı</span>
                                            <span className={`text-[10px] ${buySortKey === 'targetSellPrice' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'targetSellPrice' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleBuySort('projectedNetProfit')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Hedef Net Kâr</span>
                                            <span className={`text-[10px] ${buySortKey === 'projectedNetProfit' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'projectedNetProfit' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleBuySort('projectedRoiPercent')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Hedef ROI %</span>
                                            <span className={`text-[10px] ${buySortKey === 'projectedRoiPercent' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'projectedRoiPercent' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleBuySort('durationMinutes')}
                                        className="py-3 px-3 cursor-pointer hover:text-purple-300 transition select-none group"
                                    >
                                        <div className="flex items-center gap-1">
                                            <span>Emir Süresi</span>
                                            <span className={`text-[10px] ${buySortKey === 'durationMinutes' ? 'text-purple-400 font-bold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                                {buySortKey === 'durationMinutes' ? (buySortOrder === 'desc' ? '▼' : '▲') : '⇅'}
                                            </span>
                                        </div>
                                    </th>
                                    <th className="py-3 px-4 text-right">Pazar Linki</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#181c24]">
                                {filteredBuys.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="py-12 text-center text-gray-500">
                                            Aktif alış emri bulunmuyor.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredBuys.map((b) => (
                                        <tr key={b.orderId} className="hover:bg-white/[0.02] transition">
                                            {/* Item */}
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    {b.icon ? (
                                                        <img
                                                            src={b.icon}
                                                            alt={b.name}
                                                            className="w-10 h-10 object-cover rounded-lg border border-[#2e3646] bg-black/40 flex-shrink-0"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg border border-[#2e3646] bg-black/40 flex items-center justify-center text-base flex-shrink-0">
                                                            🛒
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <a
                                                                href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(b.market)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="font-bold text-white hover:text-purple-400 transition truncate block max-w-[200px]"
                                                                title={b.name}
                                                            >
                                                                {b.name}
                                                            </a>
                                                            <a
                                                                href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(b.market)}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-gray-500 hover:text-purple-400 transition flex-shrink-0"
                                                                title="Gaijin Pazarında Aç"
                                                            >
                                                                ↗
                                                            </a>
                                                        </div>
                                                        <span className="text-[10px] text-gray-500 font-mono block">
                                                            {b.market}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="py-3 px-3">
                                                {b.isHighestBid ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                        <span>🟢</span> En Yüksek Teklif
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        <span>🟡</span> Outbid Olduk
                                                    </span>
                                                )}
                                            </td>

                                            {/* Bid Price */}
                                            <td className="py-3 px-3 font-mono font-bold text-white text-sm">
                                                ${b.bidPrice.toFixed(2)}
                                            </td>

                                            {/* Market Highest Bid */}
                                            <td className="py-3 px-3 font-mono text-gray-300">
                                                {b.marketHighestBuy ? `$${b.marketHighestBuy.toFixed(2)}` : '—'}
                                            </td>

                                            {/* Target Sell Price */}
                                            <td className="py-3 px-3 font-mono text-cyan-300 font-semibold">
                                                ${b.targetSellPrice.toFixed(2)}
                                            </td>

                                            {/* Projected Net Profit */}
                                            <td className="py-3 px-3 font-mono font-bold text-sm text-emerald-400">
                                                +${b.projectedNetProfit.toFixed(2)}
                                            </td>

                                            {/* Projected ROI */}
                                            <td className="py-3 px-3 font-mono font-semibold text-emerald-400">
                                                %{b.projectedRoiPercent.toFixed(1)}
                                            </td>

                                            {/* Duration */}
                                            <td className="py-3 px-3 font-mono text-gray-400">
                                                {b.durationMinutes} dk
                                            </td>

                                            {/* Link */}
                                            <td className="py-3 px-4 text-right">
                                                <a
                                                    href={`https://trade.gaijin.net/market/1067/${encodeURIComponent(b.market)}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="px-2.5 py-1 bg-[#181c24] hover:bg-[#252c39] border border-[#2e3646] text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                                                >
                                                    <span>🔗</span> Pazarda Gör
                                                </a>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OperationsPage;
