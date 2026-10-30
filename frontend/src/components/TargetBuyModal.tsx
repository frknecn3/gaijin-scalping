import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export interface TargetBuyItem {
  market_name: string;
  display_name?: string;
  icon?: string;
  max_price: number;
  active: boolean;
  status: string;
  our_bid?: number;
  order_id?: string;
  created_at?: string;
  acquired_at?: string;
  acquired_price?: number;
}

export interface ValidatedItemDetails {
  valid: boolean;
  market_name: string;
  display_name: string;
  icon?: string;
  highest_bid: number;
  lowest_sell: number;
  recommended_bid: number;
  error?: string;
}

export interface SearchResultItem {
  market_name: string;
  display_name: string;
  icon?: string;
  lowest_sell?: number;
  highest_bid?: number;
  tags?: string[];
  source?: string;
}

interface TargetBuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshOrders?: () => void;
}

export const TargetBuyModal: React.FC<TargetBuyModalProps> = ({ isOpen, onClose, onRefreshOrders }) => {
  const [items, setItems] = useState<TargetBuyItem[]>([]);
  
  // Input methods: 'url' | 'search' | 'manual'
  const [inputMode, setInputMode] = useState<'url' | 'search' | 'manual'>('url');
  const [inputValue, setInputValue] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('65.00');

  // Search autocomplete state
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [verifiedItem, setVerifiedItem] = useState<ValidatedItemDetails | null>(null);

  // Form submission state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const fetchItems = async () => {
    try {
      const res = await axios.get('/api/target-buys');
      if (res.data.success) {
        setItems(res.data.items);
      }
    } catch (err) {
      console.error("Hedef alım listesi çekilemedi:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
      setMessage(null);
      // Preload KV-220 validation as a convenient default example
      if (!inputValue && !verifiedItem) {
        setInputValue('https://trade.gaijin.net/?n=KV-220');
        handleValidateInput('https://trade.gaijin.net/?n=KV-220');
      }
    }
  }, [isOpen]);

  // Debounced search when user types in 'search' or 'manual' mode
  const handleInputChange = (val: string) => {
    setInputValue(val);
    setMessage(null);

    // Auto-detect URL paste in any mode
    if (val.includes('trade.gaijin.net') || val.includes('?n=')) {
      setInputMode('url');
      handleValidateInput(val);
      return;
    }

    if (inputMode === 'search') {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (val.trim().length >= 2) {
        setSearchLoading(true);
        setShowDropdown(true);
        searchTimeoutRef.current = setTimeout(async () => {
          try {
            const res = await axios.get(`/api/target-buys/search?q=${encodeURIComponent(val.trim())}`);
            if (res.data.success) {
              setSearchResults(res.data.results || []);
            }
          } catch (e) {
            console.error("Arama hatası:", e);
          } finally {
            setSearchLoading(false);
          }
        }, 350);
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }
  };

  // Validates any input (URL, display name, hash) with Gaijin orderbook
  const handleValidateInput = async (targetToValidate?: string) => {
    const raw = (targetToValidate !== undefined ? targetToValidate : inputValue).trim();
    if (!raw) return;

    setValidating(true);
    setMessage(null);
    try {
      const res = await axios.post('/api/target-buys/validate', { input: raw });
      if (res.data.success && res.data.details) {
        const details: ValidatedItemDetails = res.data.details;
        setVerifiedItem(details);
        setShowDropdown(false);
        // Pre-fill a safe recommended max price (lowest sell or recommended bid * 1.1)
        if (details.lowest_sell && details.lowest_sell > 0) {
          setMaxPriceInput(details.lowest_sell.toFixed(2));
        } else if (details.recommended_bid && details.recommended_bid > 0) {
          setMaxPriceInput((details.recommended_bid * 1.15).toFixed(2));
        }
      }
    } catch (err: any) {
      setVerifiedItem(null);
      setMessage({
        text: err.response?.data?.error || "Gaijin pazarında bu ürün doğrulanamadı. Lütfen linki veya ismi kontrol edin.",
        type: 'error'
      });
    } finally {
      setValidating(false);
    }
  };

  const handleSelectSearchResult = (result: SearchResultItem) => {
    setInputValue(result.display_name || result.market_name);
    setShowDropdown(false);
    handleValidateInput(result.market_name);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const market = verifiedItem?.market_name || inputValue.trim();
    const maxPrice = Number(maxPriceInput);

    if (!market || isNaN(maxPrice) || maxPrice <= 0) {
      setMessage({ text: "Lütfen doğrulanmış bir ürün ve pozitif tavan fiyat (GJN) girin.", type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await axios.post('/api/target-buys', { market, maxPrice });
      if (res.data.success) {
        const isPlaced = res.data.orderPlaced;
        setMessage({
          text: res.data.message || `🎯 ${res.data.display_name || market} hedef alıma eklendi!`,
          type: isPlaced ? 'success' : 'warning'
        });
        await fetchItems();
        if (onRefreshOrders) onRefreshOrders();
      } else {
        setMessage({ text: res.data.error || "İşlem başarısız oldu.", type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.response?.data?.error || "Sunucu hatası oluştu.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (market: string, currentActive: boolean) => {
    try {
      await axios.post('/api/target-buys/toggle', { market, active: !currentActive });
      await fetchItems();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const handleRemove = async (market: string) => {
    if (!window.confirm(`${market} hedef alım listesinden silinsin mi?`)) return;
    try {
      await axios.post('/api/target-buys/remove', { market });
      await fetchItems();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err) {
      console.error("Remove error:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#0f131c] border border-indigo-500/30 rounded-2xl shadow-2xl text-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/80 bg-black/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xl shadow-inner">
              🎯
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide flex items-center gap-2">
                Sniper Modu & Hedef Alım
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  %100 Doğrulamalı
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Pazardaki linki yapıştır veya araç adını ara; bot en ucuzdan kapsın, rakipleri +0.01 GJN ile ezsin.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-gray-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          
          {/* Method Selection Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-gray-800/80 text-xs">
            <button
              type="button"
              onClick={() => { setInputMode('url'); setInputValue(''); setVerifiedItem(null); }}
              className={`flex-1 py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                inputMode === 'url'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
              }`}
            >
              <span>🔗</span>
              <span>Gaijin Linki Yapıştır</span>
              <span className="hidden sm:inline text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-normal">En Garanti</span>
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('search'); setInputValue(''); setVerifiedItem(null); }}
              className={`flex-1 py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                inputMode === 'search'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
              }`}
            >
              <span>🔍</span>
              <span>Araç / Ürün Ara</span>
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('manual'); setInputValue(''); setVerifiedItem(null); }}
              className={`flex-1 py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                inputMode === 'manual'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
              }`}
            >
              <span>⌨️</span>
              <span>Manuel Kod</span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAdd} className="bg-black/30 p-4 sm:p-5 rounded-2xl border border-gray-800/90 space-y-4">
            
            {/* Input field + Validate Button */}
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
                <span>
                  {inputMode === 'url' && 'Gaijin Pazar Sayfası Linki (URL)'}
                  {inputMode === 'search' && 'War Thunder Araç veya Kamuflaj Adı'}
                  {inputMode === 'manual' && 'Pazar Kodu (Exact Market Hash)'}
                </span>
                {validating && (
                  <span className="text-[11px] text-indigo-400 animate-pulse flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                    Gaijin API ile doğrulanıyor...
                  </span>
                )}
              </label>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !verifiedItem) {
                        e.preventDefault();
                        handleValidateInput();
                      }
                    }}
                    placeholder={
                      inputMode === 'url'
                        ? 'Örn: https://trade.gaijin.net/?n=KV-220 veya trade.gaijin.net/?n=ugcitem_1002542'
                        : inputMode === 'search'
                        ? 'Örn: KV-220, Object 279, T-34, F-16, Mosquito...'
                        : 'Örn: KV-220 veya ugcitem_1002542'
                    }
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs sm:text-sm bg-[#121622] border border-gray-700/80 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500 transition shadow-inner"
                  />
                  {inputValue && (
                    <button
                      type="button"
                      onClick={() => { setInputValue(''); setVerifiedItem(null); setSearchResults([]); }}
                      className="absolute right-3 top-2.5 text-gray-500 hover:text-white text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={validating || !inputValue.trim()}
                  onClick={() => handleValidateInput()}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-indigo-500/30 transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  <span>{validating ? '⌛' : '✓'}</span>
                  <span>{validating ? 'Kontrol...' : 'Doğrula'}</span>
                </button>
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && inputMode === 'search' && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-64 overflow-y-auto bg-[#141926] border border-indigo-500/40 rounded-xl shadow-2xl divide-y divide-gray-800/80">
                  {searchLoading ? (
                    <div className="p-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></span>
                      Aranıyor...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400">
                      Eşleşen ürün bulunamadı. Lütfen tam pazar linkini yapıştırmayı deneyin.
                    </div>
                  ) : (
                    searchResults.map((res) => (
                      <div
                        key={res.market_name}
                        onClick={() => handleSelectSearchResult(res)}
                        className="p-2.5 flex items-center justify-between gap-3 hover:bg-indigo-950/40 cursor-pointer transition"
                      >
                        <div className="flex items-center gap-3">
                          {res.icon ? (
                            <img src={res.icon} alt={res.display_name} className="w-9 h-9 object-contain rounded bg-black/40 p-0.5 border border-gray-800" />
                          ) : (
                            <div className="w-9 h-9 rounded bg-black/40 flex items-center justify-center text-xs">📦</div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-white">{res.display_name}</span>
                            <span className="text-[10px] text-gray-400 font-mono">Pazar Kodu: {res.market_name}</span>
                          </div>
                        </div>
                        <div className="text-right text-[11px] font-mono">
                          {res.lowest_sell !== undefined && (
                            <div className="text-gray-300">Satış: <strong className="text-emerald-400">{res.lowest_sell.toFixed(2)} GJN</strong></div>
                          )}
                          {res.highest_bid !== undefined && (
                            <div className="text-gray-400">Alış: <strong className="text-indigo-300">{res.highest_bid.toFixed(2)} GJN</strong></div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* VERIFIED ITEM CARD (Visual confirmation) */}
            {verifiedItem && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-black/40 border border-indigo-500/40 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {verifiedItem.icon ? (
                      <img
                        src={verifiedItem.icon}
                        alt={verifiedItem.display_name}
                        className="w-14 h-14 object-contain rounded-xl bg-black/60 p-1 border border-indigo-500/40 shadow-lg"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-indigo-900/30 border border-indigo-500/40 flex items-center justify-center text-2xl">
                        🎖️
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base font-black text-white">{verifiedItem.display_name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <span>✓</span>
                          <span>Gaijin Onaylı</span>
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                        Pazar Kodu: <strong className="text-indigo-300">{verifiedItem.market_name}</strong>
                      </div>
                    </div>
                  </div>

                  <a
                    href={`https://trade.gaijin.net/?n=${encodeURIComponent(verifiedItem.market_name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-indigo-300 border border-indigo-500/20 transition flex items-center gap-1"
                  >
                    <span>Pazarda Aç</span>
                    <span>↗</span>
                  </a>
                </div>

                {/* Market Price Badges */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800/80 font-mono text-center">
                  <div className="p-2 rounded-lg bg-black/40 border border-gray-800">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">En Yüksek Alış</div>
                    <div className="text-xs sm:text-sm font-bold text-indigo-300">
                      {verifiedItem.highest_bid > 0 ? `${verifiedItem.highest_bid.toFixed(2)} GJN` : 'Teklif Yok'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-gray-800">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">En Düşük Satış</div>
                    <div className="text-xs sm:text-sm font-bold text-emerald-300">
                      {verifiedItem.lowest_sell > 0 ? `${verifiedItem.lowest_sell.toFixed(2)} GJN` : 'Satış Yok'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-indigo-900/30 border border-indigo-500/40">
                    <div className="text-[10px] text-indigo-200 uppercase font-bold">Önerilen Teklif (+0.01)</div>
                    <div className="text-xs sm:text-sm font-extrabold text-amber-300">
                      {verifiedItem.recommended_bid > 0 ? `${verifiedItem.recommended_bid.toFixed(2)} GJN` : '0.10 GJN'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ceiling Budget (Max Price) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-gray-300 mb-1 font-semibold">
                  Maksimum Tavan Bütçeniz (GJN)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.10"
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    placeholder="Örn: 65.00"
                    required
                    className="w-full pl-3 pr-12 py-2.5 text-xs sm:text-sm bg-[#121622] border border-gray-700/80 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-black text-gray-400">GJN</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Bot rakipleri 0.01 GJN geçerek bu bütçeye kadar otomatik savaşır. Bu fiyatı ASLA aşmaz.
                </p>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={loading || validating || !verifiedItem}
                  className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{loading ? '⌛' : '🎯'}</span>
                  <span>{loading ? 'Piyasaya Sürülüyor...' : 'Sniper\'ı Başlat & En Tepeye Oyna'}</span>
                </button>
              </div>
            </div>

            {/* Status Feedback Message */}
            {message && (
              <div className={`p-3 rounded-xl text-xs font-semibold leading-relaxed ${
                message.type === 'success' 
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300' 
                  : message.type === 'warning'
                  ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                  : 'bg-red-950/60 border border-red-500/40 text-red-300'
              }`}>
                {message.text}
              </div>
            )}
          </form>

          {/* Active Targets List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <span>Mevcut Sniper Hedefleri</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-800 text-[10px] font-mono text-gray-300">{items.length}</span>
              </h3>
              <button
                type="button"
                onClick={fetchItems}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition hover:underline"
              >
                Yenile ↻
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 bg-black/20 rounded-2xl border border-gray-800/60">
                Henüz hedef alım eklenmedi. Yukarıdan Gaijin linki yapıştırarak veya arama yaparak başlayabilirsiniz.
              </div>
            ) : (
              <div className="divide-y divide-gray-800/80 border border-gray-800/80 rounded-2xl overflow-hidden bg-black/20">
                {items.map((it) => (
                  <div key={it.market_name} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-800/20 transition">
                    <div className="flex items-center gap-3">
                      {it.icon ? (
                        <img src={it.icon} alt={it.display_name || it.market_name} className="w-11 h-11 object-contain rounded-lg bg-black/40 p-1 border border-gray-800 shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-gray-800/60 flex items-center justify-center text-base shrink-0">🎖️</div>
                      )}

                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">{it.display_name || it.market_name}</span>
                          
                          {it.status === 'ACQUIRED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                              <span>🏆</span>
                              <span>Kupon Alındı</span>
                              {it.acquired_price ? <strong className="text-emerald-400">({it.acquired_price.toFixed(2)} GJN)</strong> : null}
                            </span>
                          ) : it.active ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                              Sniper Aktif
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-700/50 text-gray-400 border border-gray-600">
                              Duraklatıldı
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-gray-400 font-mono flex items-center gap-2 flex-wrap">
                          <span>Kod: <strong className="text-gray-300">{it.market_name}</strong></span>
                          <span>•</span>
                          {it.status === 'ACQUIRED' && it.acquired_price ? (
                            <span className="text-emerald-300">Alındığı Fiyat: <strong className="text-emerald-400 font-bold">{it.acquired_price.toFixed(2)} GJN</strong></span>
                          ) : (
                            <span>Tavan: <strong className="text-amber-300 font-bold">{it.max_price.toFixed(2)} GJN</strong></span>
                          )}
                          {it.our_bid !== undefined && it.status !== 'ACQUIRED' && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-300">Piyasadaki Emrimiz: <strong>{it.our_bid.toFixed(2)} GJN</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <a
                        href={`https://trade.gaijin.net/?n=${encodeURIComponent(it.market_name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                        title="Gaijin Pazarında Aç"
                      >
                        Pazar ↗
                      </a>

                      {it.status !== 'ACQUIRED' && (
                        <button
                          type="button"
                          onClick={() => handleToggle(it.market_name, it.active)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                            it.active
                              ? 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-600/40'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-600/40'
                          }`}
                        >
                          {it.active ? 'Duraklat' : 'Aktifleştir'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemove(it.market_name)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition"
                        title="Hedef listesinden sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800/80 bg-black/40 text-xs text-gray-400">
          <span>🛡️ Hedeflenen kupon satın alındığında bot bunu otomatik korur ve asla satmaz.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
};
