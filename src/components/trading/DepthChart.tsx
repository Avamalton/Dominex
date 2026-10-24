/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/trading/DepthChart.tsx
 * Market Depth Chart Visualizer using Recharts.
 * Visualizes cumulative buy and sell pressure curves with spread and interactive price picking.
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { TradingPairItem } from '../../types/index.js';
import { formatIDR, formatCrypto } from '../../lib/formatters.js';

interface Props {
  pair: TradingPairItem;
  depth: {
    bids: [string, string, string][]; // [price, qty, cumulativeQty]
    asks: [string, string, string][];
    spread: string;
  };
  myOpenOrderPrices?: Set<string>;
  onSelectPrice: (priceUnits: string) => void;
}

export const DepthChart: React.FC<Props> = ({ pair, depth, myOpenOrderPrices, onSelectPrice }) => {
  // Format data for Recharts AreaChart
  const { chartData, totalBidVolume, totalAskVolume, midPriceNum } = useMemo(() => {
    const scale = 10 ** pair.baseDecimals;
    
    // Process Bids: sorted ascending by price for chart X-axis
    const bidPoints = [...depth.bids]
      .map(([p, _, cum]) => ({
        priceNum: Number(BigInt(p) / 100n),
        rawPrice: p,
        bidVolume: Number(BigInt(cum)) / scale,
        askVolume: undefined as number | undefined
      }))
      .sort((a, b) => a.priceNum - b.priceNum);

    // Process Asks: sorted ascending by price
    const askPoints = [...depth.asks]
      .map(([p, _, cum]) => ({
        priceNum: Number(BigInt(p) / 100n),
        rawPrice: p,
        bidVolume: undefined as number | undefined,
        askVolume: Number(BigInt(cum)) / scale
      }))
      .sort((a, b) => a.priceNum - b.priceNum);

    const data = [...bidPoints, ...askPoints];

    const maxBid = bidPoints.length > 0 ? bidPoints[bidPoints.length - 1].bidVolume || 0 : 0;
    const maxAsk = askPoints.length > 0 ? askPoints[askPoints.length - 1].askVolume || 0 : 0;

    const mid = Number(BigInt(pair.lastPrice) / 100n);

    return {
      chartData: data,
      totalBidVolume: maxBid,
      totalAskVolume: maxAsk,
      midPriceNum: mid
    };
  }, [depth, pair]);

  const totalPressure = totalBidVolume + totalAskVolume;
  const bidPressurePercent = totalPressure > 0 ? Math.round((totalBidVolume / totalPressure) * 100) : 50;
  const askPressurePercent = 100 - bidPressurePercent;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isBid = data.bidVolume !== undefined;
      const volume = isBid ? data.bidVolume : data.askVolume;
      const priceRupiah = data.priceNum;
      const isMyOrder = myOpenOrderPrices?.has(data.rawPrice);

      return (
        <div className="bg-[#0b0e14]/95 border border-[#1e2633] p-2.5 rounded shadow-xl text-xs font-mono space-y-1 z-50">
          <div className="text-slate-400 font-sans text-[11px] pb-1 border-b border-[#141a23] flex items-center justify-between">
            <span>{isBid ? '🟢 Sisi Beli (Bid Accumulation)' : '🔴 Sisi Jual (Ask Supply)'}</span>
            {isMyOrder && (
              <span className="px-1.5 py-0.2 bg-blue-600 text-white font-extrabold text-[9px] rounded">
                ★ ORDER SAYA
              </span>
            )}
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Harga:</span>
            <span className="font-bold text-slate-100">Rp {priceRupiah.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Volume Akumulasi:</span>
            <span className={isBid ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {volume.toFixed(4)} {pair.baseCurrency}
            </span>
          </div>
          {isMyOrder && (
            <div className="px-2 py-0.5 bg-blue-950/70 border border-blue-700 rounded text-blue-300 text-[10px] text-center font-bold">
              ★ Level harga ini mencakup antrean order aktif Anda
            </div>
          )}
          <div className="text-[10px] text-slate-500 pt-0.5 text-center italic">
            Klik untuk pasang order di harga ini
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden h-[540px]">
      {/* Top Header & Pressure Ratio */}
      <div className="p-3 border-b border-[#1e2633] bg-[#0d121b] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">Market Depth Curve ({pair.id})</span>
            <span className="text-slate-500 text-[11px]">·</span>
            <span className="text-slate-400 text-[11px]">Spread: {formatIDR(depth.spread, true)}</span>
            {myOpenOrderPrices && myOpenOrderPrices.size > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-950 border border-blue-700 text-blue-300 text-[10px] rounded-full font-bold">
                ● {myOpenOrderPrices.size} Order Anda
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-300">
            Mid: {formatIDR(pair.lastPrice, false)}
          </div>
        </div>

        {/* Aggregate Pressure Ratio Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono">
            <span className="text-emerald-400 font-bold">Tekanan Beli: {bidPressurePercent}% ({totalBidVolume.toFixed(2)} {pair.baseCurrency})</span>
            <span className="text-red-400 font-bold">Tekanan Jual: {askPressurePercent}% ({totalAskVolume.toFixed(2)} {pair.baseCurrency})</span>
          </div>
          <div className="h-1.5 w-full bg-[#141a23] rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${bidPressurePercent}%` }} />
            <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${askPressurePercent}%` }} />
          </div>
        </div>
      </div>

      {/* Recharts Area Canvas */}
      <div className="flex-1 w-full p-2">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-600">
            Mengumpulkan likuiditas kedalaman pasar...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  const raw = e.activePayload[0].payload.rawPrice;
                  if (raw) onSelectPrice(raw);
                }
              }}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <defs>
                <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <XAxis
                dataKey="priceNum"
                type="number"
                domain={['dataMin', 'dataMax']}
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
              />

              <YAxis
                orientation="right"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `${val.toFixed(1)}`}
              />

              <Tooltip content={<CustomTooltip />} />

              <ReferenceLine
                x={midPriceNum}
                stroke="#3b82f6"
                strokeDasharray="3 3"
                label={{ value: 'Mid Price', fill: '#60a5fa', fontSize: 10, position: 'top' }}
              />

              {/* Bids Cumulative Demand Area */}
              <Area
                type="stepAfter"
                dataKey="bidVolume"
                stroke="#16a34a"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#bidGrad)"
                isAnimationActive={false}
              />

              {/* Asks Cumulative Supply Area */}
              <Area
                type="stepBefore"
                dataKey="askVolume"
                stroke="#dc2626"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#askGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="px-3 py-1.5 bg-[#0d121b] border-t border-[#1e2633] text-[10px] text-slate-500 flex justify-between font-mono">
        <span>Sumbu X: Harga (IDR Juta)</span>
        <span>Sumbu Y: Akumulasi Volume ({pair.baseCurrency})</span>
      </div>
    </div>
  );
};
