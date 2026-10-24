/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * bot.ts
 * Algorithmic Trading Bot Manager for DIMONEX.
 * Integrates directly with HMAC-SHA256 API Key authentication and assigns
 * all limit orders to the deploying user's account with clear clientOrderId tags.
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth } from './auth.js';
import { requireHmacAuth } from './apiKeys.js';
import { matchingEngine } from '../engine/MatchingEngine.js';
import { db, SYSTEM_TREASURY_ID } from '../db/database.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { marketWsService } from '../websocket/MarketDataWs.js';

export const botRouter = Router();

// Middleware: Authenticate via HMAC API Key header OR Session Bearer token
export const requireAuthOrHmac = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-dimonex-apikey'];
  if (apiKey) {
    return requireHmacAuth(req, res, next);
  }
  return requireAuth(req, res, next);
};

export interface ActiveBot {
  id: string;
  userId: string;
  userEmail: string;
  apiKeyId?: string;
  name: string;
  strategy: 'SPOT_GRID' | 'BUY_LAYERS' | 'SELL_LAYERS' | 'SMART_TRADE' | 'VOLUME_BOT';
  pairId: string;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';
  config: any;
  deployedOrderIds: string[];
  filledOrderCount: number;
  totalVolumeFilled: string;
  realizedProfitIdr: string;
  logs: { timestamp: number; message: string; type: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' }[];
  createdAt: number;
  updatedAt: number;
}

const BOTS_FILE = path.join(process.cwd(), 'server', 'data', 'bots_state.json');
const activeBots: Map<string, ActiveBot> = new Map();
const botIntervals: Map<string, NodeJS.Timeout> = new Map();

let saveBotsTimer: NodeJS.Timeout | null = null;
export function scheduleSaveBots() {
  if (saveBotsTimer) clearTimeout(saveBotsTimer);
  saveBotsTimer = setTimeout(() => {
    saveBotsToDisk();
    saveBotsTimer = null;
  }, 400);
}

export function saveBotsToDisk() {
  try {
    const dir = path.dirname(BOTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const botsArray = Array.from(activeBots.values());
    fs.writeFileSync(BOTS_FILE, JSON.stringify(botsArray, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DIMONEX Bot Engine] Gagal menyimpan bots ke disk:', err);
  }
}

function addBotLog(bot: ActiveBot, message: string, type: 'INFO' | 'ORDER' | 'FILL' | 'ERROR' = 'INFO') {
  bot.logs.unshift({
    timestamp: Date.now(),
    message,
    type
  });
  if (bot.logs.length > 80) bot.logs.pop();
  bot.updatedAt = Date.now();
  scheduleSaveBots();
}

// 1. Get All Bots for User
botRouter.get('/list', requireAuthOrHmac, (req, res) => {
  const user = (req as any).user;
  const userBots = Array.from(activeBots.values())
    .filter(b => b.userId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(userBots);
});

// 2. Get Orders of a Specific Bot
botRouter.get('/orders/:botId', requireAuthOrHmac, (req, res) => {
  const user = (req as any).user;
  const bot = activeBots.get(req.params.botId);
  if (!bot || bot.userId !== user.id) {
    return res.status(404).json({ error: 'Bot tidak ditemukan' });
  }

  const botOrders = bot.deployedOrderIds
    .map(id => db.orders.get(id))
    .filter(Boolean);

  res.json(botOrders);
});

// 2b. Get All Active Bot Orders for User
botRouter.get('/open-orders', requireAuthOrHmac, (req, res) => {
  const user = (req as any).user;
  const userBots = Array.from(activeBots.values()).filter(b => b.userId === user.id);
  const botOrderIds = new Set<string>();
  userBots.forEach(b => b.deployedOrderIds.forEach(id => botOrderIds.add(id)));

  const openOrders = Array.from(db.orders.values())
    .filter(o => o.userId === user.id && (botOrderIds.has(o.id) || (o.clientOrderId && o.clientOrderId.startsWith('bot-'))) && (o.status === 'NEW' || o.status === 'PARTIALLY_FILLED'))
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json(openOrders);
});

// 3. Deploy Spot Grid Bot (Two-Sided Grid: Buys below mid, Sells above mid)
botRouter.post('/grid/deploy', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const { apiKeyId, pairId, lowerPrice, upperPrice, gridCount, totalInvestmentIdr, investmentCrypto } = req.body;

    if (!pairId || !lowerPrice || !upperPrice || !gridCount || !totalInvestmentIdr) {
      return res.status(400).json({ error: 'Parameter Spot Grid tidak lengkap' });
    }

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Trading pair tidak ditemukan' });

    const lowerUnits = PrecisionMath.parseToUnits(lowerPrice, pair.quoteDecimals);
    const upperUnits = PrecisionMath.parseToUnits(upperPrice, pair.quoteDecimals);
    const currentPriceUnits = BigInt(pair.lastPrice);

    if (lowerUnits >= upperUnits) {
      return res.status(400).json({ error: 'Batas harga bawah harus lebih kecil dari batas harga atas' });
    }

    const count = parseInt(gridCount, 10);
    if (count < 3 || count > 30) {
      return res.status(400).json({ error: 'Jumlah grid harus di antara 3 sampai 30' });
    }

    const priceStep = (upperUnits - lowerUnits) / BigInt(count);
    const budgetPerGridIdr = PrecisionMath.parseToUnits(totalInvestmentIdr, 2) / BigInt(count);

    const botId = `bot-grid-${crypto.randomUUID().slice(0, 8)}`;
    const bot: ActiveBot = {
      id: botId,
      userId: user.id,
      userEmail: user.email,
      apiKeyId,
      name: `Spot Grid ${pairId} (${count} Level)`,
      strategy: 'SPOT_GRID',
      pairId,
      status: 'RUNNING',
      config: {
        lowerPrice,
        upperPrice,
        gridCount: count,
        priceStep: priceStep.toString(),
        totalInvestmentIdr
      },
      deployedOrderIds: [],
      filledOrderCount: 0,
      totalVolumeFilled: '0',
      realizedProfitIdr: '0',
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addBotLog(bot, `Bot Spot Grid diinisialisasi oleh ${user.email} (API Key: ${apiKeyId || 'Session Token'}).`);
    addBotLog(bot, `Rentang Grid: ${lowerPrice} IDR s/d ${upperPrice} IDR | Step: ${PrecisionMath.formatFromUnits(priceStep, 2)} IDR`);

    // Check user crypto balance for sell grid orders above current price
    const userBaseAcc = db.getAccount(user.id, pair.baseCurrency);
    const availableBaseUnits = userBaseAcc ? BigInt(userBaseAcc.balanceAvailable) : 0n;

    let buyOrdersDeployed = 0;
    let sellOrdersDeployed = 0;

    for (let i = 0; i <= count; i++) {
      const gridPrice = lowerUnits + (priceStep * BigInt(i));

      if (gridPrice < currentPriceUnits) {
        // BUY GRID ORDER (Below current price)
        const qtyBaseUnits = PrecisionMath.calculateBaseQuantity(budgetPerGridIdr, pair.baseDecimals, gridPrice);
        if (qtyBaseUnits >= BigInt(pair.minOrderSize)) {
          try {
            const result = matchingEngine.placeOrder({
              userId: user.id, // Explicit user ownership
              pairId,
              side: 'BUY',
              orderType: 'LIMIT',
              timeInForce: 'GTC',
              price: gridPrice.toString(),
              quantity: qtyBaseUnits.toString(),
              clientOrderId: `${botId}-buy-${i + 1}`
            });

            bot.deployedOrderIds.push(result.takerOrder.id);
            marketWsService.broadcastOrderUpdate(result.takerOrder);
            buyOrdersDeployed++;
            addBotLog(bot, `[Grid Buy #${i + 1}] Order limit beli aktif: ${PrecisionMath.formatFromUnits(qtyBaseUnits, pair.baseDecimals)} @ ${PrecisionMath.formatIDRDisplay(gridPrice)}`, 'ORDER');
          } catch (err: any) {
            addBotLog(bot, `Gagal memasang grid buy #${i + 1}: ${err.message}`, 'ERROR');
          }
        }
      } else if (gridPrice > currentPriceUnits && availableBaseUnits > 0n) {
        // SELL GRID ORDER (Above current price, if base crypto is available)
        const qtyToSellUnits = availableBaseUnits / BigInt(count);
        if (qtyToSellUnits >= BigInt(pair.minOrderSize)) {
          try {
            const result = matchingEngine.placeOrder({
              userId: user.id,
              pairId,
              side: 'SELL',
              orderType: 'LIMIT',
              timeInForce: 'GTC',
              price: gridPrice.toString(),
              quantity: qtyToSellUnits.toString(),
              clientOrderId: `${botId}-sell-${i + 1}`
            });

            bot.deployedOrderIds.push(result.takerOrder.id);
            marketWsService.broadcastOrderUpdate(result.takerOrder);
            sellOrdersDeployed++;
            addBotLog(bot, `[Grid Sell #${i + 1}] Order limit jual aktif: ${PrecisionMath.formatFromUnits(qtyToSellUnits, pair.baseDecimals)} @ ${PrecisionMath.formatIDRDisplay(gridPrice)}`, 'ORDER');
          } catch (err: any) {
            // non-fatal if user runs out of sell balance
          }
        }
      }
    }

    addBotLog(bot, `Deployment selesai: Total ${bot.deployedOrderIds.length} order limit aktif dimasukkan ke buku order (${buyOrdersDeployed} Beli, ${sellOrdersDeployed} Jual)`);

    activeBots.set(bot.id, bot);
    const book = matchingEngine.getOrderBook(pairId);
    marketWsService.broadcast(`depth:${pairId}`, { type: 'depth', pairId, data: book.getDepth(25) });

    res.json({ success: true, bot });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Deploy Layered Limit Orders (Ladder Buy / Sell)
botRouter.post('/layers/deploy', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const { apiKeyId, pairId, side, startPrice, layerCount, priceStepPercent, quantityPerLayer } = req.body;

    if (!pairId || !side || !startPrice || !layerCount || !priceStepPercent || !quantityPerLayer) {
      return res.status(400).json({ error: 'Konfigurasi layer order tidak lengkap' });
    }

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair tidak ditemukan' });

    const baseStartPriceUnits = PrecisionMath.parseToUnits(startPrice, pair.quoteDecimals);
    const count = parseInt(layerCount, 10);
    const stepBps = Math.round(parseFloat(priceStepPercent) * 100); // 1% = 100 bps
    const qtyUnits = PrecisionMath.parseToUnits(quantityPerLayer, pair.baseDecimals);

    if (count < 2 || count > 20) {
      return res.status(400).json({ error: 'Jumlah layer order harus antara 2 sampai 20' });
    }

    const botId = `bot-layer-${crypto.randomUUID().slice(0, 8)}`;
    const bot: ActiveBot = {
      id: botId,
      userId: user.id,
      userEmail: user.email,
      apiKeyId,
      name: `Layered ${side} Ladder ${pairId} (${count} Level)`,
      strategy: side === 'BUY' ? 'BUY_LAYERS' : 'SELL_LAYERS',
      pairId,
      status: 'RUNNING',
      config: {
        side,
        startPrice,
        layerCount: count,
        priceStepPercent,
        quantityPerLayer
      },
      deployedOrderIds: [],
      filledOrderCount: 0,
      totalVolumeFilled: '0',
      realizedProfitIdr: '0',
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addBotLog(bot, `Mendeploy tangga order ${side} untuk ${user.email} (Step: ${priceStepPercent}% per level)`);

    for (let i = 0; i < count; i++) {
      const multiplierBps = side === 'BUY' 
        ? 10000n - (BigInt(stepBps) * BigInt(i))
        : 10000n + (BigInt(stepBps) * BigInt(i));

      const layerPriceUnits = (baseStartPriceUnits * multiplierBps) / 10000n;

      try {
        const result = matchingEngine.placeOrder({
          userId: user.id, // Explicit user ownership
          pairId,
          side: side as any,
          orderType: 'LIMIT',
          timeInForce: 'GTC',
          price: layerPriceUnits.toString(),
          quantity: qtyUnits.toString(),
          clientOrderId: `${botId}-${side.toLowerCase()}-layer-${i + 1}`
        });

        bot.deployedOrderIds.push(result.takerOrder.id);
        marketWsService.broadcastOrderUpdate(result.takerOrder);
        addBotLog(bot, `[Layer #${i + 1}] Order limit ${side} aktif: ${quantityPerLayer} ${pair.baseCurrency} @ ${PrecisionMath.formatIDRDisplay(layerPriceUnits)}`, 'ORDER');
      } catch (err: any) {
        addBotLog(bot, `Gagal memasang layer #${i + 1}: ${err.message}`, 'ERROR');
      }
    }

    addBotLog(bot, `Berhasil memasukkan ${bot.deployedOrderIds.length} order limit ke buku order dan antrean order aktif.`);

    activeBots.set(bot.id, bot);
    const book = matchingEngine.getOrderBook(pairId);
    marketWsService.broadcast(`depth:${pairId}`, { type: 'depth', pairId, data: book.getDepth(25) });

    res.json({ success: true, bot });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Deploy Auto Smart Trade (Target Volume & Price Execution)
botRouter.post('/smart-trade/deploy', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const { apiKeyId, pairId, side, targetPrice, totalVolume, sliceCount, orderType } = req.body;

    if (!pairId || !side || !targetPrice || !totalVolume || !sliceCount) {
      return res.status(400).json({ error: 'Parameter Smart Trade tidak lengkap' });
    }

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair tidak ditemukan' });

    const totalVolumeUnits = PrecisionMath.parseToUnits(totalVolume, pair.baseDecimals);
    const targetPriceUnits = PrecisionMath.parseToUnits(targetPrice, pair.quoteDecimals);
    const slices = parseInt(sliceCount, 10);
    const sliceQtyUnits = totalVolumeUnits / BigInt(slices);

    const botId = `bot-smart-${crypto.randomUUID().slice(0, 8)}`;
    const bot: ActiveBot = {
      id: botId,
      userId: user.id,
      userEmail: user.email,
      apiKeyId,
      name: `Smart Trade ${side} ${pairId} (${totalVolume} ${pair.baseCurrency})`,
      strategy: 'SMART_TRADE',
      pairId,
      status: 'RUNNING',
      config: {
        side,
        targetPrice,
        totalVolume,
        sliceCount: slices,
        orderType: orderType || 'LIMIT'
      },
      deployedOrderIds: [],
      filledOrderCount: 0,
      totalVolumeFilled: '0',
      realizedProfitIdr: '0',
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addBotLog(bot, `Smart Trade dimulai: Target volume ${totalVolume} ${pair.baseCurrency} dibagi ke dalam ${slices} slice @ ${targetPrice} IDR`);

    // Place initial slice as limit or market
    try {
      const result = matchingEngine.placeOrder({
        userId: user.id, // Explicit user ownership
        pairId,
        side: side as any,
        orderType: orderType === 'MARKET' ? 'MARKET' : 'LIMIT',
        timeInForce: 'GTC',
        price: targetPriceUnits.toString(),
        quantity: sliceQtyUnits.toString(),
        clientOrderId: `${botId}-slice-1`
      });

      bot.deployedOrderIds.push(result.takerOrder.id);
      marketWsService.broadcastOrderUpdate(result.takerOrder);

      if (result.trades.length > 0) {
        bot.filledOrderCount += 1;
        bot.totalVolumeFilled = (BigInt(bot.totalVolumeFilled) + sliceQtyUnits).toString();
        addBotLog(bot, `Slice #1 terisi langsung: ${PrecisionMath.formatFromUnits(sliceQtyUnits, pair.baseDecimals)} ${pair.baseCurrency}`, 'FILL');
      } else {
        addBotLog(bot, `Slice #1 terpasang sebagai limit order aktif @ ${PrecisionMath.formatIDRDisplay(targetPriceUnits)}`, 'ORDER');
      }
    } catch (err: any) {
      addBotLog(bot, `Gagal mengeksekusi slice awal: ${err.message}`, 'ERROR');
    }

    activeBots.set(bot.id, bot);
    const book = matchingEngine.getOrderBook(pairId);
    marketWsService.broadcast(`depth:${pairId}`, { type: 'depth', pairId, data: book.getDepth(25) });

    res.json({ success: true, bot });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5b. Background Volume Bot Runner
function startVolumeBotRunner(botId: string) {
  const bot = activeBots.get(botId);
  if (!bot || bot.status !== 'RUNNING') return;

  const pair = db.tradingPairs.get(bot.pairId);
  if (!pair) return;

  const delayMs = Math.max(1000, Number(bot.config.delaySecondAmount || 3) * 1000);
  let stepIndex = 0;

  const executeTick = () => {
    const currentBot = activeBots.get(botId);
    if (!currentBot || currentBot.status !== 'RUNNING') {
      const timer = botIntervals.get(botId);
      if (timer) {
        clearInterval(timer);
        botIntervals.delete(botId);
      }
      return;
    }

    const currentPair = db.tradingPairs.get(currentBot.pairId);
    if (!currentPair) return;

    const targetVolumeUnits = PrecisionMath.parseToUnits(currentBot.config.targetVolumeReach, currentPair.baseDecimals);
    const currentFilledUnits = BigInt(currentBot.totalVolumeFilled || '0');

    if (currentFilledUnits >= targetVolumeUnits) {
      currentBot.status = 'COMPLETED';
      addBotLog(currentBot, `🎯 Target volume ${currentBot.config.targetVolumeReach} ${currentPair.baseCurrency} tercapai 100%! Bot volume selesai secara otomatis.`, 'FILL');
      const timer = botIntervals.get(botId);
      if (timer) {
        clearInterval(timer);
        botIntervals.delete(botId);
      }
      return;
    }

    // 1. Determine Direction Mode (BUY_FIRST, SELL_FIRST, RANDOM)
    let side: 'BUY' | 'SELL';
    if (currentBot.config.directionMode === 'BUY_FIRST') {
      side = stepIndex % 2 === 0 ? 'BUY' : 'SELL';
    } else if (currentBot.config.directionMode === 'SELL_FIRST') {
      side = stepIndex % 2 === 0 ? 'SELL' : 'BUY';
    } else {
      side = Math.random() >= 0.5 ? 'BUY' : 'SELL';
    }

    // 2. Determine Quantity (Amount Random vs Fixed)
    let qtyStr = currentBot.config.amountMin || '0.01';
    if (currentBot.config.amountRandom) {
      const minVal = parseFloat(currentBot.config.amountMin || '0.01');
      const maxVal = parseFloat(currentBot.config.amountMax || (minVal * 2).toString());
      const randVal = minVal + Math.random() * (maxVal - minVal);
      qtyStr = randVal.toFixed(currentPair.baseDecimals > 6 ? 4 : 2);
    }
    let qtyUnits = PrecisionMath.parseToUnits(qtyStr, currentPair.baseDecimals);
    if (qtyUnits < BigInt(currentPair.minOrderSize)) {
      qtyUnits = BigInt(currentPair.minOrderSize);
    }

    // Cap to remaining target volume
    const remainingUnits = targetVolumeUnits - currentFilledUnits;
    if (qtyUnits > remainingUnits) {
      qtyUnits = remainingUnits;
    }

    // 3. Determine Price within [minPrice, maxPrice]
    const minUnits = PrecisionMath.parseToUnits(currentBot.config.minPrice, currentPair.quoteDecimals);
    const maxUnits = PrecisionMath.parseToUnits(currentBot.config.maxPrice, currentPair.quoteDecimals);
    const midUnits = BigInt(currentPair.lastPrice);

    // Natural variation around market price within ±0.15%
    const randomBps = BigInt(Math.floor(Math.random() * 30 - 15));
    let priceUnits = midUnits + ((midUnits * randomBps) / 10000n);
    if (priceUnits < minUnits) priceUnits = minUnits;
    if (priceUnits > maxUnits) priceUnits = maxUnits;

    stepIndex++;

    try {
      // Ensure liquidity accounts exist for continuous execution
      db.createOrGetAccount(currentBot.userId, currentPair.quoteCurrency, '500000000000');
      db.createOrGetAccount(currentBot.userId, currentPair.baseCurrency, '1000000000');

      // Pre-seed opposing liquidity order from Treasury so order matches and completes volume turnover
      const book = matchingEngine.getOrderBook(currentPair.id);
      const opposingSide = side === 'BUY' ? book.asks : book.bids;
      const hasOpposing = opposingSide.some(o => o.userId !== currentBot.userId);

      if (!hasOpposing) {
        matchingEngine.placeOrder({
          userId: SYSTEM_TREASURY_ID,
          pairId: currentPair.id,
          side: side === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'LIMIT',
          timeInForce: 'GTC',
          price: priceUnits.toString(),
          quantity: qtyUnits.toString(),
          clientOrderId: `sys-vol-maker-${Date.now()}`
        });
      }

      // Execute order for user bot
      const result = matchingEngine.placeOrder({
        userId: currentBot.userId,
        pairId: currentPair.id,
        side,
        orderType: 'LIMIT',
        timeInForce: 'IOC',
        price: priceUnits.toString(),
        quantity: qtyUnits.toString(),
        clientOrderId: `${botId}-vol-${side.toLowerCase()}-${stepIndex}`
      });

      currentBot.deployedOrderIds.push(result.takerOrder.id);
      currentBot.filledOrderCount += 1;

      const filledThisTick = BigInt(result.takerOrder.filledQuantity || qtyUnits.toString());
      currentBot.totalVolumeFilled = (BigInt(currentBot.totalVolumeFilled) + filledThisTick).toString();

      // Broadcast trades and updates
      for (const t of result.trades) {
        marketWsService.broadcastTrade(t);
      }
      marketWsService.broadcastOrderUpdate(result.takerOrder);
      const updatedBook = matchingEngine.getOrderBook(currentPair.id);
      marketWsService.broadcast(`depth:${currentPair.id}`, { type: 'depth', pairId: currentPair.id, data: updatedBook.getDepth(25) });

      const cumFormatted = PrecisionMath.formatFromUnits(BigInt(currentBot.totalVolumeFilled), currentPair.baseDecimals);
      const targetFormatted = currentBot.config.targetVolumeReach;
      const pct = Math.min(100, Number((BigInt(currentBot.totalVolumeFilled) * 100n) / targetVolumeUnits));

      addBotLog(
        currentBot,
        `[Vol Bot #${stepIndex}] Eksekusi ${side} ${PrecisionMath.formatFromUnits(filledThisTick, currentPair.baseDecimals)} ${currentPair.baseCurrency} @ ${PrecisionMath.formatIDRDisplay(priceUnits)} | Akumulasi: ${cumFormatted}/${targetFormatted} (${pct}%)`,
        'FILL'
      );

      if (BigInt(currentBot.totalVolumeFilled) >= targetVolumeUnits) {
        currentBot.status = 'COMPLETED';
        addBotLog(currentBot, `🎯 Target volume ${targetFormatted} ${currentPair.baseCurrency} TERCAPAI LENGKAP 100%! Bot volume selesai.`, 'INFO');
        const timer = botIntervals.get(botId);
        if (timer) {
          clearInterval(timer);
          botIntervals.delete(botId);
        }
      }
    } catch (err: any) {
      addBotLog(currentBot, `Gagal eksekusi tick volume #${stepIndex}: ${err.message}`, 'ERROR');
    }
  };

  // Run immediate first tick, then interval
  executeTick();
  const interval = setInterval(executeTick, delayMs);
  botIntervals.set(botId, interval);
}

export function loadBotsFromDisk() {
  try {
    if (!fs.existsSync(BOTS_FILE)) return;
    const raw = fs.readFileSync(BOTS_FILE, 'utf-8');
    const botsArray: ActiveBot[] = JSON.parse(raw);
    if (Array.isArray(botsArray)) {
      for (const bot of botsArray) {
        activeBots.set(bot.id, bot);
        if (bot.status === 'RUNNING' && bot.strategy === 'VOLUME_BOT') {
          startVolumeBotRunner(bot.id);
        }
      }
      console.log(`[DIMONEX Bot Engine] Berhasil memuat ${activeBots.size} bot dari disk.`);
    }
  } catch (err) {
    console.warn('[DIMONEX Bot Engine] Gagal memuat bots dari disk:', err);
  }
}

// Re-hydrate bots from disk on boot
loadBotsFromDisk();

// 5c. Deploy Volume Bot
botRouter.post('/volume/deploy', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const {
      apiKeyId,
      pairId,
      targetVolumeReach,
      minPrice,
      maxPrice,
      delaySecondAmount,
      amountRandom,
      amountMin,
      amountMax,
      directionMode
    } = req.body;

    if (!pairId || !targetVolumeReach || !minPrice || !maxPrice) {
      return res.status(400).json({ error: 'Parameter volume bot tidak lengkap (pairId, targetVolumeReach, minPrice, maxPrice)' });
    }

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Trading pair tidak ditemukan' });

    const minPriceUnits = PrecisionMath.parseToUnits(minPrice, pair.quoteDecimals);
    const maxPriceUnits = PrecisionMath.parseToUnits(maxPrice, pair.quoteDecimals);
    if (minPriceUnits >= maxPriceUnits) {
      return res.status(400).json({ error: 'Harga minimum harus lebih kecil dari harga maksimum' });
    }

    const delaySec = Math.max(1, parseInt(String(delaySecondAmount || 3), 10));

    const botId = `bot-vol-${crypto.randomUUID().slice(0, 8)}`;
    const bot: ActiveBot = {
      id: botId,
      userId: user.id,
      userEmail: user.email,
      apiKeyId,
      name: `Volume Bot ${pairId} (${targetVolumeReach} ${pair.baseCurrency})`,
      strategy: 'VOLUME_BOT',
      pairId,
      status: 'RUNNING',
      config: {
        targetVolumeReach,
        minPrice,
        maxPrice,
        delaySecondAmount: delaySec,
        amountRandom: Boolean(amountRandom),
        amountMin: amountMin || '0.01',
        amountMax: amountMax || '0.05',
        directionMode: directionMode || 'RANDOM'
      },
      deployedOrderIds: [],
      filledOrderCount: 0,
      totalVolumeFilled: '0',
      realizedProfitIdr: '0',
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    addBotLog(bot, `Volume Bot diluncurkan oleh ${user.email}. Target: ${targetVolumeReach} ${pair.baseCurrency} | Rentang: ${minPrice} - ${maxPrice} IDR`);
    addBotLog(bot, `Arah: ${directionMode || 'RANDOM'} | Interval Delay: ${delaySec}s | Random Amount: ${amountRandom ? 'YA' : 'TIDAK'}`);

    activeBots.set(bot.id, bot);

    // Start background volume runner
    startVolumeBotRunner(bot.id);

    res.json({ success: true, bot });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Stop Bot & Cancel Open Orders
botRouter.post('/stop', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const { botId, cancelOpenOrders } = req.body;

    const bot = activeBots.get(botId);
    if (!bot || bot.userId !== user.id) {
      return res.status(404).json({ error: 'Bot tidak ditemukan' });
    }

    bot.status = 'STOPPED';
    addBotLog(bot, `Bot dihentikan oleh user ${user.email}`);

    // Clear background interval if any
    const timer = botIntervals.get(botId);
    if (timer) {
      clearInterval(timer);
      botIntervals.delete(botId);
    }

    let cancelledCount = 0;
    if (cancelOpenOrders) {
      for (const orderId of bot.deployedOrderIds) {
        const order = db.orders.get(orderId);
        if (order && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
          try {
            matchingEngine.cancelOrder(orderId, user.id, bot.pairId);
            cancelledCount++;
          } catch (e) {}
        }
      }
      addBotLog(bot, `Membatalkan ${cancelledCount} order aktif yang belum terisi di buku order.`);
      const book = matchingEngine.getOrderBook(bot.pairId);
      marketWsService.broadcast(`depth:${bot.pairId}`, { type: 'depth', pairId: bot.pairId, data: book.getDepth(25) });
    }

    res.json({ success: true, message: `Bot ${bot.name} dihentikan. ${cancelledCount} order terbuka dibatalkan.`, bot });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Cancel All Bot Orders Across All Bots for User
botRouter.post('/cancel-all', requireAuthOrHmac, (req, res) => {
  try {
    const user = (req as any).user;
    const userBots = Array.from(activeBots.values()).filter(b => b.userId === user.id);
    let totalCancelled = 0;
    const affectedPairs = new Set<string>();

    // Clear all running interval timers
    for (const [bId, timer] of botIntervals.entries()) {
      clearInterval(timer);
      botIntervals.delete(bId);
    }

    for (const bot of userBots) {
      bot.status = 'STOPPED';
      affectedPairs.add(bot.pairId);
      for (const orderId of bot.deployedOrderIds) {
        const order = db.orders.get(orderId);
        if (order && (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED')) {
          try {
            matchingEngine.cancelOrder(orderId, user.id, bot.pairId);
            totalCancelled++;
          } catch (e) {}
        }
      }
      addBotLog(bot, `Semua order bot dibatalkan secara massal.`);
    }

    for (const pairId of affectedPairs) {
      const book = matchingEngine.getOrderBook(pairId);
      marketWsService.broadcast(`depth:${pairId}`, { type: 'depth', pairId, data: book.getDepth(25) });
    }

    res.json({ success: true, message: `Berhasil membatalkan ${totalCancelled} order bot terbuka.`, totalCancelled });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
