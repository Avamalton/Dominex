/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/bot/BotConsoleView.tsx
 * Algorithmic Trading Bot Console for DIMONEX
 * Features:
 * - Direct integration with generated HMAC API Keys & User Account
 * - Spot Grid Trading Bot (Arithmetic / Geometric spacing)
 * - Layered Limit Buy / Sell Ladder generator (Spread % steps & volume sizing)
 * - Auto Smart Trade (Target Volume & Price Execution / TWAP Slicer)
 * - Volume Maker Bot (Target Volume Reach, Min/Max Price, Delay Seconds, Amount Random, Buy First/Sell First/Random)
 * - Live execution terminal & Active Bot Order Manager with 1-click cancellation
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, TradingPairItem, UserBalance, OrderItem } from '../../types/index.js';
import { formatIDR, formatCrypto, formatDateTime } from '../../lib/formatters.js';

interface Props {
  user: UserProfile | null;
  tradingPairs: TradingPairItem[];
  balances: UserBalance[];
  onRefreshBalances: () => void;
  onRefreshOrders?: () => void;
  onOpenAuthModal: () => void;
  onOpenSecurityView: () => void;
}

export const BotConsoleView: React.FC<Props> = ({
  user,
  tradingPairs,
  balances,
  onRefreshBalances,
  onRefreshOrders,
  onOpenAuthModal,
  onOpenSecurityView,
}) => {
  const [selectedPairId, setSelectedPairId] = useState('BTC-IDR');
  const [activeStrategy, setActiveStrategy] = useState<'GRID' | 'LAYERS' | 'SMART' | 'VOLUME'>('GRID');

  // API Key integration state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  // Active Bots & Bot Orders list
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [botOpenOrders, setBotOpenOrders] = useState<OrderItem[]>([]);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'CONFIG' | 'BOT_ORDERS'>('CONFIG');

  // Spot Grid Form state
  const [gridLowerPrice, setGridLowerPrice] = useState('1400000000');
  const [gridUpperPrice, setGridUpperPrice] = useState('1500000000');
  const [gridCount, setGridCount] = useState('6');
  const [gridInvestment, setGridInvestment] = useState('25000000'); // 25M IDR
  const [gridSpacingMode, setGridSpacingMode] = useState<'ARITHMETIC' | 'GEOMETRIC'>('ARITHMETIC');

  // Layered Orders Form state
  const [layerSide, setLayerSide] = useState<'BUY' | 'SELL'>('BUY');
  const [layerStartPrice, setLayerStartPrice] = useState('1440000000');
  const [layerCount, setLayerCount] = useState('5');
  const [layerStepPercent, setLayerStepPercent] = useState('0.8'); // 0.8%
  const [layerQty, setLayerQty] = useState('0.05');

  // Smart Trade Form state
  const [smartSide, setSmartSide] = useState<'BUY' | 'SELL'>('BUY');
  const [smartTargetPrice, setSmartTargetPrice] = useState('1435000000');
  const [smartTotalVol, setSmartTotalVol] = useState('0.2');
  const [smartSliceCount, setSmartSliceCount] = useState('4');
  const [smartOrderType, setSmartOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');

  // Volume Bot Form state
  const [volTargetVolume, setVolTargetVolume] = useState('2.5'); // e.g. 2.5 BTC
  const [volMinPrice, setVolMinPrice] = useState('1420000000');
  const [volMaxPrice, setVolMaxPrice] = useState('1480000000');
  const [volDelaySeconds, setVolDelaySeconds] = useState('3');
  const [volAmountRandom, setVolAmountRandom] = useState(true);
  const [volAmountMin, setVolAmountMin] = useState('0.02');
  const [volAmountMax, setVolAmountMax] = useState('0.08');
  const [volDirectionMode, setVolDirectionMode] = useState<'BUY_FIRST' | 'SELL_FIRST' | 'RANDOM'>('RANDOM');

  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedPair = tradingPairs.find(p => p.id === selectedPairId) || tradingPairs[0] || {
    id: 'BTC-IDR',
    baseCurrency: 'BTC',
    quoteCurrency: 'IDR',
    baseDecimals: 8,
    quoteDecimals: 2,
    lastPrice: '145000000000',
    minOrderSize: '1000'
  };

  useEffect(() => {
    if (user) {
      loadUserApiKeys();
      loadActiveBots();
      loadBotOpenOrders();
      const interval = setInterval(() => {
        loadActiveBots();
        loadBotOpenOrders();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Set default prices when pair changes
  useEffect(() => {
    if (selectedPair && selectedPair.lastPrice) {
      const midRupiah = Number(BigInt(selectedPair.lastPrice) / 100n);
      setGridLowerPrice(Math.round(midRupiah * 0.95).toString());
      setGridUpperPrice(Math.round(midRupiah * 1.05).toString());
      setLayerStartPrice(Math.round(midRupiah * 0.99).toString());
      setSmartTargetPrice(midRupiah.toString());
      setVolMinPrice(Math.round(midRupiah * 0.98).toString());
      setVolMaxPrice(Math.round(midRupiah * 1.02).toString());

      if (selectedPair.baseCurrency === 'BTC') {
        setVolTargetVolume('2.0');
        setVolAmountMin('0.02');
        setVolAmountMax('0.08');
      } else if (selectedPair.baseCurrency === 'ETH') {
        setVolTargetVolume('20.0');
        setVolAmountMin('0.2');
        setVolAmountMax('0.8');
      } else {
        setVolTargetVolume('5000');
        setVolAmountMin('50');
        setVolAmountMax('200');
      }
    }
  }, [selectedPairId, selectedPair.lastPrice]);

  const loadUserApiKeys = async () => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/api-keys/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.length > 0) {
        setApiKeys(data);
        if (!selectedApiKeyId) setSelectedApiKeyId(data[0].keyId);
      }
    } catch (e) {}
  };

  const handleQuickCreateApiKey = async () => {
    setIsGeneratingKey(true);
    setActionError(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/api-keys/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: `Algo Bot Key (${user?.role === 'admin' ? 'Admin' : 'Trader'})`,
          permissions: ['read', 'trade'],
          ipWhitelist: '*'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionMessage(`Kunci API Baru berhasil dibuat: ${data.apiKey}. Bot otomatis terhubung!`);
      await loadUserApiKeys();
      setSelectedApiKeyId(data.apiKey);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const loadActiveBots = async () => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBots(data);
        if (!selectedBotId && data.length > 0) {
          setSelectedBotId(data[0].id);
        }
      }
    } catch (e) {}
  };

  const loadBotOpenOrders = async () => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/open-orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setBotOpenOrders(await res.json());
      }
    } catch (e) {}
  };

  // Preset price adjustment helper
  const applyPercentPreset = (
    percent: number,
    target: 'LOWER' | 'UPPER' | 'LAYER_START' | 'SMART_TARGET' | 'VOL_MIN' | 'VOL_MAX'
  ) => {
    const mid = Number(BigInt(selectedPair.lastPrice || '0') / 100n);
    const newPrice = Math.round(mid * (1 + percent / 100)).toString();
    if (target === 'LOWER') setGridLowerPrice(newPrice);
    if (target === 'UPPER') setGridUpperPrice(newPrice);
    if (target === 'LAYER_START') setLayerStartPrice(newPrice);
    if (target === 'SMART_TARGET') setSmartTargetPrice(newPrice);
    if (target === 'VOL_MIN') setVolMinPrice(newPrice);
    if (target === 'VOL_MAX') setVolMaxPrice(newPrice);
  };

  // 1. Deploy Grid Bot
  const handleDeployGrid = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/grid/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          apiKeyId: selectedApiKeyId,
          pairId: selectedPairId,
          lowerPrice: gridLowerPrice,
          upperPrice: gridUpperPrice,
          gridCount,
          totalInvestmentIdr: gridInvestment
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionMessage(`Bot Spot Grid berhasil diluncurkan! Terpasang ${data.bot.deployedOrderIds.length} limit order aktif di antrean Order Aktif Anda (${user?.email}).`);
      loadActiveBots();
      loadBotOpenOrders();
      onRefreshBalances();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Deploy Layer Orders
  const handleDeployLayers = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/layers/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          apiKeyId: selectedApiKeyId,
          pairId: selectedPairId,
          side: layerSide,
          startPrice: layerStartPrice,
          layerCount,
          priceStepPercent: layerStepPercent,
          quantityPerLayer: layerQty
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionMessage(`Berhasil mendeploy ${data.bot.deployedOrderIds.length} limit order layer ${layerSide}! Order langsung aktif di antrean Order Aktif akun Anda (${user?.email}).`);
      loadActiveBots();
      loadBotOpenOrders();
      onRefreshBalances();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Deploy Smart Trade
  const handleDeploySmartTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/smart-trade/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          apiKeyId: selectedApiKeyId,
          pairId: selectedPairId,
          side: smartSide,
          targetPrice: smartTargetPrice,
          totalVolume: smartTotalVol,
          sliceCount: smartSliceCount,
          orderType: smartOrderType
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionMessage(`Smart Trade ${smartSide} berhasil dimulai: Target ${smartTotalVol} ${selectedPair.baseCurrency}. Order terdaftar di Order Aktif Anda.`);
      loadActiveBots();
      loadBotOpenOrders();
      onRefreshBalances();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Deploy Volume Maker Bot
  const handleDeployVolumeBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/volume/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          apiKeyId: selectedApiKeyId,
          pairId: selectedPairId,
          targetVolumeReach: volTargetVolume,
          minPrice: volMinPrice,
          maxPrice: volMaxPrice,
          delaySecondAmount: volDelaySeconds,
          amountRandom: volAmountRandom,
          amountMin: volAmountMin,
          amountMax: volAmountMax,
          directionMode: volDirectionMode
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionMessage(`Bot Volume berhasil diluncurkan! Target: ${volTargetVolume} ${selectedPair.baseCurrency} | Delay: ${volDelaySeconds}s | Mode: ${volDirectionMode}`);
      loadActiveBots();
      loadBotOpenOrders();
      onRefreshBalances();
      if (onRefreshOrders) onRefreshOrders();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Stop Bot
  const handleStopBot = async (botId: string) => {
    if (!confirm('Hentikan bot dan batalkan seluruh order aktif yang terpasang di buku order?')) return;
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ botId, cancelOpenOrders: true })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message);
        loadActiveBots();
        loadBotOpenOrders();
        onRefreshBalances();
        if (onRefreshOrders) onRefreshOrders();
      }
    } catch (e) {}
  };

  // Cancel Individual Order
  const handleCancelSingleOrder = async (orderId: string, pairId: string) => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/trading/order/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId, pairId })
      });
      if (res.ok) {
        loadBotOpenOrders();
        onRefreshBalances();
        if (onRefreshOrders) onRefreshOrders();
      }
    } catch (e) {}
  };

  // Cancel All Bot Orders
  const handleCancelAllBotOrders = async () => {
    if (!confirm('Batalkan SEMUA order aktif yang dihasilkan oleh seluruh bot trading Anda?')) return;
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/bot/cancel-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message);
        loadActiveBots();
        loadBotOpenOrders();
        onRefreshBalances();
        if (onRefreshOrders) onRefreshOrders();
      }
    } catch (e) {}
  };

  if (!user) {
    return (
      <div className="p-8 text-center bg-[#0b0e14] border border-[#1e2633] rounded-lg">
        <h2 className="text-base font-bold text-slate-100 mb-2">DIMONEX Algo Bot Console</h2>
        <p className="text-xs text-slate-400 mb-4">Masuk untuk mengonfigurasi Spot Grid, Layer Orders, Smart Trade, dan Volume Maker Bot.</p>
        <button
          onClick={onOpenAuthModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded"
        >
          Masuk Akun
        </button>
      </div>
    );
  }

  const selectedBot = bots.find(b => b.id === selectedBotId) || bots[0];
  const midPriceDisplay = Number(BigInt(selectedPair.lastPrice || '0') / 100n);

  return (
    <div className="space-y-6">
      {/* Console Header & API Key Binding */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-100">DIMONEX Algo Trading Bot Console</h2>
            <span className="px-2 py-0.5 bg-blue-950/80 border border-blue-800 text-blue-400 text-[10px] font-mono font-bold rounded">
              HMAC-SHA256 SIGNED
            </span>
            <span className={`px-2 py-0.5 border text-[10px] font-bold rounded ${
              user.role === 'admin' 
                ? 'bg-amber-950/80 border-amber-700 text-amber-300' 
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}>
              {user.role === 'admin' ? '👑 AKUN ADMIN' : '👤 AKUN TRADER'}: {user.email}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Eksekusi otomatis strategi kuantitatif. Semua order limit langsung terdaftar di antrean <strong>Order Aktif</strong> akun Anda dan ditandai di Buku Order dengan label <strong>★ SAYA</strong>.
          </p>
        </div>

        {/* API Key Selector & Quick Create */}
        <div className="flex flex-wrap items-center gap-2 bg-[#141a23] p-2.5 rounded-md border border-[#1e2633]">
          <span className="text-[11px] text-slate-400 font-medium">Kunci API Terikat:</span>
          {apiKeys.length === 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleQuickCreateApiKey}
                disabled={isGeneratingKey}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded shadow transition-colors flex items-center gap-1"
              >
                {isGeneratingKey ? 'Membuat Kunci...' : '⚡ Buat Kunci API Cepat'}
              </button>
              <button
                onClick={onOpenSecurityView}
                className="text-[11px] text-blue-400 hover:underline"
              >
                Kelola API
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={selectedApiKeyId}
                onChange={e => setSelectedApiKeyId(e.target.value)}
                className="bg-[#0b0e14] border border-[#1e2633] text-xs font-mono text-emerald-400 rounded px-2.5 py-1 focus:outline-none"
              >
                {apiKeys.map(k => (
                  <option key={k.id} value={k.keyId}>
                    {k.label} ({k.keyId.slice(0, 14)}...)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleQuickCreateApiKey}
                disabled={isGeneratingKey}
                className="px-2 py-1 bg-[#1e2633] hover:bg-slate-700 text-slate-300 text-[10px] font-medium rounded transition-colors"
                title="Buat Kunci API Baru"
              >
                + Baru
              </button>
            </div>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded flex justify-between items-center animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-400 font-bold ml-2">✕</button>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded flex justify-between items-center animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold">⚠</span>
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Main Tabs: Strategy Configurator vs Bot Active Orders */}
      <div className="flex items-center justify-between border-b border-[#1e2633] pb-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveConsoleTab('CONFIG')}
            className={`text-xs font-bold pb-2 border-b-2 transition-colors ${
              activeConsoleTab === 'CONFIG'
                ? 'text-blue-400 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            ⚙️ Konfigurasi Strategi Bot
          </button>
          <button
            type="button"
            onClick={() => setActiveConsoleTab('BOT_ORDERS')}
            className={`text-xs font-bold pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeConsoleTab === 'BOT_ORDERS'
                ? 'text-blue-400 border-blue-500'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            📋 Order Aktif dari Bot
            {botOpenOrders.length > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-mono font-bold rounded-full">
                {botOpenOrders.length}
              </span>
            )}
          </button>
        </div>

        {botOpenOrders.length > 0 && (
          <button
            type="button"
            onClick={handleCancelAllBotOrders}
            className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-medium rounded transition-colors"
          >
            ⛔ Batalkan Semua Order Bot ({botOpenOrders.length})
          </button>
        )}
      </div>

      {activeConsoleTab === 'CONFIG' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Strategy Configurator Forms */}
          <div className="lg:col-span-6 bg-[#0b0e14] border border-[#1e2633] rounded-lg p-5 space-y-4">
            {/* Pair Selector & Strategy Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2633] pb-3">
              <div className="flex items-center gap-2">
                <select
                  value={selectedPairId}
                  onChange={e => setSelectedPairId(e.target.value)}
                  className="bg-[#141a23] border border-[#1e2633] text-xs font-bold text-white rounded px-2.5 py-1.5 focus:outline-none"
                >
                  {tradingPairs.map(p => (
                    <option key={p.id} value={p.id}>{p.id}</option>
                  ))}
                </select>
                <span className="text-[11px] font-mono text-slate-400">
                  Harga Pasar: <strong className="text-slate-100">Rp {midPriceDisplay.toLocaleString('id-ID')}</strong>
                </span>
              </div>

              <div className="flex flex-wrap gap-1 bg-[#141a23] p-1 rounded-md border border-[#1e2633] text-xs">
                <button
                  type="button"
                  onClick={() => setActiveStrategy('GRID')}
                  className={`px-2.5 py-1 font-semibold rounded transition-colors ${
                    activeStrategy === 'GRID' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Spot Grid
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStrategy('LAYERS')}
                  className={`px-2.5 py-1 font-semibold rounded transition-colors ${
                    activeStrategy === 'LAYERS' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Order Layers
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStrategy('SMART')}
                  className={`px-2.5 py-1 font-semibold rounded transition-colors ${
                    activeStrategy === 'SMART' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Smart Trade
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStrategy('VOLUME')}
                  className={`px-2.5 py-1 font-bold rounded transition-colors flex items-center gap-1 ${
                    activeStrategy === 'VOLUME' ? 'bg-rose-600 text-white shadow' : 'text-rose-400 hover:text-rose-200'
                  }`}
                >
                  🔥 Bot Volume
                </button>
              </div>
            </div>

            {/* STRATEGY 1: SPOT GRID CONFIG */}
            {activeStrategy === 'GRID' && (
              <form onSubmit={handleDeployGrid} className="space-y-4 text-xs">
                <div className="p-3 bg-[#101622] rounded border border-[#141a23] text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">Spot Grid Trading Strategy</span>
                    <span className="text-[10px] font-mono text-blue-400">Dua Arah: Beli & Jual Berundak</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Memasang jaring limit order beli berundak di bawah harga pasar dan order jual di atas harga pasar. Semua order masuk ke antrean <strong>Order Aktif</strong> akun Anda.
                  </p>
                </div>

                {/* Price Presets */}
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>Preset Rentang Cepat:</span>
                  <button
                    type="button"
                    onClick={() => { applyPercentPreset(-5, 'LOWER'); applyPercentPreset(5, 'UPPER'); }}
                    className="px-2 py-0.5 bg-[#141a23] hover:bg-slate-700 text-slate-300 rounded font-mono"
                  >
                    ±5%
                  </button>
                  <button
                    type="button"
                    onClick={() => { applyPercentPreset(-10, 'LOWER'); applyPercentPreset(10, 'UPPER'); }}
                    className="px-2 py-0.5 bg-[#141a23] hover:bg-slate-700 text-slate-300 rounded font-mono"
                  >
                    ±10%
                  </button>
                  <button
                    type="button"
                    onClick={() => { applyPercentPreset(-15, 'LOWER'); applyPercentPreset(15, 'UPPER'); }}
                    className="px-2 py-0.5 bg-[#141a23] hover:bg-slate-700 text-slate-300 rounded font-mono"
                  >
                    ±15%
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Batas Harga Bawah (IDR):</label>
                    <input
                      type="number"
                      value={gridLowerPrice}
                      onChange={e => setGridLowerPrice(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Batas Harga Atas (IDR):</label>
                    <input
                      type="number"
                      value={gridUpperPrice}
                      onChange={e => setGridUpperPrice(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Jumlah Grid (3 - 30):</label>
                    <input
                      type="number"
                      value={gridCount}
                      min={3}
                      max={30}
                      onChange={e => setGridCount(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Total Alokasi Investasi (IDR):</label>
                    <input
                      type="number"
                      value={gridInvestment}
                      onChange={e => setGridInvestment(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Spacing Mode */}
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-[11px]">Mode Grid Step:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGridSpacingMode('ARITHMETIC')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        gridSpacingMode === 'ARITHMETIC' ? 'bg-[#1e2633] text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Aritmatika (Jarak IDR Sama)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGridSpacingMode('GEOMETRIC')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        gridSpacingMode === 'GEOMETRIC' ? 'bg-[#1e2633] text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Geometris (Rasio % Sama)
                    </button>
                  </div>
                </div>

                {/* Grid Preview Calculation */}
                <div className="p-3 bg-[#141a23]/50 border border-[#1e2633] rounded text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Jarak Interval Harga:</span>
                    <span className="text-slate-200 font-bold">
                      Rp {Math.round((Number(gridUpperPrice) - Number(gridLowerPrice)) / Number(gridCount || 1)).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Estimasi Profit / Grid:</span>
                    <span className="text-emerald-400 font-bold">
                      ~{(((Number(gridUpperPrice) - Number(gridLowerPrice)) / Number(gridLowerPrice || 1) / Number(gridCount || 1)) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Menerapkan Grid Order...' : '🚀 Luncurkan Spot Grid Bot'}
                </button>
              </form>
            )}

            {/* STRATEGY 2: LAYERED ORDERS LADDER */}
            {activeStrategy === 'LAYERS' && (
              <form onSubmit={handleDeployLayers} className="space-y-4 text-xs">
                <div className="p-3 bg-[#101622] rounded border border-[#141a23] text-slate-300 space-y-1">
                  <span className="font-bold text-slate-100 block">Auto Create Limit Order Layers</span>
                  <p className="text-[11px] text-slate-400">
                    Membangun tangga likuiditas (*liquidity ladder*) berundak untuk masuk posisi (Buy) atau *take-profit* bertahap (Sell). Semua limit order otomatis masuk ke <strong>Order Aktif</strong> akun Anda.
                  </p>
                </div>

                {/* Buy vs Sell side */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLayerSide('BUY');
                      setLayerStartPrice(Math.round(midPriceDisplay * 0.99).toString());
                    }}
                    className={`py-2 rounded font-bold border transition-colors ${
                      layerSide === 'BUY'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-[#141a23] border-[#1e2633] text-slate-400'
                    }`}
                  >
                    🟢 Buy Layers (Tangga Beli)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLayerSide('SELL');
                      setLayerStartPrice(Math.round(midPriceDisplay * 1.01).toString());
                    }}
                    className={`py-2 rounded font-bold border transition-colors ${
                      layerSide === 'SELL'
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-[#141a23] border-[#1e2633] text-slate-400'
                    }`}
                  >
                    🔴 Sell Layers (Tangga Jual)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Harga Awal Layer #1 (IDR):</label>
                    <input
                      type="number"
                      value={layerStartPrice}
                      onChange={e => setLayerStartPrice(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Jumlah Layer (2 - 20):</label>
                    <input
                      type="number"
                      value={layerCount}
                      min={2}
                      max={20}
                      onChange={e => setLayerCount(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Jarak Antar Layer (% Spread Step):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={layerStepPercent}
                      onChange={e => setLayerStepPercent(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Kuantitas per Layer ({selectedPair.baseCurrency}):</label>
                    <input
                      type="number"
                      step="any"
                      value={layerQty}
                      onChange={e => setLayerQty(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors shadow-md"
                >
                  {isLoading ? 'Menerapkan Layers...' : `⚡ Deploy ${layerCount} Layer ${layerSide} Orders`}
                </button>
              </form>
            )}

            {/* STRATEGY 3: AUTO SMART TRADE */}
            {activeStrategy === 'SMART' && (
              <form onSubmit={handleDeploySmartTrade} className="space-y-4 text-xs">
                <div className="p-3 bg-[#101622] rounded border border-[#141a23] text-slate-300 space-y-1">
                  <span className="font-bold text-slate-100 block">Auto Smart Trade & Slicer (TWAP / Volume Target)</span>
                  <p className="text-[11px] text-slate-400">
                    Mengeksekusi akumulasi atau likuidasi volume target secara bertahap untuk meminimalkan dampak pasar (*slippage minimizer*).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSmartSide('BUY')}
                    className={`py-2 rounded font-bold border transition-colors ${
                      smartSide === 'BUY'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-[#141a23] border-[#1e2633] text-slate-400'
                    }`}
                  >
                    🟢 Smart Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmartSide('SELL')}
                    className={`py-2 rounded font-bold border transition-colors ${
                      smartSide === 'SELL'
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-[#141a23] border-[#1e2633] text-slate-400'
                    }`}
                  >
                    🔴 Smart Sell
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Target Harga Eksekusi (IDR):</label>
                    <input
                      type="number"
                      value={smartTargetPrice}
                      onChange={e => setSmartTargetPrice(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Total Target Volume ({selectedPair.baseCurrency}):</label>
                    <input
                      type="number"
                      step="any"
                      value={smartTotalVol}
                      onChange={e => setSmartTotalVol(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Jumlah Slice Pemecah Order:</label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={smartSliceCount}
                      onChange={e => setSmartSliceCount(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Tipe Eksekusi Slice:</label>
                    <select
                      value={smartOrderType}
                      onChange={e => setSmartOrderType(e.target.value as any)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                    >
                      <option value="LIMIT">Limit Order (Buku Order)</option>
                      <option value="MARKET">Market Order</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors shadow-md"
                >
                  {isLoading ? 'Menginisialisasi Smart Trade...' : '🎯 Jalankan Auto Smart Trade'}
                </button>
              </form>
            )}

            {/* STRATEGY 4: BOT VOLUME (VOLUME MAKER BOT) */}
            {activeStrategy === 'VOLUME' && (
              <form onSubmit={handleDeployVolumeBot} className="space-y-4 text-xs">
                <div className="p-3 bg-rose-950/30 rounded border border-rose-900/60 text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-300 flex items-center gap-1.5">
                      🔥 Bot Volume Maker & Turnover Generator
                    </span>
                    <span className="px-1.5 py-0.2 bg-rose-950 border border-rose-700 text-rose-300 text-[9px] font-mono font-bold rounded">
                      AUTO TARGET
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Mengeksekusi transaksi bursa secara berkala dengan interval detik tertentu untuk mencapai target volume perdagangan (*target volume reach*), menjaga likuiditas, dan memicu volume 24 jam pasar.
                  </p>
                </div>

                {/* 1. Target Volume Reach */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 font-bold">
                      Target Volume Reach ({selectedPair.baseCurrency}):
                    </label>
                    <span className="text-[11px] font-mono text-emerald-400">
                      Batas akhir otomatis
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={volTargetVolume}
                    onChange={e => setVolTargetVolume(e.target.value)}
                    placeholder="Contoh: 5.0"
                    className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 font-mono text-sm text-emerald-400 font-bold focus:outline-none focus:border-rose-500"
                    required
                  />
                  <div className="flex gap-2 mt-1.5">
                    {(selectedPair.baseCurrency === 'BTC' ? ['0.5', '1.0', '2.5', '5.0'] :
                      selectedPair.baseCurrency === 'ETH' ? ['5.0', '10.0', '25.0', '50.0'] :
                      ['1000', '2500', '5000', '10000']
                    ).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setVolTargetVolume(val)}
                        className="px-2 py-0.5 bg-[#141a23] hover:bg-slate-700 text-slate-300 rounded font-mono text-[10px]"
                      >
                        {val} {selectedPair.baseCurrency}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Min Price & Max Price */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 font-bold">
                      Rentang Harga Eksekusi (Min & Max Price IDR):
                    </label>
                    <div className="flex gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => { applyPercentPreset(-1, 'VOL_MIN'); applyPercentPreset(1, 'VOL_MAX'); }}
                        className="px-1.5 py-0.2 bg-[#141a23] text-slate-300 rounded hover:bg-slate-700 font-mono"
                      >
                        ±1%
                      </button>
                      <button
                        type="button"
                        onClick={() => { applyPercentPreset(-2, 'VOL_MIN'); applyPercentPreset(2, 'VOL_MAX'); }}
                        className="px-1.5 py-0.2 bg-[#141a23] text-slate-300 rounded hover:bg-slate-700 font-mono"
                      >
                        ±2%
                      </button>
                      <button
                        type="button"
                        onClick={() => { applyPercentPreset(-5, 'VOL_MIN'); applyPercentPreset(5, 'VOL_MAX'); }}
                        className="px-1.5 py-0.2 bg-[#141a23] text-slate-300 rounded hover:bg-slate-700 font-mono"
                      >
                        ±5%
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Min Price:</span>
                      <input
                        type="number"
                        value={volMinPrice}
                        onChange={e => setVolMinPrice(e.target.value)}
                        className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Max Price:</span>
                      <input
                        type="number"
                        value={volMaxPrice}
                        onChange={e => setVolMaxPrice(e.target.value)}
                        className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Delay Second Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Delay Antar Order (Detik):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={volDelaySeconds}
                      onChange={e => setVolDelaySeconds(e.target.value)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                      required
                    />
                    <div className="flex gap-1.5 mt-1">
                      {['1', '2', '3', '5'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setVolDelaySeconds(s)}
                          className="px-2 py-0.5 bg-[#141a23] text-slate-300 rounded text-[10px] font-mono hover:bg-slate-700"
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Direction Mode: BUY_FIRST, SELL_FIRST, RANDOM */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      Urutan Arah Eksekusi:
                    </label>
                    <select
                      value={volDirectionMode}
                      onChange={e => setVolDirectionMode(e.target.value as any)}
                      className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-sans text-xs text-slate-100 focus:outline-none"
                    >
                      <option value="RANDOM">🎲 Random (Acak Beli/Jual)</option>
                      <option value="BUY_FIRST">🟢 Buy First (Beli lalu Jual)</option>
                      <option value="SELL_FIRST">🔴 Sell First (Jual lalu Beli)</option>
                    </select>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {volDirectionMode === 'RANDOM' ? 'Arah acak tiap tick' : 'Bergantian net-neutral'}
                    </span>
                  </div>
                </div>

                {/* 5. Amount Random vs Fixed */}
                <div className="p-3 bg-[#101622] rounded border border-[#141a23] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={volAmountRandom}
                        onChange={e => setVolAmountRandom(e.target.checked)}
                        className="rounded border-[#1e2633] text-rose-600 focus:ring-0"
                      />
                      <span className="font-bold text-slate-200">Randomize Kuantitas per Order</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {volAmountRandom ? 'Rentang Min - Max' : 'Kuantitas Tetap'}
                    </span>
                  </div>

                  {volAmountRandom ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Min Kuantitas:</span>
                        <input
                          type="number"
                          step="any"
                          value={volAmountMin}
                          onChange={e => setVolAmountMin(e.target.value)}
                          className="w-full bg-[#141a23] border border-[#1e2633] rounded p-1.5 font-mono text-slate-100 focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Max Kuantitas:</span>
                        <input
                          type="number"
                          step="any"
                          value={volAmountMax}
                          onChange={e => setVolAmountMax(e.target.value)}
                          className="w-full bg-[#141a23] border border-[#1e2633] rounded p-1.5 font-mono text-slate-100 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Kuantitas Tetap Tiap Order:</span>
                      <input
                        type="number"
                        step="any"
                        value={volAmountMin}
                        onChange={e => setVolAmountMin(e.target.value)}
                        className="w-full bg-[#141a23] border border-[#1e2633] rounded p-1.5 font-mono text-slate-100 focus:outline-none"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Estimation Preview */}
                <div className="p-3 bg-[#141a23]/50 border border-[#1e2633] rounded text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Estimasi Jumlah Transaksi:</span>
                    <span className="text-slate-200 font-bold">
                      ~{Math.round(Number(volTargetVolume || 1) / ((Number(volAmountMin || 0.01) + Number(volAmountMax || 0.05)) / 2))} trade
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Estimasi Durasi Penyelesaian:</span>
                    <span className="text-rose-400 font-bold">
                      ~{Math.round((Math.round(Number(volTargetVolume || 1) / ((Number(volAmountMin || 0.01) + Number(volAmountMax || 0.05)) / 2)) * Number(volDelaySeconds || 3)) / 60)} menit
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Menginisialisasi Bot Volume...' : `🔥 Luncurkan Bot Volume (Target: ${volTargetVolume} ${selectedPair.baseCurrency})`}
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Active Bots & Real-Time Terminal Logs */}
          <div className="lg:col-span-6 space-y-4">
            {/* Active Bots Status Cards */}
            <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200">Daftar Bot Berjalan ({bots.length})</h3>
                <span className="text-[11px] text-slate-500 font-mono">Akun: {user.email}</span>
              </div>

              {bots.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-600">
                  Belum ada strategi bot yang aktif. Konfigurasikan strategi di sebelah kiri untuk memulai.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {bots.map(b => {
                    const isVolumeBot = b.strategy === 'VOLUME_BOT';
                    const targetVol = b.config?.targetVolumeReach || '1';
                    const filledVol = b.totalVolumeFilled || '0';
                    const pct = Math.min(100, Math.round((Number(filledVol) / Number(targetVol || 1)) * 100));

                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBotId(b.id)}
                        className={`p-3 rounded border cursor-pointer transition-colors text-xs ${
                          selectedBotId === b.id
                            ? 'bg-[#141a23] border-blue-500'
                            : 'bg-[#101622] border-[#1e2633] hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${b.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : b.status === 'COMPLETED' ? 'bg-blue-400' : 'bg-slate-500'}`} />
                            <span className="font-bold text-slate-200">{b.name}</span>
                            {isVolumeBot && (
                              <span className="px-1.5 py-0.2 bg-rose-950 border border-rose-800 text-rose-300 text-[9px] font-bold rounded">
                                VOLUME
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-blue-400 font-semibold">
                            {b.deployedOrderIds.length} Order
                          </span>
                        </div>

                        {/* Progress bar for Volume Bot */}
                        {isVolumeBot && (
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                              <span>Volume Tercapai:</span>
                              <span className="text-rose-400 font-bold">
                                {Number(filledVol).toFixed(4)} / {targetVol} {b.pairId.split('-')[0]} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full bg-[#1e2633] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-rose-500 h-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                          <span>Status: <strong className={b.status === 'RUNNING' ? 'text-emerald-400' : b.status === 'COMPLETED' ? 'text-blue-400' : 'text-slate-400'}>{b.status}</strong></span>
                          {b.status === 'RUNNING' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStopBot(b.id);
                              }}
                              className="px-2.5 py-0.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded font-medium"
                            >
                              Hentikan
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Real-Time Live Execution Terminal */}
            <div className="bg-[#080b0f] border border-[#1e2633] rounded-lg overflow-hidden flex flex-col h-[340px]">
              <div className="flex items-center justify-between px-3 py-2 bg-[#0d121b] border-b border-[#1e2633] text-xs">
                <span className="font-mono text-slate-300 flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">›_</span> Live Bot Terminal Stream
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {selectedBot ? selectedBot.id : 'READY'}
                </span>
              </div>

              <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1 text-slate-300">
                {!selectedBot || selectedBot.logs.length === 0 ? (
                  <div className="text-slate-600 italic">Menunggu log transaksi bot...</div>
                ) : (
                  selectedBot.logs.map((log: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-slate-500 select-none">[{formatDateTime(log.timestamp)}]</span>
                      <span className={
                        log.type === 'ORDER' ? 'text-blue-400 font-bold' :
                        log.type === 'FILL' ? 'text-emerald-400 font-bold' :
                        log.type === 'ERROR' ? 'text-red-400 font-bold' : 'text-slate-300'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: BOT ACTIVE OPEN ORDERS TABLE */
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2633] pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200">
                Daftar Order Aktif Hasil Eksekusi Bot ({botOpenOrders.length})
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Semua order ini terdaftar resmi atas nama akun Anda <strong>({user.role === 'admin' ? '👑 Admin' : '👤 Trader'}: {user.email})</strong> di matching engine.
              </p>
            </div>
            <button
              type="button"
              onClick={loadBotOpenOrders}
              className="px-2.5 py-1 bg-[#141a23] hover:bg-slate-700 text-slate-300 text-xs rounded border border-[#1e2633]"
            >
              🔄 Refresh Order
            </button>
          </div>

          <div className="overflow-x-auto min-h-[220px]">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#101622] text-[11px] text-slate-400 font-sans border-b border-[#1e2633]">
                <tr>
                  <th className="px-4 py-2">Waktu</th>
                  <th className="px-4 py-2">Client Order ID</th>
                  <th className="px-4 py-2">Pair</th>
                  <th className="px-4 py-2">Sisi</th>
                  <th className="px-4 py-2 text-right">Harga Limit</th>
                  <th className="px-4 py-2 text-right">Jumlah</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141a23]">
                {botOpenOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-600 font-sans text-xs">
                      Tidak ada order limit bot yang aktif saat ini.
                    </td>
                  </tr>
                ) : (
                  botOpenOrders.map(order => {
                    const isBuy = order.side === 'BUY';
                    const baseDecimals = order.pairId.startsWith('BTC') ? 8 : order.pairId.startsWith('ETH') ? 8 : 6;
                    return (
                      <tr key={order.id} className="hover:bg-[#141a23]/50 transition-colors">
                        <td className="px-4 py-2 text-slate-400 text-[11px]">
                          {formatDateTime(order.createdAt)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 bg-blue-950/70 border border-blue-800 text-blue-300 text-[10px] rounded font-mono">
                            {order.clientOrderId || order.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-bold text-slate-200">
                          {order.pairId}
                        </td>
                        <td className="px-4 py-2 font-bold">
                          <span className={isBuy ? 'text-emerald-400' : 'text-red-400'}>
                            {isBuy ? 'BELI' : 'JUAL'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-200">
                          {formatIDR(order.price, false)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-300">
                          {formatCrypto(order.quantity, baseDecimals)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-amber-400 font-bold text-[11px]">
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleCancelSingleOrder(order.id, order.pairId)}
                            className="px-2 py-0.5 text-[11px] font-sans font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors border border-red-900/40"
                          >
                            Batal
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
