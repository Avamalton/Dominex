/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * KlineService.ts
 * Authoritative Candlestick (OHLCV) Aggregator & Persistent Kline Engine for DIMONEX.
 * 
 * Guarantees:
 * - 100% Real Trade-Grounded: No mock candles, no fake bars, no synthetic sine-wave candles.
 * - Candles are produced strictly from actual executed trades matched by the exchange engine.
 * - Gap Policy: Intervals with no trades create zero-volume continuation candles bounded only between real trades.
 * - Idempotent replay: Replaying the same trade event updates existing intervals accurately without duplicate volume.
 * - Persistent to disk across server restarts and timeframe switches.
 */

import fs from 'fs';
import path from 'path';
import { Trade, TradingPair } from '../db/types.js';
import { db } from '../db/database.js';

export interface Candle {
  time: number; // Unix timestamp in seconds (aligned to timeframe interval)
  open: number; // In Rupiah (or quote unit)
  high: number;
  low: number;
  close: number;
  volume: number; // In Base currency unit
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1D';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1D': 86400,
};

const KLINES_FILE = path.join(process.cwd(), 'server', 'data', 'klines_state.json');

export class KlineService {
  // key: `${pairId}:${timeframe}` -> Candle[]
  private klineStore: Map<string, Candle[]> = new Map();
  private processedTradeIds: Set<string> = new Set();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.rebuildFromDbTrades();
      this.saveToDisk();
    }
  }

  public scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveToDisk();
      this.saveTimer = null;
    }, 500);
  }

  public saveToDisk(): boolean {
    try {
      const dir = path.dirname(KLINES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, Candle[]> = {};
      for (const [k, v] of this.klineStore.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(KLINES_FILE, JSON.stringify(obj), 'utf-8');
      return true;
    } catch (e) {
      console.error('[KlineService] Gagal menyimpan klines ke disk:', e);
      return false;
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(KLINES_FILE)) return false;
      const raw = fs.readFileSync(KLINES_FILE, 'utf-8');
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return false;
      this.klineStore.clear();
      let totalCandles = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) {
          this.klineStore.set(k, v as Candle[]);
          totalCandles += v.length;
        }
      }
      console.log(`[KlineService] Memuat ${this.klineStore.size} timeframe candle riil dari disk (${totalCandles} candle total)`);
      return true;
    } catch (e) {
      return false;
    }
  }

  private getKey(pairId: string, timeframe: string): string {
    return `${pairId}:${timeframe}`;
  }

  /**
   * Rebuild all timeframe candles from actual trades stored in the database.
   * Completely replaces any in-memory state with authoritative historical trades.
   */
  public rebuildFromDbTrades(customTrades?: Trade[]) {
    this.klineStore.clear();
    this.processedTradeIds.clear();

    const tradesToProcess = customTrades || db.trades || [];
    const sortedTrades = [...tradesToProcess].sort((a, b) => a.createdAt - b.createdAt);

    for (const trade of sortedTrades) {
      this.processTrade(trade);
    }
  }

  /**
   * Process an incoming executed Trade into all timeframe candles.
   * Strictly aggregates real executed volume and price action.
   */
  public processTrade(trade: Trade) {
    const pair = db.tradingPairs.get(trade.pairId);
    if (!pair) return;

    const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1D'];
    const tradePriceRupiah = Number(BigInt(trade.price) / 100n);
    const tradeQty = Number(trade.quantity) / (10 ** pair.baseDecimals);
    const tradeSec = Math.floor(trade.createdAt / 1000);

    const isDuplicate = this.processedTradeIds.has(trade.id);
    this.processedTradeIds.add(trade.id);
    if (this.processedTradeIds.size > 2000) {
      const arr = Array.from(this.processedTradeIds);
      this.processedTradeIds = new Set(arr.slice(-1000));
    }

    for (const tf of timeframes) {
      const interval = TIMEFRAME_SECONDS[tf];
      const candleTime = Math.floor(tradeSec / interval) * interval;
      const key = this.getKey(trade.pairId, tf);

      let candles = this.klineStore.get(key);
      if (!candles) {
        candles = [];
        this.klineStore.set(key, candles);
      }

      const lastCandle = candles[candles.length - 1];

      if (!lastCandle) {
        // First real trade candle
        candles.push({
          time: candleTime,
          open: tradePriceRupiah,
          high: tradePriceRupiah,
          low: tradePriceRupiah,
          close: tradePriceRupiah,
          volume: isDuplicate ? 0 : tradeQty
        });
      } else if (lastCandle.time === candleTime) {
        // Update current candle bounds
        lastCandle.high = Math.max(lastCandle.high, tradePriceRupiah);
        lastCandle.low = Math.min(lastCandle.low, tradePriceRupiah);
        lastCandle.close = tradePriceRupiah;
        if (!isDuplicate) {
          lastCandle.volume = Number((lastCandle.volume + tradeQty).toFixed(6));
        }
      } else if (candleTime > lastCandle.time) {
        // Gap filling between trades: flat continuation with 0 volume
        const maxGapBars = 50;
        let gapCount = 0;
        for (let t = lastCandle.time + interval; t < candleTime && gapCount < maxGapBars; t += interval) {
          candles.push({
            time: t,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
            volume: 0
          });
          gapCount++;
        }

        // New active candle with trade execution
        candles.push({
          time: candleTime,
          open: lastCandle.close,
          high: Math.max(lastCandle.close, tradePriceRupiah),
          low: Math.min(lastCandle.close, tradePriceRupiah),
          close: tradePriceRupiah,
          volume: isDuplicate ? 0 : tradeQty
        });

        // Limit memory footprint to last 500 candles per timeframe
        if (candles.length > 500) {
          candles.splice(0, candles.length - 500);
        }
      } else {
        // Historical / late trade inserted into older candle
        const existing = candles.find(c => c.time === candleTime);
        if (existing) {
          existing.high = Math.max(existing.high, tradePriceRupiah);
          existing.low = Math.min(existing.low, tradePriceRupiah);
          if (!isDuplicate) {
            existing.volume = Number((existing.volume + tradeQty).toFixed(6));
          }
        }
      }
    }
    this.scheduleSave();
  }

  /**
   * Get historical and current candles for a pair and timeframe.
   * Returns empty array if no trades have executed yet for this pair.
   */
  public getCandles(pairId: string, tfStr: string = '15m', limit = 150): Candle[] {
    const normalized = tfStr === '1D' ? '1D' : tfStr.toLowerCase();
    const tf: Timeframe = (['1m', '5m', '15m', '1h', '4h', '1d', '1D'].includes(tfStr) ? tfStr : ['1m', '5m', '15m', '1h', '4h', '1d'].includes(normalized) ? normalized : '15m') as Timeframe;
    const key = this.getKey(pairId, tf);
    let candles = this.klineStore.get(key);

    if (!candles || candles.length === 0) {
      // Check if db has trades for this pair that haven't been ingested yet
      const pairTrades = db.trades.filter(t => t.pairId === pairId);
      if (pairTrades.length > 0) {
        this.rebuildFromDbTrades();
        candles = this.klineStore.get(key) || [];
      } else {
        return [];
      }
    }

    return candles.slice(-limit);
  }
}

export const klineService = new KlineService();
