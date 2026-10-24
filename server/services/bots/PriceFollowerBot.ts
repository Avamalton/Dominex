/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PriceFollowerBot.ts
 * Real Market-Making Price Follower Bot for DIMONEX.
 * Tracks external reference prices (Binance/Bybit/Aggregated) converted to IDR
 * and places real Limit Buy/Sell orders into the authoritative Matching Engine.
 */

import { db, SYSTEM_TREASURY_ID } from '../../db/database.js';
import { matchingEngine } from '../../engine/MatchingEngine.js';
import { PrecisionMath } from '../../ledger/PrecisionMath.js';
import { priceAggregatorService } from '../external/PriceAggregatorService.js';
import { BotInstance, PriceFollowerConfig, Order } from '../../db/types.js';

export class PriceFollowerBotExecutor {
  /**
   * Execute a single tick cycle for a Price Follower Bot
   */
  public static executeCycle(
    bot: BotInstance, 
    addLog: (bot: BotInstance, msg: string, type?: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK') => void
  ): boolean {
    const cfg = bot.priceFollowerConfig;
    if (!cfg) return false;

    const pair = db.tradingPairs.get(bot.pairId);
    if (!pair) {
      addLog(bot, `Trading pair ${bot.pairId} tidak ditemukan.`, 'ERROR');
      return false;
    }

    if (pair.isHalted) {
      addLog(bot, `Trading pair ${bot.pairId} sedang di-halt oleh Administrator.`, 'RISK');
      return false;
    }

    // 1. Get validated external reference price
    const refData = priceAggregatorService.getReferencePrice(bot.pairId);
    const now = Date.now();

    // Check data staleness and validity
    if (refData.status === 'REFERENCE_PRICE_UNAVAILABLE' || refData.isStale || refData.effectiveIdrPrice <= 0) {
      addLog(bot, `Harga referensi tidak tersedia atau STALE (${refData.rejectionReason || 'Stale data'}). Penyesuaian order ditangguhkan.`, 'RISK');
      
      // If configured, safely cancel existing orders when feed is dead
      this.cancelOpenBotOrders(bot, addLog, 'Feed harga eksternal tidak tersedia/stale.');
      return false;
    }

    // Determine base reference price based on source
    let baseRefIdr = refData.effectiveIdrPrice;
    if (cfg.reference_provider === 'BINANCE' && refData.binancePrice) {
      baseRefIdr = Math.round(refData.binancePrice * refData.fxRateUsed);
    } else if (cfg.reference_provider === 'BYBIT' && refData.bybitPrice) {
      baseRefIdr = Math.round(refData.bybitPrice * refData.fxRateUsed);
    } else if (cfg.reference_provider === 'COINMARKETCAP' && refData.cmcPrice) {
      baseRefIdr = Math.round(refData.cmcPrice * refData.fxRateUsed);
    }

    // Apply tick size rounding
    const tickSize = Math.max(1, cfg.tick_size || 1000); // 1,000 IDR default tick size
    const roundedRefPrice = Math.round(baseRefIdr / tickSize) * tickSize;

    // Check reprice interval
    const lastReprice = cfg.lastRepriceTimestamp || 0;
    const minInterval = Math.max(1000, cfg.minimum_reprice_interval_ms || 2000);
    if (now - lastReprice < minInterval) {
      return true; // Still within minimum reprice interval
    }

    // Check minimum price change threshold (bps)
    const lastRefPrice = cfg.lastTargetPriceIdr || 0;
    if (lastRefPrice > 0) {
      const priceDeltaBps = Math.abs(roundedRefPrice - lastRefPrice) / lastRefPrice * 10000;
      const minDeltaBps = cfg.minimum_price_change_bps || 5; // 5 bps default
      if (priceDeltaBps < minDeltaBps && (cfg.activeBuyOrderId || cfg.activeSellOrderId)) {
        return true; // Price change is below threshold, maintain current orders without unnecessary churn
      }
    }

    // Calculate target Buy & Sell prices
    const buyOffsetBps = Math.max(0, cfg.buy_offset_bps || 20); // 0.20%
    const sellOffsetBps = Math.max(0, cfg.sell_offset_bps || 20); // 0.20%

    let targetBuyPrice = Math.round(roundedRefPrice * (1 - buyOffsetBps / 10000) / tickSize) * tickSize;
    let targetSellPrice = Math.round(roundedRefPrice * (1 + sellOffsetBps / 10000) / tickSize) * tickSize;

    if (targetBuyPrice >= targetSellPrice) {
      targetBuyPrice = targetSellPrice - tickSize;
    }

    // Base quantity to place
    const orderQtyNum = parseFloat(cfg.order_quantity || '0.01');
    const baseDecimals = pair.baseDecimals;
    const qtyBaseUnits = (BigInt(Math.round(orderQtyNum * (10 ** baseDecimals)))).toString();
    const minBaseUnits = BigInt(pair.minOrderSize || '10000');

    if (BigInt(qtyBaseUnits) < minBaseUnits) {
      addLog(bot, `Kuantitas order ${orderQtyNum} berada di bawah batas minimum pasar (${pair.minOrderSize}).`, 'ERROR');
      return false;
    }

    // Check user balances
    const quoteAccount = db.createOrGetAccount(bot.accountId, pair.quoteCurrency);
    const baseAccount = db.createOrGetAccount(bot.accountId, pair.baseCurrency);

    const quoteAvailable = BigInt(quoteAccount.balanceAvailable);
    const baseAvailable = BigInt(baseAccount.balanceAvailable);

    // Convert target IDR price to quote units (with pair.quoteDecimals)
    const buyPriceUnits = PrecisionMath.parseToUnits(targetBuyPrice.toString(), pair.quoteDecimals);
    const sellPriceUnits = PrecisionMath.parseToUnits(targetSellPrice.toString(), pair.quoteDecimals);

    // Reprice BUY Order
    const buyQuoteNeeded = PrecisionMath.calculateQuoteAmount(BigInt(qtyBaseUnits), pair.baseDecimals, buyPriceUnits);
    if (quoteAvailable >= buyQuoteNeeded) {
      this.repriceSingleSide(bot, 'BUY', buyPriceUnits.toString(), qtyBaseUnits, pair, addLog, cfg.dry_run);
    } else {
      addLog(bot, `Saldo IDR tidak cukup untuk Limit Buy (Tersedia: Rp ${PrecisionMath.formatIDRDisplay(quoteAvailable)}, Dibutuhkan: Rp ${PrecisionMath.formatIDRDisplay(buyQuoteNeeded)}).`, 'RISK');
    }

    // Reprice SELL Order
    if (baseAvailable >= BigInt(qtyBaseUnits)) {
      this.repriceSingleSide(bot, 'SELL', sellPriceUnits.toString(), qtyBaseUnits, pair, addLog, cfg.dry_run);
    } else {
      addLog(bot, `Saldo ${pair.baseCurrency} tidak cukup untuk Limit Sell (Tersedia: ${PrecisionMath.formatFromUnits(baseAvailable, baseDecimals)}, Dibutuhkan: ${orderQtyNum}).`, 'RISK');
    }

    cfg.lastRepriceTimestamp = now;
    cfg.lastTargetPriceIdr = roundedRefPrice;
    bot.lastHeartbeat = now;
    db.scheduleSave();

    return true;
  }

  private static repriceSingleSide(
    bot: BotInstance,
    side: 'BUY' | 'SELL',
    priceQuoteUnits: string,
    qtyBaseUnits: string,
    pair: any,
    addLog: (bot: BotInstance, msg: string, type?: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK') => void,
    dryRun = false
  ) {
    const cfg = bot.priceFollowerConfig!;
    const activeOrderId = side === 'BUY' ? cfg.activeBuyOrderId : cfg.activeSellOrderId;

    // Check if active order already has this exact price and is still open
    if (activeOrderId) {
      const activeOrder = db.orders.get(activeOrderId);
      if (activeOrder && (activeOrder.status === 'NEW' || activeOrder.status === 'PARTIALLY_FILLED')) {
        if (activeOrder.price === priceQuoteUnits) {
          return; // Existing order already placed at target price
        }
        // Cancel existing order before placing new one
        if (!dryRun) {
          try {
            matchingEngine.cancelOrder(activeOrderId, bot.accountId, bot.pairId);
          } catch (e) {}
        }
      }
    }

    if (dryRun) {
      addLog(bot, `[DRY-RUN] Reprice ${side}: Target Rp ${PrecisionMath.formatIDRDisplay(BigInt(priceQuoteUnits))} (Qty: ${parseFloat(qtyBaseUnits) / (10 ** pair.baseDecimals)})`, 'INFO');
      return;
    }

    // Place real order in Matching Engine
    const clientOrderId = `bot-pf-${bot.id.slice(4, 10)}-${side.toLowerCase()}-${Date.now()}`;
    try {
      const result = matchingEngine.placeOrder({
        userId: bot.accountId,
        pairId: bot.pairId,
        side,
        orderType: 'LIMIT',
        timeInForce: 'GTC',
        price: priceQuoteUnits,
        quantity: qtyBaseUnits,
        clientOrderId
      });

      const placedOrder = result?.takerOrder || (result as any)?.order;
      if (placedOrder) {
        if (side === 'BUY') {
          cfg.activeBuyOrderId = placedOrder.id;
        } else {
          cfg.activeSellOrderId = placedOrder.id;
        }

        bot.deployedOrderIds.push(placedOrder.id);
        bot.stats.ordersSubmitted += 1;
        bot.stats.ordersAccepted += 1;

        if (placedOrder.status === 'FILLED') {
          bot.stats.ordersFilled += 1;
        }

        addLog(bot, `Follower Order ${side} Rp ${PrecisionMath.formatIDRDisplay(BigInt(priceQuoteUnits))} berhasil dipasang (Order ID: ${placedOrder.id}).`, 'ORDER');
      }
    } catch (err: any) {
      addLog(bot, `Gagal memasang order ${side}: ${err.message}`, 'ERROR');
    }
  }

  public static cancelOpenBotOrders(
    bot: BotInstance,
    addLog: (bot: BotInstance, msg: string, type?: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK') => void,
    reason = 'Penghentian bot'
  ): number {
    const cfg = bot.priceFollowerConfig;
    let count = 0;

    const idsToCancel = [cfg?.activeBuyOrderId, cfg?.activeSellOrderId, ...bot.deployedOrderIds].filter(Boolean) as string[];

    for (const orderId of idsToCancel) {
      const order = db.orders.get(orderId);
      if (order && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
        try {
          const res = matchingEngine.cancelOrder(orderId, bot.accountId, bot.pairId);
          if (res && res.status === 'CANCELLED') {
            count++;
          }
        } catch (e) {}
      }
    }

    if (cfg) {
      cfg.activeBuyOrderId = undefined;
      cfg.activeSellOrderId = undefined;
    }

    if (count > 0) {
      addLog(bot, `Dibatalkan ${count} order terbuka (${reason}).`, 'INFO');
    }
    return count;
  }
}
