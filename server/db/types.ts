/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * types.ts
 * Core domain entities and enumerations for DIMONEX exchange.
 */

export type UserRole = 'user' | 'compliance' | 'admin' | 'superadmin' | 'USER' | 'MM' | 'ADMIN';
export type UserStatus = 'active' | 'frozen' | 'suspended';
export type KycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type TimeInForce = 'GTC' | 'IOC';
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
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

export type JournalTxType = 
  | 'DEPOSIT' 
  | 'WITHDRAW' 
  | 'ORDER_LOCK' 
  | 'ORDER_UNLOCK' 
  | 'TRADE_SETTLEMENT' 
  | 'FEE_COLLECTION';

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export interface OrderBotConfig {
  account_id: string;
  price_source: 'BEST_BID' | 'BEST_ASK' | 'MIDPOINT' | 'LAST_PRICE';
  price_decimal: number;
  quantity_decimal: number;
  random_min_quantity: string;
  random_max_quantity: string;
  order_count: number;
  expire_time: number; // Duration in seconds (e.g. 60 = 1 minute, 0 = GTC)
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
  min_delay: number; // in seconds
  max_delay: number; // in seconds
  min_difference: string; // price spread or delta ticks
  max_difference: string;
  priority: 'RANDOM' | 'HIGH' | 'NORMAL';
  max_limit_price: string;
  min_limit_price: string;
  vol_idr_stop_target: string; // Target volume in IDR
  vol_idr_start_threshold: string;
  volume_sell_account_id?: string;
}

export interface PriceFollowerConfig {
  account_id: string;
  market_symbol: string;
  reference_provider: 'AGGREGATED' | 'BINANCE' | 'BYBIT' | 'COINMARKETCAP';
  reference_price_source: 'MIDPOINT' | 'LAST_PRICE' | 'BEST_BID' | 'BEST_ASK';
  reference_price_mode: 'STATIC_OFFSET' | 'DYNAMIC_SPREAD';
  target_spread_bps: number;          // e.g. 40 bps = 0.40%
  buy_offset_bps: number;             // e.g. 20 bps = 0.20%
  sell_offset_bps: number;            // e.g. 20 bps = 0.20%
  order_quantity: string;             // Base units string e.g. '0.05'
  minimum_reprice_interval_ms: number;// e.g. 2000
  minimum_price_change_bps: number;   // e.g. 5 bps
  maximum_price_deviation_bps: number;// e.g. 300 bps
  maximum_order_quantity: string;     // e.g. '1.0'
  maximum_order_value_idr: string;    // e.g. '100000000' (100 Juta IDR)
  maximum_open_orders: number;        // e.g. 2 (1 buy, 1 sell)
  maximum_inventory: string;          // Maximum base unit balance allowed to hold
  maximum_daily_turnover_idr: string; // IDR turnover cap
  maximum_daily_loss_idr: string;     // Loss stop cap
  maximum_cancel_replace_rate: number;// max cancels/sec
  max_data_age_ms: number;            // e.g. 5000
  tick_size: number;                  // e.g. 1000 IDR
  lot_size: string;                   // e.g. '0.0001'
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
  number_of_bid_levels: number;       // e.g. 3 to 10
  number_of_ask_levels: number;       // e.g. 3 to 10
  bid_level_offsets_bps: number[];    // e.g. [10, 25, 50, 100]
  ask_level_offsets_bps: number[];    // e.g. [10, 25, 50, 100]
  bid_quantities: string[];           // e.g. ['0.05', '0.10', '0.15']
  ask_quantities: string[];           // e.g. ['0.05', '0.10', '0.15']
  quantity_randomization_enabled: boolean;
  random_min_quantity: string;
  random_max_quantity: string;
  minimum_reprice_interval_ms: number;// e.g. 3000
  minimum_price_change_bps: number;   // e.g. 10 bps
  maximum_open_orders: number;        // e.g. 20
  maximum_total_bid_value_idr: string;// e.g. '500000000'
  maximum_total_ask_quantity: string; // e.g. '5.0'
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
    executedVolume: string; // Base units
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

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  status: UserStatus;
  totpSecret?: string;
  isTotpEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil?: number; // epoch ms
  createdAt: number;
  updatedAt: number;
}

export interface UserKyc {
  id: string;
  userId: string;
  fullName: string;
  nik: string; // Indonesian National ID
  birthDate: string;
  idCardUrl?: string;
  selfieUrl?: string;
  status: KycStatus;
  rejectionReason?: string;
  tierLevel: number; // 1 = 25M IDR/day, 2 = 500M IDR/day
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
}

export interface LedgerAccount {
  id: string;
  userId: string;
  currency: string;
  balanceAvailable: string; // BigInt unit string
  balanceLocked: string;    // BigInt unit string
  version: number;
  updatedAt: number;
}

export interface JournalTransaction {
  id: string;
  idempotencyKey: string;
  txType: JournalTxType;
  referenceId: string;
  description: string;
  createdAt: number;
}

export interface LedgerEntry {
  id: string;
  journalId: string;
  accountId: string;
  entryType: LedgerEntryType;
  amount: string; // BigInt unit string
  balanceAfter: string;
  createdAt: number;
}

export interface TradingPair {
  id: string; // e.g. 'BTC-IDR'
  baseCurrency: string;
  quoteCurrency: string;
  baseDecimals: number;
  quoteDecimals: number;
  minOrderSize: string; // in base units
  maxOrderSize: string;
  makerFeeBps: number;  // 10 = 0.10%
  takerFeeBps: number;  // 20 = 0.20%
  isActive: boolean;
  isHalted: boolean;
  lastPrice: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  priceChange24h: string; // percentage string e.g. "+2.45"
}

export interface Order {
  id: string;
  userId: string;
  pairId: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  price: string;          // Quote unit string (0 if market)
  quantity: string;       // Base unit string
  filledQuantity: string; // Base unit string
  status: OrderStatus;
  lockedAmount: string;   // Units locked when placing
  lockedCurrency: string; // 'IDR' for BUY, baseCurrency for SELL
  clientOrderId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  pairId: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  price: string;
  quantity: string;
  quoteVolume: string;
  makerFee: string;
  takerFee: string;
  takerSide: OrderSide;
  createdAt: number;
}

export interface FiatTransaction {
  id: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  method: 'BCA_VA' | 'MANDIRI_VA' | 'BRI_VA' | 'BANK_TRANSFER';
  amount: string; // IDR units (2 decimals)
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  accountNumber: string;
  accountHolderName: string;
  idempotencyKey: string;
  txHash?: string;
  createdAt: number;
}

export interface CryptoTransaction {
  id: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  currency: string;
  chain: string;
  address: string;
  amount: string;
  txHash: string;
  status: 'PENDING' | 'CONFIRMING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  confirmations: number;
  requiredConfirmations: number;
  createdAt: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyId: string;
  secretHash: string;
  label: string;
  permissions: ('read' | 'trade')[];
  ipWhitelist?: string;
  isActive: boolean;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resource: string;
  details: string;
  ipAddress?: string;
  createdAt: number;
}
