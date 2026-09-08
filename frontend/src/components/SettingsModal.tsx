import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface BotSettings {
    guardMinProfit: number;
    scannerMinProfit: number;
    minStreak: number;
    minVolume: number;
    ignoreAllBasis: boolean;
    maxItemExposure: number;
    dynamicProfitThreshold: number;
    dynamicProfitPercentage: number;
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
        ignoreAllBasis: true,
        maxItemExposure: 1,
        dynamicProfitThreshold: 1.00,
        dynamicProfitPercentage: 5.0
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ text: string, error?: boolean } | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setStatusMsg(null);
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#181c24] border border-[#2e3646] rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden text-gray-200">
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
                                            min="0.01"
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
                                            step="5"
                                            min="0"
                                            value={settings.minVolume}
                                            onChange={e => setSettings({ ...settings, minVolume: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Son 48 saatte gerçekleşmesi gereken min işlem adedi.</span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">
                                            Max Exposure / İtem
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="1"
                                            value={settings.maxItemExposure}
                                            onChange={e => setSettings({ ...settings, maxItemExposure: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Aynı eşyadan aynı anda sahip olunabilecek max adet.</span>
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
                                            step="0.1"
                                            min="0.1"
                                            value={settings.dynamicProfitPercentage}
                                            onChange={e => setSettings({ ...settings, dynamicProfitPercentage: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-[#1c222c] border border-[#2e3646] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 block mt-1">Düşük hacimli eşyalarda bu oranın 2 katı, yükseklerde 1 katı istenir.</span>
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
