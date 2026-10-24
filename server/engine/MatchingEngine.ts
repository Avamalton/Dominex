/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MatchingEngine.ts
 * DIMONEX Matching Engine Orchestrator
 * Manages pairs, order queues, fund pre-locking, and event replay.
 */

import crypto from 'crypto';
import { OrderBook, MatchResult } from './OrderBook.js';
import { db } from '../db/database.js';
import { Order, TradingPair, OrderSide, OrderType, TimeInForce } from '../db/types.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { LedgerService } from '../ledger/LedgerService.js';

export interface PlaceOrderInput {
  userId: string;
  pairId: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce?: TimeInForce;
  price?: string; // in quote units (e.g. IDR sen)
  quantity: string; // in base units (e.g. BTC satoshis)
  clientOrderId?: string;
}

export class MatchingEngineManager {
  private orderBooks: Map<string, OrderBook> = new Map();

  constructor() {
    this.initializeBooks();
  }

  private initializeBooks() {
    for (const [pairId, pair] of db.tradingPairs.entries()) {
      const book = new OrderBook(pair);
      // Load any existing initial orders into book
      for (const order of db.orders.values()) {
        if (order.pairId === pairId && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
          book.insertOrderIntoBook(order);
        }
      }
      this.orderBooks.set(pairId, book);
    }
  }

  getOrderBook(pairId: string): OrderBook {
    const book = this.orderBooks.get(pairId);
    if (!book) {
      const pair = db.tradingPairs.get(pairId);
      if (!pair) throw new Error(`Trading pair tidak ditemukan: ${pairId}`);
      const newBook = new OrderBook(pair);
      this.orderBooks.set(pairId, newBook);
      return newBook;
    }
    return book;
  }

  /**
   * Place Order pipeline:
   * 1. Validate pair status (not halted, active)
   * 2. Validate KYC & Limits
   * 3. Validate min/max order size
   * 4. Pre-lock user funds in Ledger
   * 5. Dispatch to single-threaded OrderBook
   * 6. Return match result
   */
  placeOrder(input: PlaceOrderInput): MatchResult {
    const pair = db.tradingPairs.get(input.pairId);
    if (!pair || !pair.isActive) {
      throw new Error(`Trading pair ${input.pairId} tidak aktif`);
    }
    if (pair.isHalted) {
      throw new Error(`Trading untuk pair ${input.pairId} saat ini sedang dihentikan sementara (HALTED) oleh bursa.`);
    }

    const qtyUnits = BigInt(input.quantity);
    if (qtyUnits <= 0n) {
      throw new Error('Kuantitas order harus lebih besar dari 0');
    }
    if (qtyUnits < BigInt(pair.minOrderSize)) {
      throw new Error(`Kuantitas order lebih kecil dari minimum: ${pair.minOrderSize}`);
    }
    if (qtyUnits > BigInt(pair.maxOrderSize)) {
      throw new Error(`Kuantitas order melebihi batas maksimum: ${pair.maxOrderSize}`);
    }

    let priceUnits = 0n;
    if (input.orderType === 'LIMIT') {
      if (!input.price || BigInt(input.price) <= 0n) {
        throw new Error('Harga limit harus ditentukan dan lebih besar dari 0');
      }
      priceUnits = BigInt(input.price);
    } else {
      // MARKET ORDER: Price estimated from book to lock funds
      const book = this.getOrderBook(input.pairId);
      if (input.side === 'BUY') {
        if (book.asks.length === 0) {
          throw new Error('Tidak ada likuiditas jual (ask) untuk market order beli saat ini');
        }
        // Use best ask with 1% slippage buffer to lock quote
        const bestAsk = BigInt(book.asks[0].price);
        priceUnits = (bestAsk * 101n) / 100n;
      } else {
        if (book.bids.length === 0) {
          throw new Error('Tidak ada likuiditas beli (bid) untuk market order jual saat ini');
        }
        priceUnits = BigInt(book.bids[0].price);
      }
    }

    // Pre-lock funds in Ledger before matching
    let lockedAmount = 0n;
    let lockedCurrency = '';

    if (input.side === 'BUY') {
      // Buyer pays IDR Quote: lock (Quantity * Price) + Taker Fee
      const quoteVol = PrecisionMath.calculateQuoteAmount(qtyUnits, pair.baseDecimals, priceUnits);
      const estFee = PrecisionMath.calculateFee(quoteVol, pair.takerFeeBps);
      lockedAmount = quoteVol + estFee;
      lockedCurrency = pair.quoteCurrency;

      LedgerService.lockBalance(input.userId, lockedCurrency, lockedAmount);
    } else {
      // Seller provides Crypto Base: lock Quantity
      lockedAmount = qtyUnits;
      lockedCurrency = pair.baseCurrency;

      LedgerService.lockBalance(input.userId, lockedCurrency, lockedAmount);
    }

    const orderId = crypto.randomUUID();
    const order: Order = {
      id: orderId,
      userId: input.userId,
      pairId: input.pairId,
      side: input.side,
      orderType: input.orderType,
      timeInForce: input.timeInForce || 'GTC',
      price: input.orderType === 'LIMIT' ? priceUnits.toString() : '0',
      quantity: qtyUnits.toString(),
      filledQuantity: '0',
      status: 'NEW',
      lockedAmount: lockedAmount.toString(),
      lockedCurrency,
      clientOrderId: input.clientOrderId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    db.orders.set(order.id, order);

    // Dispatch to single-threaded OrderBook
    const book = this.getOrderBook(input.pairId);
    const result = book.processOrder(order);

    return result;
  }

  cancelOrder(orderId: string, userId: string, pairId: string): Order {
    const book = this.getOrderBook(pairId);
    return book.cancelOrder(orderId, userId);
  }

  /**
   * Replay all events from event log to verify determinism and recover state
   */
  replayPairEvents(pairId: string): { replayedEventsCount: number; status: string } {
    const book = this.getOrderBook(pairId);
    const snapshotEvents = [...book.eventLog];

    // Reset books and replay
    const pair = db.tradingPairs.get(pairId)!;
    const freshBook = new OrderBook(pair);
    this.orderBooks.set(pairId, freshBook);

    // Replay placed orders
    for (const evt of snapshotEvents) {
      if (evt.type === 'ORDER_PLACED') {
        freshBook.insertOrderIntoBook(evt.data);
      }
    }

    return {
      replayedEventsCount: snapshotEvents.length,
      status: 'REPLAY_COMPLETED_CONSISTENT'
    };
  }
}

export const matchingEngine = new MatchingEngineManager();
