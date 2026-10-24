/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ExternalFeedTypes.ts
 * Type definitions and interfaces for external market data feeds, multi-exchange aggregator,
 * and USDT/IDR conversion engine.
 */

export type ProviderId = 'binance' | 'bybit' | 'coinmarketcap';

export type ProviderConnectionStatus = 
  | 'DISCONNECTED' 
  | 'CONNECTING' 
  | 'CONNECTED' 
  | 'DEGRADED' 
  | 'STALE' 
  | 'ERROR';

export interface ExternalPriceTick {
  provider: ProviderId;
  symbol: string;               // e.g. 'BTCUSDT', 'ETHUSDT'
  lastPrice: number;            // Latest trade price
  bestBid: number;              // Best bid
  bestAsk: number;              // Best ask
  exchangeTimestamp: number;    // Timestamp from exchange
  receivedAt: number;           // Local timestamp when tick received
  latencyMs: number;            // Local receivedAt - exchangeTimestamp
  isFresh: boolean;
  isValid: boolean;
  rejectionReason?: string;
}

export interface ProviderMetrics {
  reconnectCount: number;
  lastHeartbeat: number;
  messagesReceived: number;
  lastMessageTimestamp: number;
  avgLatencyMs: number;
  lastError?: string;
}

export interface ExternalMarketDataProvider {
  id: ProviderId;
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(symbols: string[]): void;
  reconnect(): Promise<void>;
  getConnectionStatus(): ProviderConnectionStatus;
  getLatestPrice(symbol: string): number | null;
  getLatestBidAsk(symbol: string): { bid: number; ask: number } | null;
  getLastUpdateTimestamp(symbol: string): number | null;
  getMetrics(): ProviderMetrics;
  getTick(symbol: string): ExternalPriceTick | null;
}

export interface AggregatorConfig {
  primaryProvider: ProviderId;
  secondaryProvider: ProviderId;
  maxDataAgeMs: number;             // e.g. 5000ms
  maxAllowedDeviationBps: number;    // e.g. 200 bps = 2.00%
  maxSpreadBps: number;             // e.g. 300 bps = 3.00%
  minValidProviders: number;        // default 1
  failoverBehavior: 'AUTOMATIC' | 'MANUAL';
  outlierRejectionPolicy: 'STRICT' | 'LOG_ONLY';
}

export interface AggregatedReferencePrice {
  symbol: string;                   // e.g. 'BTCUSDT'
  pairId: string;                   // e.g. 'BTC-IDR'
  effectiveUsdtPrice: number;       // In USDT
  effectiveIdrPrice: number;        // In IDR (after FX rate conversion)
  primaryProvider: ProviderId;
  activeProvider: ProviderId;
  deviationBps: number;
  isStale: boolean;
  isAbnormal: boolean;
  status: 'ACTIVE' | 'DEGRADED' | 'REFERENCE_PRICE_UNAVAILABLE';
  rejectionReason?: string;
  binancePrice: number | null;
  bybitPrice: number | null;
  cmcPrice: number | null;
  fxRateUsed: number;
  fxTimestamp: number;
  updatedAt: number;
}

export interface FxRateRecord {
  rate: number;                     // IDR per 1 USDT (e.g. 16350.00)
  source: 'MANUAL_ADMIN' | 'EXTERNAL_FEED' | 'COINMARKETCAP' | 'SYSTEM_DEFAULT';
  updatedBy: string;                // Admin email or system
  updatedAt: number;
  validUntil: number;               // Epoch ms until this rate is considered valid
  isStale: boolean;
  notes?: string;
}

export interface FxRateAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  previousRate: number;
  newRate: number;
  percentChange: number;
  source: string;
  notes?: string;
}
