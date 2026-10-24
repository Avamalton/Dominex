/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * trading.ts
 * Core trading REST endpoints: order placement, cancellation, depth, trades, and pairs.
 */

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { matchingEngine } from '../engine/MatchingEngine.js';
import { db } from '../db/database.js';
import { marketWsService } from '../websocket/MarketDataWs.js';
import { klineService } from '../engine/KlineService.js';

export const tradingRouter = Router();

// Get All Active Trading Pairs
tradingRouter.get('/pairs', (req, res) => {
  const pairs = Array.from(db.tradingPairs.values());
  res.json(pairs);
});

// Get Ticker for a pair
tradingRouter.get('/ticker/:pairId', (req, res) => {
  const pair = db.tradingPairs.get(req.params.pairId);
  if (!pair) return res.status(404).json({ error: 'Pair tidak ditemukan' });
  res.json(pair);
});

// Get L2 Order Book Depth
tradingRouter.get('/depth/:pairId', (req, res) => {
  try {
    const book = matchingEngine.getOrderBook(req.params.pairId);
    const depth = book.getDepth(60);
    res.json(depth);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Get Recent Trades for a pair
tradingRouter.get('/trades/:pairId', (req, res) => {
  const pairTrades = db.trades
    .filter(t => t.pairId === req.params.pairId)
    .slice(-50)
    .reverse();
  res.json(pairTrades);
});

// Get Real Candlestick (OHLCV) History for a pair
tradingRouter.get('/candles/:pairId', (req, res) => {
  try {
    const pairId = req.params.pairId;
    const timeframe = (req.query.timeframe as string) || '15m';
    const limit = Math.min(300, Math.max(10, parseInt(req.query.limit as string || '150', 10)));
    const candles = klineService.getCandles(pairId, timeframe, limit);
    res.json(candles);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Place New Order
tradingRouter.post('/order', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { pairId, side, orderType, timeInForce, price, quantity, clientOrderId } = req.body;

    if (!pairId || !side || !orderType || !quantity) {
      return res.status(400).json({ error: 'Parameter order tidak lengkap' });
    }

    const result = matchingEngine.placeOrder({
      userId: user.id,
      pairId,
      side,
      orderType,
      timeInForce: timeInForce || 'GTC',
      price: price ? String(price) : undefined,
      quantity: String(quantity),
      clientOrderId
    });

    // Broadcast trades via WebSocket
    for (const trade of result.trades) {
      marketWsService.broadcastTrade(trade);
    }

    // Broadcast user order status
    marketWsService.broadcastOrderUpdate(result.takerOrder);
    for (const maker of result.makerOrdersUpdated) {
      marketWsService.broadcastOrderUpdate(maker);
    }

    // Immediately broadcast updated depth to all subscribers
    marketWsService.broadcastDepth(pairId);

    db.scheduleSave();

    res.json({
      success: true,
      order: result.takerOrder,
      trades: result.trades,
      cancelledOrders: result.cancelledOrders
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel Order
tradingRouter.post('/order/cancel', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { orderId, pairId } = req.body;

    if (!orderId || !pairId) {
      return res.status(400).json({ error: 'orderId dan pairId wajib diisi' });
    }

    const cancelledOrder = matchingEngine.cancelOrder(orderId, user.id, pairId);
    marketWsService.broadcastOrderUpdate(cancelledOrder);

    // Immediately broadcast updated depth to all subscribers
    marketWsService.broadcastDepth(pairId);

    db.scheduleSave();

    res.json({
      success: true,
      message: 'Order berhasil dibatalkan',
      order: cancelledOrder
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get Open Orders for Authenticated User
tradingRouter.get('/orders/open', requireAuth, (req, res) => {
  const user = (req as any).user;
  const role = (user.role || '').toUpperCase();
  const isMMOrAdmin = role === 'MM' || role === 'ADMIN' || role === 'SUPERADMIN';

  const userOpenOrders = Array.from(db.orders.values())
    .filter(o => {
      const isOwner = o.userId === user.id;
      const isMMBotOrder = isMMOrAdmin && (o.clientOrderId?.startsWith('bot-') || o.clientOrderId?.includes('-ord-') || o.clientOrderId?.includes('-vol-'));
      return (isOwner || isMMBotOrder) && (o.status === 'NEW' || o.status === 'PARTIALLY_FILLED');
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json(userOpenOrders);
});

// Get Order History for Authenticated User
tradingRouter.get('/orders/history', requireAuth, (req, res) => {
  const user = (req as any).user;
  const userOrders = Array.from(db.orders.values())
    .filter(o => o.userId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);

  res.json(userOrders);
});

// Get Public External Reference Price for Chart Benchmark Overlay
tradingRouter.get('/reference-price/:pairId', async (req, res) => {
  try {
    const { priceAggregatorService } = await import('../services/external/PriceAggregatorService.js');
    const ref = priceAggregatorService.getReferencePrice(req.params.pairId);
    res.json(ref);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

