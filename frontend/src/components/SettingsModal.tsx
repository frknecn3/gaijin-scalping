import React, { useEffect, useState } from 'react';
import axios from 'axios';

export interface ScannerTierRule {
    id: string;
    minPrice: number;
    maxPrice: number | null;
    minVolume: number;
    minProfitPercent: number;
    minProfitGJN: number;
}

const DEFAULT_TIER_RULES: ScannerTierRule[] = [
    { id: "tier-1", minPrice: 0.00, maxPrice: 3.00, minVolume: 30, minProfitPercent: 8.0, minProfitGJN: 0.10 },
    { id: "tier-2", minPrice: 3.00, maxPrice: 7.00, minVolume: 18, minProfitPercent: 7.0, minProfitGJN: 0.25 },
    { id: "tier-3", minPrice: 7.00, maxPrice: 15.00, minVolume: 10, minProfitPercent: 6.0, minProfitGJN: 0.60 },
    { id: "tier-4", minPrice: 15.00, maxPrice: null, minVolume: 4, minProfitPercent: 5.0, minProfitGJN: 1.00 }
];

interface BotSettings {
    guardMinProfit: number;
    scannerMinProfit: number;
    minStreak: number;
    minVolume: number;
    ignoreAllBasis: boolean;
    maxItemExposure: number;
    dynamicProfitThreshold: number;
    dynamicProfitPercentage: number;
    dynamicMinVolume: number;
    enableTierRules?: boolean;
    scannerTierRules?: ScannerTierRule[];
    fallingKnifeProtection: boolean;
    fallingKnifeDropPercent: number;
    fallingKnifeMinDelta: number;
    buyOrderTtlMinutes: number;
    inventoryHoldTimeoutHours: number;
    maxItemPrice: number;
    maxWalletPercentPerItem: number;
    enableDynamicLiquidation: boolean;
    softStopLossMinAgeHours: number;
    softStopLossMaxPercent: number;
    queueClearanceThresholdHours: number;
    emergencyDumpMinAgeHours: number;
    emergencyDumpMaxLossPercent: number;
    ultraLiquidVolumeThreshold: number;
    ultraLiquidMaxExposure: number;
    enableBuying?: boolean;
    enableSelling?: boolean;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [settings, setSettings] = useState<BotSettings>({
        guardMinProfit: 0.01,
        scannerMinProfit: 0.10,
        minStreak: 10,
        minVolume: 50,
        ignoreAllBasis: false,
        maxItemExposure: 1,
        dynamicProfitThreshold: 1.00,
        dynamicProfitPercentage: 5.0,
        dynamicMinVolume: 25,
        enableTierRules: true,
        scannerTierRules: DEFAULT_TIER_RULES,
        fallingKnifeProtection: true,
        fallingKnifeDropPercent: 8.0,
        fallingKnifeMinDelta: 0.05,
        buyOrderTtlMinutes: 15,
        inventoryHoldTimeoutHours: 2,
        maxItemPrice: 4.00,
        maxWalletPercentPerItem: 20.0,
        enableDynamicLiquidation: true,
        softStopLossMinAgeHours: 6.0,
        softStopLossMaxPercent: 5.0,
        queueClearanceThresholdHours: 24.0,
        emergencyDumpMinAgeHours: 18.0,
        emergencyDumpMaxLossPercent: 15.0,
        ultraLiquidVolumeThreshold: 100,
        ultraLiquidMaxExposure: 2,
        enableBuying: true,
        enableSelling: true
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ text: string, error?: boolean } | null>(null);
    const [ignoredItems, setIgnoredItems] = useState<string[]>([]);
    const [newIgnoreInput, setNewIgnoreInput] = useState<string>('');

    const fetchIgnored = async () => {
        try {
            const res = await axios.get('/api/ignored');
            if (res.data?.items) {
                setIgnoredItems(res.data.items);
            }
        } catch (err) {
            console.error("Failed to load ignored items", err);
        }
    };

    const handleAddIgnore = async () => {
        const trimmed = newIgnoreInput.trim();
        if (!trimmed) return;
        try {
            const res = await axios.post('/api/ignored/add', { market: trimmed });
            if (res.data?.success) {
                setNewIgnoreInput('');
                fetchIgnored();
            }
        } catch (err) {
            console.error("Failed to add ignored item", err);
        }
    };

    const handleRemoveIgnore = async (market: string) => {
        try {
            const res = await axios.post('/api/ignored/remove', { market });
            if (res.data?.success) {
                fetchIgnored();
            }
        } catch (err) {
            console.error("Failed to remove ignored item", err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setStatusMsg(null);
            fetchIgnored();
            axios.get('/settings')
                .then(res => {
                    if (res.data?.settings) {
                        setSettings(res.data.settings);
                    }
                })
                .catch(err => {
                    console.error("Failed to load settings:", err);
                    setStatusMsg({ text: "Ayarlar yüklenemedi!", error: true });
                })
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    const handleSave = async () => {
        setSaving(true);
        setStatusMsg(null);
        try {
            const res = await axios.post('/settings', settings);
            if (res.data?.success) {
                setStatusMsg({ text: "Ayarlar başarıyla kaydedildi! Bot anında yeni ayarlarla çalışıyor." });
                setTimeout(() => {
                    onClose();
                }, 1200);
            } else {
                setStatusMsg({ text: "Kaydetme başarısız!", error: true });
            }
        } catch (err: any) {
            console.error("Failed to save settings:", err);
            setStatusMsg({ text: err?.response?.data?.error || "Ayarlar kaydedilirken hata oluştu!", error: true });
        } finally {
            setSaving(false);
        }
    };

    const handleAddTierRule = () => {
        const rules = settings.scannerTierRules || [];
        const lastRule = rules[rules.length - 1];
        const nextMin = lastRule && lastRule.maxPrice ? lastRule.maxPrice : (lastRule ? lastRule.minPrice + 5 : 0);
        const newRule: ScannerTierRule = {
            id: `tier-${Date.now()}`,
            minPrice: nextMin,
            maxPrice: null,
            minVolume: 10,
            minProfitPercent: 6.0,
            minProfitGJN: 0.50
        };
        setSettings({ ...settings, scannerTierRules: [...rules, newRule] });
    };

    const handleUpdateTierRule = (index: number, field: keyof ScannerTierRule, value: any) => {
        const rules = [...(settings.scannerTierRules || [])];
        rules[index] = { ...rules[index], [field]: value };
        setSettings({ ...settings, scannerTierRules: rules });
    };

    const handleMoveTierRule = (index: number, direction: 'up' | 'down') => {
        const rules = [...(settings.scannerTierRules || [])];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= rules.length) return;
        const temp = rules[index];
        rules[index] = rules[targetIndex];
        rules[targetIndex] = temp;
        setSettings({ ...settings, scannerTierRules: rules });
    };

    const handleSortTierRules = () => {
        const rules = [...(settings.scannerTierRules || [])];
        rules.sort((a, b) => (a.minPrice || 0) - (b.minPrice || 0));
        setSettings({ ...settings, scannerTierRules: rules });
    };

    const handleDeleteTierRule = (index: number) => {
        const rules = [...(settings.scannerTierRules || [])];
        rules.splice(index, 1);
        setSettings({ ...settings, scannerTierRules: rules });
    };

    const handleResetTierRules = () => {
        setSettings({ ...settings, scannerTierRules: DEFAULT_TIER_RULES });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#181c24] border border-[#2e3646] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden text-gray-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e3646] bg-[#1c222c]">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚙️</span>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-wide">Bot Kontrol & Risk Ayarları</h2>
                            <p className="text-xs text-gray-400">Canlı Guard ve Scanner parametrelerini dinamik yönetin</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white hover:bg-white/10 rounded-lg p-2 transition"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    {loading ? (
                        <div className="py-12 text-center text-gray-400">Ayarlar getiriliyor...</div>
                    ) : (
                        <>
                            {statusMsg && (
                                <div className={`p-3 rounded-lg text-sm font-medium ${statusMsg.error ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                    {statusMsg.text}
                                </div>
                            )}

                            {/* Section: Master Operation Switches */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-cyan-500/30 space-y-3 bg-gradient-to-r from-cyan-950/20 to-blue-950/20">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                    <span className="flex items-center gap-2">🕹️ Bot Çalışma Modülleri (Master Switches)</span>
                                    <span className="text-[11px] font-normal normal-case text-gray-400">Alış ve Satış işlemlerini tek tıkla durdurup başlatın</span>
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                    {/* Buying Toggle */}
                                    <div className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-2 ${settings.enableBuying ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-red-950/30 border-red-500/40'}`}>
                                        <div>
                                            <div className="flex items-center gap-2 font-bold text-sm text-white">
                                                <span>🛒</span>
                                                <span>Otomatik Alış (Scanner)</span>
                                            </div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">
                                                {settings.enableBuying ? "Yeni BUY emirleri açılıyor" : "Alış işlemleri TAMAMEN DURDURULDU"}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSettings({ ...settings, enableBuying: !settings.enableBuying })}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition shadow flex-shrink-0 ${
                                                settings.enableBuying
                                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                                                    : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                                            }`}
                                        >
                                            {settings.enableBuying ? 'AÇIK (ON)' : 'KAPALI (OFF)'}
                                        </button>
                                    </div>

                                    {/* Selling Toggle */}
                                    <div className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-2 ${settings.enableSelling ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-red-950/30 border-red-500/40'}`}>
                                        <div>
                                            <div className="flex items-center gap-2 font-bold text-sm text-white">
                                                <span>🏷️</span>
                                                <span>Otomatik Satış (Guard)</span>
                                            </div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">
                                                {settings.enableSelling ? "SELL emirleri ve undercut devrede" : "Satış güncellemeleri TAMAMEN DURDURULDU"}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSettings({ ...settings, enableSelling: !settings.enableSelling })}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition shadow flex-shrink-0 ${
                                                settings.enableSelling
                                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                                                    : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                                            }`}
                                        >
                                            {settings.enableSelling ? 'AÇIK (ON)' : 'KAPALI (OFF)'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Ignored Items / Blacklist */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-purple-500/30 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                    <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                                        🚫 Yoksayılan Ürünler (Kara Liste - {ignoredItems.length})
                                    </h3>
                                    <span className="text-[11px] text-gray-400">
                                        Bot bu listedeki ürünleri Scanner taramalarında satın almaz
                                    </span>
                                </div>

                                {/* Add input */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newIgnoreInput}
                                        onChange={e => setNewIgnoreInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddIgnore(); }}}
                                        placeholder="Ürün market hash adı ekle (Örn: 'Trophy 6' ya da tam adı)..."
                                        className="flex-1 bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddIgnore}
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition shadow"
                                    >
                                        + Ekle
                                    </button>
                                </div>

                                {/* Ignored list */}
                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                    {ignoredItems.length === 0 ? (
                                        <div className="text-xs text-gray-500 py-3 text-center italic bg-[#181c24] rounded-lg border border-gray-800">
                                            Henüz yoksayılan ürün yok. Kartlardaki "🚫 Yoksay" butonuna basarak veya yukarıdan adını yazarak ekleyebilirsiniz.
                                        </div>
                                    ) : (
                                        ignoredItems.map(market => (
                                            <div
                                                key={market}
                                                className="flex items-center justify-between bg-[#181c24] border border-purple-900/40 rounded-lg px-3 py-2 text-xs text-gray-300 hover:border-purple-500/50 transition"
                                            >
                                                <span className="font-mono text-gray-200 truncate mr-2" title={market}>{market}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveIgnore(market)}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-xs transition font-semibold"
                                                    title="Listeden çıkar"
                                                >
                                                    ✕ Kaldır
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Section: Guard Settings */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-[#262c3b] space-y-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                                    🛡️ Guard & Satış Ayarları
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Guard Min Profit (GJN)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={settings.guardMinProfit}
                                            onChange={e => setSettings({ ...settings, guardMinProfit: parseFloat(e.target.value) || 0.01 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Undercut yaparken gereken asgari kâr.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Liquidate Mode (Basis Yok Say)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSettings({ ...settings, ignoreAllBasis: !settings.ignoreAllBasis })}
                                            className={`w-full py-2 px-3 rounded-lg text-sm font-bold transition flex items-center justify-between border ${settings.ignoreAllBasis
                                                ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                                : 'bg-[#1c222c] border-[#2e3646] text-gray-300'
                                                }`}
                                        >
                                            <span>{settings.ignoreAllBasis ? 'AÇIK (Likidasyon)' : 'KAPALI (Maliyet Koru)'}</span>
                                            <span className="text-xs opacity-75">{settings.ignoreAllBasis ? '🟡' : '⚪'}</span>
                                        </button>
                                        <span className="text-[11px] text-gray-500 block mt-1">Açıkken eski maliyete takılmadan anlık makasa göre satar.</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Scanner Settings */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-[#262c3b] space-y-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                    🔍 Scanner & Alım Ayarları
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Scanner Min Profit (GJN)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            value={settings.scannerMinProfit}
                                            onChange={e => setSettings({ ...settings, scannerMinProfit: parseFloat(e.target.value) || 0.10 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Yeni alım emri girmek için gereken net kâr.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Confirmation Streak (Tur)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            value={settings.minStreak}
                                            onChange={e => setSettings({ ...settings, minStreak: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Alınmadan önce kârlı kalması gereken ardışık tarama sayısı.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Min Volume (48s Hacim)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="0"
                                            value={settings.minVolume}
                                            onChange={e => setSettings({ ...settings, minVolume: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Son 48 saatte gerçekleşmesi gereken min işlem adedi.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Normal Eşyalar Max Stok (Adet)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            value={settings.maxItemExposure}
                                            onChange={e => setSettings({ ...settings, maxItemExposure: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Standart eşyalarda aynı anda elde tutulabilecek max adet (Örn: 1).</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-cyan-400 mb-1">
                                            Ultra-Likit Eşik Hacmi (48s)
                                        </label>
                                        <input
                                            type="number"
                                            step="5"
                                            min="50"
                                            value={settings.ultraLiquidVolumeThreshold}
                                            onChange={e => setSettings({ ...settings, ultraLiquidVolumeThreshold: parseInt(e.target.value) || 100 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Ultra likit sayılması için gereken 48 saatlik satış adedi (Örn: 100).</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-cyan-400 mb-1">
                                            Ultra-Likit Max Stok (Adet)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            max="5"
                                            value={settings.ultraLiquidMaxExposure}
                                            onChange={e => setSettings({ ...settings, ultraLiquidMaxExposure: parseInt(e.target.value) || 2 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Esports kupaları gibi 100+ satanlarda aynı anda izin verilen stok (Örn: 2).</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#262c3b]">
                                    <div>
                                        <label className="block text-xs font-medium text-amber-300 mb-1">
                                            Dinamik Kâr Eşiği ($)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={settings.dynamicProfitThreshold}
                                            onChange={e => setSettings({ ...settings, dynamicProfitThreshold: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Bu fiyatın üzerindeki eşyalarda yüzdelik kâr hesabı devreye girer.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-amber-300 mb-1">
                                            Hedef Kâr Yüzdesi (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.1"
                                            value={settings.dynamicProfitPercentage}
                                            onChange={e => setSettings({ ...settings, dynamicProfitPercentage: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Düşük hacimli eşyalarda bu oranın 2 katı, yükseklerde 1 katı istenir.</span>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-amber-300 mb-1">
                                            Dinamik Min Hacim (Eşik Üstü Eşyalar İçin 48s Hacim)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="0"
                                            value={settings.dynamicMinVolume}
                                            onChange={e => setSettings({ ...settings, dynamicMinVolume: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Fiyatı dinamik eşiğin üzerindeki pahalı eşyalar için aranan asgari 48 saatlik satış adedi (Örn: 25).</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Custom Tier Rules Matrix */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-indigo-500/30 space-y-4 shadow-lg shadow-indigo-950/20">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262c3b] pb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                                            🎯 Kademeli Alım Kuralları (Tier Rules Matrix)
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Eşyaları fiyatlarına göre kademelere ayırarak her bütçe grubu için özel hacim ve kâr kuralları belirleyin.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSettings({ ...settings, enableTierRules: !settings.enableTierRules })}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 border ${
                                            settings.enableTierRules
                                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                                : 'bg-[#1c222c] border-[#2e3646] text-gray-400'
                                        }`}
                                    >
                                        <span>{settings.enableTierRules ? 'AÇIK (Kademeli Sistem Aktif)' : 'KAPALI (Genel Ayarlar Kullanılır)'}</span>
                                        <span>{settings.enableTierRules ? '🟢' : '⚪'}</span>
                                    </button>
                                </div>

                                {settings.enableTierRules && (
                                    <div className="space-y-3">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-[#262c3b] text-gray-400 font-semibold">
                                                        <th className="py-2 px-2">Min Fiyat ($)</th>
                                                        <th className="py-2 px-2">Max Fiyat ($)</th>
                                                        <th className="py-2 px-2">Min 48s Hacim</th>
                                                        <th className="py-2 px-2">Min Kâr (%)</th>
                                                        <th className="py-2 px-2">Min Kâr ($)</th>
                                                        <th className="py-2 px-2 text-right">Sil</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#1c222c]">
                                                    {(settings.scannerTierRules || []).map((rule, idx) => (
                                                        <tr key={rule.id || idx} className="hover:bg-white/[0.02] transition">
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    min="0"
                                                                    value={rule.minPrice}
                                                                    onChange={e => handleUpdateTierRule(idx, 'minPrice', parseFloat(e.target.value) || 0)}
                                                                    className="w-20 bg-[#1c222c] border border-[#2e3646] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    min="0"
                                                                    placeholder="Sınırsız"
                                                                    value={rule.maxPrice !== null && rule.maxPrice !== undefined ? rule.maxPrice : ''}
                                                                    onChange={e => {
                                                                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                                                        handleUpdateTierRule(idx, 'maxPrice', isNaN(val as number) ? null : val);
                                                                    }}
                                                                    className="w-20 bg-[#1c222c] border border-[#2e3646] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <input
                                                                    type="number"
                                                                    step="1"
                                                                    min="1"
                                                                    value={rule.minVolume}
                                                                    onChange={e => handleUpdateTierRule(idx, 'minVolume', parseInt(e.target.value) || 1)}
                                                                    className="w-20 bg-[#1c222c] border border-[#2e3646] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                                                />
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        step="0.5"
                                                                        min="0.1"
                                                                        value={rule.minProfitPercent}
                                                                        onChange={e => handleUpdateTierRule(idx, 'minProfitPercent', parseFloat(e.target.value) || 0.1)}
                                                                        className="w-16 bg-[#1c222c] border border-[#2e3646] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                                                    />
                                                                    <span className="text-gray-400">%</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        step="0.05"
                                                                        min="0.01"
                                                                        value={rule.minProfitGJN}
                                                                        onChange={e => handleUpdateTierRule(idx, 'minProfitGJN', parseFloat(e.target.value) || 0.01)}
                                                                        className="w-16 bg-[#1c222c] border border-[#2e3646] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                                                    />
                                                                    <span className="text-gray-400">$</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        type="button"
                                                                        disabled={idx === 0}
                                                                        onClick={() => handleMoveTierRule(idx, 'up')}
                                                                        className={`p-1 rounded transition text-xs ${idx === 0 ? 'opacity-20 cursor-not-allowed text-gray-600' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
                                                                        title="Yukarı Taşı"
                                                                    >
                                                                        ⬆️
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={idx === (settings.scannerTierRules || []).length - 1}
                                                                        onClick={() => handleMoveTierRule(idx, 'down')}
                                                                        className={`p-1 rounded transition text-xs ${idx === (settings.scannerTierRules || []).length - 1 ? 'opacity-20 cursor-not-allowed text-gray-600' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
                                                                        title="Aşağı Taşı"
                                                                    >
                                                                        ⬇️
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteTierRule(idx)}
                                                                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded transition text-xs ml-1"
                                                                        title="Kademeyi Sil"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleAddTierRule}
                                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-md shadow-indigo-900/30"
                                                >
                                                    <span>➕</span> Yeni Kademe Ekle
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSortTierRules}
                                                    className="px-3 py-1.5 bg-[#1c222c] hover:bg-[#252c39] border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
                                                    title="Tüm kademeleri Min Fiyata göre küçükten büyüğe otomatik sıralar"
                                                >
                                                    <span>🔢</span> Fiyata Göre Sırala
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleResetTierRules}
                                                className="px-3 py-1.5 bg-transparent hover:bg-white/5 border border-gray-700 text-gray-400 hover:text-gray-300 rounded-lg text-xs transition"
                                            >
                                                ↺ Varsayılanları Yükle
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Section: Risk & Order Lifecycle */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-[#262c3b] space-y-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                                    ⚡ Risk & Emir Yaşam Döngüsü (TTL & Düşen Bıçak)
                                </h3>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Düşen Bıçak Koruması
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSettings({ ...settings, fallingKnifeProtection: !settings.fallingKnifeProtection })}
                                            className={`w-full py-2 px-3 rounded-lg text-sm font-bold transition flex items-center justify-between border ${settings.fallingKnifeProtection
                                                ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                                                : 'bg-[#1c222c] border-[#2e3646] text-gray-300'
                                                }`}
                                        >
                                            <span>{settings.fallingKnifeProtection ? 'AÇIK (Trend Koruması)' : 'KAPALI'}</span>
                                            <span className="text-xs opacity-75">{settings.fallingKnifeProtection ? '🛡️' : '⚪'}</span>
                                        </button>
                                        <span className="text-[11px] text-gray-500 block mt-1">Hızlı değer kaybeden eşyalara yeni alım emri girmeyi engeller.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Düşüş Eşiği (%) / 30 Dk
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="1"
                                            value={settings.fallingKnifeDropPercent}
                                            onChange={e => setSettings({ ...settings, fallingKnifeDropPercent: parseFloat(e.target.value) || 8.0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Son 30 dakikada bu oranın üzerinde düşen eşyalar dondurulur (Örn: 8%).</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Alış Emri TTL (Dakika)
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            value={settings.buyOrderTtlMinutes}
                                            onChange={e => setSettings({ ...settings, buyOrderTtlMinutes: parseInt(e.target.value) || 15 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Geçilen ve dolmayan alış emirlerinin iptal edilme süresi (Örn: 15 dk).</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Stok Bekleme & Başabaş (Saat)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            value={settings.inventoryHoldTimeoutHours}
                                            onChange={e => setSettings({ ...settings, inventoryHoldTimeoutHours: parseFloat(e.target.value) || 2.0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Bu süreden uzun satılmayan eşyalar kârsız başabaşa (0 kâr) indirilerek nakde çevrilir.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-rose-300 mb-1">
                                            Max Eşya Fiyatı ($ GJN)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            value={settings.maxItemPrice}
                                            onChange={e => setSettings({ ...settings, maxItemPrice: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Botun tek bir eşyaya ödeyebileceği tavan fiyat (Örn: 4.00 $).</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-rose-300 mb-1">
                                            Max Kasa Payı (%) / Eşya
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            max="100"
                                            value={settings.maxWalletPercentPerItem}
                                            onChange={e => setSettings({ ...settings, maxWalletPercentPerItem: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Tek bir eşyanın güncel toplam bakiyenizden alabileceği azami oran (Örn: 20%).</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Safe Dynamic Liquidation Ladder */}
                            <div className="bg-[#12161f] p-4 rounded-xl border border-[#262c3b] space-y-4">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                    🛡️ Kademeli Güvenli Likidasyon (Sıra Derinliği & Hacim Odaklı)
                                </h3>
                                <p className="text-xs text-gray-400 leading-relaxed">
                                    Pazar fiyatı gerilediğinde eşyanın sonsuza kadar rafta kilitli kalmasını engeller. Önündeki sıra derinliğini ve satış hızını hesaplayarak sadece satılamayacak duruma gelen eşyalara kademeli ve kontrollü müdahale eder.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Kademeli Güvenli Likidasyon
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setSettings({ ...settings, enableDynamicLiquidation: !settings.enableDynamicLiquidation })}
                                            className={`w-full py-2 px-3 rounded-lg text-sm font-bold transition flex items-center justify-between border ${settings.enableDynamicLiquidation
                                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                                : 'bg-[#1c222c] border-[#2e3646] text-gray-300'
                                                }`}
                                        >
                                            <span>{settings.enableDynamicLiquidation ? 'AÇIK (Akıllı Sıra Analizi)' : 'KAPALI (Sadece Manuel Likidasyon)'}</span>
                                            <span className="text-xs opacity-75">{settings.enableDynamicLiquidation ? '🛡️' : '⚪'}</span>
                                        </button>
                                        <span className="text-[11px] text-gray-500 block mt-1">Açıkken hantal kalan eşyaları kontrollü adımlarla sırayla eritir.</span>
                                    </div>

                                    <div>
                                         <label className="block text-xs font-medium text-emerald-300 mb-1">
                                             Yumuşak Zarar Kes Min Süre (Saat)
                                         </label>
                                         <input
                                             type="number"
                                             step="0.5"
                                             min="1"
                                             value={settings.softStopLossMinAgeHours}
                                             onChange={e => setSettings({ ...settings, softStopLossMinAgeHours: parseFloat(e.target.value) || 4.5 })}
                                             className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                         />
                                         <span className="text-[11px] text-gray-500 block mt-1">Eşya en az bu kadar saat satılmamış olmalıdır (Örn: 4.5 saat).</span>
                                    </div>

                                    <div>
                                         <label className="block text-xs font-medium text-emerald-300 mb-1">
                                             Yumuşak Zarar Kes Max Kayıp (%)
                                         </label>
                                         <input
                                             type="number"
                                             step="0.5"
                                             min="1"
                                             max="20"
                                             value={settings.softStopLossMaxPercent}
                                             onChange={e => setSettings({ ...settings, softStopLossMaxPercent: parseFloat(e.target.value) || 5.0 })}
                                             className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                         />
                                         <span className="text-[11px] text-gray-500 block mt-1">Sıranın önüne geçmek için izin verilen azami zarar oranı (Örn: %5).</span>
                                    </div>

                                    <div>
                                         <label className="block text-xs font-medium text-gray-300 mb-1">
                                             Kuyruk Erime Eşiği (Saat)
                                         </label>
                                         <input
                                             type="number"
                                             step="1"
                                             min="4"
                                             value={settings.queueClearanceThresholdHours}
                                             onChange={e => setSettings({ ...settings, queueClearanceThresholdHours: parseFloat(e.target.value) || 16.0 })}
                                             className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                         />
                                         <span className="text-[11px] text-gray-500 block mt-1">Öndeki sıranın erimesi bu süreden uzun sürecekse müdahale edilir (Örn: 16 saat).</span>
                                    </div>

                                    <div>
                                         <label className="block text-xs font-medium text-amber-300 mb-1">
                                             Acil Likidasyon Min Süre (Saat)
                                         </label>
                                         <input
                                             type="number"
                                             step="1"
                                             min="4"
                                             value={settings.emergencyDumpMinAgeHours}
                                             onChange={e => setSettings({ ...settings, emergencyDumpMinAgeHours: parseFloat(e.target.value) || 14.0 })}
                                             className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                         />
                                         <span className="text-[11px] text-gray-500 block mt-1">Tamamen tıkanan eşyanın doğrudan BUY tahtasına satılma süresi (Örn: 14 saat).</span>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-amber-300 mb-1">
                                            Acil Likidasyon Max Kayıp (%)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="1"
                                            max="50"
                                            value={settings.emergencyDumpMaxLossPercent}
                                            onChange={e => setSettings({ ...settings, emergencyDumpMaxLossPercent: parseFloat(e.target.value) || 15.0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">BUY teklifine doğrudan satarken kabul edilecek en yüksek zarar tavanı (Örn: %15). Teklif daha düşükse satmaz.</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2e3646] bg-[#1c222c]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition"
                    >
                        Vazgeç
                    </button>
                    <button
                        type="button"
                        disabled={saving || loading}
                        onClick={handleSave}
                        className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition active:scale-95"
                    >
                        {saving ? "Kaydediliyor..." : "Kaydet ve Uygula"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
