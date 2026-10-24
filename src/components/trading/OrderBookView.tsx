/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/trading/OrderBookView.tsx
 * High-density Order Book depth visualizer with:
 * - Precision level filter & dynamic depth aggregation (0.01, 0.1, 1.0, 10, 100, 1000)
 * - Anti-clutter visual grouping with cumulative volume bars and spread
 * - Prominent "ORDER KITA" indicators to distinguish user/admin/bot orders from market noise.
 */

import React, { useState, useMemo } from 'react';
import { TradingPairItem } from '../../types/index.js';
import { formatIDR, formatCrypto } from '../../lib/formatters.js';

interface UserOrderSummary {
  count: number;
  totalQty: string;
  isBot: boolean;
}

interface Props {
  pair: TradingPairItem;
  depth: {
    bids: [string, string, string][]; // [price, qty, cumulativeQty]
    asks: [string, string, string][];
    spread: string;
  };
  myOpenOrderPrices?: Set<string>;
  myOrdersByPrice?: Map<string, UserOrderSummary>;
  userRole?: string;
  onSelectPrice: (priceUnits: string) => void;
}

export type PrecisionOption = '0.01' | '0.1' | '1.0' | '10' | '100' | '1000';

export const OrderBookView: React.FC<Props> = ({
  pair,
  depth,
  myOpenOrderPrices,
  myOrdersByPrice,
  userRole,
  onSelectPrice,
}) => {
  // Precision filter state with local persistence
  const [precision, setPrecisionState] = useState<PrecisionOption>(() => {
    const saved = localStorage.getItem('dimonex_orderbook_precision');
    if (saved && ['0.01', '0.1', '1.0', '10', '100', '1000'].includes(saved)) {
      return saved as PrecisionOption;
    }
    return '0.01';
  });

  const setPrecision = (p: PrecisionOption) => {
    setPrecisionState(p);
    localStorage.setItem('dimonex_orderbook_precision', p);
  };

  // Precision options available
  const precisionOptions: { label: string; value: PrecisionOption }[] = [
    { label: '0.01', value: '0.01' },
    { label: '0.1', value: '0.1' },
    { label: '1.0', value: '1.0' },
    { label: '10', value: '10' },
    { label: '100', value: '100' },
    { label: '1.000', value: '1000' },
  ];

  // Convert precision option to BigInt units (1 IDR = 100 quote units)
  const stepUnits = useMemo(() => {
    switch (precision) {
      case '0.1': return 10n;
      case '1.0': return 100n;
      case '10': return 1000n;
      case '100': return 10000n;
      case '1000': return 100000n;
      default: return 1n; // '0.01'
    }
  }, [precision]);

  // Aggregate depth according to selected precision
  const aggregatedDepth = useMemo(() => {
    if (stepUnits === 1n) {
      return depth;
    }

    // 1. Aggregate Bids (Floor down to stepUnits)
    const bidMap = new Map<string, bigint>();
    for (const [p, q] of depth.bids) {
      const pUnits = BigInt(p);
      const bucketUnits = (pUnits / stepUnits) * stepUnits;
      const bucketKey = bucketUnits.toString();
      bidMap.set(bucketKey, (bidMap.get(bucketKey) || 0n) + BigInt(q));
    }

    const sortedBids = Array.from(bidMap.entries()).sort((a, b) => {
      const diff = BigInt(b[0]) - BigInt(a[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    let cumBid = 0n;
    const aggBids: [string, string, string][] = sortedBids.map(([p, q]) => {
      cumBid += q;
      return [p, q.toString(), cumBid.toString()];
    });

    // 2. Aggregate Asks (Ceil up to stepUnits)
    const askMap = new Map<string, bigint>();
    for (const [p, q] of depth.asks) {
      const pUnits = BigInt(p);
      const bucketUnits = ((pUnits + stepUnits - 1n) / stepUnits) * stepUnits;
      const bucketKey = bucketUnits.toString();
      askMap.set(bucketKey, (askMap.get(bucketKey) || 0n) + BigInt(q));
    }

    const sortedAsks = Array.from(askMap.entries()).sort((a, b) => {
      const diff = BigInt(a[0]) - BigInt(b[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    let cumAsk = 0n;
    const aggAsks: [string, string, string][] = sortedAsks.map(([p, q]) => {
      cumAsk += q;
      return [p, q.toString(), cumAsk.toString()];
    });

    return {
      bids: aggBids,
      asks: aggAsks,
      spread: depth.spread
    };
  }, [depth, stepUnits]);

  // Helper to determine if an aggregated bucket contains any user orders
  const getBucketUserOrderSummary = (bucketPrice: string, isAsk: boolean): UserOrderSummary | null => {
    if (!myOpenOrderPrices || myOpenOrderPrices.size === 0) return null;

    let bUnits = 0n;
    try {
      bUnits = BigInt(bucketPrice);
    } catch {
      return null;
    }

    const normBucket = bUnits.toString();
    let matchedCount = 0;
    let matchedTotalQty = 0n;
    let matchedIsBot = false;

    if (stepUnits === 1n) {
      const direct = myOrdersByPrice?.get(normBucket) || myOrdersByPrice?.get(bucketPrice);
      if (direct) return direct;
      if (myOpenOrderPrices.has(normBucket) || myOpenOrderPrices.has(bucketPrice)) {
        return { count: 1, totalQty: '0', isBot: false };
      }
      return null;
    }

    for (const userPrice of myOpenOrderPrices) {
      let uUnits = 0n;
      try {
        uUnits = BigInt(userPrice);
      } catch {
        continue;
      }

      const userBucketUnits = isAsk
        ? ((uUnits + stepUnits - 1n) / stepUnits) * stepUnits
        : (uUnits / stepUnits) * stepUnits;

      if (userBucketUnits === bUnits) {
        const normUserPrice = uUnits.toString();
        const direct = myOrdersByPrice?.get(normUserPrice) || myOrdersByPrice?.get(userPrice);
        if (direct) {
          matchedCount += direct.count;
          matchedTotalQty += BigInt(direct.totalQty || '0');
          if (direct.isBot) matchedIsBot = true;
        } else {
          matchedCount += 1;
        }
      }
    }

    if (matchedCount > 0) {
      return {
        count: matchedCount,
        totalQty: matchedTotalQty.toString(),
        isBot: matchedIsBot
      };
    }

    return null;
  };

  // Compute max cumulative volume for background depth bar scaling
  const maxBidCum = aggregatedDepth.bids.length > 0 ? BigInt(aggregatedDepth.bids[aggregatedDepth.bids.length - 1][2]) : 1n;
  const maxAskCum = aggregatedDepth.asks.length > 0 ? BigInt(aggregatedDepth.asks[aggregatedDepth.asks.length - 1][2]) : 1n;
  const maxVolume = maxBidCum > maxAskCum ? maxBidCum : maxAskCum;

  // Active user orders summary in this pair for the quick ribbon
  const myOrdersInThisPair = useMemo(() => {
    if (!myOrdersByPrice) return [];
    return Array.from(myOrdersByPrice.entries()).map(([price, summary]) => ({
      price,
      ...summary
    }));
  }, [myOrdersByPrice]);

  // Guaranteed visibility for user orders in Asks:
  // Show top 25 levels + dynamically include any deeper levels with user active orders
  const displayAsks = useMemo(() => {
    const allAsks = aggregatedDepth.asks;
    if (allAsks.length <= 25) {
      return [...allAsks].reverse();
    }

    const topAsks = allAsks.slice(0, 25);
    const included = new Set(topAsks.map(a => a[0]));

    const extraUserAsks: [string, string, string][] = [];
    for (let i = 25; i < allAsks.length; i++) {
      const ask = allAsks[i];
      if (getBucketUserOrderSummary(ask[0], true) && !included.has(ask[0])) {
        extraUserAsks.push(ask);
        included.add(ask[0]);
      }
    }

    const combined = [...topAsks, ...extraUserAsks];
    combined.sort((a, b) => {
      const diff = BigInt(a[0]) - BigInt(b[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    return combined.reverse();
  }, [aggregatedDepth.asks, myOpenOrderPrices, stepUnits]);

  // Guaranteed visibility for user orders in Bids:
  // Show top 25 levels + dynamically include any deeper levels with user active orders
  const displayBids = useMemo(() => {
    const allBids = aggregatedDepth.bids;
    if (allBids.length <= 25) {
      return allBids;
    }

    const topBids = allBids.slice(0, 25);
    const included = new Set(topBids.map(b => b[0]));

    const extraUserBids: [string, string, string][] = [];
    for (let i = 25; i < allBids.length; i++) {
      const bid = allBids[i];
      if (getBucketUserOrderSummary(bid[0], false) && !included.has(bid[0])) {
        extraUserBids.push(bid);
        included.add(bid[0]);
      }
    }

    const combined = [...topBids, ...extraUserBids];
    combined.sort((a, b) => {
      const diff = BigInt(b[0]) - BigInt(a[0]);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    return combined;
  }, [aggregatedDepth.bids, myOpenOrderPrices, stepUnits]);

  const spreadIDR = depth.spread && depth.spread !== '0' ? formatIDR(depth.spread, true) : 'Rp 0';
  const myTotalOrdersCount = myOpenOrderPrices?.size || 0;

  const renderBadge = (orderInfo?: UserOrderSummary | null) => {
    if (!orderInfo) return null;
    if (orderInfo.isBot) {
      return (
        <span className="px-1.5 py-0.2 bg-purple-900 border border-purple-600 text-purple-200 text-[9px] font-sans font-extrabold rounded tracking-tight shadow">
          🤖 BOT KITA {orderInfo.count > 1 ? `(${orderInfo.count})` : ''}
        </span>
      );
    }
    const roleUpper = (userRole || '').toUpperCase();
    if (roleUpper === 'ADMIN' || roleUpper === 'SUPERADMIN') {
      return (
        <span className="px-1.5 py-0.2 bg-amber-900 border border-amber-600 text-amber-200 text-[9px] font-sans font-extrabold rounded tracking-tight shadow">
          👑 ADMIN KITA {orderInfo.count > 1 ? `(${orderInfo.count})` : ''}
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.2 bg-blue-600 border border-blue-400 text-white text-[9px] font-sans font-extrabold rounded tracking-tight shadow">
        ★ SAYA {orderInfo.count > 1 ? `(${orderInfo.count})` : ''}
      </span>
    );
  };

  return (
    <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden min-h-[560px]">
      {/* Header & Precision Filter Selector */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-[#1e2633] bg-[#0d121b] gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-300">Order Book ({pair.id})</h3>
          {myTotalOrdersCount > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-950 border border-blue-700 text-blue-300 rounded-full font-bold flex items-center gap-1 animate-pulse">
              ● {myTotalOrdersCount} Order Aktif Anda
            </span>
          )}
        </div>

        {/* Decimal Precision Aggregation Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-medium font-sans">Presisi:</span>
          <div className="flex items-center bg-[#141a23] p-0.5 rounded border border-[#1e2633] text-[10px] font-mono">
            {precisionOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPrecision(opt.value)}
                title={`Agregasi buku order level ${opt.label}`}
                className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                  precision === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a222e]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active Orders Quick Ribbon */}
      {myOrdersInThisPair.length > 0 && (
        <div className="bg-[#121926] border-b border-[#1e2633] px-3 py-1.5 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
          <span className="text-[10px] uppercase font-bold text-blue-400 whitespace-nowrap flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            Order Anda:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {myOrdersInThisPair.map((ord, idx) => (
              <button
                key={`my-ord-${idx}`}
                type="button"
                onClick={() => onSelectPrice(ord.price)}
                title="Klik untuk memilih harga order ini di form transaksi"
                className="px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-600/70 text-blue-200 font-mono text-[11px] whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                <span className={ord.isBot ? "text-purple-300 font-extrabold" : "text-amber-300 font-extrabold"}>
                  {ord.isBot ? '🤖' : '★'}
                </span>
                <span className="font-bold">{formatIDR(ord.price, false)}</span>
                <span className="text-[10px] text-blue-300">({formatCrypto(ord.totalQty, pair.baseDecimals)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Column Titles */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-slate-500 font-medium border-b border-[#141a23]">
        <span className="text-left flex items-center gap-1">
          Harga ({pair.quoteCurrency})
          {precision !== '0.01' && (
            <span className="text-[9px] text-blue-400 font-mono">±{precision}</span>
          )}
        </span>
        <span className="text-right">Jumlah ({pair.baseCurrency})</span>
        <span className="text-right">Total Akumulasi</span>
      </div>

      {/* Asks (Sell Orders - Red) */}
      <div className="flex-1 overflow-y-auto max-h-[230px] flex flex-col justify-end py-1 space-y-px">
        {displayAsks.map(([price, qty, cumQty], idx) => {
          const depthPercent = maxVolume > 0n ? Math.min(100, Number((BigInt(cumQty) * 100n) / maxVolume)) : 0;
          const userOrderSummary = getBucketUserOrderSummary(price, true);
          const isMyOrder = Boolean(userOrderSummary);

          return (
            <button
              key={`ask-${idx}`}
              type="button"
              onClick={() => onSelectPrice(price)}
              title={isMyOrder ? `Order Anda di level ini: ${formatCrypto(userOrderSummary!.totalQty, pair.baseDecimals)}` : undefined}
              className={`relative grid grid-cols-3 px-3 py-0.5 text-xs font-mono tabular-nums text-right hover:bg-red-950/30 transition-colors w-full group ${
                isMyOrder 
                  ? 'bg-blue-950/45 border-l-4 border-blue-400 ring-1 ring-blue-500/40 shadow-xs' 
                  : ''
              }`}
            >
              {/* Depth Background Bar */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-red-950/40 pointer-events-none transition-all duration-150"
                style={{ width: `${depthPercent}%` }}
              />
              <div className="flex items-center gap-1.5 text-left relative z-10">
                <span className={`font-semibold group-hover:underline ${isMyOrder ? 'text-red-300 font-bold' : 'text-red-400'}`}>
                  {formatIDR(price, false)}
                </span>
                {isMyOrder && renderBadge(userOrderSummary)}
              </div>
              <span className={`relative z-10 ${isMyOrder ? 'text-blue-100 font-bold' : 'text-slate-300'}`}>
                {formatCrypto(qty, pair.baseDecimals)}
              </span>
              <span className="text-slate-500 relative z-10 text-right">
                {formatCrypto(cumQty, pair.baseDecimals)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mid Spread Indicator */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#101622] border-y border-[#1e2633] text-xs font-mono shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-slate-100">
            {formatIDR(pair.lastPrice, true)}
          </span>
          <span className={`text-[11px] font-bold ${pair.priceChange24h.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
            {pair.priceChange24h}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          {precision !== '0.01' && (
            <span className="px-1.5 py-0.2 bg-blue-950/60 border border-blue-800 text-blue-300 text-[10px] rounded font-mono">
              Agregasi {precision}
            </span>
          )}
          <span>Spread: <strong className="text-slate-300 font-medium">{spreadIDR}</strong></span>
        </div>
      </div>

      {/* Bids (Buy Orders - Green) */}
      <div className="flex-1 overflow-y-auto max-h-[230px] flex flex-col justify-start py-1 space-y-px">
        {displayBids.map(([price, qty, cumQty], idx) => {
          const depthPercent = maxVolume > 0n ? Math.min(100, Number((BigInt(cumQty) * 100n) / maxVolume)) : 0;
          const userOrderSummary = getBucketUserOrderSummary(price, false);
          const isMyOrder = Boolean(userOrderSummary);

          return (
            <button
              key={`bid-${idx}`}
              type="button"
              onClick={() => onSelectPrice(price)}
              title={isMyOrder ? `Order Anda di level ini: ${formatCrypto(userOrderSummary!.totalQty, pair.baseDecimals)}` : undefined}
              className={`relative grid grid-cols-3 px-3 py-0.5 text-xs font-mono tabular-nums text-right hover:bg-emerald-950/30 transition-colors w-full group ${
                isMyOrder 
                  ? 'bg-blue-950/45 border-l-4 border-blue-400 ring-1 ring-blue-500/40 shadow-xs' 
                  : ''
              }`}
            >
              {/* Depth Background Bar */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-emerald-950/40 pointer-events-none transition-all duration-150"
                style={{ width: `${depthPercent}%` }}
              />
              <div className="flex items-center gap-1.5 text-left relative z-10">
                <span className={`font-semibold group-hover:underline ${isMyOrder ? 'text-emerald-300 font-bold' : 'text-emerald-400'}`}>
                  {formatIDR(price, false)}
                </span>
                {isMyOrder && renderBadge(userOrderSummary)}
              </div>
              <span className={`relative z-10 ${isMyOrder ? 'text-blue-100 font-bold' : 'text-slate-300'}`}>
                {formatCrypto(qty, pair.baseDecimals)}
              </span>
              <span className="text-slate-500 relative z-10 text-right">
                {formatCrypto(cumQty, pair.baseDecimals)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
