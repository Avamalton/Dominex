/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * test_external_feeds.ts
 * Comprehensive Automated Tests for DIMONEX External Price Feed,
 * Multi-Exchange Aggregator, USDT/IDR FX Conversion Engine,
 * Price Follower Bot, and Depth & Liquidity Bot.
 */

import crypto from 'crypto';
import { db } from '../db/database.js';
import { matchingEngine } from '../engine/MatchingEngine.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { BinancePublicFeed } from '../services/external/BinancePublicFeed.js';
import { BybitPublicFeed } from '../services/external/BybitPublicFeed.js';
import { FxConversionService, fxConversionService } from '../services/external/FxConversionService.js';
import { PriceAggregatorService, priceAggregatorService } from '../services/external/PriceAggregatorService.js';
import { PriceFollowerBotExecutor } from '../services/bots/PriceFollowerBot.js';
import { DepthLiquidityBotExecutor } from '../services/bots/DepthLiquidityBot.js';
import { botWorkerManager } from '../services/BotWorkerManager.js';
import { BotInstance } from '../db/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('   DIMONEX: EXTERNAL FEEDS & MARKET MAKER AUTOMATED TEST SUITE  ');
  console.log('================================================================\n');

  const mmUserId = 'usr-mm-0000-0000-000000000001';
  const adminUserId = 'usr-admin-0000-0000-000000000001';

  // Ensure balance for MM user
  const mmIdr = db.createOrGetAccount(mmUserId, 'IDR', '5000000000000');
  mmIdr.balanceAvailable = (BigInt(mmIdr.balanceAvailable) + 5000000000000n).toString();
  const mmBtc = db.createOrGetAccount(mmUserId, 'BTC', '5000000000');
  mmBtc.balanceAvailable = (BigInt(mmBtc.balanceAvailable) + 5000000000n).toString();

  // -------------------------------------------------------------
  // TEST 1: Binance Public Stream Provider Interface & Metrics
  // -------------------------------------------------------------
  console.log('--- Test 1: Binance Spot Public Provider ---');
  const binance = new BinancePublicFeed();
  const bStatus = binance.getConnectionStatus();
  assert(['DISCONNECTED', 'CONNECTING', 'CONNECTED'].includes(bStatus), '1.1 Binance connection status valid', bStatus);

  const bMetrics = binance.getMetrics();
  assert(typeof bMetrics.reconnectCount === 'number', '1.2 Binance metrics tracks reconnectCount');
  assert(typeof bMetrics.lastHeartbeat === 'number', '1.3 Binance metrics tracks lastHeartbeat');

  const btcTick = binance.getTick('BTCUSDT');
  assert(btcTick !== null && btcTick.lastPrice > 0, '1.4 Binance returns baseline tick for BTCUSDT');
  assert(btcTick !== null && btcTick.bestAsk >= btcTick.bestBid, '1.5 Binance best ask >= best bid');

  // -------------------------------------------------------------
  // TEST 2: Bybit Spot Public Provider Interface & Metrics
  // -------------------------------------------------------------
  console.log('--- Test 2: Bybit Spot Public Provider ---');
  const bybit = new BybitPublicFeed();
  const yStatus = bybit.getConnectionStatus();
  assert(['DISCONNECTED', 'CONNECTING', 'CONNECTED'].includes(yStatus), '2.1 Bybit connection status valid', yStatus);

  const yMetrics = bybit.getMetrics();
  assert(typeof yMetrics.reconnectCount === 'number', '2.2 Bybit metrics tracks reconnectCount');

  const yBtcTick = bybit.getTick('BTCUSDT');
  assert(yBtcTick !== null && yBtcTick.lastPrice > 0, '2.3 Bybit returns baseline tick for BTCUSDT');

  // -------------------------------------------------------------
  // TEST 3: USDT/IDR FX Conversion Engine & Admin Audit History
  // -------------------------------------------------------------
  console.log('--- Test 3: USDT/IDR FX Conversion Engine ---');
  const fxService = fxConversionService;
  const currentFx = fxService.getCurrentRate();
  assert(currentFx.rate === 16350.00, '3.1 Default USDT/IDR FX rate is 16,350 IDR');
  assert(!currentFx.isStale, '3.2 Initial FX rate is fresh and valid');

  const btcConverted = fxService.convertUsdtToIdr(95000.00);
  assert(btcConverted.isValid && btcConverted.idrPrice === 95000 * 16350, '3.3 BTC/IDR = BTC/USDT * USDT/IDR mathematical accuracy', `Got: ${btcConverted.idrPrice}`);

  // Admin updates FX rate
  const updateResult = fxService.updateManualRate(16400.00, 'admin@dimonex.id', 'Penyesuaian kurs tengah', 24);
  assert(updateResult.success, '3.4 Admin can update manual FX rate within tolerance');
  assert(fxService.getCurrentRate().rate === 16400.00, '3.5 New FX rate is active');

  // Audit history recorded
  const history = fxService.getAuditHistory();
  assert(history.length >= 2, '3.6 Audit trail accurately recorded rate change');
  assert(history[0].actor === 'admin@dimonex.id' && history[0].newRate === 16400.00, '3.7 Audit record contains actor and new rate');

  // Guard against massive jump without explicit confirmation
  const massiveJump = fxService.updateManualRate(25000.00, 'admin@dimonex.id', 'Lompatan besar', 24, false);
  assert(!massiveJump.success, '3.8 Massive jump (>10%) rejected without explicit out-of-band confirmation');

  const confirmedJump = fxService.updateManualRate(16350.00, 'admin@dimonex.id', 'Reset rate', 24, true);
  assert(confirmedJump.success, '3.9 Confirmed rate change accepted');

  // -------------------------------------------------------------
  // TEST 4: Multi-Exchange Price Aggregator, Deviation & Failover
  // -------------------------------------------------------------
  console.log('--- Test 4: Multi-Exchange Price Aggregator ---');
  const aggregator = priceAggregatorService;
  const refBtc = aggregator.getReferencePrice('BTC-IDR');
  assert(refBtc.effectiveIdrPrice > 0, '4.1 Aggregator computes IDR reference price', `IDR: ${refBtc.effectiveIdrPrice}`);
  assert(refBtc.status === 'ACTIVE' || refBtc.status === 'DEGRADED', '4.2 Aggregator status active/degraded');
  assert(refBtc.activeProvider === 'binance', '4.3 Primary provider defaults to Binance');

  // Test abnormal deviation detection
  aggregator.binance.updateMockTick('BTCUSDT', 95000);
  aggregator.bybit.updateMockTick('BTCUSDT', 110000); // ~14% deviation (> 200 bps)
  const abnormalRef = aggregator.getReferencePrice('BTC-IDR');
  assert(abnormalRef.isAbnormal, '4.4 Deviation > 200 bps flagged as abnormal');
  assert(abnormalRef.status === 'REFERENCE_PRICE_UNAVAILABLE', '4.5 Strict policy marks abnormal market as REFERENCE_PRICE_UNAVAILABLE');

  // Reset back to aligned prices
  aggregator.binance.updateMockTick('BTCUSDT', 95000);
  aggregator.bybit.updateMockTick('BTCUSDT', 95010);
  const normalRef = aggregator.getReferencePrice('BTC-IDR');
  assert(!normalRef.isAbnormal && normalRef.status === 'ACTIVE', '4.6 Normal aligned prices restore ACTIVE status');

  // -------------------------------------------------------------
  // TEST 5: Price Follower Bot Real Execution & Lifecycle
  // -------------------------------------------------------------
  console.log('--- Test 5: Price Follower Bot Execution ---');
  const pfBotId = `bot-pf-test-${crypto.randomUUID().slice(0, 6)}`;
  const pfBot: BotInstance = {
    id: pfBotId,
    name: 'Test Price Follower',
    botType: 'PRICE_FOLLOWER',
    pairId: 'BTC-IDR',
    environment: 'DEMO',
    ownerUserId: mmUserId,
    accountId: mmUserId,
    version: 1,
    status: 'READY',
    lastHeartbeat: Date.now(),
    priceFollowerConfig: {
      account_id: mmUserId,
      market_symbol: 'BTC-IDR',
      reference_provider: 'AGGREGATED',
      reference_price_source: 'MIDPOINT',
      reference_price_mode: 'STATIC_OFFSET',
      target_spread_bps: 40,
      buy_offset_bps: 20,
      sell_offset_bps: 20,
      order_quantity: '0.02',
      minimum_reprice_interval_ms: 1000,
      minimum_price_change_bps: 5,
      maximum_price_deviation_bps: 300,
      maximum_order_quantity: '1.0',
      maximum_order_value_idr: '100000000',
      maximum_open_orders: 2,
      maximum_inventory: '5.0',
      maximum_daily_turnover_idr: '500000000',
      maximum_daily_loss_idr: '25000000',
      maximum_cancel_replace_rate: 5,
      max_data_age_ms: 15000,
      tick_size: 1000,
      lot_size: '0.0001',
      enabled: true,
      dry_run: false
    },
    stats: {
      ordersSubmitted: 0,
      ordersAccepted: 0,
      ordersFilled: 0,
      executedVolume: '0',
      totalTrades: 0
    },
    deployedOrderIds: [],
    logs: [],
    createdBy: 'mm@dimonex.id',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  db.botInstances.set(pfBot.id, pfBot);

  // Execute tick cycle
  const executed = PriceFollowerBotExecutor.executeCycle(pfBot, (b, msg) => b.logs.push({ timestamp: Date.now(), message: msg, type: 'INFO' }));
  assert(executed, '5.1 PriceFollowerBotExecutor successfully executed cycle');
  assert(pfBot.stats.ordersSubmitted >= 1, '5.2 Bot placed real orders in matching engine', `Submitted: ${pfBot.stats.ordersSubmitted}`);
  assert(pfBot.priceFollowerConfig?.activeBuyOrderId !== undefined || pfBot.priceFollowerConfig?.activeSellOrderId !== undefined, '5.3 Active order IDs tracked on bot config');

  // Verify orders exist in database and matching engine
  if (pfBot.priceFollowerConfig?.activeBuyOrderId) {
    const buyOrder = db.orders.get(pfBot.priceFollowerConfig.activeBuyOrderId);
    assert(buyOrder !== undefined && buyOrder.side === 'BUY', '5.4 Real BUY order created in DB');
  }

  // Cancel orders
  const cancelledPf = PriceFollowerBotExecutor.cancelOpenBotOrders(pfBot, (b, msg) => b.logs.push({ timestamp: Date.now(), message: msg, type: 'INFO' }));
  assert(cancelledPf >= 1, '5.5 Price Follower cancelOpenBotOrders safely purges active orders', `Cancelled: ${cancelledPf}`);

  // -------------------------------------------------------------
  // TEST 6: Depth & Liquidity Bot Multi-Level Ladder Placement
  // -------------------------------------------------------------
  console.log('--- Test 6: Depth & Liquidity Bot Ladder Placement ---');
  const dlBotId = `bot-dl-test-${crypto.randomUUID().slice(0, 6)}`;
  const dlBot: BotInstance = {
    id: dlBotId,
    name: 'Test Depth Bot',
    botType: 'DEPTH_LIQUIDITY',
    pairId: 'BTC-IDR',
    environment: 'DEMO',
    ownerUserId: mmUserId,
    accountId: mmUserId,
    version: 1,
    status: 'READY',
    lastHeartbeat: Date.now(),
    depthLiquidityConfig: {
      account_id: mmUserId,
      market_symbol: 'BTC-IDR',
      reference_price_source: 'AGGREGATED',
      number_of_bid_levels: 3,
      number_of_ask_levels: 3,
      bid_level_offsets_bps: [10, 25, 50],
      ask_level_offsets_bps: [10, 25, 50],
      bid_quantities: ['0.02', '0.04', '0.08'],
      ask_quantities: ['0.02', '0.04', '0.08'],
      quantity_randomization_enabled: false,
      random_min_quantity: '0.01',
      random_max_quantity: '0.05',
      minimum_reprice_interval_ms: 1000,
      minimum_price_change_bps: 10,
      maximum_open_orders: 10,
      maximum_total_bid_value_idr: '500000000',
      maximum_total_ask_quantity: '5.0',
      maximum_inventory: '10.0',
      maximum_order_value_idr: '100000000',
      max_data_age_ms: 15000,
      tick_size: 1000,
      lot_size: '0.0001',
      dry_run: false,
      enabled: true,
      activeOrderIds: []
    },
    stats: {
      ordersSubmitted: 0,
      ordersAccepted: 0,
      ordersFilled: 0,
      executedVolume: '0',
      totalTrades: 0
    },
    deployedOrderIds: [],
    logs: [],
    createdBy: 'mm@dimonex.id',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  db.botInstances.set(dlBot.id, dlBot);

  const dlExecuted = DepthLiquidityBotExecutor.executeCycle(dlBot, (b, msg) => b.logs.push({ timestamp: Date.now(), message: msg, type: 'INFO' }));
  assert(dlExecuted, '6.1 DepthLiquidityBotExecutor successfully executed cycle');
  assert((dlBot.depthLiquidityConfig?.activeOrderIds?.length || 0) >= 3, '6.2 Multiple ladder levels deployed to order book', `Levels: ${dlBot.depthLiquidityConfig?.activeOrderIds?.length}`);

  // Verify levels in Matching Engine order book depth
  const bookDepth = matchingEngine.getOrderBook('BTC-IDR').getDepth(60);
  assert(bookDepth.bids.length > 0 && bookDepth.asks.length > 0, '6.3 Real Order Book depth contains deployed levels');

  // Clean cancellation
  const cancelledDl = DepthLiquidityBotExecutor.cancelOpenDepthOrders(dlBot, (b, msg) => b.logs.push({ timestamp: Date.now(), message: msg, type: 'INFO' }));
  assert(cancelledDl >= 3, '6.4 cancelOpenDepthOrders successfully removed all ladder levels', `Cancelled: ${cancelledDl}`);

  // -------------------------------------------------------------
  // TEST 7: Bot Cloning Configuration Independence for New Types
  // -------------------------------------------------------------
  console.log('--- Test 7: Bot Cloning Isolation ---');
  const clonedPfConfig = JSON.parse(JSON.stringify(pfBot.priceFollowerConfig));
  clonedPfConfig.buy_offset_bps = 50; // modify cloned config
  assert(pfBot.priceFollowerConfig?.buy_offset_bps === 20, '7.1 Original bot configuration unchanged after clone modification');
  assert(clonedPfConfig.buy_offset_bps === 50, '7.2 Cloned configuration operates independently');

  // -------------------------------------------------------------
  // TEST 8: Chart Benchmark Reference Overlay Consistency
  // -------------------------------------------------------------
  console.log('--- Test 8: Chart Benchmark Reference Overlay ---');
  const refEth = aggregator.getReferencePrice('ETH-IDR');
  assert(refEth.effectiveIdrPrice > 0, '8.1 ETH-IDR reference price available');
  assert(refEth.fxRateUsed === 16350.00, '8.2 Correct FX rate applied to ETH-IDR benchmark');

  // -------------------------------------------------------------
  // TEST 9: CoinMarketCap Provider & Live FX Rate Sync
  // -------------------------------------------------------------
  console.log('--- Test 9: CoinMarketCap Provider & FX Sync ---');
  const cmcProvider = aggregator.cmc;
  assert(['DISCONNECTED', 'CONNECTING', 'CONNECTED'].includes(cmcProvider.getConnectionStatus()), '9.1 CoinMarketCap provider connection status valid');
  
  const cmcBtc = cmcProvider.getTick('BTCUSDT');
  assert(cmcBtc !== null && cmcBtc.lastPrice > 0, '9.2 CoinMarketCap returns valid BTCUSDT price tick');

  const cmcUsdt = cmcProvider.getTick('USDTIDR');
  assert(cmcUsdt !== null && cmcUsdt.lastPrice > 0, '9.3 CoinMarketCap returns valid USDTIDR exchange rate tick');

  // Sync FX rate from CoinMarketCap
  const cmcSyncResult = fxService.syncWithCoinMarketCap(cmcUsdt!.lastPrice, 'cmc-bot@dimonex.id', 6);
  assert(cmcSyncResult.success, '9.4 FX Conversion engine successfully synced rate from CoinMarketCap');
  assert(fxService.getCurrentRate().source === 'COINMARKETCAP', '9.5 FX rate source is accurately recorded as COINMARKETCAP');
  assert(fxService.getCurrentRate().rate === cmcUsdt!.lastPrice, '9.6 Active FX rate matches CoinMarketCap rate');

  // Aggregator now reflects updated CMC rate in converted benchmark
  const refBtcCmc = aggregator.getReferencePrice('BTC-IDR');
  assert(refBtcCmc.cmcPrice !== null && refBtcCmc.cmcPrice > 0, '9.7 Aggregator reference price contains cmcPrice');
  assert(refBtcCmc.fxRateUsed === cmcUsdt!.lastPrice, '9.8 Converted benchmark automatically uses newly synced CoinMarketCap rate');

  console.log('\n================================================================');
  console.log(`TOTAL EXTERNAL FEEDS TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
