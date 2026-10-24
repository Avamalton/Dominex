// /**
//  * @license
//  * SPDX-License-Identifier: Apache-2.0
//  * 
//  * DepthLiquidityBot.ts
//  * Real Multi-Level Depth & Liquidity Market-Making Bot for DIMONEX.
//  * Deploys multiple authentic bid and ask levels around the validated reference price
//  * directly into the single-threaded authoritative Matching Engine.
//  */

// import { db } from '../../db/database.js';
// import { matchingEngine } from '../../engine/MatchingEngine.js';
// import { PrecisionMath } from '../../ledger/PrecisionMath.js';
// import { priceAggregatorService } from '../external/PriceAggregatorService.js';
// import { BotInstance, DepthLiquidityConfig, Order } from '../../db/types.js';

// export class DepthLiquidityBotExecutor {
//   /**
//    * Execute a single cycle for a Depth & Liquidity Bot
//    */
//   public static executeCycle(
//     bot: BotInstance,
//     addLog: (bot: BotInstance, msg: string, type?: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK') => void
//   ): boolean {
//     const cfg = bot.depthLiquidityConfig;
//     if (!cfg) return false;

//     const pair = db.tradingPairs.get(bot.pairId);
//     if (!pair) {
//       addLog(bot, `Trading pair ${bot.pairId} tidak ditemukan.`, 'ERROR');
//       return false;
//     }

//     if (pair.isHalted) {
//       addLog(bot, `Trading pair ${bot.pairId} sedang di-halt oleh Administrator.`, 'RISK');
//       return false;
//     }

//     // 1. Get validated external reference price
//     const refData = priceAggregatorService.getReferencePrice(bot.pairId);
//     const now = Date.now();

//     if (refData.status === 'REFERENCE_PRICE_UNAVAILABLE' || refData.isStale || refData.effectiveIdrPrice <= 0) {
//       addLog(bot, `Harga referensi eksternal tidak valid atau STALE (${refData.rejectionReason || 'Stale data'}). Penyesuaian likuiditas ditangguhkan.`, 'RISK');
//       this.cancelOpenDepthOrders(bot, addLog, 'Feed harga eksternal stale');
//       return false;
//     }

//     let baseRefIdr = refData.effectiveIdrPrice;
//     if (cfg.reference_price_source === 'BINANCE' && refData.binancePrice) {
//       baseRefIdr = Math.round(refData.binancePrice * refData.fxRateUsed);
//     } else if (cfg.reference_price_source === 'BYBIT' && refData.bybitPrice) {
//       baseRefIdr = Math.round(refData.bybitPrice * refData.fxRateUsed);
//     }

//     const tickSize = Math.max(1, cfg.tick_size || 1000);
//     const roundedRefPrice = Math.round(baseRefIdr / tickSize) * tickSize;

//     // Check reprice interval
//     const lastReprice = cfg.lastRepriceTimestamp || 0;
//     const minInterval = Math.max(1000, cfg.minimum_reprice_interval_ms || 3000);
//     if (now - lastReprice < minInterval && (cfg.activeOrderIds && cfg.activeOrderIds.length > 0)) {
//       return true;
//     }

//     // Prepare ladder configurations
//     const numBids = Math.min(10, Math.max(1, cfg.number_of_bid_levels || 3));
//     const numAsks = Math.min(10, Math.max(1, cfg.number_of_ask_levels || 3));

//     const bidOffsets = cfg.bid_level_offsets_bps && cfg.bid_level_offsets_bps.length > 0
//       ? cfg.bid_level_offsets_bps
//       : [10, 25, 50, 100];

//     const askOffsets = cfg.ask_level_offsets_bps && cfg.ask_level_offsets_bps.length > 0
//       ? cfg.ask_level_offsets_bps
//       : [10, 25, 50, 100];

//     const bidQuantities = cfg.bid_quantities && cfg.bid_quantities.length > 0
//       ? cfg.bid_quantities
//       : ['0.02', '0.05', '0.10', '0.20'];

//     const askQuantities = cfg.ask_quantities && cfg.ask_quantities.length > 0
//       ? cfg.ask_quantities
//       : ['0.02', '0.05', '0.10', '0.20'];

//     // Check accounts and balances
//     const quoteAccount = db.createOrGetAccount(bot.accountId, pair.quoteCurrency);
//     const baseAccount = db.createOrGetAccount(bot.accountId, pair.baseCurrency);
//     let quoteAvailable = BigInt(quoteAccount.balanceAvailable);
//     let baseAvailable = BigInt(baseAccount.balanceAvailable);
//     const baseDecimals = pair.baseDecimals;

//     // Cancel old active orders to refresh ladder cleanly
//     if (!cfg.dry_run) {
//       this.cancelOpenDepthOrders(bot, addLog, 'Rotasi reprice ladder likuiditas');
//     }

//     const newActiveOrderIds: string[] = [];

//     // Deploy BID Ladder
//     for (let i = 0; i < numBids; i++) {
//       const offsetBps = bidOffsets[i % bidOffsets.length] || ((i + 1) * 15);
//       const targetBidPrice = Math.round(roundedRefPrice * (1 - offsetBps / 10000) / tickSize) * tickSize;

//       let qtyStr = bidQuantities[i % bidQuantities.length] || '0.02';
//       if (cfg.quantity_randomization_enabled) {
//         const minQ = parseFloat(cfg.random_min_quantity || '0.01');
//         const maxQ = parseFloat(cfg.random_max_quantity || '0.05');
//         const randQ = minQ + Math.random() * (maxQ - minQ);
//         qtyStr = randQ.toFixed(4);
//       }

//       const qtyBaseUnits = (BigInt(Math.round(parseFloat(qtyStr) * (10 ** baseDecimals)))).toString();
//       const bidPriceUnits = PrecisionMath.parseToUnits(targetBidPrice.toString(), pair.quoteDecimals);
//       const neededQuote = PrecisionMath.calculateQuoteAmount(BigInt(qtyBaseUnits), baseDecimals, bidPriceUnits);

//       if (quoteAvailable >= neededQuote) {
//         if (cfg.dry_run) {
//           addLog(bot, `[DRY-RUN] Deploy Bid Level ${i + 1}: Rp ${targetBidPrice.toLocaleString()} (Qty: ${qtyStr})`, 'INFO');
//         } else {
//           const clientOrderId = `bot-dp-${bot.id.slice(4, 10)}-b${i + 1}-${Date.now()}`;
//           try {
//             addLog(
//   bot,
//   `[DEBUG BID] level=${i + 1} ref=${roundedRefPrice} ` +
//   `offsetBps=${offsetBps} target=${targetBidPrice} ` +
//   `priceUnits=${bidPriceUnits.toString()}`,
//   'INFO'
// );
//             const res = matchingEngine.placeOrder({
//               userId: bot.accountId,
//               pairId: bot.pairId,
//               side: 'BUY',
//               orderType: 'LIMIT',
//               timeInForce: 'GTC',
//               price: bidPriceUnits.toString(),
//               quantity: qtyBaseUnits,
//               clientOrderId
//             });

//             const placedBid = res?.takerOrder || (res as any)?.order;
//             if (placedBid) {
//               newActiveOrderIds.push(placedBid.id);
//               bot.deployedOrderIds.push(placedBid.id);
//               bot.stats.ordersSubmitted++;
//               bot.stats.ordersAccepted++;
//               quoteAvailable -= neededQuote;
//             }
//           } catch (err: any) {
//             addLog(bot, `Gagal memasang Bid Level ${i + 1}: ${err.message}`, 'ERROR');
//           }
//         }
//       }
//     }

//     // Deploy ASK Ladder
//     for (let i = 0; i < numAsks; i++) {
//       const offsetBps = askOffsets[i % askOffsets.length] || ((i + 1) * 15);
//       const targetAskPrice = Math.round(roundedRefPrice * (1 + offsetBps / 10000) / tickSize) * tickSize;

//       let qtyStr = askQuantities[i % askQuantities.length] || '0.02';
//       if (cfg.quantity_randomization_enabled) {
//         const minQ = parseFloat(cfg.random_min_quantity || '0.01');
//         const maxQ = parseFloat(cfg.random_max_quantity || '0.05');
//         const randQ = minQ + Math.random() * (maxQ - minQ);
//         qtyStr = randQ.toFixed(4);
//       }

//       const qtyBaseUnits = (BigInt(Math.round(parseFloat(qtyStr) * (10 ** baseDecimals)))).toString();
//       const askPriceUnits = PrecisionMath.parseToUnits(targetAskPrice.toString(), pair.quoteDecimals);

//       if (baseAvailable >= BigInt(qtyBaseUnits)) {
//         if (cfg.dry_run) {
//           addLog(bot, `[DRY-RUN] Deploy Ask Level ${i + 1}: Rp ${targetAskPrice.toLocaleString()} (Qty: ${qtyStr})`, 'INFO');
//         } else {
//           const clientOrderId = `bot-dp-${bot.id.slice(4, 10)}-a${i + 1}-${Date.now()}`;
//           try {
//             addLog(
//   bot,
//   `[DEBUG ASK] level=${i + 1} ref=${roundedRefPrice} ` +
//   `offsetBps=${offsetBps} target=${targetAskPrice} ` +
//   `priceUnits=${askPriceUnits.toString()}`,
//   'INFO'
// );    const res = matchingEngine.placeOrder({
//               userId: bot.accountId,
//               pairId: bot.pairId,
//               side: 'SELL',
//               orderType: 'LIMIT',
//               timeInForce: 'GTC',
//               price: askPriceUnits.toString(),
//               quantity: qtyBaseUnits,
//               clientOrderId
//             });

//             const placedAsk = res?.takerOrder || (res as any)?.order;
//             if (placedAsk) {
//               newActiveOrderIds.push(placedAsk.id);
//               bot.deployedOrderIds.push(placedAsk.id);
//               bot.stats.ordersSubmitted++;
//               bot.stats.ordersAccepted++;
//               baseAvailable -= BigInt(qtyBaseUnits);
//             }
//           } catch (err: any) {
//             addLog(bot, `Gagal memasang Ask Level ${i + 1}: ${err.message}`, 'ERROR');
//           }
//         }
//       }
//     }

//     cfg.activeOrderIds = newActiveOrderIds;
//     cfg.lastRepriceTimestamp = now;
//     bot.lastHeartbeat = now;

//     if (newActiveOrderIds.length > 0) {
//       addLog(bot, `Berhasil memperbarui kedalaman order book: ${newActiveOrderIds.length} level order aktif dipasang di Matching Engine.`, 'ORDER');
//     }

//     db.scheduleSave();
//     return true;
//   }

//   public static cancelOpenDepthOrders(
//     bot: BotInstance,
//     addLog: (bot: BotInstance, msg: string, type?: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK') => void,
//     reason = 'Penghentian bot'
//   ): number {
//     const cfg = bot.depthLiquidityConfig;
//     let count = 0;

//     const idsToCancel = [...(cfg?.activeOrderIds || []), ...bot.deployedOrderIds];
//     const uniqueIds = Array.from(new Set(idsToCancel));

//     for (const orderId of uniqueIds) {
//       const order = db.orders.get(orderId);
//       if (order && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
//         try {
//           const res = matchingEngine.cancelOrder(orderId, bot.accountId, bot.pairId);
//           if (res && res.status === 'CANCELLED') {
//             count++;
//           }
//         } catch (e) {}
//       }
//     }

//     if (cfg) {
//       cfg.activeOrderIds = [];
//     }

//     if (count > 0) {
//       addLog(bot, `Membatalkan ${count} order depth terbuka (${reason}).`, 'INFO');
//     }
//     return count;
//   }
// }






/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DepthLiquidityBot.ts
 * Multi-level Depth & Liquidity Bot for DIMONEX.
 *
 * Prices are calculated in integer IDR ticks and converted to quote units
 * before submission to the authoritative Matching Engine.
 */

import { db } from '../../db/database.js';
import { matchingEngine } from '../../engine/MatchingEngine.js';
import { PrecisionMath } from '../../ledger/PrecisionMath.js';
import { priceAggregatorService } from '../external/PriceAggregatorService.js';
import { BotInstance, DepthLiquidityConfig } from '../../db/types.js';

type LogType = 'INFO' | 'ORDER' | 'FILL' | 'ERROR' | 'RISK';

type LogFn = (
  bot: BotInstance,
  msg: string,
  type?: LogType
) => void;

type Side = 'BUY' | 'SELL';

export class DepthLiquidityBotExecutor {
  private static readonly BPS_DENOMINATOR = 10_000n;

  private static isOpenOrder(order: any): boolean {
    return Boolean(
      order &&
      (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')
    );
  }

  /**
   * Round a positive integer price to the nearest configured tick.
   */
  private static roundToTick(price: bigint, tick: bigint): bigint {
    if (price <= 0n || tick <= 0n) {
      throw new Error('Harga dan tick harus lebih besar dari nol.');
    }

    return ((price + tick / 2n) / tick) * tick;
  }

  /**
   * Calculate a target price using integer basis-point arithmetic.
   */
  private static calculateTargetPrice(
    referencePrice: bigint,
    offsetBps: number,
    side: Side,
    tick: bigint,
    previousPrice: bigint | null
  ): bigint {
    if (!Number.isSafeInteger(offsetBps) || offsetBps < 0) {
      throw new Error(`Offset bps tidak valid: ${offsetBps}`);
    }

    const offset = BigInt(offsetBps);

    let target: bigint;

    if (side === 'BUY') {
      if (offset >= this.BPS_DENOMINATOR) {
        throw new Error(`Offset BID terlalu besar: ${offsetBps} bps`);
      }

      const raw =
        (referencePrice * (this.BPS_DENOMINATOR - offset)) /
        this.BPS_DENOMINATOR;

      target = this.roundToTick(raw, tick);

      // BID must remain below reference and descend at each level.
      const maximumBid = referencePrice - tick;

      if (target > maximumBid) {
        target = maximumBid;
      }

      if (previousPrice !== null && target >= previousPrice) {
        target = previousPrice - tick;
      }
    } else {
      const raw =
        (referencePrice * (this.BPS_DENOMINATOR + offset)) /
        this.BPS_DENOMINATOR;

      target = this.roundToTick(raw, tick);

      // ASK must remain above reference and ascend at each level.
      const minimumAsk = referencePrice + tick;

      if (target < minimumAsk) {
        target = minimumAsk;
      }

      if (previousPrice !== null && target <= previousPrice) {
        target = previousPrice + tick;
      }
    }

    if (target <= 0n) {
      throw new Error('Harga hasil kalkulasi tidak valid.');
    }

    return target;
  }

  /**
   * Parse a configured quantity, or randomly choose an exact base-unit
   * quantity between the configured minimum and maximum.
   */
  private static getQuantityUnits(
    cfg: DepthLiquidityConfig,
    configuredQuantity: string,
    baseDecimals: number
  ): bigint {
    if (!cfg.quantity_randomization_enabled) {
      const qty = PrecisionMath.parseToUnits(
        configuredQuantity,
        baseDecimals
      );

      if (qty <= 0n) {
        throw new Error(`Kuantitas harus positif: ${configuredQuantity}`);
      }

      return qty;
    }

    const minText = cfg.random_min_quantity || '0.01';
    const maxText = cfg.random_max_quantity || '0.05';

    const min = PrecisionMath.parseToUnits(minText, baseDecimals);
    const max = PrecisionMath.parseToUnits(maxText, baseDecimals);

    if (min <= 0n || max < min) {
      throw new Error(
        `Rentang kuantitas acak tidak valid: ${minText}–${maxText}`
      );
    }

    // Math.random selects a point in the interval; financial values remain
    // represented as integers after conversion to base units.
    const span = max - min + 1n;
    const randomFraction = BigInt(
      Math.floor(Math.random() * 1_000_000_000)
    );

    return min + (randomFraction * span) / 1_000_000_000n;
  }

  /**
   * Return only the order ID and order state from the matching-engine result.
   */
  private static getSubmittedOrder(result: any): any | undefined {
    return result?.takerOrder ?? result?.order;
  }

  public static executeCycle(bot: BotInstance, addLog: LogFn): boolean {
    const cfg = bot.depthLiquidityConfig;

    if (!cfg) {
      addLog(bot, 'Konfigurasi Depth & Liquidity tidak ditemukan.', 'ERROR');
      return false;
    }

    const pair = db.tradingPairs.get(bot.pairId);

    if (!pair) {
      addLog(bot, `Trading pair ${bot.pairId} tidak ditemukan.`, 'ERROR');
      return false;
    }

    if (pair.isHalted) {
      addLog(bot, `Trading pair ${bot.pairId} sedang di-halt.`, 'RISK');
      return false;
    }

    const now = Date.now();

    // 1. Obtain a validated external reference price.
    const refData = priceAggregatorService.getReferencePrice(bot.pairId);

    if (
      refData.status === 'REFERENCE_PRICE_UNAVAILABLE' ||
      refData.isStale ||
      !Number.isFinite(refData.effectiveIdrPrice) ||
      refData.effectiveIdrPrice <= 0
    ) {
      addLog(
        bot,
        `Harga referensi tidak valid atau stale: ${
          refData.rejectionReason || 'Feed harga tidak tersedia'
        }.`,
        'RISK'
      );

      this.cancelOpenDepthOrders(bot, addLog, 'Feed harga eksternal stale');
      return false;
    }

    let referenceNumber = refData.effectiveIdrPrice;

    if (
      cfg.reference_price_source === 'BINANCE' &&
      refData.binancePrice &&
      Number.isFinite(refData.binancePrice) &&
      Number.isFinite(refData.fxRateUsed)
    ) {
      referenceNumber = refData.binancePrice * refData.fxRateUsed;
    } else if (
      cfg.reference_price_source === 'BYBIT' &&
      refData.bybitPrice &&
      Number.isFinite(refData.bybitPrice) &&
      Number.isFinite(refData.fxRateUsed)
    ) {
      referenceNumber = refData.bybitPrice * refData.fxRateUsed;
    }

    if (!Number.isFinite(referenceNumber) || referenceNumber <= 0) {
      addLog(bot, 'Harga referensi hasil konversi tidak valid.', 'RISK');
      this.cancelOpenDepthOrders(bot, addLog, 'Harga referensi tidak valid');
      return false;
    }

    // IDR reference prices and tick_size are expressed as whole IDR values.
    if (!Number.isSafeInteger(Math.round(referenceNumber))) {
      addLog(
        bot,
        'Harga referensi di luar rentang integer yang aman.',
        'RISK'
      );
      return false;
    }

    const tickNumber = Number(cfg.tick_size || 1000);

    if (!Number.isSafeInteger(tickNumber) || tickNumber < 1) {
      addLog(bot, `tick_size tidak valid: ${cfg.tick_size}`, 'ERROR');
      return false;
    }

    const tick = BigInt(tickNumber);
    const referencePrice = this.roundToTick(
      BigInt(Math.round(referenceNumber)),
      tick
    );

    // Respect the configured repricing interval when orders remain open.
    const lastReprice = cfg.lastRepriceTimestamp || 0;
    const minInterval = Math.max(
      1000,
      cfg.minimum_reprice_interval_ms || 3000
    );

    if (
      now - lastReprice < minInterval &&
      (cfg.activeOrderIds?.length || 0) > 0
    ) {
      return true;
    }

    const numBids = Math.min(
      10,
      Math.max(1, Math.trunc(cfg.number_of_bid_levels || 3))
    );

    const numAsks = Math.min(
      10,
      Math.max(1, Math.trunc(cfg.number_of_ask_levels || 3))
    );

    const bidOffsets =
      cfg.bid_level_offsets_bps?.length
        ? cfg.bid_level_offsets_bps
        : [10, 25, 50, 100];

    const askOffsets =
      cfg.ask_level_offsets_bps?.length
        ? cfg.ask_level_offsets_bps
        : [10, 25, 50, 100];

    const bidQuantities =
      cfg.bid_quantities?.length
        ? cfg.bid_quantities
        : ['0.02', '0.05', '0.10', '0.20'];

    const askQuantities =
      cfg.ask_quantities?.length
        ? cfg.ask_quantities
        : ['0.02', '0.05', '0.10', '0.20'];

    // Cancel the previous ladder before constructing a new one.
    if (!cfg.dry_run) {
      this.cancelOpenDepthOrders(bot, addLog, 'Rotasi reprice ladder');
    }

    const newActiveOrderIds: string[] = [];

    // Read available balances. The matching engine is authoritative.
    let quoteAvailable = BigInt(
      db.createOrGetAccount(bot.accountId, pair.quoteCurrency).balanceAvailable
    );

    let baseAvailable = BigInt(
      db.createOrGetAccount(bot.accountId, pair.baseCurrency).balanceAvailable
    );

    let previousBidPrice: bigint | null = null;
    let previousAskPrice: bigint | null = null;

    // 2. Deploy BID ladder.
    for (let i = 0; i < numBids; i++) {
      try {
        const configuredOffset = bidOffsets[i % bidOffsets.length];
        const offsetBps =
          configuredOffset ?? (i + 1) * 15;

        const targetBidPrice = this.calculateTargetPrice(
          referencePrice,
          offsetBps,
          'BUY',
          tick,
          previousBidPrice
        );

        previousBidPrice = targetBidPrice;

        const qtyStr =
          bidQuantities[i % bidQuantities.length] || '0.02';

        const qtyUnits = this.getQuantityUnits(
          cfg,
          qtyStr,
          pair.baseDecimals
        );

        if (qtyUnits < BigInt(pair.minOrderSize)) {
          addLog(
            bot,
            `BID level ${i + 1} dilewati: kuantitas di bawah minimum order.`,
            'RISK'
          );
          continue;
        }

        if (qtyUnits > BigInt(pair.maxOrderSize)) {
          addLog(
            bot,
            `BID level ${i + 1} dilewati: kuantitas melebihi maksimum order.`,
            'RISK'
          );
          continue;
        }

        const priceUnits = PrecisionMath.parseToUnits(
          targetBidPrice.toString(),
          pair.quoteDecimals
        );

        const neededQuote = PrecisionMath.calculateQuoteAmount(
          qtyUnits,
          pair.baseDecimals,
          priceUnits
        );

        if (quoteAvailable < neededQuote) {
          addLog(
            bot,
            `BID level ${i + 1} dilewati: saldo ${pair.quoteCurrency} tidak cukup.`,
            'RISK'
          );
          continue;
        }

        if (cfg.dry_run) {
          addLog(
            bot,
            `[DRY-RUN BID] level=${i + 1} ref=${referencePrice} ` +
              `offset=${offsetBps}bps target=${targetBidPrice} ` +
              `qty=${PrecisionMath.formatFromUnits(qtyUnits, pair.baseDecimals)}`,
            'INFO'
          );

          quoteAvailable -= neededQuote;
          continue;
        }

        const clientOrderId =
          `bot-dp-${bot.id.slice(4, 10)}-b${i + 1}-${now}`;

        addLog(
          bot,
          `[DEBUG BID] level=${i + 1} ref=${referencePrice} ` +
            `offsetBps=${offsetBps} target=${targetBidPrice} ` +
            `priceUnits=${priceUnits.toString()}`,
          'INFO'
        );

        const result = matchingEngine.placeOrder({
          userId: bot.accountId,
          pairId: bot.pairId,
          side: 'BUY',
          orderType: 'LIMIT',
          timeInForce: 'GTC',
          price: priceUnits.toString(),
          quantity: qtyUnits.toString(),
          clientOrderId
        });

        const order = this.getSubmittedOrder(result);

        if (!order) {
          addLog(
            bot,
            `Matching Engine tidak mengembalikan order untuk BID level ${i + 1}.`,
            'ERROR'
          );
          continue;
        }

        bot.stats.ordersSubmitted++;
        bot.stats.ordersAccepted++;

        if (this.isOpenOrder(order)) {
          newActiveOrderIds.push(order.id);
        }

        // Keep the historical IDs only while their orders are open.
        if (this.isOpenOrder(order)) {
          if (!bot.deployedOrderIds.includes(order.id)) {
            bot.deployedOrderIds.push(order.id);
          }
        }

        // Refresh the available balance after the engine has processed
        // the order, including fees and any immediate execution.
        quoteAvailable = BigInt(
          db.createOrGetAccount(bot.accountId, pair.quoteCurrency)
            .balanceAvailable
        );

        addLog(
          bot,
          `[BID] level=${i + 1} status=${order.status} ` +
            `price=${targetBidPrice.toLocaleString()} IDR`,
          order.status === 'FILLED' ? 'FILL' : 'ORDER'
        );
      } catch (err: any) {
        addLog(
          bot,
          `Gagal memasang BID level ${i + 1}: ${err?.message || String(err)}`,
          'ERROR'
        );
      }
    }

    // 3. Deploy ASK ladder.
    for (let i = 0; i < numAsks; i++) {
      try {
        const configuredOffset = askOffsets[i % askOffsets.length];
        const offsetBps =
          configuredOffset ?? (i + 1) * 15;

        const targetAskPrice = this.calculateTargetPrice(
          referencePrice,
          offsetBps,
          'SELL',
          tick,
          previousAskPrice
        );

        previousAskPrice = targetAskPrice;

        const qtyStr =
          askQuantities[i % askQuantities.length] || '0.02';

        const qtyUnits = this.getQuantityUnits(
          cfg,
          qtyStr,
          pair.baseDecimals
        );

        if (qtyUnits < BigInt(pair.minOrderSize)) {
          addLog(
            bot,
            `ASK level ${i + 1} dilewati: kuantitas di bawah minimum order.`,
            'RISK'
          );
          continue;
        }

        if (qtyUnits > BigInt(pair.maxOrderSize)) {
          addLog(
            bot,
            `ASK level ${i + 1} dilewati: kuantitas melebihi maksimum order.`,
            'RISK'
          );
          continue;
        }

        const priceUnits = PrecisionMath.parseToUnits(
          targetAskPrice.toString(),
          pair.quoteDecimals
        );

        if (baseAvailable < qtyUnits) {
          addLog(
            bot,
            `ASK level ${i + 1} dilewati: saldo ${pair.baseCurrency} tidak cukup.`,
            'RISK'
          );
          continue;
        }

        if (cfg.dry_run) {
          addLog(
            bot,
            `[DRY-RUN ASK] level=${i + 1} ref=${referencePrice} ` +
              `offset=${offsetBps}bps target=${targetAskPrice} ` +
              `qty=${PrecisionMath.formatFromUnits(qtyUnits, pair.baseDecimals)}`,
            'INFO'
          );

          baseAvailable -= qtyUnits;
          continue;
        }

        const clientOrderId =
          `bot-dp-${bot.id.slice(4, 10)}-a${i + 1}-${now}`;

        addLog(
          bot,
          `[DEBUG ASK] level=${i + 1} ref=${referencePrice} ` +
            `offsetBps=${offsetBps} target=${targetAskPrice} ` +
            `priceUnits=${priceUnits.toString()}`,
          'INFO'
        );

        const result = matchingEngine.placeOrder({
          userId: bot.accountId,
          pairId: bot.pairId,
          side: 'SELL',
          orderType: 'LIMIT',
          timeInForce: 'GTC',
          price: priceUnits.toString(),
          quantity: qtyUnits.toString(),
          clientOrderId
        });

        const order = this.getSubmittedOrder(result);

        if (!order) {
          addLog(
            bot,
            `Matching Engine tidak mengembalikan order untuk ASK level ${i + 1}.`,
            'ERROR'
          );
          continue;
        }

        bot.stats.ordersSubmitted++;
        bot.stats.ordersAccepted++;

        if (this.isOpenOrder(order)) {
          newActiveOrderIds.push(order.id);

          if (!bot.deployedOrderIds.includes(order.id)) {
            bot.deployedOrderIds.push(order.id);
          }
        }

        baseAvailable = BigInt(
          db.createOrGetAccount(bot.accountId, pair.baseCurrency)
            .balanceAvailable
        );

        addLog(
          bot,
          `[ASK] level=${i + 1} status=${order.status} ` +
            `price=${targetAskPrice.toLocaleString()} IDR`,
          order.status === 'FILLED' ? 'FILL' : 'ORDER'
        );
      } catch (err: any) {
        addLog(
          bot,
          `Gagal memasang ASK level ${i + 1}: ${err?.message || String(err)}`,
          'ERROR'
        );
      }
    }

    // Keep only orders that remain open after matching.
    cfg.activeOrderIds = Array.from(new Set(newActiveOrderIds));
    cfg.lastRepriceTimestamp = now;
    bot.lastHeartbeat = now;

    // Prune completed/cancelled IDs so future cancellation cycles do not
    // repeatedly process historical orders.
    bot.deployedOrderIds = bot.deployedOrderIds.filter((id) => {
      const order = db.orders.get(id);
      return this.isOpenOrder(order);
    });

    addLog(
      bot,
      `Ladder selesai: ${cfg.activeOrderIds.length} order masih terbuka; ` +
        `referensi=${referencePrice.toLocaleString()} IDR.`,
      'ORDER'
    );

    db.scheduleSave();
    return true;
  }

  public static cancelOpenDepthOrders(
    bot: BotInstance,
    addLog: LogFn,
    reason = 'Penghentian bot'
  ): number {
    const cfg = bot.depthLiquidityConfig;

    const idsToCancel = Array.from(
      new Set([
        ...(cfg?.activeOrderIds || []),
        ...(bot.deployedOrderIds || [])
      ])
    );

    let count = 0;

    for (const orderId of idsToCancel) {
      const order = db.orders.get(orderId);

      if (!this.isOpenOrder(order)) {
        continue;
      }

      try {
        const result = matchingEngine.cancelOrder(
          orderId,
          bot.accountId,
          bot.pairId
        );

        if (result?.status === 'CANCELLED') {
          count++;
        }
      } catch (err: any) {
        addLog(
          bot,
          `Gagal membatalkan order ${orderId}: ${err?.message || String(err)}`,
          'ERROR'
        );
      }
    }

    if (cfg) {
      cfg.activeOrderIds = [];
    }

    bot.deployedOrderIds = bot.deployedOrderIds.filter((id) => {
      const order = db.orders.get(id);
      return this.isOpenOrder(order);
    });

    if (count > 0) {
      addLog(
        bot,
        `Membatalkan ${count} order depth terbuka (${reason}).`,
        'INFO'
      );
    }

    db.scheduleSave();
    return count;
  }
}
