/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/App.tsx
 * DIMONEX Spot Crypto Exchange — Master Application Component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/layout/Navbar.js';
import { TradingChart } from './components/trading/TradingChart.js';
import { OrderBookView } from './components/trading/OrderBookView.js';
import { DepthChart } from './components/trading/DepthChart.js';
import { RecentTradesView } from './components/trading/RecentTradesView.js';
import { OrderPlacementForm } from './components/trading/OrderPlacementForm.js';
import { UserOrdersTable } from './components/trading/UserOrdersTable.js';
import { WalletView } from './components/wallet/WalletView.js';
import { KycView } from './components/kyc/KycView.js';
import { SecurityView } from './components/security/SecurityView.js';
import { AdminView } from './components/admin/AdminView.js';
import { BotConsoleView } from './components/bot/BotConsoleView.js';
import { MMConsoleView } from './components/bot/MMConsoleView.js';
import { AuthModal } from './components/auth/AuthModal.js';
import { TradingPairItem, TradeItem, OrderItem, UserProfile, UserBalance, AppLanguage } from './types/index.js';
import { formatIDR, formatCrypto } from './lib/formatters.js';

export default function App() {
  const [currentView, setCurrentViewState] = useState<'TRADE' | 'BOT' | 'WALLET' | 'KYC' | 'SECURITY' | 'ADMIN'>(() => {
    const saved = localStorage.getItem('dimonex_view');
    if (saved && ['TRADE', 'BOT', 'WALLET', 'KYC', 'SECURITY', 'ADMIN'].includes(saved)) {
      return saved as any;
    }
    return 'TRADE';
  });
  const [botConsoleMode, setBotConsoleMode] = useState<'MM_CONSOLE' | 'QUICK_BOTS'>('MM_CONSOLE');
  const [lang, setLangState] = useState<AppLanguage>(() => {
    return (localStorage.getItem('dimonex_lang') as AppLanguage) || 'ID';
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isQuickLoggingIn, setIsQuickLoggingIn] = useState(false);

  // Market tab mode: 'BOOK' (Order Book L2), 'TRADES' (Live Trades), 'CHART' (Depth Curve), or 'SPLIT' (Side-by-side)
  const [marketTab, setMarketTabState] = useState<'BOOK' | 'TRADES' | 'CHART' | 'SPLIT'>(() => {
    const saved = localStorage.getItem('dimonex_market_tab');
    if (saved && ['BOOK', 'TRADES', 'CHART', 'SPLIT'].includes(saved)) {
      return saved as any;
    }
    return 'BOOK';
  });

  // Trading data state
  const [pairs, setPairs] = useState<TradingPairItem[]>([]);
  const [selectedPairId, setSelectedPairIdState] = useState<string>(() => {
    return localStorage.getItem('dimonex_pair') || 'BTC-IDR';
  });
  const [selectedPriceForOrder, setSelectedPriceForOrder] = useState<string | null>(null);

  // Persistent state helper actions
  const handleSelectView = (view: 'TRADE' | 'BOT' | 'WALLET' | 'KYC' | 'SECURITY' | 'ADMIN') => {
    setCurrentViewState(view);
    localStorage.setItem('dimonex_view', view);
  };

  const handleSelectPair = (pairId: string) => {
    setSelectedPairIdState(pairId);
    localStorage.setItem('dimonex_pair', pairId);
  };

  const handleSelectMarketTab = (tab: 'BOOK' | 'TRADES' | 'CHART' | 'SPLIT') => {
    setMarketTabState(tab);
    localStorage.setItem('dimonex_market_tab', tab);
  };

  const handleToggleLang = () => {
    setLangState(prev => {
      const next = prev === 'ID' ? 'EN' : 'ID';
      localStorage.setItem('dimonex_lang', next);
      return next;
    });
  };

  // Instant demo account login (Phase 2: user1, user2, mm, admin)
  const quickLogin = async (email: string, pass: string) => {
    setIsQuickLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('dimonex_auth_token', data.token);
        setUser({
          ...data.user,
          kycStatus: 'approved',
          kycTier: 2,
          fullName: data.user.email.includes('admin')
            ? 'Super Admin DIMONEX'
            : data.user.email.includes('mm')
            ? 'Market Maker Operator'
            : data.user.email.includes('user1') || data.user.email.includes('budi')
            ? 'User 1 (Regular Trader)'
            : 'User 2 (Regular Trader)'
        });
        refreshBalances();
        refreshUserOrders();
      }
    } catch (e) {
      console.error('Quick login failed:', e);
    } finally {
      setIsQuickLoggingIn(false);
    }
  };

  // Order Book & Trades
  const [depth, setDepth] = useState<{ bids: [string, string, string][]; asks: [string, string, string][]; spread: string }>({
    bids: [],
    asks: [],
    spread: '0'
  });
  const [recentTrades, setRecentTrades] = useState<TradeItem[]>([]);

  // User private state
  const [balances, setBalances] = useState<UserBalance[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Compute active user order prices and order summaries for Order Book and Depth Chart
  const { myOpenOrderPrices, myOrdersByPrice } = React.useMemo(() => {
    const prices = new Set<string>();
    const byPrice = new Map<string, { count: number; totalQty: string; isBot: boolean }>();

    for (const order of openOrders) {
      if (order.pairId === selectedPairId && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
        let normPrice = order.price;
        try {
          normPrice = BigInt(order.price).toString();
        } catch {
          normPrice = order.price;
        }

        prices.add(normPrice);
        prices.add(order.price); // Also add raw price for fallback

        const existing = byPrice.get(normPrice);
        const isBot = Boolean(
          order.clientOrderId &&
          (order.clientOrderId.startsWith('bot-') ||
           order.clientOrderId.includes('-ord-') ||
           order.clientOrderId.includes('-vol-'))
        );
        const remainingQty = (BigInt(order.quantity) - BigInt(order.filledQuantity)).toString();

        if (existing) {
          existing.count += 1;
          existing.totalQty = (BigInt(existing.totalQty) + BigInt(remainingQty)).toString();
          if (isBot) existing.isBot = true;
        } else {
          byPrice.set(normPrice, {
            count: 1,
            totalQty: remainingQty,
            isBot
          });
        }
      }
    }

    return { myOpenOrderPrices: prices, myOrdersByPrice: byPrice };
  }, [openOrders, selectedPairId]);

  // Load Initial Session & Trading Pairs
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    // 1. Fetch Trading Pairs
    try {
      const res = await fetch('/api/trading/pairs');
      if (res.ok) {
        const data = await res.json();
        setPairs(data);
      }
    } catch (e) {}

    // 2. Fetch User Profile if token exists
    const token = localStorage.getItem('dimonex_auth_token');
    if (token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser({
            ...data.user,
            kycStatus: data.kyc?.status || 'unverified',
            kycTier: data.kyc?.tierLevel || 1,
            fullName: data.kyc?.fullName
          });
          refreshBalances();
          refreshUserOrders();
        } else {
          localStorage.removeItem('dimonex_auth_token');
        }
      } catch (e) {}
    }
  };

  const refreshBalances = useCallback(async () => {
    const token = localStorage.getItem('dimonex_auth_token');
    if (!token) return;
    try {
      const res = await fetch('/api/wallet/balances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setBalances(await res.json());
      }
    } catch (e) {}
  }, []);

  const refreshUserOrders = useCallback(async () => {
    const token = localStorage.getItem('dimonex_auth_token');
    if (!token) return;
    setIsLoadingOrders(true);
    try {
      const [openRes, histRes] = await Promise.all([
        fetch('/api/trading/orders/open', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/trading/orders/history', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (openRes.ok) setOpenOrders(await openRes.json());
      if (histRes.ok) setOrderHistory(await histRes.json());
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  // Fetch Depth and Trades when pair changes or after actions
  const fetchPairMarketData = useCallback(async () => {
    if (!selectedPairId) return;
    try {
      const [dRes, tRes] = await Promise.all([
        fetch(`/api/trading/depth/${selectedPairId}`),
        fetch(`/api/trading/trades/${selectedPairId}`)
      ]);
      if (dRes.ok) setDepth(await dRes.json());
      if (tRes.ok) setRecentTrades(await tRes.json());
    } catch (e) {}
  }, [selectedPairId]);

  // Initial fetch for market data
  useEffect(() => {
    fetchPairMarketData();
  }, [fetchPairMarketData]);

  // Periodic background fallback sync (every 2.5s) to guarantee active orders & depth never freeze
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPairMarketData();
      if (localStorage.getItem('dimonex_auth_token')) {
        refreshUserOrders();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchPairMarketData, refreshUserOrders]);

  // Real-time WebSocket connection with automatic reconnect
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const connectWs = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        // Subscribe to depth, trades, and ticker
        socket.send(JSON.stringify({
          action: 'subscribe',
          channel: `depth:${selectedPairId}`
        }));
        socket.send(JSON.stringify({
          action: 'subscribe',
          channel: `trades:${selectedPairId}`
        }));
        socket.send(JSON.stringify({
          action: 'subscribe',
          channel: 'ticker'
        }));
        if (user) {
          socket.send(JSON.stringify({
            action: 'subscribe',
            channel: `orders:${user.id}`,
            userId: user.id
          }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const isDepthMsg = msg.type === 'depth' || (msg.type === 'snapshot' && msg.channel?.startsWith('depth:'));
          if (isDepthMsg && (msg.pairId === selectedPairId || msg.channel === `depth:${selectedPairId}`)) {
            if (msg.data && Array.isArray(msg.data.bids) && Array.isArray(msg.data.asks)) {
              setDepth(msg.data);
            }
          } else if (msg.type === 'trade' && msg.data?.pairId === selectedPairId) {
            setRecentTrades(prev => [msg.data, ...prev.slice(0, 49)]);
          } else if (msg.type === 'ticker' && msg.pair) {
            setPairs(prev => prev.map(p => p.id === msg.pair.id ? msg.pair : p));
          } else if (msg.type === 'order_update' || msg.type === 'trade_notification') {
            refreshBalances();
            refreshUserOrders();
            fetchPairMarketData();
          }
        } catch (err) {}
      };

      socket.onclose = () => {
        if (!isDisposed) {
          reconnectTimer = setTimeout(connectWs, 1500);
        }
      };

      socket.onerror = () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    };

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [selectedPairId, user?.id, refreshBalances, refreshUserOrders, fetchPairMarketData]);

  // Cancel Order Handler
  const handleCancelOrder = async (orderId: string, pairId: string) => {
    const token = localStorage.getItem('dimonex_auth_token');
    if (!token) return;

    const res = await fetch('/api/trading/order/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ orderId, pairId })
    });

    if (res.ok) {
      refreshUserOrders();
      refreshBalances();
      fetchPairMarketData();
    } else {
      const err = await res.json();
      alert(err.error || 'Gagal membatalkan order');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dimonex_auth_token');
    setUser(null);
    setBalances([]);
    setOpenOrders([]);
    setOrderHistory([]);
  };

  const selectedPair = pairs.find(p => p.id === selectedPairId) || pairs[0] || {
    id: 'BTC-IDR',
    baseCurrency: 'BTC',
    quoteCurrency: 'IDR',
    baseDecimals: 8,
    quoteDecimals: 2,
    minOrderSize: '1000',
    maxOrderSize: '1000000000',
    makerFeeBps: 10,
    takerFeeBps: 20,
    isActive: true,
    isHalted: false,
    lastPrice: '145000000000',
    high24h: '148000000000',
    low24h: '143500000000',
    volume24h: '2450000000',
    priceChange24h: '+2.85'
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Bar Contract Navigation */}
      {/* Top Bar Contract Navigation */}
      <Navbar
        currentView={currentView}
        onSelectView={handleSelectView}
        user={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        lang={lang}
        onToggleLang={handleToggleLang}
      />

      {/* Persistent Demo Account Quick Access & Role Switcher Ribbon (Phase 2) */}
      <div className="bg-[#0f172a] border-b border-[#1e293b] px-4 py-2 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">Akun Testing (Phase 2):</span>
          <span className="text-slate-400 hidden xl:inline">Pilih akun untuk simulasi trading, matching engine, atau MM Console:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={isQuickLoggingIn}
            onClick={() => quickLogin('user1@dimonex.id', 'User1Dimonex2026!')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              user?.email === 'user1@dimonex.id'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                : 'bg-[#1e293b] hover:bg-[#283548] text-slate-200 border border-[#334155]'
            }`}
          >
            <span>👤</span>
            <span>User 1 (Regular)</span>
          </button>
          <button
            type="button"
            disabled={isQuickLoggingIn}
            onClick={() => quickLogin('user2@dimonex.id', 'User2Dimonex2026!')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              user?.email === 'user2@dimonex.id'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                : 'bg-[#1e293b] hover:bg-[#283548] text-slate-200 border border-[#334155]'
            }`}
          >
            <span>👤</span>
            <span>User 2 (Regular)</span>
          </button>
          <button
            type="button"
            disabled={isQuickLoggingIn}
            onClick={() => quickLogin('mm@dimonex.id', 'MarketMaker2026!')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              user?.email === 'mm@dimonex.id'
                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                : 'bg-[#1e293b] hover:bg-[#283548] text-indigo-300 border border-indigo-500/30'
            }`}
          >
            <span>🤖</span>
            <span>MM (Market Maker)</span>
          </button>
          <button
            type="button"
            disabled={isQuickLoggingIn}
            onClick={() => quickLogin('admin@dimonex.id', 'AdminDimonex2026!')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              user?.email === 'admin@dimonex.id'
                ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
                : 'bg-[#1e293b] hover:bg-[#283548] text-amber-300 border border-amber-500/30'
            }`}
          >
            <span>👑</span>
            <span>Admin (Bursa)</span>
          </button>
          {!user && (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition cursor-pointer"
            >
              Masuk / Daftar
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-[1780px] w-full mx-auto px-3 sm:px-4 md:px-6 py-4">
        {currentView === 'TRADE' && (
          <div className="space-y-4">
            {/* Pro-Tier Market Ticker Strip Bar */}
            <div className="bg-[#0b0e14] border border-[#1e2633] rounded-xl p-3 shadow-md flex flex-wrap items-center justify-between gap-4">
              {/* Pair Selector & Fast Chips */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Fast Pair Switch Chips */}
                <div className="flex items-center gap-1.5 bg-[#141a23] p-1 rounded-lg border border-[#1e2633]">
                  {pairs.map(p => {
                    const isSelected = p.id === selectedPairId;
                    const isUp = p.priceChange24h.startsWith('+');
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPair(p.id)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
                        }`}
                      >
                        <span>{p.baseCurrency}</span>
                        <span className={`text-[10px] font-mono font-medium ${
                          isSelected ? 'text-blue-100' : isUp ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {p.priceChange24h}%
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Dropdown for extensible pair list */}
                <select
                  value={selectedPairId}
                  onChange={e => handleSelectPair(e.target.value)}
                  className="bg-[#141a23] border border-[#1e2633] rounded-lg px-2.5 py-1 text-xs font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-blue-500"
                >
                  {pairs.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.id} ({p.baseCurrency}/IDR)
                    </option>
                  ))}
                </select>

                {/* Last Traded Price Display */}
                <div className="flex items-baseline gap-2 border-l border-[#1e2633] pl-3">
                  <span className="text-xl md:text-2xl font-extrabold font-mono tabular-nums text-slate-100">
                    {formatIDR(selectedPair.lastPrice, true)}
                  </span>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    selectedPair.priceChange24h.startsWith('+')
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}>
                    {selectedPair.priceChange24h}%
                  </span>
                </div>
              </div>

              {/* 24h Stats and Quick Shortcuts */}
              <div className="flex flex-wrap items-center gap-5 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider">24h Tertinggi</span>
                  <span className="text-slate-200 font-bold">{formatIDR(selectedPair.high24h, false)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider">24h Terendah</span>
                  <span className="text-slate-200 font-bold">{formatIDR(selectedPair.low24h, false)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider">24h Vol ({selectedPair.baseCurrency})</span>
                  <span className="text-slate-200 font-bold">
                    {formatCrypto(selectedPair.volume24h, selectedPair.baseDecimals, selectedPair.baseCurrency)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Maker / Taker Fee</span>
                  <span className="text-blue-400 font-bold">
                    {selectedPair.makerFeeBps / 100}% / {selectedPair.takerFeeBps / 100}%
                  </span>
                </div>

                {selectedPair.isHalted && (
                  <span className="px-2 py-0.5 bg-red-950 border border-red-800 text-red-400 font-sans font-bold text-[11px] rounded animate-pulse">
                    TRADING DIHENTIKAN
                  </span>
                )}

                {/* Direct Shortcuts */}
                <div className="hidden xl:flex items-center gap-2 border-l border-[#1e2633] pl-4">
                  <button
                    onClick={() => handleSelectView('BOT')}
                    className="px-2.5 py-1 text-xs font-sans font-semibold rounded-lg bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-300 transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <span>⚡ Bot Algo</span>
                  </button>
                  <button
                    onClick={() => handleSelectView('WALLET')}
                    className="px-2.5 py-1 text-xs font-sans font-semibold rounded-lg bg-[#141a23] hover:bg-[#1a2230] border border-[#1e2633] text-slate-300 transition-colors flex items-center gap-1"
                  >
                    <span>💰 Dompet</span>
                  </button>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-sans pl-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Live WS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Trading Workspace Grid (Chart + Orders on Left, Execution + Market Depth on Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left / Center Column (Interactive Chart + Paginated Orders) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                <TradingChart pair={selectedPair} recentTrades={recentTrades} />
                <UserOrdersTable
                  openOrders={openOrders}
                  orderHistory={orderHistory}
                  onCancelOrder={handleCancelOrder}
                  isLoading={isLoadingOrders}
                  currentUserEmail={user?.email}
                  userRole={user?.role}
                />
              </div>

              {/* Right Column (Order Placement Form + Modular Market Depth / Trades Center) */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                {/* 1. Order Placement Form */}
                <OrderPlacementForm
                  pair={selectedPair}
                  user={user}
                  balances={balances}
                  selectedPriceUnits={selectedPriceForOrder}
                  onOrderPlaced={() => {
                    refreshBalances();
                    refreshUserOrders();
                    fetchPairMarketData();
                  }}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                />

                {/* 2. Modular Market Depth & Trades Center */}
                <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-xl overflow-hidden shadow-lg">
                  {/* Tab Navigation Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2633] bg-[#0d121b]">
                    <div className="flex items-center gap-1 bg-[#141a23] p-0.5 rounded-lg border border-[#1e2633] text-xs">
                      <button
                        type="button"
                        onClick={() => handleSelectMarketTab('BOOK')}
                        className={`px-2.5 py-1 font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          marketTab === 'BOOK'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
                        }`}
                      >
                        <span>📖 Buku Order (L2)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectMarketTab('TRADES')}
                        className={`px-2.5 py-1 font-bold rounded-md transition-all flex items-center gap-1.5 ${
                          marketTab === 'TRADES'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
                        }`}
                      >
                        <span>⚡ Transaksi</span>
                        <span className="px-1 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {recentTrades.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectMarketTab('CHART')}
                        className={`px-2.5 py-1 font-bold rounded-md transition-all ${
                          marketTab === 'CHART'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
                        }`}
                      >
                        <span>📈 Depth Curve</span>
                      </button>
                    </div>

                    {/* Split View Toggle for wide displays */}
                    <button
                      type="button"
                      onClick={() => handleSelectMarketTab(marketTab === 'SPLIT' ? 'BOOK' : 'SPLIT')}
                      title="Tampilan Split Berdampingan"
                      className={`hidden 2xl:flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                        marketTab === 'SPLIT'
                          ? 'bg-blue-950 text-blue-300 border-blue-700'
                          : 'bg-[#141a23] text-slate-400 border-[#1e2633] hover:text-slate-200'
                      }`}
                    >
                      <span>⚏ Split</span>
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="p-0">
                    {marketTab === 'BOOK' && (
                      <OrderBookView
                        pair={selectedPair}
                        depth={depth}
                        myOpenOrderPrices={myOpenOrderPrices}
                        myOrdersByPrice={myOrdersByPrice}
                        userRole={user?.role}
                        onSelectPrice={setSelectedPriceForOrder}
                      />
                    )}

                    {marketTab === 'TRADES' && (
                      <RecentTradesView
                        pair={selectedPair}
                        trades={recentTrades}
                        currentUserId={user?.id}
                      />
                    )}

                    {marketTab === 'CHART' && (
                      <DepthChart
                        pair={selectedPair}
                        depth={depth}
                        myOpenOrderPrices={myOpenOrderPrices}
                        onSelectPrice={setSelectedPriceForOrder}
                      />
                    )}

                    {marketTab === 'SPLIT' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                        <OrderBookView
                          pair={selectedPair}
                          depth={depth}
                          myOpenOrderPrices={myOpenOrderPrices}
                          myOrdersByPrice={myOrdersByPrice}
                          userRole={user?.role}
                          onSelectPrice={setSelectedPriceForOrder}
                        />
                        <RecentTradesView
                          pair={selectedPair}
                          trades={recentTrades}
                          currentUserId={user?.id}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'BOT' && (
          <div className="space-y-4">
            {/* Console Submode Switcher */}
            <div className="flex items-center justify-between p-2.5 bg-[#0e141f] border border-[#1e293b] rounded-xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBotConsoleMode('MM_CONSOLE')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    botConsoleMode === 'MM_CONSOLE'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Market Maker (MM) Console
                </button>
                <button
                  onClick={() => setBotConsoleMode('QUICK_BOTS')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    botConsoleMode === 'QUICK_BOTS'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quick Spot Grid & Layer Bots
                </button>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {botConsoleMode === 'MM_CONSOLE' 
                  ? 'MM Console: Order Bots, Volume Bots, CSV, Clones & Risk Controls' 
                  : 'Quick Bot Deployer: Spot Grid & Ladder Buy/Sell'}
              </span>
            </div>

            {botConsoleMode === 'MM_CONSOLE' ? (
              <MMConsoleView
                user={user}
                tradingPairs={pairs}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onOpenSecurityView={() => handleSelectView('SECURITY')}
              />
            ) : (
              <BotConsoleView
                user={user}
                tradingPairs={pairs}
                balances={balances}
                onRefreshBalances={refreshBalances}
                onRefreshOrders={refreshUserOrders}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onOpenSecurityView={() => handleSelectView('SECURITY')}
              />
            )}
          </div>
        )}

        {currentView === 'WALLET' && (
          <WalletView
            balances={balances}
            user={user}
            onRefreshBalances={refreshBalances}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenKycView={() => handleSelectView('KYC')}
          />
        )}

        {currentView === 'KYC' && (
          <KycView
            user={user}
            onKycUpdated={fetchInitialData}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {currentView === 'SECURITY' && (
          <SecurityView
            user={user}
            onUserUpdated={fetchInitialData}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {currentView === 'ADMIN' && (
          <AdminView
            user={user}
            tradingPairs={pairs}
            onRefreshPairs={fetchInitialData}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-[#1e2633] bg-[#0b0e14] py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-400">DIMONEX</span>
          <span>·</span>
          <span>PT Dimension Money Exchange Indonesia</span>
          <span>·</span>
          <span>Bappebti & Kominfo Compliant Architecture</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>Proof of Reserves: 100% Invariant Verified</span>
          <span>·</span>
          <span className="text-emerald-400 font-mono">Engine: Single-Thread In-Memory FIFO</span>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(_token, authedUser) => {
          setUser(authedUser);
          fetchInitialData();
        }}
      />
    </div>
  );
}
