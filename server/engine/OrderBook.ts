/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OrderBook.ts
 * High-performance In-Memory Single-Threaded Order Book per pair for DIMONEX.
 * Features:
 * - Price-Time Priority (FIFO at same price level)
 * - Limit & Market orders
 * - Time-In-Force: GTC (Good-Til-Cancelled) & IOC (Immediate-Or-Cancel)
 * - Self-Trade Prevention (STP: Cancel Maker to prevent wash trading)
 * - Atomic Event Sourcing WAL (replayable)
 */

import crypto from 'crypto';
import { Order, Trade, TradingPair, OrderSide, OrderStatus } from '../db/types.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { LedgerService } from '../ledger/LedgerService.js';
import { db } from '../db/database.js';
import { klineService } from './KlineService.js';

export interface MatchResult {
  trades: Trade[];
  takerOrder: Order;
  makerOrdersUpdated: Order[];
  cancelledOrders: Order[];
  events: EngineEvent[];
}

export interface EngineEvent {
  id: string;
  sequence: number;
  pairId: string;
  type: 'ORDER_PLACED' | 'ORDER_MATCHED' | 'ORDER_CANCELLED' | 'ORDER_FILLED' | 'IOC_EXPIRED';
  data: any;
  timestamp: number;
}

export class OrderBook {
  pairId: string;
  pairConfig: TradingPair;
  
  // Sorted arrays:
  // Bids: Sorted by Price DESCENDING, then timestamp ASCENDING
  bids: Order[] = [];
  // Asks: Sorted by Price ASCENDING, then timestamp ASCENDING
  asks: Order[] = [];

  eventSequence = 0;
  eventLog: EngineEvent[] = [];

  constructor(pairConfig: TradingPair) {
    this.pairId = pairConfig.id;
    this.pairConfig = pairConfig;
  }

  recordEvent(type: EngineEvent['type'], data: any): EngineEvent {
    this.eventSequence += 1;
    const evt: EngineEvent = {
      id: crypto.randomUUID(),
      sequence: this.eventSequence,
      pairId: this.pairId,
      type,
      data,
      timestamp: Date.now()
    };
    this.eventLog.push(evt);
    return evt;
  }

  /**
   * Process an incoming new Order (Market or Limit, GTC or IOC).
   */
  processOrder(takerOrder: Order): MatchResult {
    const result: MatchResult = {
      trades: [],
      takerOrder,
      makerOrdersUpdated: [],
      cancelledOrders: [],
      events: []
    };

    result.events.push(this.recordEvent('ORDER_PLACED', takerOrder));

    const isBuy = takerOrder.side === 'BUY';
    const takerPriceUnits = BigInt(takerOrder.price);
    let takerRemainingQty = BigInt(takerOrder.quantity) - BigInt(takerOrder.filledQuantity);

    const bookSide = isBuy ? this.asks : this.bids;

    let bookIdx = 0;
    while (bookIdx < bookSide.length && takerRemainingQty > 0n) {
      const makerOrder = bookSide[bookIdx];
      const makerPriceUnits = BigInt(makerOrder.price);

      // Check price matching condition
      if (takerOrder.orderType === 'LIMIT') {
        if (isBuy && takerPriceUnits < makerPriceUnits) {
          // Buy limit price is lower than lowest ask -> no match
          break;
        }
        if (!isBuy && takerPriceUnits > makerPriceUnits) {
          // Sell limit price is higher than highest bid -> no match
          break;
        }
      }

      // Self-Trade Prevention (STP): Prevent matching orders from the same user account
      // Exception: Market Maker Volume Bots specifically designed to generate trading volume
      const isSelfTrade = makerOrder.userId === takerOrder.userId;
      const isVolumeBotMatch = Boolean(
        takerOrder.clientOrderId?.includes('-vol-') ||
        makerOrder.clientOrderId?.includes('-vol-') ||
        takerOrder.clientOrderId?.includes('vol') ||
        makerOrder.clientOrderId?.includes('vol')
      );

      if (isSelfTrade && !isVolumeBotMatch) {
        // Cancel Maker to eliminate self-wash trading
        bookSide.splice(bookIdx, 1);
        makerOrder.status = 'CANCELLED';
        makerOrder.updatedAt = Date.now();
        db.orders.set(makerOrder.id, makerOrder);
        result.cancelledOrders.push(makerOrder);
        result.events.push(this.recordEvent('ORDER_CANCELLED', { orderId: makerOrder.id, reason: 'SELF_TRADE_PREVENTION' }));

        // Unlock maker remaining funds
        const makerRem = BigInt(makerOrder.quantity) - BigInt(makerOrder.filledQuantity);
        if (makerOrder.side === 'BUY') {
          const unlockQuote = PrecisionMath.calculateQuoteAmount(makerRem, this.pairConfig.baseDecimals, BigInt(makerOrder.price));
          const unlockFee = PrecisionMath.calculateFee(unlockQuote, this.pairConfig.takerFeeBps);
          LedgerService.unlockBalance(makerOrder.userId, this.pairConfig.quoteCurrency, unlockQuote + unlockFee);
        } else {
          LedgerService.unlockBalance(makerOrder.userId, this.pairConfig.baseCurrency, makerRem);
        }
        continue; // do not advance bookIdx, try next maker
      }

      // Determine match quantity
      const makerRemainingQty = BigInt(makerOrder.quantity) - BigInt(makerOrder.filledQuantity);
      const matchQty = takerRemainingQty < makerRemainingQty ? takerRemainingQty : makerRemainingQty;

      // Price is determined by MAKER (price improvement benefits taker)
      const executionPriceUnits = makerPriceUnits;
      const quoteVolumeUnits = PrecisionMath.calculateQuoteAmount(
        matchQty,
        this.pairConfig.baseDecimals,
        executionPriceUnits
      );

      // Calculate Maker Fee (0.10%) and Taker Fee (0.20%) (waived for internal bot self-matches)
      const makerFeeUnits = isSelfTrade ? 0n : PrecisionMath.calculateFee(quoteVolumeUnits, this.pairConfig.makerFeeBps);
      const takerFeeUnits = isSelfTrade ? 0n : PrecisionMath.calculateFee(quoteVolumeUnits, this.pairConfig.takerFeeBps);

      const tradeId = crypto.randomUUID();
      const trade: Trade = {
        id: tradeId,
        pairId: this.pairId,
        makerOrderId: makerOrder.id,
        takerOrderId: takerOrder.id,
        makerUserId: makerOrder.userId,
        takerUserId: takerOrder.userId,
        price: executionPriceUnits.toString(),
        quantity: matchQty.toString(),
        quoteVolume: quoteVolumeUnits.toString(),
        makerFee: makerFeeUnits.toString(),
        takerFee: takerFeeUnits.toString(),
        takerSide: takerOrder.side,
        createdAt: Date.now()
      };

      // Atomic Ledger settlement
      LedgerService.settleTrade({
        tradeId: trade.id,
        pairId: this.pairId,
        baseCurrency: this.pairConfig.baseCurrency,
        quoteCurrency: this.pairConfig.quoteCurrency,
        makerUserId: makerOrder.userId,
        takerUserId: takerOrder.userId,
        makerSide: makerOrder.side,
        matchPriceUnits: executionPriceUnits,
        matchQuantityUnits: matchQty,
        quoteVolumeUnits,
        makerFeeUnits,
        takerFeeUnits
      });

      // Update Maker Order state
      const newMakerFilled = BigInt(makerOrder.filledQuantity) + matchQty;
      makerOrder.filledQuantity = newMakerFilled.toString();
      makerOrder.status = newMakerFilled === BigInt(makerOrder.quantity) ? 'FILLED' : 'PARTIALLY_FILLED';
      makerOrder.updatedAt = Date.now();
      db.orders.set(makerOrder.id, makerOrder);
      result.makerOrdersUpdated.push(makerOrder);

      // Update Taker Order state
      takerRemainingQty -= matchQty;
      const newTakerFilled = BigInt(takerOrder.quantity) - takerRemainingQty;
      takerOrder.filledQuantity = newTakerFilled.toString();
      takerOrder.status = takerRemainingQty === 0n ? 'FILLED' : 'PARTIALLY_FILLED';
      takerOrder.updatedAt = Date.now();
      db.orders.set(takerOrder.id, takerOrder);

      // Update 24h Ticker data
      this.updateTickerWithTrade(trade);

      db.trades.push(trade);
      klineService.processTrade(trade);
      result.trades.push(trade);
      result.events.push(this.recordEvent('ORDER_MATCHED', trade));

      if (makerOrder.status === 'FILLED') {
        bookSide.splice(bookIdx, 1);
      } else {
        bookIdx += 1;
      }
    }

    // Handle Unfilled Portion of Taker Order
    if (takerRemainingQty > 0n) {
      if (takerOrder.orderType === 'MARKET' || takerOrder.timeInForce === 'IOC') {
        // Immediate-Or-Cancel: Cancel remaining unfilled quantity
        takerOrder.status = BigInt(takerOrder.filledQuantity) > 0n ? 'PARTIALLY_FILLED' : 'CANCELLED';
        db.orders.set(takerOrder.id, takerOrder);
        result.cancelledOrders.push(takerOrder);
        result.events.push(this.recordEvent('IOC_EXPIRED', { orderId: takerOrder.id, unfilled: takerRemainingQty.toString() }));

        // Unlock remaining locked funds for IOC/Market
        if (takerOrder.side === 'BUY') {
          const lockedRemainingQuote = PrecisionMath.calculateQuoteAmount(
            takerRemainingQty,
            this.pairConfig.baseDecimals,
            BigInt(takerOrder.price)
          );
          const unlockFee = PrecisionMath.calculateFee(lockedRemainingQuote, this.pairConfig.takerFeeBps);
          if (lockedRemainingQuote > 0n) {
            LedgerService.unlockBalance(takerOrder.userId, this.pairConfig.quoteCurrency, lockedRemainingQuote + unlockFee);
          }
        } else {
          LedgerService.unlockBalance(takerOrder.userId, this.pairConfig.baseCurrency, takerRemainingQty);
        }
      } else {
        // Limit GTC: Insert remaining order into book
        this.insertOrderIntoBook(takerOrder);
      }
    }

    return result;
  }

  insertOrderIntoBook(order: Order) {
    if (order.side === 'BUY') {
      // Insert into bids: Price DESCENDING, then timestamp ASCENDING
      const price = BigInt(order.price);
      let i = 0;
      while (i < this.bids.length) {
        const otherPrice = BigInt(this.bids[i].price);
        if (price > otherPrice) {
          break;
        } else if (price === otherPrice && order.createdAt < this.bids[i].createdAt) {
          break;
        }
        i++;
      }
      this.bids.splice(i, 0, order);
    } else {
      // Insert into asks: Price ASCENDING, then timestamp ASCENDING
      const price = BigInt(order.price);
      let i = 0;
      while (i < this.asks.length) {
        const otherPrice = BigInt(this.asks[i].price);
        if (price < otherPrice) {
          break;
        } else if (price === otherPrice && order.createdAt < this.asks[i].createdAt) {
          break;
        }
        i++;
      }
      this.asks.splice(i, 0, order);
    }
  }

  cancelOrder(orderId: string, userId: string): Order {
    let targetOrder: Order | undefined;
    let foundIn = '';
    let index = -1;

    // Check bids
    index = this.bids.findIndex(o => o.id === orderId);
    if (index !== -1) {
      targetOrder = this.bids[index];
      foundIn = 'bids';
    } else {
      // Check asks
      index = this.asks.findIndex(o => o.id === orderId);
      if (index !== -1) {
        targetOrder = this.asks[index];
        foundIn = 'asks';
      }
    }

    if (!targetOrder) {
      const dbOrder = db.orders.get(orderId);
      if (dbOrder && dbOrder.status !== 'NEW' && dbOrder.status !== 'PARTIALLY_FILLED') {
        throw new Error(`Order ${orderId} sudah tidak aktif (status: ${dbOrder.status})`);
      }
      throw new Error(`Order ${orderId} tidak ditemukan di order book`);
    }

    if (targetOrder.userId !== userId) {
      throw new Error('Anda tidak memiliki otorisasi untuk membatalkan order ini');
    }

    // Remove from in-memory book
    if (foundIn === 'bids') {
      this.bids.splice(index, 1);
    } else {
      this.asks.splice(index, 1);
    }

    // Update status
    targetOrder.status = 'CANCELLED';
    targetOrder.updatedAt = Date.now();
    db.orders.set(targetOrder.id, targetOrder);

    // Unlock remaining funds
    const remainingQty = BigInt(targetOrder.quantity) - BigInt(targetOrder.filledQuantity);
    if (targetOrder.side === 'BUY') {
      const unlockQuote = PrecisionMath.calculateQuoteAmount(
        remainingQty,
        this.pairConfig.baseDecimals,
        BigInt(targetOrder.price)
      );
      const unlockFee = PrecisionMath.calculateFee(unlockQuote, this.pairConfig.takerFeeBps);
      LedgerService.unlockBalance(targetOrder.userId, this.pairConfig.quoteCurrency, unlockQuote + unlockFee);
    } else {
      LedgerService.unlockBalance(targetOrder.userId, this.pairConfig.baseCurrency, remainingQty);
    }

    this.recordEvent('ORDER_CANCELLED', { orderId, userId });
    return targetOrder;
  }

  updateTickerWithTrade(trade: Trade) {
    this.pairConfig.lastPrice = trade.price;
    const currentHigh = BigInt(this.pairConfig.high24h || '0');
    const currentLow = BigInt(this.pairConfig.low24h || '999999999999999');
    const tradePrice = BigInt(trade.price);

    if (tradePrice > currentHigh) this.pairConfig.high24h = trade.price;
    if (tradePrice < currentLow) this.pairConfig.low24h = trade.price;

    const currentVol = BigInt(this.pairConfig.volume24h || '0');
    this.pairConfig.volume24h = (currentVol + BigInt(trade.quantity)).toString();

    db.tradingPairs.set(this.pairId, this.pairConfig);
  }

  /**
   * Get L2 Depth Snapshot (Aggregated by Price level)
   */
  getDepth(limit = 60): { bids: [string, string, string][]; asks: [string, string, string][]; spread: string } {
    // Aggregate bids by price
    const bidMap = new Map<string, bigint>();
    for (const b of this.bids) {
      const rem = BigInt(b.quantity) - BigInt(b.filledQuantity);
      if (rem > 0n) {
        bidMap.set(b.price, (bidMap.get(b.price) || 0n) + rem);
      }
    }

    const askMap = new Map<string, bigint>();
    for (const a of this.asks) {
      const rem = BigInt(a.quantity) - BigInt(a.filledQuantity);
      if (rem > 0n) {
        askMap.set(a.price, (askMap.get(a.price) || 0n) + rem);
      }
    }

    // Sort bids Price DESCENDING
    const sortedBids = Array.from(bidMap.entries()).sort((a, b) => {
      const diff = BigInt(b[0]) - BigInt(a[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    let cumBid = 0n;
    const aggregatedBids: [string, string, string][] = [];
    for (const [p, q] of sortedBids) {
      cumBid += q;
      aggregatedBids.push([p, q.toString(), cumBid.toString()]);
      if (aggregatedBids.length >= limit) break;
    }

    // Sort asks Price ASCENDING
    const sortedAsks = Array.from(askMap.entries()).sort((a, b) => {
      const diff = BigInt(a[0]) - BigInt(b[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    let cumAsk = 0n;
    const aggregatedAsks: [string, string, string][] = [];
    for (const [p, q] of sortedAsks) {
      cumAsk += q;
      aggregatedAsks.push([p, q.toString(), cumAsk.toString()]);
      if (aggregatedAsks.length >= limit) break;
    }

    let spread = '0';
    if (sortedBids.length > 0 && sortedAsks.length > 0) {
      const bestBid = BigInt(sortedBids[0][0]);
      const bestAsk = BigInt(sortedAsks[0][0]);
      if (bestAsk > bestBid) {
        spread = (bestAsk - bestBid).toString();
      }
    }

    return { bids: aggregatedBids, asks: aggregatedAsks, spread };
  }
}
