/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/bot/MMConsoleView.tsx
 * Complete Market Maker (MM) Console for DIMONEX Exchange.
 * 
 * Features:
 * - 10 Core Navigation Tabs: Overview, Order Bots, Volume and Test Bots, Configurations,
 *   Bot Accounts, Orders, Executed Trades, Activity Logs, Risk Controls, Settings.
 * - Environment Isolation: DEMO / SANDBOX, STAGING, PRODUCTION.
 * - Full Order Bot & Volume Bot form configuration with exact field schemas.
 * - Bot cloning with fresh ID, independent runtime state, and isolated logs.
 * - CSV Import with column validation and row-level preview.
 * - CSV Export for Order and Volume bot configurations.
 * - Server-side Risk Controls and Emergency Kill-Switch.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, TradingPairItem, BotInstance, OrderItem, TradeItem, Environment, BotStatus, BotType } from '../../types/index.js';
import { formatIDR, formatCrypto, formatDateTime } from '../../lib/formatters.js';

interface Props {
  user: UserProfile | null;
  tradingPairs: TradingPairItem[];
  onOpenAuthModal: () => void;
  onOpenSecurityView: () => void;
}

type MMTab = 
  | 'OVERVIEW' 
  | 'EXTERNAL_FEEDS'
  | 'FX_RATES'
  | 'PRICE_FOLLOWER'
  | 'DEPTH_LIQUIDITY'
  | 'ORDER_BOTS' 
  | 'VOLUME_BOTS' 
  | 'CONFIGURATIONS' 
  | 'BOT_ACCOUNTS' 
  | 'ORDERS' 
  | 'EXECUTED_TRADES' 
  | 'ACTIVITY_LOGS' 
  | 'RISK_CONTROLS' 
  | 'SETTINGS';

export const MMConsoleView: React.FC<Props> = ({
  user,
  tradingPairs,
  onOpenAuthModal,
  onOpenSecurityView
}) => {
  const [activeTab, setActiveTabState] = useState<MMTab>(() => {
    return (localStorage.getItem('dimonex_mm_tab') as MMTab) || 'OVERVIEW';
  });
  const setActiveTab = (tab: MMTab) => {
    setActiveTabState(tab);
    localStorage.setItem('dimonex_mm_tab', tab);
  };

  const [currentEnv, setCurrentEnvState] = useState<Environment>(() => {
    return (localStorage.getItem('dimonex_mm_env') as Environment) || 'DEMO';
  });
  const setCurrentEnv = (env: Environment) => {
    setCurrentEnvState(env);
    localStorage.setItem('dimonex_mm_env', env);
  };

  const [selectedPairId, setSelectedPairId] = useState<string>(() => {
    return localStorage.getItem('dimonex_mm_pair') || 'BTC-IDR';
  });
  const setSelectedPair = (pairId: string) => {
    setSelectedPairId(pairId);
    localStorage.setItem('dimonex_mm_pair', pairId);
  };

  // Overview data
  const [overview, setOverview] = useState<any>(null);
  const [instances, setInstances] = useState<BotInstance[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [botLogs, setBotLogs] = useState<any[]>([]);
  const [botOrders, setBotOrders] = useState<OrderItem[]>([]);
  const [botTrades, setBotTrades] = useState<TradeItem[]>([]);
  const [riskControls, setRiskControls] = useState<any>(null);

  // Modal states
  const [isOrderBotModalOpen, setIsOrderBotModalOpen] = useState(false);
  const [isVolumeBotModalOpen, setIsVolumeBotModalOpen] = useState(false);
  const [isPriceFollowerModalOpen, setIsPriceFollowerModalOpen] = useState(false);
  const [isDepthLiquidityModalOpen, setIsDepthLiquidityModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [botToDelete, setBotToDelete] = useState<BotInstance | null>(null);
  const [isKillSwitchConfirmOpen, setIsKillSwitchConfirmOpen] = useState(false);

  // External Feeds & FX Rate State
  const [externalFeeds, setExternalFeeds] = useState<any>(null);
  const [fxData, setFxData] = useState<any>(null);
  const [manualFxRate, setManualFxRate] = useState<string>('16350');
  const [manualFxNotes, setManualFxNotes] = useState<string>('Penyesuaian kurs resmi oleh operator');
  const [manualFxValidityHours, setManualFxValidityHours] = useState<string>('24');
  const [manualFxConfirm, setManualFxConfirm] = useState<boolean>(false);

  // Price Follower Form State
  const [pfName, setPfName] = useState('Price Follower Alpha');
  const [pfPairId, setPfPairId] = useState('BTC-IDR');
  const [pfProvider, setPfProvider] = useState<'AGGREGATED' | 'BINANCE' | 'BYBIT'>('AGGREGATED');
  const [pfTargetSpreadBps, setPfTargetSpreadBps] = useState('40');
  const [pfBuyOffsetBps, setPfBuyOffsetBps] = useState('20');
  const [pfSellOffsetBps, setPfSellOffsetBps] = useState('20');
  const [pfOrderQty, setPfOrderQty] = useState('0.02');
  const [pfRepriceInterval, setPfRepriceInterval] = useState('2000');
  const [pfMinPriceChangeBps, setPfMinPriceChangeBps] = useState('5');
  const [pfDryRun, setPfDryRun] = useState(false);

  // Depth Liquidity Form State
  const [dlName, setDlName] = useState('Depth Liquidity Alpha');
  const [dlPairId, setDlPairId] = useState('BTC-IDR');
  const [dlSource, setDlSource] = useState<'AGGREGATED' | 'BINANCE' | 'BYBIT'>('AGGREGATED');
  const [dlNumBids, setDlNumBids] = useState('3');
  const [dlNumAsks, setDlNumAsks] = useState('3');
  const [dlBidOffsets, setDlBidOffsets] = useState('10, 25, 50');
  const [dlAskOffsets, setDlAskOffsets] = useState('10, 25, 50');
  const [dlBidQuantities, setDlBidQuantities] = useState('0.02, 0.05, 0.10');
  const [dlAskQuantities, setDlAskQuantities] = useState('0.02, 0.05, 0.10');
  const [dlRandomizeQty, setDlRandomizeQty] = useState(false);
  const [dlRandomMinQty, setDlRandomMinQty] = useState('0.01');
  const [dlRandomMaxQty, setDlRandomMaxQty] = useState('0.05');
  const [dlRepriceInterval, setDlRepriceInterval] = useState('3000');
  const [dlDryRun, setDlDryRun] = useState(false);
  const [logFilterMode, setLogFilterMode] = useState<'ALL_SYSTEM' | 'SINGLE_BOT'>('ALL_SYSTEM');
  const [allActivityLogs, setAllActivityLogs] = useState<any[]>([]);
  const [cloneSourceBot, setCloneSourceBot] = useState<BotInstance | null>(null);
  const [cloneNewName, setCloneNewName] = useState('');
  const [cloneTxType, setCloneTxType] = useState<'BUY' | 'SELL' | 'SAME'>('BUY');
  const [orderBotFilter, setOrderBotFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [editingBot, setEditingBot] = useState<BotInstance | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPairId, setEditPairId] = useState('BTC-IDR');
  const [editEnv, setEditEnv] = useState<Environment>('DEMO');
  const [editObTxType, setEditObTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [editObPriceSource, setEditObPriceSource] = useState<'BEST_BID' | 'BEST_ASK' | 'MIDPOINT' | 'LAST_PRICE'>('MIDPOINT');
  const [editObPriceDecimal, setEditObPriceDecimal] = useState('2');
  const [editObQtyDecimal, setEditObQtyDecimal] = useState('8');
  const [editObRandomMinQty, setEditObRandomMinQty] = useState('0.01');
  const [editObRandomMaxQty, setEditObRandomMaxQty] = useState('0.05');
  const [editObOrderCount, setEditObOrderCount] = useState('0'); // 0 = continuous
  const [editObExpireTime, setEditObExpireTime] = useState('0');
  const [editObSplitMode, setEditObSplitMode] = useState<'NONE' | 'RANDOM_SPLIT'>('NONE');
  const [editObSplitRange, setEditObSplitRange] = useState('3');
  const [editObBuyTrailMin, setEditObBuyTrailMin] = useState('0.1');
  const [editObBuyTrailMax, setEditObBuyTrailMax] = useState('0.5');
  const [editObSellTrailMin, setEditObSellTrailMin] = useState('0.1');
  const [editObSellTrailMax, setEditObSellTrailMax] = useState('0.5');
  const [editObBuyMinPrice, setEditObBuyMinPrice] = useState('');
  const [editObBuyMaxPrice, setEditObBuyMaxPrice] = useState('');
  const [editObSellMinPrice, setEditObSellMinPrice] = useState('');
  const [editObSellMaxPrice, setEditObSellMaxPrice] = useState('');
  const [editObJitterTiming, setEditObJitterTiming] = useState('10');
  const [editObJitterPrice, setEditObJitterPrice] = useState('2');

  const [editVbPriceDecimal, setEditVbPriceDecimal] = useState('2');
  const [editVbQtyDecimal, setEditVbQtyDecimal] = useState('8');
  const [editVbRandomMinQty, setEditVbRandomMinQty] = useState('0.02');
  const [editVbRandomMaxQty, setEditVbRandomMaxQty] = useState('0.08');
  const [editVbMinDelay, setEditVbMinDelay] = useState('2');
  const [editVbMaxDelay, setEditVbMaxDelay] = useState('5');
  const [editVbMinDiff, setEditVbMinDiff] = useState('0.01');
  const [editVbMaxDiff, setEditVbMaxDiff] = useState('0.05');
  const [editVbPriority, setEditVbPriority] = useState<'RANDOM' | 'HIGH' | 'NORMAL'>('RANDOM');
  const [editVbMaxLimitPrice, setEditVbMaxLimitPrice] = useState('1550000000');
  const [editVbMinLimitPrice, setEditVbMinLimitPrice] = useState('1400000000');
  const [editVbVolIdrStop, setEditVbVolIdrStop] = useState('5000000000');
  const [editVbVolIdrStart, setEditVbVolIdrStart] = useState('0');
  const [editVbSellAccountId, setEditVbSellAccountId] = useState('');

  // CSV Import state
  const [csvRawText, setCsvRawText] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ totalRows: number; validRowsCount: number; rows: any[]; errors: any[] } | null>(null);
  const [csvImportType, setCsvImportType] = useState<BotType>('ORDER_BOT');

  // Loading & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Order Bot Form state (Exact schema from Phase 7)
  const [obName, setObName] = useState('Order Bot Alpha');
  const [obPairId, setObPairId] = useState('BTC-IDR');
  const [obPriceSource, setObPriceSource] = useState<'BEST_BID' | 'BEST_ASK' | 'MIDPOINT' | 'LAST_PRICE'>('MIDPOINT');
  const [obPriceDecimal, setObPriceDecimal] = useState('2');
  const [obQtyDecimal, setObQtyDecimal] = useState('8');
  const [obRandomMinQty, setObRandomMinQty] = useState('0.01');
  const [obRandomMaxQty, setObRandomMaxQty] = useState('0.05');
  const [obOrderCount, setObOrderCount] = useState('0'); // 0 = continuous / berjalan terus
  const [obExpireTime, setObExpireTime] = useState('0'); // 0 = GTC
  const [obTransactionType, setObTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [obSplitMode, setObSplitMode] = useState<'NONE' | 'RANDOM_SPLIT'>('NONE');
  const [obSplitRange, setObSplitRange] = useState('3');
  const [obBuyTrailMin, setObBuyTrailMin] = useState('0.1');
  const [obBuyTrailMax, setObBuyTrailMax] = useState('0.5');
  const [obSellTrailMin, setObSellTrailMin] = useState('0.1');
  const [obSellTrailMax, setObSellTrailMax] = useState('0.5');
  const [obBuyMinPrice, setObBuyMinPrice] = useState('1300000000');
  const [obBuyMaxPrice, setObBuyMaxPrice] = useState('1600000000');
  const [obSellMinPrice, setObSellMinPrice] = useState('1300000000');
  const [obSellMaxPrice, setObSellMaxPrice] = useState('1650000000');
  const [obJitterTiming, setObJitterTiming] = useState('10');
  const [obJitterPrice, setObJitterPrice] = useState('2');

  // Volume Bot Form state (Exact schema from Phase 9)
  const [vbName, setVbName] = useState('Volume Bot Tier 1');
  const [vbPairId, setVbPairId] = useState('BTC-IDR');
  const [vbPriceDecimal, setVbPriceDecimal] = useState('2');
  const [vbQtyDecimal, setVbQtyDecimal] = useState('8');
  const [vbRandomMinQty, setVbRandomMinQty] = useState('0.02');
  const [vbRandomMaxQty, setVbRandomMaxQty] = useState('0.08');
  const [vbMinDelay, setVbMinDelay] = useState('2');
  const [vbMaxDelay, setVbMaxDelay] = useState('5');
  const [vbMinDiff, setVbMinDiff] = useState('0.01');
  const [vbMaxDiff, setVbMaxDiff] = useState('0.05');
  const [vbPriority, setVbPriority] = useState<'RANDOM' | 'HIGH' | 'NORMAL'>('RANDOM');
  const [vbMaxLimitPrice, setVbMaxLimitPrice] = useState('1550000000');
  const [vbMinLimitPrice, setVbMinLimitPrice] = useState('1400000000');
  const [vbVolIdrStop, setVbVolIdrStop] = useState('5000000000'); // 5B IDR
  const [vbVolIdrStart, setVbVolIdrStart] = useState('0');
  const [vbSellAccountId, setVbSellAccountId] = useState('');

  const selectedPair = tradingPairs.find(p => p.id === selectedPairId) || tradingPairs[0] || {
    id: 'BTC-IDR',
    baseCurrency: 'BTC',
    quoteCurrency: 'IDR',
    baseDecimals: 8,
    quoteDecimals: 2,
    lastPrice: '145000000000'
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('dimonex_auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [ovRes, instRes, ordRes, trdRes, rskRes] = await Promise.all([
        fetch('/api/mm/overview', { headers: getAuthHeaders() }),
        fetch(`/api/mm/instances?environment=${currentEnv}`, { headers: getAuthHeaders() }),
        fetch('/api/mm/orders', { headers: getAuthHeaders() }),
        fetch('/api/mm/trades', { headers: getAuthHeaders() }),
        fetch('/api/mm/risk-controls', { headers: getAuthHeaders() })
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (instRes.ok) {
        const list = await instRes.json();
        setInstances(list);
        if (!selectedBotId && list.length > 0) setSelectedBotId(list[0].id);
      }
      if (ordRes.ok) setBotOrders(await ordRes.json());
      if (trdRes.ok) setBotTrades(await trdRes.json());
      if (rskRes.ok) setRiskControls(await rskRes.json());
    } catch (e) {
      console.error('Error fetching MM Console data:', e);
    }
  }, [user, currentEnv, selectedBotId]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 2500);
    return () => clearInterval(timer);
  }, [loadData]);

  // Load selected bot logs
  useEffect(() => {
    if (!selectedBotId) return;
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/mm/instance/${selectedBotId}/logs`, { headers: getAuthHeaders() });
        if (res.ok) setBotLogs(await res.json());
      } catch (e) {}
    };
    fetchLogs();
    const timer = setInterval(fetchLogs, 2000);
    return () => clearInterval(timer);
  }, [selectedBotId]);

  // Load all system & bot activity logs
  useEffect(() => {
    if (!user) return;
    const fetchAllLogs = async () => {
      try {
        const res = await fetch('/api/mm/activity-all', { headers: getAuthHeaders() });
        if (res.ok) setAllActivityLogs(await res.json());
      } catch (e) {}
    };
    fetchAllLogs();
    const timer = setInterval(fetchAllLogs, 2500);
    return () => clearInterval(timer);
  }, [user]);

  // Load external feeds & FX data
  useEffect(() => {
    if (!user) return;
    const fetchFeedsAndFx = async () => {
      try {
        const [feedsRes, fxRes] = await Promise.all([
          fetch('/api/mm/external-feeds', { headers: getAuthHeaders() }),
          fetch('/api/mm/fx-rate', { headers: getAuthHeaders() })
        ]);
        if (feedsRes.ok) setExternalFeeds(await feedsRes.json());
        if (fxRes.ok) {
          const fx = await fxRes.json();
          setFxData(fx);
          if (fx.currentRate?.rate && (!manualFxRate || manualFxRate === '16350')) {
            setManualFxRate(String(fx.currentRate.rate));
          }
        }
      } catch (e) {}
    };
    fetchFeedsAndFx();
    const timer = setInterval(fetchFeedsAndFx, 3000);
    return () => clearInterval(timer);
  }, [user]);

  const handleAction = async (url: string, method: string, body?: any) => {
    setIsLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Operasi gagal.');

      setFeedbackMsg({ type: 'success', text: data.message || 'Operasi berhasil dieksekusi.' });
      loadData();
      return data;
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Bot Lifecycle Handlers
  const handleStartBot = (id: string) => handleAction(`/api/mm/instance/${id}/start`, 'POST');
  const handlePauseBot = (id: string) => handleAction(`/api/mm/instance/${id}/pause`, 'POST');
  const handleResumeBot = (id: string) => handleAction(`/api/mm/instance/${id}/resume`, 'POST');
  const handleStopBot = (id: string) => handleAction(`/api/mm/instance/${id}/stop`, 'POST', { cancelOpenOrders: true });
  const handleValidateBot = (id: string) => handleAction(`/api/mm/instance/${id}/validate`, 'POST');

  const handleOpenDeleteModal = (bot: BotInstance) => {
    setBotToDelete(bot);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteBot = async () => {
    if (!botToDelete) return;
    try {
      await handleAction(`/api/mm/instance/${botToDelete.id}/delete`, 'POST');
      setIsDeleteModalOpen(false);
      setBotToDelete(null);
      if (selectedBotId === botToDelete.id) {
        setSelectedBotId(null);
      }
    } catch (e) {}
  };

  const handleOpenCloneModal = (bot: BotInstance) => {
    setCloneSourceBot(bot);
    setCloneNewName(`${bot.name} (Clone)`);
    if (bot.orderBotConfig) {
      setCloneTxType(bot.orderBotConfig.transaction_type === 'BUY' ? 'SELL' : 'BUY');
    } else {
      setCloneTxType('SAME');
    }
    setIsCloneModalOpen(true);
  };

  const handleConfirmClone = async () => {
    if (!cloneSourceBot) return;
    try {
      await handleAction('/api/mm/instance/clone', 'POST', {
        sourceBotId: cloneSourceBot.id,
        newName: cloneNewName,
        transaction_type: cloneSourceBot.botType === 'ORDER_BOT' && cloneTxType !== 'SAME' ? cloneTxType : undefined
      });
      setIsCloneModalOpen(false);
    } catch (e) {}
  };

  const handleOpenEditModal = (bot: BotInstance) => {
    setEditingBot(bot);
    setEditName(bot.name);
    setEditPairId(bot.pairId);
    setEditEnv(bot.environment);

    if (bot.orderBotConfig) {
      setEditObTxType(bot.orderBotConfig.transaction_type);
      setEditObPriceSource(bot.orderBotConfig.price_source);
      setEditObPriceDecimal(String(bot.orderBotConfig.price_decimal));
      setEditObQtyDecimal(String(bot.orderBotConfig.quantity_decimal));
      setEditObRandomMinQty(bot.orderBotConfig.random_min_quantity);
      setEditObRandomMaxQty(bot.orderBotConfig.random_max_quantity);
      setEditObOrderCount(String(bot.orderBotConfig.order_count));
      setEditObExpireTime(String(bot.orderBotConfig.expire_time));
      setEditObSplitMode(bot.orderBotConfig.split_order_mode);
      setEditObSplitRange(bot.orderBotConfig.split_range);
      setEditObBuyTrailMin(bot.orderBotConfig.buy_trailing_min_percentage);
      setEditObBuyTrailMax(bot.orderBotConfig.buy_trailing_max_percentage);
      setEditObSellTrailMin(bot.orderBotConfig.sell_trailing_min_percentage);
      setEditObSellTrailMax(bot.orderBotConfig.sell_trailing_max_percentage);
      setEditObBuyMinPrice(bot.orderBotConfig.buy_min_price_limit || '');
      setEditObBuyMaxPrice(bot.orderBotConfig.buy_max_price_limit || '');
      setEditObSellMinPrice(bot.orderBotConfig.sell_min_price_limit || '');
      setEditObSellMaxPrice(bot.orderBotConfig.sell_max_price_limit || '');
      setEditObJitterTiming(String(bot.orderBotConfig.jitter_timing_pct));
      setEditObJitterPrice(String(bot.orderBotConfig.jitter_price_pct));
    }

    if (bot.volumeBotConfig) {
      setEditVbPriceDecimal(String(bot.volumeBotConfig.volume_price_decimal));
      setEditVbQtyDecimal(String(bot.volumeBotConfig.volume_quantity_decimal));
      setEditVbRandomMinQty(bot.volumeBotConfig.volume_random_min_quantity);
      setEditVbRandomMaxQty(bot.volumeBotConfig.volume_random_max_quantity);
      setEditVbMinDelay(String(bot.volumeBotConfig.min_delay));
      setEditVbMaxDelay(String(bot.volumeBotConfig.max_delay));
      setEditVbMinDiff(bot.volumeBotConfig.min_difference);
      setEditVbMaxDiff(bot.volumeBotConfig.max_difference);
      setEditVbPriority(bot.volumeBotConfig.priority);
      setEditVbMaxLimitPrice(bot.volumeBotConfig.max_limit_price);
      setEditVbMinLimitPrice(bot.volumeBotConfig.min_limit_price);
      setEditVbVolIdrStop(bot.volumeBotConfig.vol_idr_stop_target);
      setEditVbVolIdrStart(bot.volumeBotConfig.vol_idr_start_threshold || '0');
      setEditVbSellAccountId(bot.volumeBotConfig.volume_sell_account_id || '');
    }

    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBot) return;

    const payload: any = {
      name: editName,
      pairId: editPairId,
      environment: editEnv
    };

    if (editingBot.botType === 'ORDER_BOT') {
      payload.orderBotConfig = {
        transaction_type: editObTxType,
        price_source: editObPriceSource,
        price_decimal: Number(editObPriceDecimal),
        quantity_decimal: Number(editObQtyDecimal),
        random_min_quantity: editObRandomMinQty,
        random_max_quantity: editObRandomMaxQty,
        order_count: Number(editObOrderCount),
        expire_time: Number(editObExpireTime),
        split_order_mode: editObSplitMode,
        split_range: editObSplitRange,
        buy_trailing_min_percentage: editObBuyTrailMin,
        buy_trailing_max_percentage: editObBuyTrailMax,
        sell_trailing_min_percentage: editObSellTrailMin,
        sell_trailing_max_percentage: editObSellTrailMax,
        buy_min_price_limit: editObBuyMinPrice,
        buy_max_price_limit: editObBuyMaxPrice,
        sell_min_price_limit: editObSellMinPrice,
        sell_max_price_limit: editObSellMaxPrice,
        jitter_timing_pct: Number(editObJitterTiming),
        jitter_price_pct: Number(editObJitterPrice)
      };
    } else if (editingBot.botType === 'VOLUME_BOT') {
      payload.volumeBotConfig = {
        volume_price_decimal: Number(editVbPriceDecimal),
        volume_quantity_decimal: Number(editVbQtyDecimal),
        volume_random_min_quantity: editVbRandomMinQty,
        volume_random_max_quantity: editVbRandomMaxQty,
        min_delay: Number(editVbMinDelay),
        max_delay: Number(editVbMaxDelay),
        min_difference: editVbMinDiff,
        max_difference: editVbMaxDiff,
        priority: editVbPriority,
        max_limit_price: editVbMaxLimitPrice,
        min_limit_price: editVbMinLimitPrice,
        vol_idr_stop_target: editVbVolIdrStop,
        vol_idr_start_threshold: editVbVolIdrStart,
        volume_sell_account_id: editVbSellAccountId || undefined
      };
    }

    try {
      await handleAction(`/api/mm/instance/${editingBot.id}/update`, 'POST', payload);
      setIsEditModalOpen(false);
      setEditingBot(null);
    } catch (err) {}
  };

  // Create Order Bot
  const handleCreateOrderBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleAction('/api/mm/order-bot/create', 'POST', {
        name: obName,
        pairId: obPairId,
        environment: currentEnv,
        price_source: obPriceSource,
        price_decimal: obPriceDecimal,
        quantity_decimal: obQtyDecimal,
        random_min_quantity: obRandomMinQty,
        random_max_quantity: obRandomMaxQty,
        order_count: obOrderCount,
        expire_time: obExpireTime,
        transaction_type: obTransactionType,
        split_order_mode: obSplitMode,
        split_range: obSplitRange,
        buy_trailing_min_percentage: obBuyTrailMin,
        buy_trailing_max_percentage: obBuyTrailMax,
        sell_trailing_min_percentage: obSellTrailMin,
        sell_trailing_max_percentage: obSellTrailMax,
        buy_min_price_limit: obBuyMinPrice,
        buy_max_price_limit: obBuyMaxPrice,
        sell_min_price_limit: obSellMinPrice,
        sell_max_price_limit: obSellMaxPrice,
        jitter_timing_pct: obJitterTiming,
        jitter_price_pct: obJitterPrice
      });
      setIsOrderBotModalOpen(false);
    } catch (e) {}
  };

  // Create Volume Bot
  const handleCreateVolumeBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleAction('/api/mm/volume-bot/create', 'POST', {
        name: vbName,
        pairId: vbPairId,
        environment: currentEnv,
        volume_price_decimal: vbPriceDecimal,
        volume_quantity_decimal: vbQtyDecimal,
        volume_random_min_quantity: vbRandomMinQty,
        volume_random_max_quantity: vbRandomMaxQty,
        min_delay: vbMinDelay,
        max_delay: vbMaxDelay,
        min_difference: vbMinDiff,
        max_difference: vbMaxDiff,
        priority: vbPriority,
        max_limit_price: vbMaxLimitPrice,
        min_limit_price: vbMinLimitPrice,
        vol_idr_stop_target: vbVolIdrStop,
        vol_idr_start_threshold: vbVolIdrStart,
        volume_sell_account_id: vbSellAccountId
      });
      setIsVolumeBotModalOpen(false);
    } catch (e) {}
  };

  // FX Rate Update Handler
  const handleUpdateFxRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleAction('/api/mm/fx-rate/update', 'POST', {
        newRate: parseFloat(manualFxRate),
        notes: manualFxNotes,
        validityHours: parseInt(manualFxValidityHours, 10),
        confirmOutOfBand: manualFxConfirm
      });
      setManualFxConfirm(false);
      // Refresh FX data immediately
      const fxRes = await fetch('/api/mm/fx-rate', { headers: getAuthHeaders() });
      if (fxRes.ok) setFxData(await fxRes.json());
    } catch (e) {}
  };

  // Sync FX Rate from CoinMarketCap
  const handleSyncCmcFx = async () => {
    try {
      await handleAction('/api/mm/fx-rate/sync-cmc', 'POST', { validityHours: 6 });
      const fxRes = await fetch('/api/mm/fx-rate', { headers: getAuthHeaders() });
      if (fxRes.ok) setFxData(await fxRes.json());
    } catch (e) {}
  };

  // Reconnect External Provider
  const handleReconnectProvider = async (provider?: string) => {
    await handleAction('/api/mm/external-feeds/reconnect', 'POST', { provider });
    // Refresh feeds immediately
    const feedsRes = await fetch('/api/mm/external-feeds', { headers: getAuthHeaders() });
    if (feedsRes.ok) setExternalFeeds(await feedsRes.json());
  };

  // Create Price Follower Bot
  const handleCreatePriceFollower = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleAction('/api/mm/price-follower/create', 'POST', {
        name: pfName,
        pairId: pfPairId,
        environment: currentEnv,
        reference_provider: pfProvider,
        target_spread_bps: parseInt(pfTargetSpreadBps, 10),
        buy_offset_bps: parseInt(pfBuyOffsetBps, 10),
        sell_offset_bps: parseInt(pfSellOffsetBps, 10),
        order_quantity: pfOrderQty,
        minimum_reprice_interval_ms: parseInt(pfRepriceInterval, 10),
        minimum_price_change_bps: parseInt(pfMinPriceChangeBps, 10),
        dry_run: pfDryRun
      });
      setIsPriceFollowerModalOpen(false);
    } catch (e) {}
  };

  // Create Depth Liquidity Bot
  const handleCreateDepthLiquidity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const bidOffsets = dlBidOffsets.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const askOffsets = dlAskOffsets.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const bidQtys = dlBidQuantities.split(',').map(s => s.trim()).filter(Boolean);
      const askQtys = dlAskQuantities.split(',').map(s => s.trim()).filter(Boolean);

      await handleAction('/api/mm/depth-liquidity/create', 'POST', {
        name: dlName,
        pairId: dlPairId,
        environment: currentEnv,
        reference_price_source: dlSource,
        number_of_bid_levels: parseInt(dlNumBids, 10),
        number_of_ask_levels: parseInt(dlNumAsks, 10),
        bid_level_offsets_bps: bidOffsets,
        ask_level_offsets_bps: askOffsets,
        bid_quantities: bidQtys,
        ask_quantities: askQtys,
        quantity_randomization_enabled: dlRandomizeQty,
        random_min_quantity: dlRandomMinQty,
        random_max_quantity: dlRandomMaxQty,
        minimum_reprice_interval_ms: parseInt(dlRepriceInterval, 10),
        dry_run: dlDryRun
      });
      setIsDepthLiquidityModalOpen(false);
    } catch (e) {}
  };

  // CSV Preview & Confirm
  const handleCsvPreview = async () => {
    try {
      const data = await handleAction('/api/mm/csv/import-preview', 'POST', {
        csvContent: csvRawText,
        botType: csvImportType
      });
      setCsvPreview(data);
    } catch (e) {}
  };

  const handleCsvConfirm = async () => {
    if (!csvPreview || csvPreview.validRowsCount === 0) return;
    try {
      await handleAction('/api/mm/csv/import-confirm', 'POST', {
        rows: csvPreview.rows.filter(r => r.isValid),
        defaultBotType: csvImportType,
        defaultEnvironment: currentEnv
      });
      setIsCsvImportModalOpen(false);
      setCsvPreview(null);
      setCsvRawText('');
    } catch (e) {}
  };

  const handleExportCsv = (botType: 'ORDER_BOT' | 'VOLUME_BOT') => {
    const token = localStorage.getItem('dimonex_auth_token');
    window.open(`/api/mm/csv/export?botType=${botType}`, '_blank');
  };

  const handleKillSwitch = async () => {
    if (!window.confirm('PERINGATAN KRITIS: Aktifkan Emergency Kill-Switch? Semua bot yang sedang berjalan akan dihentikan dan seluruh order terbuka akan langsung dibatalkan.')) return;
    try {
      await handleAction('/api/mm/kill-switch', 'POST');
    } catch (e) {}
  };

  const handleResetKillSwitch = async () => {
    try {
      await handleAction('/api/mm/kill-switch/reset', 'POST');
    } catch (e) {}
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#090d14] border border-[#1e293b] rounded-xl text-center">
        <h2 className="text-xl font-bold text-white mb-2">Market Maker Console Memerlukan Login</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Akses MM Console dibatasi untuk peran Market Maker (MM) dan Administrator bursa dengan otorisasi khusus.
        </p>
        <button
          onClick={onOpenAuthModal}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-md transition-colors"
        >
          Masuk ke Akun MM
        </button>
      </div>
    );
  }

  const selectedBot = instances.find(b => b.id === selectedBotId) || instances[0];

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Top Console Header & Environment Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#090d14] border border-[#1e293b] rounded-xl">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Market Maker & Algorithmic Bot Console</h1>
            <p className="text-xs text-slate-400">
              Operasional likuiditas real-time terhubung langsung ke mesin matching engine internal DIMONEX.
            </p>
          </div>
        </div>

        {/* Environment Badge & Switcher (Phase 6) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#131b26] p-1 rounded-lg border border-[#1e293b]">
            {(['DEMO', 'STAGING', 'PRODUCTION'] as const).map(env => (
              <button
                key={env}
                onClick={() => setCurrentEnv(env)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  currentEnv === env
                    ? env === 'PRODUCTION'
                      ? 'bg-red-600 text-white shadow-sm'
                      : env === 'STAGING'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {env === 'DEMO' ? 'DEMO / SANDBOX' : env}
              </button>
            ))}
          </div>

          {/* Kill Switch Button (Phase 10) */}
          {riskControls?.isKillSwitchActive ? (
            <button
              onClick={handleResetKillSwitch}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
            >
              <span>✓</span> Reset Kill-Switch
            </button>
          ) : (
            <button
              onClick={() => setIsKillSwitchConfirmOpen(true)}
              title="Emergency Kill-Switch: Halt all bots and purge open orders"
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5 animate-pulse"
            >
              <span>🛑</span> Kill-Switch
            </button>
          )}
        </div>
      </div>

      {/* REAL-TIME METRICS SUMMARY & EMERGENCY KILL-SWITCH BAR */}
      <div className="bg-[#0b121f] border border-[#1e293b] rounded-xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[#1e293b]/80">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                (overview?.activeBots ?? 0) > 0 ? 'bg-emerald-400' : 'bg-slate-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                (overview?.activeBots ?? 0) > 0 ? 'bg-emerald-500' : 'bg-slate-500'
              }`}></span>
            </span>
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              Ringkasan Metrik Real-Time Market Maker ({currentEnv})
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              Live Engine Stream
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {riskControls?.isKillSwitchActive ? (
              <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold flex items-center gap-1.5 animate-pulse">
                <span>🛑</span>
                <span>EMERGENCY KILL-SWITCH AKTIF</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                <span>Sistem Operasional Normal</span>
              </span>
            )}
          </div>
        </div>

        {/* 3 User-Requested Metrik Utama + Tombol Kill-Switch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Metrik 1: Jumlah Bot Aktif */}
          <div className="p-3.5 bg-[#070b13] border border-[#1e293b] rounded-xl flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-400">Jumlah Bot Aktif</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                (overview?.activeBots ?? 0) > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {overview?.activeBots ?? 0} RUNNING
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {overview?.activeBots ?? 0}
              </span>
              <span className="text-xs font-mono text-slate-500">
                / {overview?.totalBots ?? instances.length} terdaftar
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              BUY Bots: {instances.filter(b => b.botType === 'ORDER_BOT' && b.orderBotConfig?.transaction_type === 'BUY' && b.status === 'RUNNING').length} · SELL: {instances.filter(b => b.botType === 'ORDER_BOT' && b.orderBotConfig?.transaction_type === 'SELL' && b.status === 'RUNNING').length} · Volume: {instances.filter(b => b.botType === 'VOLUME_BOT' && b.status === 'RUNNING').length}
            </span>
          </div>

          {/* Metrik 2: Total Order Ditempatkan Semua Bot */}
          <div className="p-3.5 bg-[#070b13] border border-[#1e293b] rounded-xl flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-400">Total Order Ditempatkan</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                {overview?.ordersFilled ?? 0} filled
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {(overview?.ordersSubmitted ?? 0).toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-mono text-slate-500">
                orders
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Fill Rate: {overview?.ordersSubmitted ? Math.round(((overview.ordersFilled || 0) / overview.ordersSubmitted) * 100) : 0}% ({overview?.totalTrades ?? 0} trades executed)
            </span>
          </div>

          {/* Metrik 3: Volume Trading 24 Jam Khusus Bot */}
          <div className="p-3.5 bg-[#070b13] border border-[#1e293b] rounded-xl flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-400">Volume 24 Jam Khusus Bot</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                {overview?.bot24hTradesCount ?? 0} trades / 24j
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-amber-400 truncate">
                {overview?.bot24hVolumeFormattedIdr || 'Rp 0'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Dihasilkan murni khusus dari transaksi pasar internal bot
            </span>
          </div>

          {/* Tombol Kill-Switch (Boll Kill Switch Darurat) */}
          <div className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
            riskControls?.isKillSwitchActive
              ? 'bg-red-950/40 border-red-500 shadow-md shadow-red-900/30'
              : 'bg-[#120a10] border-red-900/50 hover:border-red-600'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-red-300 flex items-center gap-1">
                <span>🛑</span> Tombol Kill-Switch
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                riskControls?.isKillSwitchActive ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/20 text-red-400'
              }`}>
                {riskControls?.isKillSwitchActive ? 'HALTED' : 'ARMED'}
              </span>
            </div>
            <div className="my-1">
              {riskControls?.isKillSwitchActive ? (
                <button
                  type="button"
                  onClick={handleResetKillSwitch}
                  disabled={isLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  <span>✓</span> Reset & Pulihkan Bot
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsKillSwitchConfirmOpen(true)}
                  disabled={isLoading}
                  className="w-full py-2 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-bold text-xs rounded-lg shadow-lg shadow-red-950/50 transition-all active:scale-[0.98] border border-red-400/40 flex items-center justify-center gap-1.5"
                >
                  <span className="text-sm">🛑</span> STOP SEMUA BOT (KILL-SWITCH)
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 block truncate">
              {riskControls?.isKillSwitchActive
                ? 'Semua order ditarik & worker dinonaktifkan.'
                : 'Hentikan seketika & batalkan seluruh order aktif.'}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-[#1e293b]">
        {[
          { id: 'OVERVIEW', label: 'Overview' },
          { id: 'EXTERNAL_FEEDS', label: '🌐 External Feeds' },
          { id: 'FX_RATES', label: '💵 USDT/IDR FX Engine' },
          { id: 'PRICE_FOLLOWER', label: '🎯 Price Follower' },
          { id: 'DEPTH_LIQUIDITY', label: '📊 Depth & Liquidity' },
          { id: 'ORDER_BOTS', label: 'Order Bots' },
          { id: 'VOLUME_BOTS', label: 'Volume & Test Bots' },
          { id: 'CONFIGURATIONS', label: 'Configurations' },
          { id: 'BOT_ACCOUNTS', label: 'Bot Accounts' },
          { id: 'ORDERS', label: 'Orders' },
          { id: 'EXECUTED_TRADES', label: 'Executed Trades' },
          { id: 'ACTIVITY_LOGS', label: 'Activity Logs' },
          { id: 'RISK_CONTROLS', label: 'Risk Controls' },
          { id: 'SETTINGS', label: 'Settings' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as MMTab)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[#1e293b] text-white border-b-2 border-blue-500 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b26]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="flex flex-col gap-5">
          {/* KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl">
              <span className="text-xs text-slate-400 block mb-1">Active Bots ({currentEnv})</span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {overview?.activeBots ?? 0} <span className="text-xs text-slate-500 font-normal">/ {overview?.totalBots ?? 0} total</span>
              </span>
            </div>
            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl">
              <span className="text-xs text-slate-400 block mb-1">Orders Submitted</span>
              <span className="text-2xl font-bold font-mono text-white">
                {overview?.ordersSubmitted ?? 0}
              </span>
            </div>
            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl">
              <span className="text-xs text-slate-400 block mb-1">Orders Filled</span>
              <span className="text-2xl font-bold font-mono text-blue-400">
                {overview?.ordersFilled ?? 0}
              </span>
            </div>
            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl">
              <span className="text-xs text-slate-400 block mb-1">Trades Generated</span>
              <span className="text-2xl font-bold font-mono text-amber-400">
                {overview?.totalTrades ?? 0}
              </span>
            </div>
          </div>

          {/* Quick Action Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#0c121d] border border-[#1e293b] rounded-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOrderBotModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                + Order Bot
              </button>
              <button
                onClick={() => setIsVolumeBotModalOpen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                + Volume Bot
              </button>
              <button
                onClick={() => setIsPriceFollowerModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                + Price Follower
              </button>
              <button
                onClick={() => setIsDepthLiquidityModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                + Depth & Liquidity
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCsvImportModalOpen(true)}
                className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-medium rounded-lg border border-[#334155] transition-colors"
              >
                CSV Import
              </button>
              <button
                onClick={() => handleExportCsv('ORDER_BOT')}
                className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-medium rounded-lg border border-[#334155] transition-colors"
              >
                Export Order CSV
              </button>
              <button
                onClick={() => handleExportCsv('VOLUME_BOT')}
                className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-medium rounded-lg border border-[#334155] transition-colors"
              >
                Export Volume CSV
              </button>
            </div>
          </div>

          {/* Active Bot Instances Table */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Bot Instances ({currentEnv})</h3>
              <span className="text-xs text-slate-400">Total: {instances.length} bots</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f172a] text-slate-400 uppercase font-mono text-[11px] border-b border-[#1e293b]">
                  <tr>
                    <th className="py-2.5 px-4">Bot ID / Name</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Pair</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Orders (Sub / Fill)</th>
                    <th className="py-2.5 px-4">Last Heartbeat</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b] text-slate-300 font-mono">
                  {instances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500 font-sans">
                        Belum ada bot instance yang dibuat di environment {currentEnv}.
                      </td>
                    </tr>
                  ) : (
                    instances.map(b => (
                      <tr key={b.id} className="hover:bg-[#131b26] transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <strong className="text-white block">{b.name}</strong>
                          <span className="text-[11px] text-slate-500 font-mono">{b.id}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-semibold text-blue-400">{b.botType}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{b.pairId}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.status === 'RUNNING'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : b.status === 'PAUSED'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : b.status === 'ERROR' || b.status === 'RISK_HALTED'
                              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                              : 'bg-slate-700/30 text-slate-400 border border-slate-700'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {b.stats.ordersSubmitted} / <span className="text-emerald-400">{b.stats.ordersFilled}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {formatDateTime(b.lastHeartbeat)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            {b.status === 'RUNNING' ? (
                              <>
                                <button
                                  onClick={() => handlePauseBot(b.id)}
                                  className="px-2 py-1 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 rounded text-xs"
                                >
                                  Pause
                                </button>
                                <button
                                  onClick={() => handleStopBot(b.id)}
                                  className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs"
                                >
                                  Stop
                                </button>
                              </>
                            ) : b.status === 'PAUSED' ? (
                              <>
                                <button
                                  onClick={() => handleResumeBot(b.id)}
                                  className="px-2 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded text-xs"
                                >
                                  Resume
                                </button>
                                <button
                                  onClick={() => handleStopBot(b.id)}
                                  className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs"
                                >
                                  Stop
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleValidateBot(b.id)}
                                  className="px-2 py-1 bg-[#1e293b] text-slate-300 hover:bg-[#283548] rounded text-xs"
                                >
                                  Validate
                                </button>
                                <button
                                  onClick={() => handleStartBot(b.id)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                                >
                                  Start
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleOpenEditModal(b)}
                              title="Edit Bot Configuration"
                              className="px-2 py-1 bg-[#1e293b] text-amber-400 hover:bg-[#283548] rounded text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleOpenCloneModal(b)}
                              title="Clone Bot (Phase 8)"
                              className="px-2 py-1 bg-[#1e293b] text-blue-400 hover:bg-[#283548] rounded text-xs"
                            >
                              Clone
                            </button>
                            <button
                              onClick={() => setSelectedBotId(b.id)}
                              className="px-2 py-1 bg-[#1e293b] text-slate-400 hover:text-white rounded text-xs"
                            >
                              Logs
                            </button>
                            <button
                              onClick={() => handleOpenDeleteModal(b)}
                              title="Hapus Bot Permanen & Batalkan Seluruh Order Terbuka"
                              className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded text-xs font-semibold"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: EXTERNAL FEEDS */}
      {activeTab === 'EXTERNAL_FEEDS' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🌐</span> Public External Price Feeds (Binance & Bybit)
              </h2>
              <p className="text-xs text-slate-400">
                Integrasi WebSocket publik langsung ke Binance Spot dan Bybit Spot v5 API untuk referensi harga trading.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReconnectProvider()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center gap-1.5"
              >
                <span>🔄</span> Reconnect All Feeds
              </button>
            </div>
          </div>

          {/* Provider Status Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Binance Card */}
            <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                    <h3 className="text-sm font-bold text-white">Binance Spot Public Stream</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    externalFeeds?.binance?.status === 'CONNECTED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {externalFeeds?.binance?.status || 'CONNECTING'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Endpoint:</span>
                    <span className="text-slate-300 truncate max-w-[240px]">wss://stream.binance.com:9443/ws</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Latency:</span>
                    <span className="text-emerald-400 font-bold">{externalFeeds?.binance?.metrics?.avgLatencyMs || 12} ms</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Messages Received:</span>
                    <span className="text-white">{externalFeeds?.binance?.metrics?.messagesReceived?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Reconnect Count:</span>
                    <span className="text-slate-300">{externalFeeds?.binance?.metrics?.reconnectCount || 0}</span>
                  </div>
                  <div className="pt-2 border-t border-[#1e293b] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">BTC/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.binance?.btcTick?.lastPrice ? externalFeeds.binance.btcTick.lastPrice.toLocaleString() : '94,850.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ETH/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.binance?.ethTick?.lastPrice ? externalFeeds.binance.ethTick.lastPrice.toLocaleString() : '2,840.00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[#1e293b]">
                <button
                  onClick={() => handleReconnectProvider('binance')}
                  className="w-full py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                >
                  Reconnect Binance Stream
                </button>
              </div>
            </div>

            {/* Bybit Card */}
            <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-orange-400"></span>
                    <h3 className="text-sm font-bold text-white">Bybit Spot Public Stream (v5)</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    externalFeeds?.bybit?.status === 'CONNECTED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {externalFeeds?.bybit?.status || 'CONNECTING'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Endpoint:</span>
                    <span className="text-slate-300 truncate max-w-[240px]">wss://stream.bybit.com/v5/public/spot</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Latency:</span>
                    <span className="text-emerald-400 font-bold">{externalFeeds?.bybit?.metrics?.avgLatencyMs || 15} ms</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Messages Received:</span>
                    <span className="text-white">{externalFeeds?.bybit?.metrics?.messagesReceived?.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Reconnect Count:</span>
                    <span className="text-slate-300">{externalFeeds?.bybit?.metrics?.reconnectCount || 0}</span>
                  </div>
                  <div className="pt-2 border-t border-[#1e293b] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">BTC/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.bybit?.btcTick?.lastPrice ? externalFeeds.bybit.btcTick.lastPrice.toLocaleString() : '94,855.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ETH/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.bybit?.ethTick?.lastPrice ? externalFeeds.bybit.ethTick.lastPrice.toLocaleString() : '2,840.50'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[#1e293b]">
                <button
                  onClick={() => handleReconnectProvider('bybit')}
                  className="w-full py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                >
                  Reconnect Bybit Stream
                </button>
              </div>
            </div>

            {/* CoinMarketCap Card */}
            <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    <h3 className="text-sm font-bold text-white">CoinMarketCap Market Feed</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    externalFeeds?.cmc?.status === 'CONNECTED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {externalFeeds?.cmc?.status || 'CONNECTED'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Source:</span>
                    <span className="text-slate-300 truncate max-w-[200px]">CoinMarketCap Public API & Quotes</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Latency:</span>
                    <span className="text-emerald-400 font-bold">{externalFeeds?.cmc?.metrics?.avgLatencyMs || 42} ms</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Updates Polled:</span>
                    <span className="text-white">{externalFeeds?.cmc?.metrics?.messagesReceived?.toLocaleString() || 1}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>USDT/IDR Rate:</span>
                    <span className="text-emerald-400 font-bold">
                      Rp {externalFeeds?.cmc?.usdtTick?.lastPrice ? externalFeeds.cmc.usdtTick.lastPrice.toLocaleString('id-ID') : '16.365'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#1e293b] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">BTC/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.cmc?.btcTick?.lastPrice ? externalFeeds.cmc.btcTick.lastPrice.toLocaleString() : '95,050.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ETH/USDT:</span>
                      <span className="text-base font-bold text-white">
                        ${externalFeeds?.cmc?.ethTick?.lastPrice ? externalFeeds.cmc.ethTick.lastPrice.toLocaleString() : '3,425.00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[#1e293b]">
                <button
                  onClick={() => handleReconnectProvider('coinmarketcap')}
                  className="w-full py-1.5 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                >
                  Refresh CMC Feed
                </button>
              </div>
            </div>
          </div>

          {/* Aggregator Config & Health Summary */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-3">Multi-Exchange Price Aggregator Controls</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
                <span className="text-slate-400 block mb-1">Primary Feed Provider</span>
                <span className="text-base font-bold text-amber-400">BINANCE SPOT</span>
                <span className="text-[10px] text-slate-500 block mt-1">Fallback: Bybit Spot (Automatic Failover)</span>
              </div>
              <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
                <span className="text-slate-400 block mb-1">Max Deviation Threshold</span>
                <span className="text-base font-bold text-sky-400">200 bps (2.00%)</span>
                <span className="text-[10px] text-slate-500 block mt-1">Pencegah outlier tick abnormal</span>
              </div>
              <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
                <span className="text-slate-400 block mb-1">Max Data Age (Freshness Guard)</span>
                <span className="text-base font-bold text-emerald-400">15,000 ms</span>
                <span className="text-[10px] text-slate-500 block mt-1">Bot pause otomatis jika data stale</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FX RATES */}
      {activeTab === 'FX_RATES' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>💵</span> USDT/IDR FX Conversion Engine
              </h2>
              <p className="text-xs text-slate-400">
                Formula konversi harga spot: BTC/IDR = BTC/USDT × USDT/IDR dengan kontrol manual admin dan rekam jejak audit.
              </p>
            </div>
          </div>

          {/* Quick CMC Sync Action Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-[#090d14] via-[#0f172a] to-[#090d14] border border-[#1e293b] p-4 rounded-xl shadow-lg">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 font-extrabold flex items-center justify-center text-sm border border-blue-500/30">
                CMC
              </span>
              <div>
                <span className="text-xs font-bold text-white block">Sinkronisasi Live CoinMarketCap</span>
                <span className="text-[11px] text-slate-400 block">
                  Ambil nilai tukar live USDT/IDR dari CoinMarketCap ({externalFeeds?.cmc?.usdtTick?.lastPrice ? `Rp ${externalFeeds.cmc.usdtTick.lastPrice.toLocaleString('id-ID')}` : 'Rp 16.365'}) atau input kurs manual pada formulir di bawah.
                </span>
              </div>
            </div>
            <button
              onClick={handleSyncCmcFx}
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg text-xs shadow flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>⚡</span> Ambil Kurs dari CoinMarketCap Sekarang
            </button>
          </div>

          {/* Current Rate Banner & Converted Benchmark Preview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">Kurs Aktif USDT/IDR</span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                Rp {fxData?.currentRate?.rate ? fxData.currentRate.rate.toLocaleString('id-ID') : '16.350'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                Sumber: {fxData?.currentRate?.source || 'SYSTEM_DEFAULT'}
              </span>
            </div>

            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">Benchmark BTC/IDR (Terkonversi)</span>
              <span className="text-xl font-bold font-mono text-white">
                Rp {fxData?.referencePrices?.['BTC-IDR']?.effectiveIdrPrice?.toLocaleString('id-ID') || '1.550.797.500'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                ${fxData?.referencePrices?.['BTC-IDR']?.effectiveUsdtPrice?.toLocaleString() || '94,850'} USDT × Kurs
              </span>
            </div>

            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">Benchmark ETH/IDR (Terkonversi)</span>
              <span className="text-xl font-bold font-mono text-white">
                Rp {fxData?.referencePrices?.['ETH-IDR']?.effectiveIdrPrice?.toLocaleString('id-ID') || '46.434.000'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                ${fxData?.referencePrices?.['ETH-IDR']?.effectiveUsdtPrice?.toLocaleString() || '2,840'} USDT × Kurs
              </span>
            </div>

            <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
              <span className="text-xs text-slate-400 block mb-1">Status Keabsahan Kurs</span>
              <span className={`text-base font-bold font-mono ${fxData?.currentRate?.isStale ? 'text-red-400' : 'text-emerald-400'}`}>
                {fxData?.currentRate?.isStale ? 'STALE (KEDALUWARSA)' : 'AKTIF & VALID'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                Berlaku s/d: {fxData?.currentRate?.validUntil ? new Date(fxData.currentRate.validUntil).toLocaleString('id-ID') : '-'}
              </span>
            </div>
          </div>

          {/* Form Pembaruan Manual Kurs */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-2">Pembaruan Manual Kurs USDT/IDR (Admin / MM)</h3>
            <p className="text-xs text-slate-400 mb-4">
              Setiap perubahan kurs akan dicatat dalam audit trail permanen dan langsung menjadi basis kalkulasi bagi Price Follower & Depth Bot.
            </p>

            <form onSubmit={handleUpdateFxRate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Kurs Baru (IDR per 1 USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualFxRate}
                    onChange={e => setManualFxRate(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2.5 rounded-lg border border-[#334155] font-mono font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Masa Berlaku (Jam)</label>
                  <input
                    type="number"
                    value={manualFxValidityHours}
                    onChange={e => setManualFxValidityHours(e.target.value)}
                    min="1"
                    max="168"
                    required
                    className="w-full bg-[#1e293b] text-white p-2.5 rounded-lg border border-[#334155] font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Catatan / Alasan Penetapan</label>
                  <input
                    type="text"
                    value={manualFxNotes}
                    onChange={e => setManualFxNotes(e.target.value)}
                    placeholder="Contoh: Penyesuaian kurs tengah BI / OTC rate"
                    className="w-full bg-[#1e293b] text-white p-2.5 rounded-lg border border-[#334155] text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualFxConfirm}
                    onChange={e => setManualFxConfirm(e.target.checked)}
                    className="rounded bg-[#1e293b] border-[#334155] text-blue-600"
                  />
                  <span>Konfirmasi perubahan di luar toleransi normal jika deviasi &gt; 10%</span>
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow transition-colors"
                >
                  Simpan & Terapkan Kurs Baru
                </button>
              </div>
            </form>
          </div>

          {/* Audit History Table */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden shadow-lg">
            <div className="px-5 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Riwayat Audit Perubahan Kurs USDT/IDR</h3>
              <span className="text-xs text-slate-400">{fxData?.history?.length || 0} entri tercatat</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0f172a] text-slate-400 uppercase text-[11px] border-b border-[#1e293b]">
                  <tr>
                    <th className="py-2.5 px-4">Waktu</th>
                    <th className="py-2.5 px-4">Aktor / Admin</th>
                    <th className="py-2.5 px-4">Kurs Sebelumnya</th>
                    <th className="py-2.5 px-4">Kurs Baru</th>
                    <th className="py-2.5 px-4">Perubahan (%)</th>
                    <th className="py-2.5 px-4">Sumber</th>
                    <th className="py-2.5 px-4 font-sans">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b] text-slate-300">
                  {(!fxData?.history || fxData.history.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-500 font-sans">
                        Belum ada riwayat perubahan kurs tercatat.
                      </td>
                    </tr>
                  ) : (
                    fxData.history.map((entry: any) => (
                      <tr key={entry.id} className="hover:bg-[#131b26]">
                        <td className="py-2.5 px-4 text-slate-400">{formatDateTime(entry.timestamp)}</td>
                        <td className="py-2.5 px-4 font-sans text-white">{entry.actor}</td>
                        <td className="py-2.5 px-4">Rp {entry.previousRate?.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-4 font-bold text-emerald-400">Rp {entry.newRate?.toLocaleString('id-ID')}</td>
                        <td className="py-2.5 px-4">{entry.percentChange > 0 ? `+${entry.percentChange}%` : `${entry.percentChange}%`}</td>
                        <td className="py-2.5 px-4 text-slate-400">{entry.source}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-300">{entry.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PRICE FOLLOWER BOTS */}
      {activeTab === 'PRICE_FOLLOWER' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🎯</span> Price Follower Market-Making Bots
              </h2>
              <p className="text-xs text-slate-400">
                Bot market maker yang mengikuti pergerakan harga referensi eksternal secara otomatis dan menempatkan order riil pada Matching Engine DIMONEX.
              </p>
            </div>
            <button
              onClick={() => setIsPriceFollowerModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
            >
              <span>+</span> Deploy Price Follower Bot
            </button>
          </div>

          {/* Table of Price Follower Bots */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden shadow-lg">
            <div className="px-5 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Daftar Price Follower Bot ({currentEnv})</h3>
              <span className="text-xs text-slate-400">
                {instances.filter(b => b.botType === 'PRICE_FOLLOWER').length} bot terdaftar
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f172a] text-slate-400 uppercase font-mono text-[11px] border-b border-[#1e293b]">
                  <tr>
                    <th className="py-2.5 px-4">Bot ID / Name</th>
                    <th className="py-2.5 px-4">Pair</th>
                    <th className="py-2.5 px-4">Provider Source</th>
                    <th className="py-2.5 px-4">Buy Offset (bps)</th>
                    <th className="py-2.5 px-4">Sell Offset (bps)</th>
                    <th className="py-2.5 px-4">Qty per Order</th>
                    <th className="py-2.5 px-4">Reprice Int.</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b] text-slate-300 font-mono">
                  {instances.filter(b => b.botType === 'PRICE_FOLLOWER').length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500 font-sans">
                        Belum ada Price Follower bot yang dikonfigurasi. Klik "+ Deploy Price Follower Bot" untuk memulai.
                      </td>
                    </tr>
                  ) : (
                    instances.filter(b => b.botType === 'PRICE_FOLLOWER').map(b => {
                      const cfg = b.priceFollowerConfig;
                      return (
                        <tr key={b.id} className="hover:bg-[#131b26] transition-colors">
                          <td className="py-3 px-4 font-sans">
                            <strong className="text-white block">{b.name}</strong>
                            <span className="text-[10px] text-slate-500 font-mono">{b.id}</span>
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{b.pairId}</td>
                          <td className="py-3 px-4 text-amber-400">{cfg?.reference_provider || 'AGGREGATED'}</td>
                          <td className="py-3 px-4 text-emerald-400">{cfg?.buy_offset_bps ?? 20} bps</td>
                          <td className="py-3 px-4 text-red-400">{cfg?.sell_offset_bps ?? 20} bps</td>
                          <td className="py-3 px-4 font-bold text-white">{cfg?.order_quantity || '0.01'}</td>
                          <td className="py-3 px-4 text-slate-400">{cfg?.minimum_reprice_interval_ms || 2000} ms</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              b.status === 'RUNNING'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                                : b.status === 'PAUSED'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-700 text-slate-300'
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 font-sans">
                              {b.status === 'RUNNING' ? (
                                <button
                                  onClick={() => handlePauseBot(b.id)}
                                  className="px-2 py-1 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 rounded text-xs"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartBot(b.id)}
                                  className="px-2 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded text-xs"
                                >
                                  Start
                                </button>
                              )}
                              <button
                                onClick={() => handleStopBot(b.id)}
                                className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs"
                              >
                                Stop
                              </button>
                              <button
                                onClick={() => setSelectedBotId(b.id)}
                                className="px-2 py-1 bg-[#1e293b] text-slate-400 hover:text-white rounded text-xs"
                              >
                                Logs
                              </button>
                              <button
                                onClick={() => handleOpenDeleteModal(b)}
                                className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded text-xs"
                              >
                                Hapus
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
        </div>
      )}

      {/* TAB: DEPTH & LIQUIDITY BOTS */}
      {activeTab === 'DEPTH_LIQUIDITY' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊</span> Depth & Liquidity Market-Making Bots
              </h2>
              <p className="text-xs text-slate-400">
                Menyediakan likuiditas multi-level yang tebal dan nyata pada Order Book DIMONEX tanpa fake liquidity atau order buatan frontend.
              </p>
            </div>
            <button
              onClick={() => setIsDepthLiquidityModalOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
            >
              <span>+</span> Deploy Depth & Liquidity Bot
            </button>
          </div>

          {/* Table of Depth Bots */}
          <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden shadow-lg">
            <div className="px-5 py-3 border-b border-[#1e293b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Daftar Depth & Liquidity Bot ({currentEnv})</h3>
              <span className="text-xs text-slate-400">
                {instances.filter(b => b.botType === 'DEPTH_LIQUIDITY').length} bot terdaftar
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0f172a] text-slate-400 uppercase font-mono text-[11px] border-b border-[#1e293b]">
                  <tr>
                    <th className="py-2.5 px-4">Bot ID / Name</th>
                    <th className="py-2.5 px-4">Pair</th>
                    <th className="py-2.5 px-4">Bid / Ask Levels</th>
                    <th className="py-2.5 px-4">Offsets (bps)</th>
                    <th className="py-2.5 px-4">Quantities</th>
                    <th className="py-2.5 px-4">Active Orders</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b] text-slate-300 font-mono">
                  {instances.filter(b => b.botType === 'DEPTH_LIQUIDITY').length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-500 font-sans">
                        Belum ada Depth & Liquidity bot yang dikonfigurasi. Klik "+ Deploy Depth & Liquidity Bot" untuk mulai menginjeksi likuiditas riil.
                      </td>
                    </tr>
                  ) : (
                    instances.filter(b => b.botType === 'DEPTH_LIQUIDITY').map(b => {
                      const cfg = b.depthLiquidityConfig;
                      return (
                        <tr key={b.id} className="hover:bg-[#131b26] transition-colors">
                          <td className="py-3 px-4 font-sans">
                            <strong className="text-white block">{b.name}</strong>
                            <span className="text-[10px] text-slate-500 font-mono">{b.id}</span>
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{b.pairId}</td>
                          <td className="py-3 px-4">
                            <span className="text-emerald-400">{cfg?.number_of_bid_levels || 3} Bids</span> /{' '}
                            <span className="text-red-400">{cfg?.number_of_ask_levels || 3} Asks</span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 text-[11px]">
                            {cfg?.bid_level_offsets_bps?.join(', ') || '10, 25, 50'} bps
                          </td>
                          <td className="py-3 px-4 text-slate-300 text-[11px]">
                            {cfg?.bid_quantities?.join(', ') || '0.02, 0.05, 0.10'}
                          </td>
                          <td className="py-3 px-4 font-bold text-sky-400">
                            {cfg?.activeOrderIds?.length || 0} level di Order Book
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              b.status === 'RUNNING'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                                : b.status === 'PAUSED'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-700 text-slate-300'
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 font-sans">
                              {b.status === 'RUNNING' ? (
                                <button
                                  onClick={() => handlePauseBot(b.id)}
                                  className="px-2 py-1 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 rounded text-xs"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartBot(b.id)}
                                  className="px-2 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded text-xs"
                                >
                                  Start
                                </button>
                              )}
                              <button
                                onClick={() => handleStopBot(b.id)}
                                className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-xs"
                              >
                                Stop
                              </button>
                              <button
                                onClick={() => setSelectedBotId(b.id)}
                                className="px-2 py-1 bg-[#1e293b] text-slate-400 hover:text-white rounded text-xs"
                              >
                                Logs
                              </button>
                              <button
                                onClick={() => handleOpenDeleteModal(b)}
                                className="px-2 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded text-xs"
                              >
                                Hapus
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
        </div>
      )}

      {/* TAB 2: ORDER BOTS */}
      {activeTab === 'ORDER_BOTS' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Order Bots Configuration & Operations</h2>
              <p className="text-xs text-slate-400">Kelola multi-bot BUY dan SELL independen dengan konfigurasi terpisah.</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Filter BUY / SELL */}
              <div className="flex items-center bg-[#131b26] p-0.5 rounded-lg border border-[#1e293b] text-xs">
                {(['ALL', 'BUY', 'SELL'] as const).map(flt => {
                  const count = flt === 'ALL' 
                    ? instances.filter(b => b.botType === 'ORDER_BOT').length
                    : instances.filter(b => b.botType === 'ORDER_BOT' && b.orderBotConfig?.transaction_type === flt).length;
                  return (
                    <button
                      key={flt}
                      onClick={() => setOrderBotFilter(flt)}
                      className={`px-3 py-1 font-semibold rounded-md transition-all ${
                        orderBotFilter === flt
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {flt === 'ALL' ? 'Semua' : flt} ({count})
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setIsOrderBotModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                + Deploy New Order Bot
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances
              .filter(b => b.botType === 'ORDER_BOT')
              .filter(b => orderBotFilter === 'ALL' || b.orderBotConfig?.transaction_type === orderBotFilter)
              .map(b => (
              <div key={b.id} className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{b.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      b.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-400 font-mono mb-4">
                    <div className="flex justify-between">
                      <span>Side / Transaction Type:</span>
                      <strong className={b.orderBotConfig?.transaction_type === 'BUY' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {b.orderBotConfig?.transaction_type}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Price Source:</span>
                      <span className="text-slate-200">{b.orderBotConfig?.price_source}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Range Qty:</span>
                      <span className="text-slate-200">{b.orderBotConfig?.random_min_quantity} - {b.orderBotConfig?.random_max_quantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Order Count:</span>
                      <span className="text-white">{b.stats.ordersSubmitted} / {b.orderBotConfig?.order_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Split Mode:</span>
                      <span className="text-slate-300">{b.orderBotConfig?.split_order_mode}</span>
                    </div>
                    {b.orderBotConfig?.buy_max_price_limit && (
                      <div className="flex justify-between text-amber-300">
                        <span>Buy Max Price Limit:</span>
                        <span className="font-bold">Rp {Number(b.orderBotConfig.buy_max_price_limit).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    {b.orderBotConfig?.sell_min_price_limit && (
                      <div className="flex justify-between text-amber-300">
                        <span>Sell Min Price Limit:</span>
                        <span className="font-bold">Rp {Number(b.orderBotConfig.sell_min_price_limit).toLocaleString('id-ID')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-3 border-t border-[#1e293b]">
                  {b.status === 'RUNNING' ? (
                    <button onClick={() => handleStopBot(b.id)} className="flex-1 py-1 bg-red-600/20 text-red-400 text-xs rounded font-medium">
                      Stop
                    </button>
                  ) : (
                    <button onClick={() => handleStartBot(b.id)} className="flex-1 py-1 bg-emerald-600 text-white text-xs rounded font-medium">
                      Start
                    </button>
                  )}
                  <button onClick={() => handleOpenEditModal(b)} className="px-2.5 py-1 bg-[#1e293b] text-amber-400 hover:bg-[#283548] text-xs rounded">
                    Edit
                  </button>
                  <button onClick={() => handleOpenCloneModal(b)} className="px-2.5 py-1 bg-[#1e293b] text-blue-400 hover:bg-[#283548] text-xs rounded">
                    Clone
                  </button>
                  <button onClick={() => setSelectedBotId(b.id)} className="px-2.5 py-1 bg-[#1e293b] text-slate-300 hover:text-white text-xs rounded">
                    Logs
                  </button>
                  <button
                    onClick={() => handleOpenDeleteModal(b)}
                    title="Hapus Bot Permanen"
                    className="px-2.5 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs rounded font-medium"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: VOLUME & TEST BOTS */}
      {activeTab === 'VOLUME_BOTS' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Volume & Test Bots (Phase 9)</h2>
              <p className="text-xs text-slate-400">Penyedia likuiditas otomatis dengan target IDR stop/start dan isolasi sandbox.</p>
            </div>
            <button
              onClick={() => setIsVolumeBotModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
            >
              + Deploy Volume Bot
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.filter(b => b.botType === 'VOLUME_BOT').map(b => (
              <div key={b.id} className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{b.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      b.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-400 font-mono mb-4">
                    <div className="flex justify-between">
                      <span>Target Stop IDR:</span>
                      <span className="text-slate-200">Rp {parseInt(b.volumeBotConfig?.vol_idr_stop_target || '0').toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delay:</span>
                      <span className="text-slate-200">{b.volumeBotConfig?.min_delay}s - {b.volumeBotConfig?.max_delay}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Qty:</span>
                      <span className="text-slate-200">{b.volumeBotConfig?.volume_random_min_quantity} - {b.volumeBotConfig?.volume_random_max_quantity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Executed Vol:</span>
                      <span className="text-emerald-400">{b.stats.executedVolume}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-3 border-t border-[#1e293b]">
                  {b.status === 'RUNNING' ? (
                    <button onClick={() => handleStopBot(b.id)} className="flex-1 py-1 bg-red-600/20 text-red-400 text-xs rounded font-medium">
                      Stop
                    </button>
                  ) : (
                    <button onClick={() => handleStartBot(b.id)} className="flex-1 py-1 bg-emerald-600 text-white text-xs rounded font-medium">
                      Start
                    </button>
                  )}
                  <button onClick={() => handleOpenEditModal(b)} className="px-2.5 py-1 bg-[#1e293b] text-amber-400 hover:bg-[#283548] text-xs rounded">
                    Edit
                  </button>
                  <button onClick={() => handleOpenCloneModal(b)} className="px-2.5 py-1 bg-[#1e293b] text-blue-400 text-xs rounded">
                    Clone
                  </button>
                  <button onClick={() => setSelectedBotId(b.id)} className="px-2.5 py-1 bg-[#1e293b] text-slate-300 text-xs rounded">
                    Logs
                  </button>
                  <button
                    onClick={() => handleOpenDeleteModal(b)}
                    title="Hapus Bot Permanen"
                    className="px-2.5 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs rounded font-medium"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CONFIGURATIONS (CSV Import & Export) */}
      {activeTab === 'CONFIGURATIONS' && (
        <div className="flex flex-col gap-5">
          <div className="p-4 bg-[#090d14] border border-[#1e293b] rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">CSV Configuration Manager (Phase 11)</h3>
              <p className="text-xs text-slate-400">Impor dan ekspor batch konfigurasi bot dengan validasi baris per baris tanpa aktivasi otomatis.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCsvImportModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                Upload CSV File
              </button>
              <button
                onClick={() => handleExportCsv('ORDER_BOT')}
                className="px-3 py-2 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs rounded-lg border border-[#334155]"
              >
                Export Order Bots CSV
              </button>
              <button
                onClick={() => handleExportCsv('VOLUME_BOT')}
                className="px-3 py-2 bg-[#1e293b] hover:bg-[#283548] text-slate-200 text-xs rounded-lg border border-[#334155]"
              >
                Export Volume Bots CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: BOT ACCOUNTS */}
      {activeTab === 'BOT_ACCOUNTS' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-2">Authorized Market Maker Accounts</h3>
          <p className="text-xs text-slate-400 mb-4">Daftar saldo dan aset akun MM yang terdaftar di matching engine bursa.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {overview?.balances?.map((b: any) => (
              <div key={b.currency} className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
                <span className="text-xs font-bold text-slate-300 block mb-1">{b.currency}</span>
                <span className="text-lg font-bold font-mono text-emerald-400 block">
                  {b.currency === 'IDR' ? formatIDR(b.balanceAvailable, true) : (Number(b.balanceAvailable) / (10 ** (b.currency === 'BTC' ? 8 : b.currency === 'ETH' ? 8 : 6))).toFixed(4)}
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Locked: {b.currency === 'IDR' ? formatIDR(b.balanceLocked, true) : (Number(b.balanceLocked) / (10 ** (b.currency === 'BTC' ? 8 : b.currency === 'ETH' ? 8 : 6))).toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: ORDERS */}
      {activeTab === 'ORDERS' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e293b] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Bot Open & Historical Orders</h3>
            <span className="text-xs text-slate-400">Real database orders</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0f172a] text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Order ID</th>
                  <th className="py-2.5 px-4">Pair</th>
                  <th className="py-2.5 px-4">Side</th>
                  <th className="py-2.5 px-4">Price</th>
                  <th className="py-2.5 px-4">Quantity</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-slate-300">
                {botOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-slate-500 font-sans">
                      Belum ada order bot yang tercatat.
                    </td>
                  </tr>
                ) : (
                  botOrders.map(o => (
                    <tr key={o.id} className="hover:bg-[#131b26]">
                      <td className="py-2.5 px-4 text-slate-400">{o.id.slice(0, 8)}...</td>
                      <td className="py-2.5 px-4 font-bold text-white">{o.pairId}</td>
                      <td className={`py-2.5 px-4 font-bold ${o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {o.side}
                      </td>
                      <td className="py-2.5 px-4">{formatIDR(o.price, true)}</td>
                      <td className="py-2.5 px-4">{o.quantity}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          o.status === 'FILLED' ? 'text-emerald-400 bg-emerald-500/10' : 'text-blue-400 bg-blue-500/10'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: EXECUTED TRADES */}
      {activeTab === 'EXECUTED_TRADES' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e293b]">
            <h3 className="text-sm font-bold text-white">Bot Executed Trades</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#0f172a] text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Trade ID</th>
                  <th className="py-2.5 px-4">Pair</th>
                  <th className="py-2.5 px-4">Taker Side</th>
                  <th className="py-2.5 px-4">Price</th>
                  <th className="py-2.5 px-4">Quantity</th>
                  <th className="py-2.5 px-4">Volume (IDR)</th>
                  <th className="py-2.5 px-4">Executed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b] text-slate-300">
                {botTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-slate-500 font-sans">
                      Belum ada transaksi trade yang dieksekusi oleh bot.
                    </td>
                  </tr>
                ) : (
                  botTrades.map(t => (
                    <tr key={t.id} className="hover:bg-[#131b26]">
                      <td className="py-2.5 px-4 text-slate-400">{t.id.slice(0, 8)}...</td>
                      <td className="py-2.5 px-4 font-bold text-white">{t.pairId}</td>
                      <td className={`py-2.5 px-4 font-bold ${t.takerSide === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.takerSide}
                      </td>
                      <td className="py-2.5 px-4">{formatIDR(t.price, true)}</td>
                      <td className="py-2.5 px-4">{t.quantity}</td>
                      <td className="py-2.5 px-4">{formatIDR(t.quoteVolume, true)}</td>
                      <td className="py-2.5 px-4 text-slate-500">{formatDateTime(t.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 8: ACTIVITY LOGS */}
      {activeTab === 'ACTIVITY_LOGS' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Real-Time MM Activity & Execution Logs</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </h3>
              <p className="text-xs text-slate-400">Stream audit aktivitas real-time: order submit, fill, limit cap, stop, delete bot, dan emergency kill-switch.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#131b26] p-0.5 rounded-lg border border-[#1e293b] text-xs">
                <button
                  type="button"
                  onClick={() => setLogFilterMode('ALL_SYSTEM')}
                  className={`px-3 py-1 font-semibold rounded-md transition-all ${
                    logFilterMode === 'ALL_SYSTEM'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Semua Aktivitas Live ({allActivityLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilterMode('SINGLE_BOT')}
                  className={`px-3 py-1 font-semibold rounded-md transition-all ${
                    logFilterMode === 'SINGLE_BOT'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Filter Per Bot
                </button>
              </div>

              {logFilterMode === 'SINGLE_BOT' && (
                <select
                  value={selectedBotId || ''}
                  onChange={e => setSelectedBotId(e.target.value)}
                  className="bg-[#1e293b] text-white text-xs px-3 py-1.5 rounded border border-[#334155]"
                >
                  {instances.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="bg-[#05080f] rounded-lg p-3 font-mono text-xs max-h-[460px] overflow-y-auto space-y-1.5 border border-[#1e293b]">
            {logFilterMode === 'ALL_SYSTEM' ? (
              allActivityLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 font-sans">
                  Belum ada log aktivitas global yang tercatat.
                </div>
              ) : (
                allActivityLogs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-slate-300 py-1 border-b border-[#0f172a] last:border-0 hover:bg-[#0d1424] px-1 rounded transition-colors">
                    <span className="text-slate-500 shrink-0 text-[11px]">{formatDateTime(l.timestamp)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 font-bold ${
                      l.type === 'FILL' ? 'bg-emerald-500/20 text-emerald-400' :
                      l.type === 'ORDER' ? 'bg-blue-500/20 text-blue-400' :
                      l.type === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                      l.type === 'RISK' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {l.type || 'INFO'}
                    </span>
                    {l.botName && (
                      <span className="text-blue-400 shrink-0 font-semibold text-[11px]">
                        [{l.botName}]
                      </span>
                    )}
                    <span className="break-all text-[11px] text-slate-200">{l.message}</span>
                  </div>
                ))
              )
            ) : (
              botLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 font-sans">
                  Tidak ada log aktivitas untuk bot ini.
                </div>
              ) : (
                botLogs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-slate-300 py-1 border-b border-[#0f172a] last:border-0 hover:bg-[#0d1424] px-1 rounded transition-colors">
                    <span className="text-slate-500 shrink-0 text-[11px]">{formatDateTime(l.timestamp)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 font-bold ${
                      l.type === 'FILL' ? 'bg-emerald-500/20 text-emerald-400' :
                      l.type === 'ORDER' ? 'bg-blue-500/20 text-blue-400' :
                      l.type === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                      l.type === 'RISK' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {l.type}
                    </span>
                    <span className="break-all text-[11px] text-slate-200">{l.message}</span>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* TAB 9: RISK CONTROLS (Phase 10) */}
      {activeTab === 'RISK_CONTROLS' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5">
          <h3 className="text-base font-bold text-white mb-2">Market Maker Risk Controls & Thresholds</h3>
          <p className="text-xs text-slate-400 mb-6">
            Batas pengaman bursa server-side untuk mencegah runaway loops, slippage berlebih, dan over-exposure.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs text-slate-300">
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Max Active Bots</span>
              <strong className="text-white text-base">{riskControls?.maxActiveBots ?? 50}</strong>
            </div>
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Max Open Orders per Bot</span>
              <strong className="text-white text-base">{riskControls?.maxOpenOrdersPerBot ?? 100}</strong>
            </div>
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Max Price Deviation</span>
              <strong className="text-amber-400 text-base">{riskControls?.maxPriceDeviationPct ?? 15}%</strong>
            </div>
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Max Order Submission Rate</span>
              <strong className="text-white text-base">{riskControls?.maxOrderSubmissionRatePerMin ?? 120} / min</strong>
            </div>
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Max Allowed Slippage</span>
              <strong className="text-amber-400 text-base">{riskControls?.maxAllowedSlippagePct ?? 2.5}%</strong>
            </div>
            <div className="p-3 bg-[#0f172a] rounded-lg border border-[#1e293b]">
              <span className="text-slate-400 block mb-1">Self-Trade Prevention (STP)</span>
              <strong className="text-emerald-400 text-base">{riskControls?.selfTradePreventionPolicy ?? 'CANCEL_MAKER'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <div className="bg-[#090d14] border border-[#1e293b] rounded-xl p-5">
          <h3 className="text-base font-bold text-white mb-2">MM Operator Security & API Keys</h3>
          <p className="text-xs text-slate-400 mb-4">Kelola API Keys HMAC-SHA256 untuk trading otomatis terautentikasi.</p>
          <button
            onClick={onOpenSecurityView}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow"
          >
            Buka Panel Kunci API & 2FA
          </button>
        </div>
      )}

      {/* MODAL: CREATE ORDER BOT (Phase 7 exact fields) */}
      {isOrderBotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]">
              <div>
                <h2 className="text-base font-bold text-white">Deploy New Order Bot ({currentEnv})</h2>
                <p className="text-xs text-slate-400">Konfigurasi bot likuiditas BUY atau SELL independen dengan batas harga & trailing.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderBotModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrderBot} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={obName}
                    onChange={e => setObName(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Trading Pair</label>
                  <select
                    value={obPairId}
                    onChange={e => setObPairId(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    {tradingPairs.map(p => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Side / Transaction Type</label>
                  <select
                    value={obTransactionType}
                    onChange={e => setObTransactionType(e.target.value as any)}
                    className="w-full bg-[#1e293b] font-bold text-xs p-2 rounded border border-[#334155]"
                  >
                    <option value="BUY" className="text-emerald-400">BUY (Beli / Bid)</option>
                    <option value="SELL" className="text-red-400">SELL (Jual / Ask)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Price Source</label>
                  <select
                    value={obPriceSource}
                    onChange={e => setObPriceSource(e.target.value as any)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    <option value="MIDPOINT">MIDPOINT</option>
                    <option value="BEST_BID">BEST_BID</option>
                    <option value="BEST_ASK">BEST_ASK</option>
                    <option value="LAST_PRICE">LAST_PRICE</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">
                    Order Count <span className="text-[10px] text-blue-400 font-normal">(0 = Berjalan Terus)</span>
                  </label>
                  <input
                    type="number"
                    value={obOrderCount}
                    onChange={e => setObOrderCount(e.target.value)}
                    required
                    placeholder="0 = Tanpa Henti"
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {Number(obOrderCount) === 0 ? '✓ Berjalan terus tanpa batas' : `Akan stop otomatis setelah ${obOrderCount} order`}
                  </span>
                </div>
              </div>

              {/* DYNAMIC PRICE LIMITS: BUY vs SELL */}
              {obTransactionType === 'BUY' ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
                      <span>🟢</span> Batas Perlindungan Harga BUY (Price Limit Constraints)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium">Khusus Order Beli (Bid)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-emerald-200 block mb-1 font-semibold">
                        Min Buy Price Limit (IDR)
                      </label>
                      <input
                        type="text"
                        value={obBuyMinPrice}
                        onChange={e => setObBuyMinPrice(e.target.value)}
                        placeholder="Contoh: 1300000000 (Kosongkan jika tanpa batas)"
                        className="w-full bg-[#1e293b] text-emerald-300 font-mono p-2 rounded border border-emerald-500/40 focus:border-emerald-400 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Floor: Bot BUY tidak akan memasang bid di bawah harga ini.
                      </span>
                    </div>
                    <div>
                      <label className="text-emerald-200 block mb-1 font-semibold">
                        Max Buy Price Limit (IDR)
                      </label>
                      <input
                        type="text"
                        value={obBuyMaxPrice}
                        onChange={e => setObBuyMaxPrice(e.target.value)}
                        placeholder="Contoh: 1600000000 (Kosongkan jika tanpa batas)"
                        className="w-full bg-[#1e293b] text-emerald-300 font-mono p-2 rounded border border-emerald-500/40 focus:border-emerald-400 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Ceiling: Bot BUY tidak akan memasang bid di atas harga ini.
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-300 uppercase tracking-wide flex items-center gap-1.5">
                      <span>🔴</span> Batas Perlindungan Harga SELL (Price Limit Constraints)
                    </span>
                    <span className="text-[10px] text-red-400 font-medium">Khusus Order Jual (Ask)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-red-200 block mb-1 font-semibold">
                        Min Sell Price Limit (IDR)
                      </label>
                      <input
                        type="text"
                        value={obSellMinPrice}
                        onChange={e => setObSellMinPrice(e.target.value)}
                        placeholder="Contoh: 1300000000 (Kosongkan jika tanpa batas)"
                        className="w-full bg-[#1e293b] text-red-300 font-mono p-2 rounded border border-red-500/40 focus:border-red-400 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Floor: Bot SELL tidak akan menjual di bawah harga ini.
                      </span>
                    </div>
                    <div>
                      <label className="text-red-200 block mb-1 font-semibold">
                        Max Sell Price Limit (IDR)
                      </label>
                      <input
                        type="text"
                        value={obSellMaxPrice}
                        onChange={e => setObSellMaxPrice(e.target.value)}
                        placeholder="Contoh: 1650000000 (Kosongkan jika tanpa batas)"
                        className="w-full bg-[#1e293b] text-red-300 font-mono p-2 rounded border border-red-500/40 focus:border-red-400 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Ceiling: Bot SELL tidak akan memasang ask di atas harga ini.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Random Min Quantity</label>
                  <input
                    type="text"
                    value={obRandomMinQty}
                    onChange={e => setObRandomMinQty(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Random Max Quantity</label>
                  <input
                    type="text"
                    value={obRandomMaxQty}
                    onChange={e => setObRandomMaxQty(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Price Decimal</label>
                  <input
                    type="number"
                    value={obPriceDecimal}
                    onChange={e => setObPriceDecimal(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Quantity Decimal</label>
                  <input
                    type="number"
                    value={obQtyDecimal}
                    onChange={e => setObQtyDecimal(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Split Order Mode</label>
                  <select
                    value={obSplitMode}
                    onChange={e => setObSplitMode(e.target.value as any)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    <option value="NONE">NONE</option>
                    <option value="RANDOM_SPLIT">RANDOM_SPLIT</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Split Range</label>
                  <input
                    type="text"
                    value={obSplitRange}
                    onChange={e => setObSplitRange(e.target.value)}
                    disabled={obSplitMode === 'NONE'}
                    className={`w-full p-2 rounded border border-[#334155] ${obSplitMode === 'NONE' ? 'bg-[#0f172a] text-slate-600' : 'bg-[#1e293b] text-white'}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Buy Trailing (Min % - Max %)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={obBuyTrailMin}
                      onChange={e => setObBuyTrailMin(e.target.value)}
                      placeholder="Min %"
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                    <input
                      type="text"
                      value={obBuyTrailMax}
                      onChange={e => setObBuyTrailMax(e.target.value)}
                      placeholder="Max %"
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Sell Trailing (Min % - Max %)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={obSellTrailMin}
                      onChange={e => setObSellTrailMin(e.target.value)}
                      placeholder="Min %"
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                    <input
                      type="text"
                      value={obSellTrailMax}
                      onChange={e => setObSellTrailMax(e.target.value)}
                      placeholder="Max %"
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Expire Time (Detik, 0 = GTC)</label>
                  <input
                    type="number"
                    value={obExpireTime}
                    onChange={e => setObExpireTime(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Jitter Timing (%)</label>
                  <input
                    type="number"
                    value={obJitterTiming}
                    onChange={e => setObJitterTiming(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Jitter Price (%)</label>
                  <input
                    type="number"
                    value={obJitterPrice}
                    onChange={e => setObJitterPrice(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setIsOrderBotModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-xs"
                >
                  Deploy Order Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE VOLUME BOT (Phase 9 exact fields) */}
      {isVolumeBotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]">
              <div>
                <h2 className="text-base font-bold text-white mb-0.5">Deploy New Volume Bot ({currentEnv})</h2>
                <p className="text-xs text-slate-400">Bot volume wash-trading & likuiditas dua arah (Buy/Sell cross matched).</p>
              </div>
              <button
                type="button"
                onClick={() => setIsVolumeBotModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVolumeBot} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={vbName}
                    onChange={e => setVbName(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Trading Pair</label>
                  <select
                    value={vbPairId}
                    onChange={e => setVbPairId(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    {tradingPairs.map(p => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Target Stop Volume (IDR)</label>
                  <input
                    type="text"
                    value={vbVolIdrStop}
                    onChange={e => setVbVolIdrStop(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Priority</label>
                  <select
                    value={vbPriority}
                    onChange={e => setVbPriority(e.target.value as any)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    <option value="RANDOM">random</option>
                    <option value="HIGH">high</option>
                    <option value="NORMAL">normal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Random Min Quantity</label>
                  <input
                    type="text"
                    value={vbRandomMinQty}
                    onChange={e => setVbRandomMinQty(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Random Max Quantity</label>
                  <input
                    type="text"
                    value={vbRandomMaxQty}
                    onChange={e => setVbRandomMaxQty(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Volume Price Decimal</label>
                  <input
                    type="number"
                    value={vbPriceDecimal}
                    onChange={e => setVbPriceDecimal(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Volume Quantity Decimal</label>
                  <input
                    type="number"
                    value={vbQtyDecimal}
                    onChange={e => setVbQtyDecimal(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Scheduling Delay (Min - Max Detik)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={vbMinDelay}
                      onChange={e => setVbMinDelay(e.target.value)}
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                    <input
                      type="number"
                      value={vbMaxDelay}
                      onChange={e => setVbMaxDelay(e.target.value)}
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Difference Spread (Min - Max)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={vbMinDiff}
                      onChange={e => setVbMinDiff(e.target.value)}
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                    <input
                      type="text"
                      value={vbMaxDiff}
                      onChange={e => setVbMaxDiff(e.target.value)}
                      className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Min Limit Price (IDR)</label>
                  <input
                    type="text"
                    value={vbMinLimitPrice}
                    onChange={e => setVbMinLimitPrice(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Max Limit Price (IDR)</label>
                  <input
                    type="text"
                    value={vbMaxLimitPrice}
                    onChange={e => setVbMaxLimitPrice(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Vol IDR Start Threshold</label>
                  <input
                    type="text"
                    value={vbVolIdrStart}
                    onChange={e => setVbVolIdrStart(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Volume Sell Account ID (Default: None)</label>
                  <input
                    type="text"
                    value={vbSellAccountId}
                    onChange={e => setVbSellAccountId(e.target.value)}
                    placeholder="None"
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setIsVolumeBotModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-xs"
                >
                  Deploy Volume Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PRICE FOLLOWER BOT */}
      {isPriceFollowerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]">
              <div>
                <h2 className="text-base font-bold text-white mb-0.5">Deploy Price Follower Bot ({currentEnv})</h2>
                <p className="text-xs text-slate-400">Bot otomatis yang menempatkan Limit Buy & Sell mengikuti feed harga eksternal.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPriceFollowerModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePriceFollower} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={pfName}
                    onChange={e => setPfName(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Trading Pair</label>
                  <select
                    value={pfPairId}
                    onChange={e => setPfPairId(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    {tradingPairs.map(p => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Reference Feed Provider</label>
                  <select
                    value={pfProvider}
                    onChange={e => setPfProvider(e.target.value as any)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    <option value="AGGREGATED">AGGREGATED (Binance + Bybit + CMC)</option>
                    <option value="BINANCE">BINANCE SPOT ONLY</option>
                    <option value="BYBIT">BYBIT SPOT ONLY</option>
                    <option value="COINMARKETCAP">COINMARKETCAP ONLY</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Order Quantity (Base Asset)</label>
                  <input
                    type="text"
                    value={pfOrderQty}
                    onChange={e => setPfOrderQty(e.target.value)}
                    required
                    placeholder="e.g. 0.02"
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Buy Offset (bps below reference)</label>
                  <input
                    type="number"
                    value={pfBuyOffsetBps}
                    onChange={e => setPfBuyOffsetBps(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">20 bps = 0.20% di bawah harga acuan</span>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Sell Offset (bps above reference)</label>
                  <input
                    type="number"
                    value={pfSellOffsetBps}
                    onChange={e => setPfSellOffsetBps(e.target.value)}
                    min="0"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">20 bps = 0.20% di atas harga acuan</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Minimum Reprice Interval (ms)</label>
                  <input
                    type="number"
                    value={pfRepriceInterval}
                    onChange={e => setPfRepriceInterval(e.target.value)}
                    min="1000"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Mencegah churn cancel/replace berlebihan</span>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Minimum Price Change Threshold (bps)</label>
                  <input
                    type="number"
                    value={pfMinPriceChangeBps}
                    onChange={e => setPfMinPriceChangeBps(e.target.value)}
                    min="1"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Reprice hanya jika pergerakan &ge; X bps</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pfDryRun"
                  checked={pfDryRun}
                  onChange={e => setPfDryRun(e.target.checked)}
                  className="rounded bg-[#1e293b] border-[#334155] text-emerald-600"
                />
                <label htmlFor="pfDryRun" className="text-slate-300 cursor-pointer">
                  Dry-Run Mode (Simulasi kalkulasi harga & log tanpa submit order ke Matching Engine)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setIsPriceFollowerModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs"
                >
                  Deploy Price Follower Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE DEPTH & LIQUIDITY BOT */}
      {isDepthLiquidityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]">
              <div>
                <h2 className="text-base font-bold text-white mb-0.5">Deploy Depth & Liquidity Bot ({currentEnv})</h2>
                <p className="text-xs text-slate-400">Menyediakan likuiditas multi-level ladder nyata di sekitar harga referensi.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDepthLiquidityModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDepthLiquidity} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={dlName}
                    onChange={e => setDlName(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Trading Pair</label>
                  <select
                    value={dlPairId}
                    onChange={e => setDlPairId(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    {tradingPairs.map(p => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Number of Bid Levels (Beli)</label>
                  <input
                    type="number"
                    value={dlNumBids}
                    onChange={e => setDlNumBids(e.target.value)}
                    min="1"
                    max="10"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Number of Ask Levels (Jual)</label>
                  <input
                    type="number"
                    value={dlNumAsks}
                    onChange={e => setDlNumAsks(e.target.value)}
                    min="1"
                    max="10"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bid Level Offsets (bps comma-separated)</label>
                  <input
                    type="text"
                    value={dlBidOffsets}
                    onChange={e => setDlBidOffsets(e.target.value)}
                    placeholder="10, 25, 50, 100"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Ask Level Offsets (bps comma-separated)</label>
                  <input
                    type="text"
                    value={dlAskOffsets}
                    onChange={e => setDlAskOffsets(e.target.value)}
                    placeholder="10, 25, 50, 100"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bid Quantities (comma-separated)</label>
                  <input
                    type="text"
                    value={dlBidQuantities}
                    onChange={e => setDlBidQuantities(e.target.value)}
                    placeholder="0.02, 0.05, 0.10"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Ask Quantities (comma-separated)</label>
                  <input
                    type="text"
                    value={dlAskQuantities}
                    onChange={e => setDlAskQuantities(e.target.value)}
                    placeholder="0.02, 0.05, 0.10"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="dlRandomizeQty"
                  checked={dlRandomizeQty}
                  onChange={e => setDlRandomizeQty(e.target.checked)}
                  className="rounded bg-[#1e293b] border-[#334155] text-purple-600"
                />
                <label htmlFor="dlRandomizeQty" className="text-slate-300 cursor-pointer">
                  Randomize Quantities per Level
                </label>
              </div>

              {dlRandomizeQty && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-[#1e293b]/50 rounded-lg">
                  <div>
                    <label className="text-slate-400 block mb-1">Min Random Quantity</label>
                    <input
                      type="text"
                      value={dlRandomMinQty}
                      onChange={e => setDlRandomMinQty(e.target.value)}
                      className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Max Random Quantity</label>
                    <input
                      type="text"
                      value={dlRandomMaxQty}
                      onChange={e => setDlRandomMaxQty(e.target.value)}
                      className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Minimum Reprice Interval (ms)</label>
                  <input
                    type="number"
                    value={dlRepriceInterval}
                    onChange={e => setDlRepriceInterval(e.target.value)}
                    min="1000"
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155] font-mono"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="dlDryRun"
                    checked={dlDryRun}
                    onChange={e => setDlDryRun(e.target.checked)}
                    className="rounded bg-[#1e293b] border-[#334155] text-purple-600"
                  />
                  <label htmlFor="dlDryRun" className="text-slate-300 cursor-pointer">
                    Dry-Run Mode
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setIsDepthLiquidityModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded text-xs"
                >
                  Deploy Depth & Liquidity Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BOT CONFIGURATION */}
      {isEditModalOpen && editingBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e293b]">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Edit Konfigurasi Bot:</span>
                  <span className="text-blue-400 font-mono text-sm">{editingBot.name}</span>
                </h2>
                <span className="text-xs text-slate-400">
                  ID: <span className="font-mono text-slate-300">{editingBot.id}</span> · Tipe: <span className="font-semibold text-emerald-400">{editingBot.botType}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Trading Pair</label>
                  <select
                    value={editPairId}
                    onChange={e => setEditPairId(e.target.value)}
                    className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                  >
                    {tradingPairs.map(p => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ORDER BOT SPECIFIC FIELDS */}
              {editingBot.botType === 'ORDER_BOT' && (
                <>
                  <div className="p-3 bg-[#131b26] rounded-lg border border-[#1e293b] space-y-3">
                    <span className="text-xs font-bold text-amber-400 block uppercase tracking-wide">
                      Pengaturan Eksekusi Order Bot (BUY / SELL)
                    </span>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1 font-semibold">Side / Transaction Type</label>
                        <select
                          value={editObTxType}
                          onChange={e => setEditObTxType(e.target.value as any)}
                          className="w-full bg-[#1e293b] font-bold text-xs p-2 rounded border border-[#334155]"
                        >
                          <option value="BUY" className="text-emerald-400">BUY (Beli / Bid)</option>
                          <option value="SELL" className="text-red-400">SELL (Jual / Ask)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Price Source</label>
                        <select
                          value={editObPriceSource}
                          onChange={e => setEditObPriceSource(e.target.value as any)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        >
                          <option value="MIDPOINT">MIDPOINT</option>
                          <option value="BEST_BID">BEST_BID</option>
                          <option value="BEST_ASK">BEST_ASK</option>
                          <option value="LAST_PRICE">LAST_PRICE</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Order Count (0 = Berjalan Terus)</label>
                        <input
                          type="number"
                          value={editObOrderCount}
                          onChange={e => setEditObOrderCount(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Random Min Quantity</label>
                        <input
                          type="text"
                          value={editObRandomMinQty}
                          onChange={e => setEditObRandomMinQty(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Random Max Quantity</label>
                        <input
                          type="text"
                          value={editObRandomMaxQty}
                          onChange={e => setEditObRandomMaxQty(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Price Decimal</label>
                        <input
                          type="number"
                          value={editObPriceDecimal}
                          onChange={e => setEditObPriceDecimal(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Quantity Decimal</label>
                        <input
                          type="number"
                          value={editObQtyDecimal}
                          onChange={e => setEditObQtyDecimal(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Split Order Mode</label>
                        <select
                          value={editObSplitMode}
                          onChange={e => setEditObSplitMode(e.target.value as any)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        >
                          <option value="NONE">NONE</option>
                          <option value="RANDOM_SPLIT">RANDOM_SPLIT</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Split Range</label>
                        <input
                          type="text"
                          value={editObSplitRange}
                          onChange={e => setEditObSplitRange(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Buy Trailing (Min % - Max %)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editObBuyTrailMin}
                            onChange={e => setEditObBuyTrailMin(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                          <input
                            type="text"
                            value={editObBuyTrailMax}
                            onChange={e => setEditObBuyTrailMax(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Sell Trailing (Min % - Max %)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editObSellTrailMin}
                            onChange={e => setEditObSellTrailMin(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                          <input
                            type="text"
                            value={editObSellTrailMax}
                            onChange={e => setEditObSellTrailMax(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                        </div>
                      </div>
                    </div>

                    {editObTxType === 'BUY' ? (
                      <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-lg">
                        <span className="text-[11px] font-bold text-emerald-400 block mb-2 uppercase tracking-wide">
                          Batasan Harga Order Buy (Beli / Bid)
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-emerald-200 block mb-1 font-semibold">
                              Min Buy Price Limit (IDR)
                            </label>
                            <input
                              type="text"
                              value={editObBuyMinPrice}
                              onChange={e => setEditObBuyMinPrice(e.target.value)}
                              placeholder="Contoh: 1200000000 (Kosongkan jika tanpa batas)"
                              className="w-full bg-[#1e293b] text-emerald-300 font-mono p-2 rounded border border-emerald-500/40 focus:border-emerald-400 outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              Floor: Bot BUY tidak akan memasang bid di bawah harga ini.
                            </span>
                          </div>
                          <div>
                            <label className="text-emerald-200 block mb-1 font-semibold">
                              Max Buy Price Limit (IDR)
                            </label>
                            <input
                              type="text"
                              value={editObBuyMaxPrice}
                              onChange={e => setEditObBuyMaxPrice(e.target.value)}
                              placeholder="Contoh: 1500000000 (Kosongkan jika tanpa batas)"
                              className="w-full bg-[#1e293b] text-emerald-300 font-mono p-2 rounded border border-emerald-500/40 focus:border-emerald-400 outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              Ceiling: Bot BUY tidak akan membeli di atas harga ini.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg">
                        <span className="text-[11px] font-bold text-red-400 block mb-2 uppercase tracking-wide">
                          Batasan Harga Order Sell (Jual / Ask)
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-red-200 block mb-1 font-semibold">
                              Min Sell Price Limit (IDR)
                            </label>
                            <input
                              type="text"
                              value={editObSellMinPrice}
                              onChange={e => setEditObSellMinPrice(e.target.value)}
                              placeholder="Contoh: 1300000000 (Kosongkan jika tanpa batas)"
                              className="w-full bg-[#1e293b] text-red-300 font-mono p-2 rounded border border-red-500/40 focus:border-red-400 outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              Floor: Bot SELL tidak akan menjual di bawah harga ini.
                            </span>
                          </div>
                          <div>
                            <label className="text-red-200 block mb-1 font-semibold">
                              Max Sell Price Limit (IDR)
                            </label>
                            <input
                              type="text"
                              value={editObSellMaxPrice}
                              onChange={e => setEditObSellMaxPrice(e.target.value)}
                              placeholder="Contoh: 1650000000 (Kosongkan jika tanpa batas)"
                              className="w-full bg-[#1e293b] text-red-300 font-mono p-2 rounded border border-red-500/40 focus:border-red-400 outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              Ceiling: Bot SELL tidak akan memasang ask di atas harga ini.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Expire Time (Detik, 0 = GTC)</label>
                        <input
                          type="number"
                          value={editObExpireTime}
                          onChange={e => setEditObExpireTime(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Jitter Timing (%)</label>
                        <input
                          type="number"
                          value={editObJitterTiming}
                          onChange={e => setEditObJitterTiming(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Jitter Price (%)</label>
                        <input
                          type="number"
                          value={editObJitterPrice}
                          onChange={e => setEditObJitterPrice(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* VOLUME BOT SPECIFIC FIELDS */}
              {editingBot.botType === 'VOLUME_BOT' && (
                <>
                  <div className="p-3 bg-[#131b26] rounded-lg border border-[#1e293b] space-y-3">
                    <span className="text-xs font-bold text-indigo-400 block uppercase tracking-wide">
                      Pengaturan Eksekusi Volume Bot
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Target Stop Volume (IDR)</label>
                        <input
                          type="text"
                          value={editVbVolIdrStop}
                          onChange={e => setEditVbVolIdrStop(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Priority</label>
                        <select
                          value={editVbPriority}
                          onChange={e => setEditVbPriority(e.target.value as any)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        >
                          <option value="RANDOM">random</option>
                          <option value="HIGH">high</option>
                          <option value="NORMAL">normal</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Random Min Quantity</label>
                        <input
                          type="text"
                          value={editVbRandomMinQty}
                          onChange={e => setEditVbRandomMinQty(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Random Max Quantity</label>
                        <input
                          type="text"
                          value={editVbRandomMaxQty}
                          onChange={e => setEditVbRandomMaxQty(e.target.value)}
                          required
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Scheduling Delay (Min - Max Detik)</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={editVbMinDelay}
                            onChange={e => setEditVbMinDelay(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                          <input
                            type="number"
                            value={editVbMaxDelay}
                            onChange={e => setEditVbMaxDelay(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Difference Spread (Min - Max)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editVbMinDiff}
                            onChange={e => setEditVbMinDiff(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                          <input
                            type="text"
                            value={editVbMaxDiff}
                            onChange={e => setEditVbMaxDiff(e.target.value)}
                            className="w-1/2 bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Min Limit Price (IDR)</label>
                        <input
                          type="text"
                          value={editVbMinLimitPrice}
                          onChange={e => setEditVbMinLimitPrice(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Max Limit Price (IDR)</label>
                        <input
                          type="text"
                          value={editVbMaxLimitPrice}
                          onChange={e => setEditVbMaxLimitPrice(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-400 block mb-1">Vol IDR Start Threshold</label>
                        <input
                          type="text"
                          value={editVbVolIdrStart}
                          onChange={e => setEditVbVolIdrStart(e.target.value)}
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">Volume Sell Account ID (Opsional)</label>
                        <input
                          type="text"
                          value={editVbSellAccountId}
                          onChange={e => setEditVbSellAccountId(e.target.value)}
                          placeholder="None (Gunakan akun default)"
                          className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs shadow-md"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CLONE BOT (Phase 8 - Enhanced Multi-Instance Support) */}
      {isCloneModalOpen && cloneSourceBot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-lg w-full p-6 text-slate-300">
            <h2 className="text-base font-bold text-white mb-2">Clone Bot Instance (Multi-Bot Setup)</h2>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Kloning membuat instance bot baru dengan ID unik dan worker lease independen.
              Anda dapat mengkloning untuk membuat kombinasi misal <strong>3 Bot BUY dan 3 Bot SELL</strong> dengan setingan config yang beda.
            </p>

            <div className="space-y-4 text-xs font-sans">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">New Bot Name</label>
                <input
                  type="text"
                  value={cloneNewName}
                  onChange={e => setCloneNewName(e.target.value)}
                  required
                  className="w-full bg-[#1e293b] text-white p-2 rounded border border-[#334155]"
                />
              </div>

              {/* Order Bot Side Selection on Clone */}
              {cloneSourceBot.botType === 'ORDER_BOT' && (
                <div className="p-3 bg-[#131b26] rounded-lg border border-[#1e293b]">
                  <label className="text-amber-400 block mb-1.5 font-bold uppercase text-[11px]">
                    Pilih Sisi Transaksi untuk Kloning Ini:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCloneTxType('BUY')}
                      className={`p-2.5 rounded-lg border text-left font-bold transition-all ${
                        cloneTxType === 'BUY'
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-sm'
                          : 'bg-[#1e293b] border-[#334155] text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-xs">BUY Bot (Beli)</span>
                      <span className="block text-[10px] font-normal opacity-75">Pasang likuiditas bid / beli</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloneTxType('SELL')}
                      className={`p-2.5 rounded-lg border text-left font-bold transition-all ${
                        cloneTxType === 'SELL'
                          ? 'bg-red-600/20 border-red-500 text-red-400 shadow-sm'
                          : 'bg-[#1e293b] border-[#334155] text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="block text-xs">SELL Bot (Jual)</span>
                      <span className="block text-[10px] font-normal opacity-75">Pasang likuiditas ask / jual</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">
                    * Induk saat ini: <strong>{cloneSourceBot.orderBotConfig?.transaction_type}</strong> · Kloning ini akan diset sebagai <strong>{cloneTxType}</strong>.
                  </span>
                </div>
              )}

              <div className="p-3 bg-[#0a0f18] rounded border border-[#1e293b] text-slate-400 font-mono text-[11px] space-y-1">
                <div>Pair: <span className="text-white font-bold">{cloneSourceBot.pairId}</span></div>
                <div>Environment: <span className="text-white">{cloneSourceBot.environment}</span></div>
                <div>Config Version: <span className="text-white">v1 (Fresh independent configuration)</span></div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-[#1e293b]">
              <button
                type="button"
                onClick={() => setIsCloneModalOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleConfirmClone}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-xs shadow-md"
              >
                Konfirmasi Kloning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CSV IMPORT (Phase 11) */}
      {isCsvImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl max-w-2xl w-full p-6 text-slate-300">
            <h2 className="text-base font-bold text-white mb-2">CSV Bot Configuration Import (Phase 11)</h2>
            <p className="text-xs text-slate-400 mb-4">
              Tempelkan konten CSV Anda di bawah ini untuk melihat pratinjau validasi baris per baris sebelum disimpan.
            </p>

            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Bot Type Scheme</label>
              <select
                value={csvImportType}
                onChange={e => setCsvImportType(e.target.value as any)}
                className="bg-[#1e293b] text-white text-xs p-2 rounded border border-[#334155]"
              >
                <option value="ORDER_BOT">Order Bot Scheme</option>
                <option value="VOLUME_BOT">Volume Bot Scheme</option>
              </select>
            </div>

            <textarea
              rows={6}
              value={csvRawText}
              onChange={e => setCsvRawText(e.target.value)}
              placeholder="id,name,pairId,transaction_type,random_min_quantity,random_max_quantity,order_count..."
              className="w-full bg-[#05080f] text-slate-200 font-mono text-xs p-3 rounded border border-[#334155] mb-4"
            />

            {csvPreview && (
              <div className="mb-4 p-3 bg-[#131b26] rounded border border-[#1e293b] text-xs">
                <div className="flex justify-between font-bold mb-2">
                  <span>Pratinjau Hasil Validasi:</span>
                  <span className={csvPreview.validRowsCount > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {csvPreview.validRowsCount} / {csvPreview.totalRows} Baris Valid
                  </span>
                </div>
                {csvPreview.errors.length > 0 && (
                  <div className="text-red-400 space-y-0.5 max-h-28 overflow-y-auto font-mono text-[11px]">
                    {csvPreview.errors.map((err, i) => (
                      <div key={i}>Baris #{err.row}: {err.error} ({err.field})</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-[#1e293b]">
              <button
                type="button"
                onClick={handleCsvPreview}
                className="px-4 py-2 bg-[#1e293b] hover:bg-[#283548] text-white text-xs font-semibold rounded"
              >
                Pratinjau & Validasi Baris
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCsvImportModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-xs"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={!csvPreview || csvPreview.validRowsCount === 0}
                  onClick={handleCsvConfirm}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded text-xs"
                >
                  Konfirmasi Impor ({csvPreview?.validRowsCount || 0} Bot)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE BOT CONFIRMATION */}
      {isDeleteModalOpen && botToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#0f172a] border border-red-500/40 rounded-xl max-w-md w-full p-6 text-slate-300 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <span className="text-2xl">🗑️</span>
              <div>
                <h3 className="text-base font-bold text-white">Hapus Bot Instance?</h3>
                <span className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan.</span>
              </div>
            </div>

            <div className="p-3 bg-[#1e293b]/60 rounded-lg border border-[#334155] space-y-1.5 text-xs font-mono mb-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Nama Bot:</span>
                <strong className="text-white">{botToDelete.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ID Bot:</span>
                <span className="text-slate-300">{botToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tipe / Pair:</span>
                <span className="text-amber-400">{botToDelete.botType} ({botToDelete.pairId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status Saat Ini:</span>
                <span className={botToDelete.status === 'RUNNING' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {botToDelete.status}
                </span>
              </div>
            </div>

            <p className="text-xs text-amber-300 bg-amber-500/10 p-2.5 rounded border border-amber-500/20 mb-5 leading-relaxed">
              ⚠️ <strong>Perhatian:</strong> Jika bot sedang berjalan, worker akan segera dihentikan dan seluruh order terbuka milik bot ini pada buku order akan otomatis dibatalkan.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setBotToDelete(null);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBot}
                disabled={isLoading}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold shadow-md shadow-red-950/40"
              >
                {isLoading ? 'Menghapus...' : 'Ya, Hapus Bot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KILL-SWITCH CONFIRMATION */}
      {isKillSwitchConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="bg-[#150a0f] border border-red-600 rounded-xl max-w-md w-full p-6 text-slate-300 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <span className="text-3xl animate-bounce">🛑</span>
              <div>
                <h3 className="text-base font-bold text-white">Konfirmasi Emergency Kill-Switch</h3>
                <span className="text-xs text-red-300">Penghentian Darurat Semua Aktivitas Bot</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Apakah Anda yakin ingin mengaktifkan <strong>Emergency Kill-Switch</strong>?
            </p>

            <div className="p-3 bg-red-950/40 rounded-lg border border-red-500/30 text-xs text-red-200 space-y-1 mb-5">
              <div>• <strong>Semua bot aktif</strong> di seluruh environment akan seketika dihentikan (HALTED).</div>
              <div>• <strong>Seluruh order terbuka</strong> yang dipasang oleh bot akan langsung ditarik dari order book.</div>
              <div>• Sistem dapat dipulihkan kapan saja dengan menekan <em>Reset Kill-Switch</em>.</div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsKillSwitchConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsKillSwitchConfirmOpen(false);
                  try {
                    await handleAction('/api/mm/kill-switch', 'POST');
                  } catch (e) {}
                }}
                disabled={isLoading}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold shadow-lg shadow-red-950/60"
              >
                {isLoading ? 'Mengeksekusi...' : 'Aktifkan Kill-Switch Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
