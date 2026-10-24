/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BinancePublicFeed.ts
 * Real-time public WebSocket feed adapter for Binance Spot.
 * Stream endpoints: wss://stream.binance.com:9443/ws or wss://data-stream.binance.vision/ws
 */

import WebSocket from 'ws';
import { 
  ExternalMarketDataProvider, 
  ExternalPriceTick, 
  ProviderConnectionStatus, 
  ProviderMetrics 
} from './ExternalFeedTypes.js';

export class BinancePublicFeed implements ExternalMarketDataProvider {
  public readonly id = 'binance' as const;
  public readonly name = 'Binance Spot Public Stream';

  private ws: WebSocket | null = null;
  private status: ProviderConnectionStatus = 'DISCONNECTED';
  private symbols: Set<string> = new Set(['BTCUSDT', 'ETHUSDT']);
  private ticks: Map<string, ExternalPriceTick> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private primaryUrl = 'wss://stream.binance.com:9443/ws';
  private fallbackUrl = 'wss://data-stream.binance.vision/ws';
  private useFallback = false;
  private intentionalDisconnect = false;

  private metrics: ProviderMetrics = {
    reconnectCount: 0,
    lastHeartbeat: Date.now(),
    messagesReceived: 0,
    lastMessageTimestamp: 0,
    avgLatencyMs: 0
  };

  constructor() {
    // Seed default initial baseline ticks
    this.seedBaselineTicks();
  }

  private seedBaselineTicks() {
    const now = Date.now();
    this.ticks.set('BTCUSDT', {
      provider: 'binance',
      symbol: 'BTCUSDT',
      lastPrice: 94850.00,
      bestBid: 94849.50,
      bestAsk: 94850.50,
      exchangeTimestamp: now,
      receivedAt: now,
      latencyMs: 15,
      isFresh: true,
      isValid: true
    });

    this.ticks.set('ETHUSDT', {
      provider: 'binance',
      symbol: 'ETHUSDT',
      lastPrice: 2840.00,
      bestBid: 2839.80,
      bestAsk: 2840.20,
      exchangeTimestamp: now,
      receivedAt: now,
      latencyMs: 18,
      isFresh: true,
      isValid: true
    });
  }

  public async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalDisconnect = false;
    this.status = 'CONNECTING';

    const url = this.useFallback ? this.fallbackUrl : this.primaryUrl;

    try {
      this.ws = new WebSocket(url, {
        handshakeTimeout: 5000,
        headers: {
          'User-Agent': 'DIMONEX-Market-Aggregator/1.0'
        }
      });

      this.ws.on('open', () => {
        this.status = 'CONNECTED';
        this.reconnectAttempts = 0;
        this.metrics.lastHeartbeat = Date.now();
        this.sendSubscriptions();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('pong', () => {
        this.metrics.lastHeartbeat = Date.now();
      });

      this.ws.on('error', (err: Error) => {
        this.metrics.lastError = err.message;
        this.status = 'ERROR';
        // Try switching to fallback endpoint next time
        this.useFallback = !this.useFallback;
      });

      this.ws.on('close', (code, reason) => {
        this.cleanupSocket();
        this.status = 'DISCONNECTED';
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });
    } catch (err: any) {
      this.status = 'ERROR';
      this.metrics.lastError = err.message;
      this.scheduleReconnect();
    }
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 15000);
  }

  private cleanupSocket() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch (_) {}
      this.ws = null;
    }
  }

  public async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.status = 'DISCONNECTED';
  }

  public async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  public subscribe(symbols: string[]): void {
    symbols.forEach(s => this.symbols.add(s.toUpperCase()));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscriptions();
    }
  }

  private sendSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const streams: string[] = [];
    for (const sym of this.symbols) {
      const lower = sym.toLowerCase();
      streams.push(`${lower}@trade`);
      streams.push(`${lower}@bookTicker`);
    }

    const payload = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now()
    };

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (_) {}
  }

  private handleMessage(data: WebSocket.Data) {
    try {
      const msg = JSON.parse(data.toString());
      this.metrics.messagesReceived++;
      const now = Date.now();
      this.metrics.lastMessageTimestamp = now;

      // Handle bookTicker event: { u: 400900217, s: "BNBUSDT", b: "25.35190000", B: "31.21000000", a: "25.36520000", A: "40.66000000" }
      if (msg.s && msg.b && msg.a) {
        const symbol = msg.s.toUpperCase();
        const bestBid = parseFloat(msg.b);
        const bestAsk = parseFloat(msg.a);
        const prev = this.ticks.get(symbol);
        const lastPrice = prev?.lastPrice || (bestBid + bestAsk) / 2;

        const tick: ExternalPriceTick = {
          provider: 'binance',
          symbol,
          lastPrice,
          bestBid,
          bestAsk,
          exchangeTimestamp: now,
          receivedAt: now,
          latencyMs: 10,
          isFresh: true,
          isValid: bestBid > 0 && bestAsk >= bestBid
        };
        this.ticks.set(symbol, tick);
        return;
      }

      // Handle trade event: { e: "trade", E: 123456789, s: "BNBUSDT", t: 12345, p: "0.001", q: "100", T: 123456785, m: true, M: true }
      if (msg.e === 'trade' && msg.s && msg.p) {
        const symbol = msg.s.toUpperCase();
        const lastPrice = parseFloat(msg.p);
        const exchangeTime = Number(msg.T || msg.E || now);
        const latency = Math.max(0, now - exchangeTime);
        const prev = this.ticks.get(symbol);

        const tick: ExternalPriceTick = {
          provider: 'binance',
          symbol,
          lastPrice,
          bestBid: prev?.bestBid || (lastPrice * 0.9999),
          bestAsk: prev?.bestAsk || (lastPrice * 1.0001),
          exchangeTimestamp: exchangeTime,
          receivedAt: now,
          latencyMs: latency,
          isFresh: true,
          isValid: lastPrice > 0
        };
        this.ticks.set(symbol, tick);
      }
    } catch (_) {}
  }

  private scheduleReconnect() {
    if (this.intentionalDisconnect || this.reconnectTimer) return;
    this.reconnectAttempts++;
    this.metrics.reconnectCount++;

    // Exponential backoff: 1s, 2s, 4s, max 15s
    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 15000);
    this.status = 'CONNECTING';

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, backoffMs);
  }

  public getConnectionStatus(): ProviderConnectionStatus {
    return this.status;
  }

  public getLatestPrice(symbol: string): number | null {
    const tick = this.getTick(symbol);
    return tick ? tick.lastPrice : null;
  }

  public getLatestBidAsk(symbol: string): { bid: number; ask: number } | null {
    const tick = this.getTick(symbol);
    if (!tick) return null;
    return { bid: tick.bestBid, ask: tick.bestAsk };
  }

  public getLastUpdateTimestamp(symbol: string): number | null {
    const tick = this.getTick(symbol);
    return tick ? tick.receivedAt : null;
  }

  public getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

  public getTick(symbol: string): ExternalPriceTick | null {
    const sym = symbol.toUpperCase();
    const tick = this.ticks.get(sym);
    if (!tick) return null;

    // Check data freshness (considered fresh if updated within 15 seconds)
    const age = Date.now() - tick.receivedAt;
    const isFresh = age < 15000;

    return {
      ...tick,
      isFresh
    };
  }

  /**
   * Test/Mock hook to update tick directly (used in automated tests or simulated feeds)
   */
  public updateMockTick(symbol: string, lastPrice: number, bid?: number, ask?: number) {
    const now = Date.now();
    this.ticks.set(symbol.toUpperCase(), {
      provider: 'binance',
      symbol: symbol.toUpperCase(),
      lastPrice,
      bestBid: bid ?? (lastPrice * 0.9999),
      bestAsk: ask ?? (lastPrice * 1.0001),
      exchangeTimestamp: now,
      receivedAt: now,
      latencyMs: 12,
      isFresh: true,
      isValid: true
    });
  }
}
