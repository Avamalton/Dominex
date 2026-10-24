/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/types/index.ts
 * Frontend domain types and internationalization dictionaries (ID / EN).
 */

export type AppLanguage = 'ID' | 'EN';

export type UserRole = 'user' | 'compliance' | 'admin' | 'superadmin' | 'USER' | 'MM' | 'ADMIN';
export type Environment = 'DEMO' | 'STAGING' | 'PRODUCTION';
export type BotStatus = 'DRAFT' | 'VALIDATING' | 'READY' | 'RUNNING' | 'PAUSED' | 'STOPPING' | 'STOPPED' | 'ERROR' | 'RISK_HALTED';
export type BotType = 
  | 'ORDER_BOT' 
  | 'VOLUME_BOT' 
  | 'PRICE_FOLLOWER' 
  | 'DEPTH_LIQUIDITY' 
  | 'SPOT_GRID' 
  | 'BUY_LAYERS' 
  | 'SELL_LAYERS' 
  | 'SMART_TRADE';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  status: 'active' | 'frozen' | 'suspended';
  isTotpEnabled: boolean;
  kycStatus?: 'unverified' | 'pending' | 'approved' | 'rejected';
  kycTier?: number;
  fullName?: string;
}

export interface OrderBotConfig {
  account_id: string;
  price_source: 'BEST_BID' | 'BEST_ASK' | 'MIDPOINT' | 'LAST_PRICE';
  price_decimal: number;
  quantity_decimal: number;
  random_min_quantity: string;
  random_max_quantity: string;
  order_count: number;
  expire_time: number;
  transaction_type: 'BUY' | 'SELL';
  split_order_mode: 'NONE' | 'RANDOM_SPLIT';
  split_range: string;
  buy_trailing_min_percentage: string;
  buy_trailing_max_percentage: string;
  sell_trailing_min_percentage: string;
  sell_trailing_max_percentage: string;
  buy_min_price_limit?: string;
  buy_max_price_limit?: string;
  sell_min_price_limit?: string;
  sell_max_price_limit?: string;
  jitter_timing_pct: number;
  jitter_price_pct: number;
}

export interface VolumeBotConfig {
  account_id: string;
  volume_price_decimal: number;
  volume_quantity_decimal: number;
  volume_random_min_quantity: string;
  volume_random_max_quantity: string;
  min_delay: number;
  max_delay: number;
  min_difference: string;
  max_difference: string;
  priority: 'RANDOM' | 'HIGH' | 'NORMAL';
  max_limit_price: string;
  min_limit_price: string;
  vol_idr_stop_target: string;
  vol_idr_start_threshold: string;
  volume_sell_account_id?: string;
}

export interface PriceFollowerConfig {
  account_id: string;
  market_symbol: string;
  reference_provider: 'AGGREGATED' | 'BINANCE' | 'BYBIT' | 'COINMARKETCAP';
  reference_price_source: 'MIDPOINT' | 'LAST_PRICE' | 'BEST_BID' | 'BEST_ASK';
  reference_price_mode: 'STATIC_OFFSET' | 'DYNAMIC_SPREAD';
  target_spread_bps: number;
  buy_offset_bps: number;
  sell_offset_bps: number;
  order_quantity: string;
  minimum_reprice_interval_ms: number;
  minimum_price_change_bps: number;
  maximum_price_deviation_bps: number;
  maximum_order_quantity: string;
  maximum_order_value_idr: string;
  maximum_open_orders: number;
  maximum_inventory: string;
  maximum_daily_turnover_idr: string;
  maximum_daily_loss_idr: string;
  maximum_cancel_replace_rate: number;
  max_data_age_ms: number;
  tick_size: number;
  lot_size: string;
  enabled: boolean;
  dry_run: boolean;
  activeBuyOrderId?: string;
  activeSellOrderId?: string;
  lastRepriceTimestamp?: number;
  lastTargetPriceIdr?: number;
}

export interface DepthLiquidityConfig {
  account_id: string;
  market_symbol: string;
  reference_price_source: 'AGGREGATED' | 'BINANCE' | 'BYBIT';
  number_of_bid_levels: number;
  number_of_ask_levels: number;
  bid_level_offsets_bps: number[];
  ask_level_offsets_bps: number[];
  bid_quantities: string[];
  ask_quantities: string[];
  quantity_randomization_enabled: boolean;
  random_min_quantity: string;
  random_max_quantity: string;
  minimum_reprice_interval_ms: number;
  minimum_price_change_bps: number;
  maximum_open_orders: number;
  maximum_total_bid_value_idr: string;
  maximum_total_ask_quantity: string;
  maximum_inventory: string;
  maximum_order_value_idr: string;
  max_data_age_ms: number;
  tick_size: number;
  lot_size: string;
  dry_run: boolean;
  enabled: boolean;
  activeOrderIds?: string[];
  lastRepriceTimestamp?: number;
}

export interface BotInstance {
  id: string;
  name: string;
  botType: BotType;
  pairId: string;
  environment: Environment;
  ownerUserId: string;
  accountId: string;
  version: number;
  status: BotStatus;
  lastHeartbeat: number;
  startedAt?: number;
  stoppedAt?: number;
  lastExecutionResult?: string;
  errorInfo?: string;
  orderBotConfig?: OrderBotConfig;
  volumeBotConfig?: VolumeBotConfig;
  priceFollowerConfig?: PriceFollowerConfig;
  depthLiquidityConfig?: DepthLiquidityConfig;
  gridConfig?: any;
  stats: {
    ordersSubmitted: number;
    ordersAccepted: number;
    ordersFilled: number;
    executedVolume: string;
    totalTrades: number;
  };
  deployedOrderIds: string[];
  logs: {
    timestamp: number;
    message: string;
    type: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK';
  }[];
  createdBy: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RiskControlsConfig {
  maxActiveBots: number;
  maxOpenOrdersPerBot: number;
  maxOrderSize: string;
  maxNotionalExposureIdr: string;
  maxDailyTradingNotionalIdr: string;
  maxPriceDeviationPct: number;
  maxOrderSubmissionRatePerMin: number;
  maxTotalReservedBalancePct: number;
  maxRetryCount: number;
  maxRuntimeMinutes: number;
  maxConsecutiveErrors: number;
  maxAllowedSlippagePct: number;
  selfTradePreventionPolicy: 'CANCEL_MAKER' | 'CANCEL_TAKER' | 'REJECT_BOTH';
  isKillSwitchActive: boolean;
}

export interface UserBalance {
  currency: string;
  balanceAvailable: string;
  balanceLocked: string;
  balanceTotal: string;
  displayAvailable: string;
  displayLocked: string;
  displayTotal: string;
}

export interface TradingPairItem {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseDecimals: number;
  quoteDecimals: number;
  minOrderSize: string;
  maxOrderSize: string;
  makerFeeBps: number;
  takerFeeBps: number;
  isActive: boolean;
  isHalted: boolean;
  lastPrice: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  priceChange24h: string;
}

export interface OrderItem {
  id: string;
  userId: string;
  pairId: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  timeInForce: 'GTC' | 'IOC';
  price: string;
  quantity: string;
  filledQuantity: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  lockedAmount: string;
  lockedCurrency: string;
  clientOrderId?: string;
  createdAt: number;
}

export interface TradeItem {
  id: string;
  pairId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId?: string;
  takerUserId?: string;
  price: string;
  quantity: string;
  quoteVolume: string;
  takerSide: 'BUY' | 'SELL';
  createdAt: number;
}

export interface CandleItem {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const I18N = {
  ID: {
    brandSubtitle: 'Bursa Kripto Spot IDR',
    navMarkets: 'Pasar',
    navTrade: 'Trading',
    navBot: 'Bot Algo Console',
    navWallet: 'Dompet & Saldo',
    navSecurity: 'Keamanan & API',
    navKyc: 'Verifikasi KYC',
    navAdmin: 'Admin Console',
    login: 'Masuk',
    register: 'Daftar',
    logout: 'Keluar',
    orderBook: 'Buku Order (Order Book)',
    marketTrades: 'Transaksi Pasar Live',
    placeOrder: 'Pasang Order',
    buy: 'Beli',
    sell: 'Jual',
    limit: 'Limit',
    market: 'Market',
    price: 'Harga',
    amount: 'Jumlah',
    total: 'Total',
    available: 'Tersedia',
    locked: 'Terkunci',
    cancel: 'Batal',
    openOrders: 'Order Aktif',
    orderHistory: 'Riwayat Order',
    depositIDR: 'Deposit IDR (Virtual Account)',
    withdrawIDR: 'Tarik Rupiah (Bank Transfer)',
    cryptoDeposit: 'Deposit Kripto',
    cryptoWithdraw: 'Tarik Kripto',
    feeEst: 'Estimasi Biaya',
    tif: 'Waktu Berlaku (TIF)',
    gtc: 'GTC (Good Till Cancelled)',
    ioc: 'IOC (Immediate Or Cancel)',
    securitySettings: 'Pengaturan Keamanan & Kunci API',
    enable2fa: 'Aktifkan 2FA TOTP',
    disable2fa: 'Nonaktifkan 2FA',
    apiKeys: 'Kunci API (HMAC-SHA256)',
    createApiKey: 'Buat Kunci API Baru',
    kycTitle: 'Verifikasi Identitas Resmi (KYC)',
    kycSubtitle: 'Sesuai regulasi Bappebti untuk perlindungan nasabah dan pencegahan pencucian uang.',
    approved: 'Terverifikasi (Tier 1)',
    pending: 'Menunggu Review',
    unverified: 'Belum Terverifikasi',
    switchPair: 'Pilih Pair Spot',
    adminConsole: 'Konsol Operator & Kepatuhan'
  },
  EN: {
    brandSubtitle: 'Spot Crypto Exchange IDR',
    navMarkets: 'Markets',
    navTrade: 'Trade',
    navBot: 'Algo Bot Console',
    navWallet: 'Wallet & Balances',
    navSecurity: 'Security & API',
    navKyc: 'KYC Verification',
    navAdmin: 'Admin Console',
    login: 'Sign In',
    register: 'Sign Up',
    logout: 'Sign Out',
    orderBook: 'Order Book Depth',
    marketTrades: 'Live Market Trades',
    placeOrder: 'Place Order',
    buy: 'Buy',
    sell: 'Sell',
    limit: 'Limit',
    market: 'Market',
    price: 'Price',
    amount: 'Amount',
    total: 'Total',
    available: 'Available',
    locked: 'Locked',
    cancel: 'Cancel',
    openOrders: 'Open Orders',
    orderHistory: 'Order History',
    depositIDR: 'Deposit IDR (Virtual Account)',
    withdrawIDR: 'Withdraw IDR (Bank Transfer)',
    cryptoDeposit: 'Crypto Deposit',
    cryptoWithdraw: 'Crypto Withdraw',
    feeEst: 'Estimated Fee',
    tif: 'Time In Force (TIF)',
    gtc: 'GTC (Good Till Cancelled)',
    ioc: 'IOC (Immediate Or Cancel)',
    securitySettings: 'Security Settings & API Keys',
    enable2fa: 'Enable 2FA TOTP',
    disable2fa: 'Disable 2FA',
    apiKeys: 'API Keys (HMAC-SHA256)',
    createApiKey: 'Generate New API Key',
    kycTitle: 'Identity Verification (KYC)',
    kycSubtitle: 'Compliant with financial regulatory standards and anti-money laundering frameworks.',
    approved: 'Verified (Tier 1)',
    pending: 'Pending Review',
    unverified: 'Unverified',
    switchPair: 'Select Spot Pair',
    adminConsole: 'Operator & Risk Console'
  }
};
