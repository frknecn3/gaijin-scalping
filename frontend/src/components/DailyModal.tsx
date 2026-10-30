import React, { useState, useEffect } from 'react';
import axios from 'axios';
import type { DailySummaryType, DailyItemBreakdown } from '../utils/types';

interface DailyModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailySummary: DailySummaryType[];
}

export const DailyModal: React.FC<DailyModalProps> = ({
  isOpen,
  onClose,
  dailySummary,
}) => {
  const [activeTab, setActiveTab] = useState<'detail' | 'summary'>('detail');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [items, setItems] = useState<DailyItemBreakdown[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [summaryStats, setSummaryStats] = useState<{
    totalTrades: number;
    totalProfit: number;
    totalVolume: number;
    wins: number;
    losses: number;
    uniqueProducts: number;
  } | null>(null);

  // Set default selected day to today (first in list)
  useEffect(() => {
    if (dailySummary.length > 0 && !selectedDay) {
      setSelectedDay(dailySummary[0].day);
    }
  }, [dailySummary, selectedDay]);

  // Fetch daily items when selectedDay changes
  useEffect(() => {
    if (!isOpen || !selectedDay) return;

    let isMounted = true;
    setLoadingItems(true);

    axios
      .get(`/api/daily-details?day=${selectedDay}`)
      .then((res) => {
        if (!isMounted) return;
        if (res.data?.success) {
          setItems(res.data.items || []);
          setSummaryStats(res.data.summary || null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch daily details:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingItems(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedDay]);

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.market.toLowerCase().includes(q)
    );
  });

  const total14DaysProfit = dailySummary.reduce(
    (acc, curr) => acc + (curr.totalProfit || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#181c24] border border-[#2e3646] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e3646] bg-[#1c222c] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Günlük Kâr & İşlem Dökümü
                </h2>
                <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                  14 Gün: {total14DaysProfit >= 0 ? `+${total14DaysProfit.toFixed(2)}` : total14DaysProfit.toFixed(2)} GJN
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Seçilen günün tüm satışlarını en çok kâr getirenden en aza doğru tekilleştirilmiş olarak inceleyin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher Tabs */}
            <div className="flex bg-[#12161f] p-1 rounded-lg border border-gray-800 text-xs mr-2">
              <button
                onClick={() => setActiveTab('detail')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'detail'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                🔎 Gün Detayı (Ürünler)
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'summary'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                📅 14 Günlük Özet
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-white/10 rounded-lg p-2 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'detail' ? (
          <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-4">
            {/* Horizontal Day Selector Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin shrink-0">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1">
                Tarih:
              </span>
              {dailySummary.map((d, idx) => {
                const isSelected = selectedDay === d.day;
                const isPositive = d.totalProfit >= 0;
                return (
                  <button
                    key={d.day}
                    onClick={() => setSelectedDay(d.day)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono transition flex items-center gap-2 shrink-0 border ${
                      isSelected
                        ? 'bg-blue-600/30 border-blue-500 text-white shadow-md shadow-blue-500/10'
                        : 'bg-[#12161f] border-gray-800/80 text-gray-300 hover:bg-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <span className="font-medium">
                      {idx === 0 ? 'Bugün' : idx === 1 ? 'Dün' : d.day.slice(5)}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        isPositive ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {isPositive ? `+${d.totalProfit.toFixed(2)}` : d.totalProfit.toFixed(2)} GJN
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Day Highlight Card */}
            {summaryStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#131720] border border-gray-800/80 p-3.5 rounded-xl shrink-0">
                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-400 uppercase font-semibold">Günün Net Kârı</span>
                  <span
                    className={`text-xl font-bold font-mono ${
                      summaryStats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {summaryStats.totalProfit >= 0
                      ? `+${summaryStats.totalProfit.toFixed(2)}`
                      : summaryStats.totalProfit.toFixed(2)}{' '}
                    <span className="text-xs text-gray-400">GJN</span>
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-400 uppercase font-semibold">İşlem & Ürün</span>
                  <span className="text-xl font-bold font-mono text-gray-200">
                    {summaryStats.totalTrades}{' '}
                    <span className="text-xs text-gray-400 font-normal">
                      işlem ({summaryStats.uniqueProducts} farklı ürün)
                    </span>
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-400 uppercase font-semibold">Toplam Ciro (Hacim)</span>
                  <span className="text-xl font-bold font-mono text-cyan-400">
                    {summaryStats.totalVolume.toFixed(2)}{' '}
                    <span className="text-xs text-gray-400">GJN</span>
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] text-gray-400 uppercase font-semibold">Kazanma Oranı</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      %{summaryStats.totalTrades > 0
                        ? ((summaryStats.wins / summaryStats.totalTrades) * 100).toFixed(0)
                        : '0'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      ({summaryStats.wins}W / {summaryStats.losses}L)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Filter & Subheader */}
            <div className="flex items-center justify-between gap-4 shrink-0">
              <div className="text-xs text-gray-400 flex items-center gap-2">
                <span>⚡ En çok kazandıran işlemden en aza doğru sıralı</span>
                <span className="text-gray-600">•</span>
                <span className="text-blue-400 font-medium">Aynı skinin çoklu satışları tek satırda birleştirildi</span>
              </div>
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Ürün adı ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#12161f] border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1.5 text-gray-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Detail Items Table */}
            <div className="flex-1 overflow-y-auto border border-gray-800/80 rounded-xl bg-[#161a22] shadow-inner">
              {loadingItems ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">İşlem verileri yükleniyor...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-16 text-gray-500 italic text-xs">
                  {searchQuery ? 'Aramanıza uygun ürün bulunamadı.' : 'Bu tarihte tamamlanmış kârlı/zararlı işlem bulunmuyor.'}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#12161f] sticky top-0 z-10 border-b border-gray-800 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">#</th>
                      <th className="py-3 px-4">Ürün / Skin</th>
                      <th className="py-3 px-3 text-center">İşlem Adedi</th>
                      <th className="py-3 px-3 text-right">Toplam Hacim</th>
                      <th className="py-3 px-3 text-right">Ort. Kâr</th>
                      <th className="py-3 px-4 text-right">Toplam Net Kâr</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-mono">
                    {filteredItems.map((item, idx) => {
                      const isProfit = item.totalProfit > 0.0001;
                      const isLoss = item.totalProfit < -0.0001;

                      return (
                        <tr
                          key={item.market}
                          className={`hover:bg-gray-800/40 transition ${
                            idx === 0 && isProfit ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          {/* Rank */}
                          <td className="py-2.5 px-3 text-center text-gray-500 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Item Icon & Name */}
                          <td className="py-2.5 px-4 font-sans">
                            <div className="flex items-center gap-3">
                              {item.icon ? (
                                <img
                                  src={item.icon}
                                  alt={item.name}
                                  className="w-9 h-9 rounded object-contain bg-[#11141c] border border-gray-800 shrink-0 p-0.5"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-9 h-9 rounded bg-[#11141c] border border-gray-800 flex items-center justify-center text-xs shrink-0 text-gray-500">
                                  📦
                                </div>
                              )}
                              <div className="min-w-0">
                                <a
                                  href={`https://trade.gaijin.net/?item=${item.market}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-200 font-semibold hover:text-blue-400 transition truncate block max-w-sm md:max-w-md"
                                  title={item.name}
                                >
                                  {item.name}
                                </a>
                                <span className="text-[10px] text-gray-500 font-mono truncate block">
                                  {item.market}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Trade Count & Win/Loss Badge */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/80 border border-gray-700 text-gray-200 text-xs font-bold">
                              {item.count}x
                              {item.count > 1 && (
                                <span className="text-[10px] font-normal text-gray-400">
                                  ({item.wins}W/{item.losses}L)
                                </span>
                              )}
                            </span>
                          </td>

                          {/* Volume */}
                          <td className="py-2.5 px-3 text-right text-gray-400">
                            {item.totalVolume.toFixed(2)} GJN
                          </td>

                          {/* Avg Profit */}
                          <td className="py-2.5 px-3 text-right text-gray-300">
                            {item.count > 1 ? (
                              <span
                                className={
                                  item.avgProfit >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'
                                }
                              >
                                {item.avgProfit >= 0
                                  ? `+${item.avgProfit.toFixed(2)}`
                                  : item.avgProfit.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>

                          {/* Total Cumulative Profit */}
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg font-bold text-xs ${
                                isProfit
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : isLoss
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : 'bg-gray-800 text-gray-400 border border-gray-700'
                              }`}
                            >
                              {item.totalProfit >= 0
                                ? `+${item.totalProfit.toFixed(2)}`
                                : item.totalProfit.toFixed(2)}{' '}
                              GJN
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          /* 14-Day High-Level Summary Table Tab */
          <div className="flex-1 overflow-y-auto p-6">
            {dailySummary.length === 0 ? (
              <div className="text-center py-10 text-gray-500 italic text-xs">
                Henüz kaydedilmiş günlük işlem verisi bulunmuyor.
              </div>
            ) : (
              <div className="border border-gray-800 rounded-xl overflow-hidden shadow-inner">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#12161f] border-b border-gray-800 text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Tarih</th>
                      <th className="py-3 px-3">İşlem</th>
                      <th className="py-3 px-3">Hacim</th>
                      <th className="py-3 px-3">Kazanma</th>
                      <th className="py-3 px-4 text-right">Net Kâr</th>
                      <th className="py-3 px-3 text-center">İncele</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 bg-[#161a22] font-mono">
                    {dailySummary.map((d, idx) => (
                      <tr
                        key={d.day}
                        onClick={() => {
                          setSelectedDay(d.day);
                          setActiveTab('detail');
                        }}
                        className={`hover:bg-blue-900/15 cursor-pointer transition ${
                          idx === 0 ? 'bg-emerald-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-medium text-gray-200">
                          {d.day}{' '}
                          {idx === 0 ? (
                            <span className="ml-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              Bugün
                            </span>
                          ) : idx === 1 ? (
                            <span className="ml-1 text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">
                              Dün
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-300">
                          {d.trades} işlem
                        </td>
                        <td className="py-3 px-3 text-gray-400">
                          {d.totalVolume.toFixed(2)} GJN
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-emerald-400 font-semibold">
                            %{d.winRatePercent.toFixed(0)}
                          </span>
                          <span className="text-gray-500 text-[10px] ml-1">
                            ({d.wins}W / {d.losses}L)
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded ${
                              d.totalProfit >= 0
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {d.totalProfit >= 0 ? `+${d.totalProfit.toFixed(2)}` : d.totalProfit.toFixed(2)} GJN
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-sans">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDay(d.day);
                              setActiveTab('detail');
                            }}
                            className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded text-[11px] font-semibold border border-blue-500/30 transition"
                          >
                            Detay →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#2e3646] bg-[#1c222c] shrink-0">
          <div className="text-xs text-gray-400">
            Toplam 14 Günlük Kâr:{' '}
            <strong className="text-emerald-400 font-mono">
              +{total14DaysProfit.toFixed(2)} GJN
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gray-700 hover:bg-gray-600 transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
