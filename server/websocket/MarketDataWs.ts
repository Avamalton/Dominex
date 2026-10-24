/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MarketDataWs.ts
 * Real-time WebSocket market data broadcaster for DIMONEX.
 * Topics:
 * - depth:<pairId> (Order Book Level 2 depth)
 * - trades:<pairId> (Public trade executions)
 * - ticker (24h price and volume stats)
 * - orders:<userId> (Private user fill and balance notifications)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { matchingEngine } from '../engine/MatchingEngine.js';
import { db } from '../db/database.js';
import { Trade, Order } from '../db/types.js';

interface ClientSubscription {
  ws: WebSocket;
  channels: Set<string>;
  userId?: string;
}

export class MarketDataWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<ClientSubscription> = new Set();
  private depthInterval: NodeJS.Timeout | null = null;

  initialize(wss: WebSocketServer) {
    this.wss = wss;

    wss.on('connection', (ws: WebSocket) => {
      const sub: ClientSubscription = { ws, channels: new Set(['ticker']) };
      this.clients.add(sub);

      // Send initial ticker snapshot
      ws.send(JSON.stringify({
        type: 'snapshot',
        channel: 'ticker',
        data: Array.from(db.tradingPairs.values())
      }));

      ws.on('message', (message: string) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.action === 'subscribe' && payload.channel) {
            sub.channels.add(payload.channel);
            if (payload.userId) sub.userId = payload.userId;

            // Send immediate snapshot if depth subscribed
            if (payload.channel.startsWith('depth:')) {
              const pairId = payload.channel.split(':')[1];
              const book = matchingEngine.getOrderBook(pairId);
              const depthData = book.getDepth(60);
              ws.send(JSON.stringify({
                type: 'depth',
                pairId,
                channel: payload.channel,
                data: depthData
              }));
            }
          } else if (payload.action === 'unsubscribe' && payload.channel) {
            sub.channels.delete(payload.channel);
          }
        } catch (err) {
          // ignore malformed ws messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(sub);
      });
    });

    // 100ms Periodic Depth & Ticker broadcast
    this.depthInterval = setInterval(() => {
      this.broadcastPeriodicDepth();
    }, 150);
  }

  private broadcastPeriodicDepth() {
    for (const [pairId] of db.tradingPairs.entries()) {
      const channel = `depth:${pairId}`;
      let hasSubscribers = false;

      for (const client of this.clients) {
        if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
          hasSubscribers = true;
          break;
        }
      }

      if (hasSubscribers) {
        const book = matchingEngine.getOrderBook(pairId);
        const depth = book.getDepth(60);
        this.broadcast(channel, { type: 'depth', pairId, data: depth });
      }
    }
  }

  broadcastDepth(pairId: string) {
    const book = matchingEngine.getOrderBook(pairId);
    const depth = book.getDepth(60);
    this.broadcast(`depth:${pairId}`, { type: 'depth', pairId, data: depth });
  }

  broadcast(channel: string, payload: any) {
    const message = JSON.stringify({ channel, ...payload });
    for (const client of this.clients) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  broadcastTrade(trade: Trade) {
    this.broadcast(`trades:${trade.pairId}`, { type: 'trade', data: trade });
    this.broadcast(`kline:${trade.pairId}`, { type: 'kline', data: trade });
    this.broadcast('ticker', {
      type: 'ticker',
      pair: db.tradingPairs.get(trade.pairId)
    });

    // Notify individual users if subscribed
    for (const client of this.clients) {
      if (
        (client.userId === trade.makerUserId || client.userId === trade.takerUserId) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(JSON.stringify({
          type: 'trade_notification',
          channel: `orders:${client.userId}`,
          data: trade
        }));
      }
    }
  }

  broadcastOrderUpdate(order: Order) {
    const channel = `orders:${order.userId}`;
    for (const client of this.clients) {
      if (client.userId === order.userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'order_update',
          channel,
          data: order
        }));
      }
    }
  }
}

export const marketWsService = new MarketDataWebSocketService();
