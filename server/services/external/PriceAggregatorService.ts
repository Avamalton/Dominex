/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PriceAggregatorService.ts
 * Multi-Exchange Price Aggregator (Binance & Bybit) with deviation check,
 * staleness detection, automatic failover, and USDT/IDR FX conversion.
 */

import { BinancePublicFeed } from './BinancePublicFeed.js';
import { BybitPublicFeed } from './BybitPublicFeed.js';
import { CoinMarketCapFeed } from './CoinMarketCapFeed.js';
import { fxConversionService } from './FxConversionService.js';
import { 
  AggregatorConfig, 
  AggregatedReferencePrice, 
  ProviderId, 
  ExternalPriceTick 
} from './ExternalFeedTypes.js';

export class PriceAggregatorService {
  public readonly binance: BinancePublicFeed;
  public readonly bybit: BybitPublicFeed;
  public readonly cmc: CoinMarketCapFeed;

  private config: AggregatorConfig = {
    primaryProvider: 'binance',
    secondaryProvider: 'bybit',
    maxDataAgeMs: 15000,           // 15 seconds max age
    maxAllowedDeviationBps: 200,   // 2.00% max difference between exchanges
    maxSpreadBps: 300,             // 3.00% max spread
    minValidProviders: 1,
    failoverBehavior: 'AUTOMATIC',
    outlierRejectionPolicy: 'STRICT'
  };

  constructor() {
    this.binance = new BinancePublicFeed();
    this.bybit = new BybitPublicFeed();
    this.cmc = new CoinMarketCapFeed();

    // Start background connections (non-blocking)
    this.binance.connect().catch(() => {});
    this.bybit.connect().catch(() => {});
    this.cmc.connect().catch(() => {});
  }

  public getConfig(): AggregatorConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AggregatorConfig>): AggregatorConfig {
    this.config = {
      ...this.config,
      ...newConfig
    };
    return this.getConfig();
  }

  /**
   * Get aggregated reference price for a DIMONEX trading pair (e.g. 'BTC-IDR', 'ETH-IDR', 'USDT-IDR')
   */
  public getReferencePrice(pairId: string): AggregatedReferencePrice {
    const now = Date.now();
    const upperPair = pairId.toUpperCase();

    // Special case for USDT-IDR: purely driven by FX rate
    if (upperPair === 'USDT-IDR') {
      const fx = fxConversionService.getCurrentRate();
      const isStale = fx.isStale;
      return {
        symbol: 'USDTUSDT',
        pairId: 'USDT-IDR',
        effectiveUsdtPrice: 1.0,
        effectiveIdrPrice: fx.rate,
        primaryProvider: 'binance',
        activeProvider: 'binance',
        deviationBps: 0,
        isStale,
        isAbnormal: false,
        status: isStale ? 'REFERENCE_PRICE_UNAVAILABLE' : 'ACTIVE',
        binancePrice: 1.0,
        bybitPrice: 1.0,
        cmcPrice: 1.0,
        fxRateUsed: fx.rate,
        fxTimestamp: fx.updatedAt,
        updatedAt: now
      };
    }

    const extSymbol = fxConversionService.getExternalSymbolForPair(upperPair) || 'BTCUSDT';
    const binanceTick = this.binance.getTick(extSymbol);
    const bybitTick = this.bybit.getTick(extSymbol);
    const cmcTick = this.cmc.getTick(extSymbol);

    const bPrice = binanceTick?.lastPrice ?? null;
    const yPrice = bybitTick?.lastPrice ?? null;
    const cPrice = cmcTick?.lastPrice ?? null;

    // Check freshness
    const bFresh = binanceTick ? (now - binanceTick.receivedAt <= this.config.maxDataAgeMs) : false;
    const yFresh = bybitTick ? (now - bybitTick.receivedAt <= this.config.maxDataAgeMs) : false;
    const cFresh = cmcTick ? (now - cmcTick.receivedAt <= this.config.maxDataAgeMs) : false;

    // Calculate cross-exchange deviation if both ticks are present
    let deviationBps = 0;
    let isAbnormal = false;
    let rejectionReason: string | undefined;

    if (bPrice !== null && yPrice !== null && bPrice > 0 && yPrice > 0) {
      const avg = (bPrice + yPrice) / 2;
      deviationBps = Math.round((Math.abs(bPrice - yPrice) / avg) * 10000);
      if (deviationBps > this.config.maxAllowedDeviationBps) {
        isAbnormal = true;
        rejectionReason = `Deviasi antar-exchange (${(deviationBps / 100).toFixed(2)}%) melampaui batas maksimum (${(this.config.maxAllowedDeviationBps / 100).toFixed(2)}%).`;
      }
    }

    // Determine active provider according to primary/secondary and failover policy
    let activeProvider: ProviderId = this.config.primaryProvider;
    let effectiveUsdtPrice = 0;
    let isStale = false;

    const getTickFor = (prov: ProviderId) => {
      if (prov === 'binance') return { tick: binanceTick, fresh: bFresh };
      if (prov === 'bybit') return { tick: bybitTick, fresh: yFresh };
      return { tick: cmcTick, fresh: cFresh };
    };

    const primaryData = getTickFor(this.config.primaryProvider);
    const secondaryData = getTickFor(this.config.secondaryProvider);

    if (primaryData.tick && primaryData.fresh && (!isAbnormal || this.config.outlierRejectionPolicy === 'LOG_ONLY')) {
      activeProvider = this.config.primaryProvider;
      effectiveUsdtPrice = primaryData.tick.lastPrice;
    } else if (this.config.failoverBehavior === 'AUTOMATIC' && secondaryData.tick && secondaryData.fresh && (!isAbnormal || this.config.outlierRejectionPolicy === 'LOG_ONLY')) {
      activeProvider = this.config.secondaryProvider;
      effectiveUsdtPrice = secondaryData.tick.lastPrice;
    } else if (primaryData.tick && primaryData.tick.lastPrice > 0) {
      activeProvider = this.config.primaryProvider;
      effectiveUsdtPrice = primaryData.tick.lastPrice;
      isStale = true;
      rejectionReason = rejectionReason || 'Feed harga eksternal melebihi batas freshness (stale data).';
    } else {
      isStale = true;
      rejectionReason = rejectionReason || 'Tidak ada provider harga eksternal yang tersedia.';
    }

    // FX Conversion to IDR
    const fx = fxConversionService.getCurrentRate();
    if (fx.isStale) {
      isStale = true;
      rejectionReason = rejectionReason ? `${rejectionReason}; ${fx.notes}` : 'Kurs USDT/IDR telah kedaluwarsa.';
    }

    const effectiveIdrPrice = Math.round(effectiveUsdtPrice * fx.rate);

    let status: 'ACTIVE' | 'DEGRADED' | 'REFERENCE_PRICE_UNAVAILABLE' = 'ACTIVE';
    if (isAbnormal && this.config.outlierRejectionPolicy === 'STRICT') {
      status = 'REFERENCE_PRICE_UNAVAILABLE';
    } else if (isStale) {
      status = 'REFERENCE_PRICE_UNAVAILABLE';
    } else if (isAbnormal || (!bFresh && yFresh) || (bFresh && !yFresh)) {
      status = 'DEGRADED';
    }

    return {
      symbol: extSymbol,
      pairId: upperPair,
      effectiveUsdtPrice,
      effectiveIdrPrice,
      primaryProvider: this.config.primaryProvider,
      activeProvider,
      deviationBps,
      isStale,
      isAbnormal,
      status,
      rejectionReason,
      binancePrice: bPrice,
      bybitPrice: yPrice,
      cmcPrice: cPrice,
      fxRateUsed: fx.rate,
      fxTimestamp: fx.updatedAt,
      updatedAt: now
    };
  }

  /**
   * Get snapshot of all available providers and health
   */
  public getProvidersStatus() {
    return {
      binance: {
        id: this.binance.id,
        name: this.binance.name,
        status: this.binance.getConnectionStatus(),
        metrics: this.binance.getMetrics(),
        btcTick: this.binance.getTick('BTCUSDT'),
        ethTick: this.binance.getTick('ETHUSDT')
      },
      bybit: {
        id: this.bybit.id,
        name: this.bybit.name,
        status: this.bybit.getConnectionStatus(),
        metrics: this.bybit.getMetrics(),
        btcTick: this.bybit.getTick('BTCUSDT'),
        ethTick: this.bybit.getTick('ETHUSDT')
      },
      cmc: {
        id: this.cmc.id,
        name: this.cmc.name,
        status: this.cmc.getConnectionStatus(),
        metrics: this.cmc.getMetrics(),
        btcTick: this.cmc.getTick('BTCUSDT'),
        ethTick: this.cmc.getTick('ETHUSDT'),
        usdtTick: this.cmc.getTick('USDTIDR')
      },
      config: this.config,
      fxRate: fxConversionService.getCurrentRate()
    };
  }
}

export const priceAggregatorService = new PriceAggregatorService();
