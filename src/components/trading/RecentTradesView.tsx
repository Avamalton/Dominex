/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/trading/RecentTradesView.tsx
 * Real-time feed of completed market trade executions with "Order Anda" highlights.
 */

import React from 'react';
import { TradingPairItem, TradeItem } from '../../types/index.js';
import { formatIDR, formatCrypto, formatTimestamp } from '../../lib/formatters.js';

interface Props {
  pair: TradingPairItem;
  trades: TradeItem[];
  currentUserId?: string;
}

export const RecentTradesView: React.FC<Props> = ({ pair, trades, currentUserId }) => {
  return (
    <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden h-[540px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2633] bg-[#0d121b]">
        <h3 className="text-xs font-bold text-slate-300">Transaksi Terakhir (Trades)</h3>
        <span className="text-[11px] text-slate-500 font-mono">Live</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-slate-500 font-medium border-b border-[#141a23]">
        <span className="text-left">Harga ({pair.quoteCurrency})</span>
        <span className="text-right">Jumlah ({pair.baseCurrency})</span>
        <span className="text-right">Waktu</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1 divide-y divide-[#141a23]/30">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-600">
            Belum ada transaksi pada pair ini
          </div>
        ) : (
          trades.slice(0, 35).map((trade, idx) => {
            const isBuy = trade.takerSide === 'BUY';
            const isMyTrade = currentUserId && (trade.makerUserId === currentUserId || trade.takerUserId === currentUserId);

            return (
              <div
                key={`trade-${trade.id || idx}`}
                className={`grid grid-cols-3 px-3 py-1 text-xs font-mono tabular-nums text-right hover:bg-[#141a23]/40 transition-colors ${
                  isMyTrade ? 'bg-blue-950/20 border-l-2 border-blue-500' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-left">
                  <span className={`font-semibold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatIDR(trade.price, false)}
                  </span>
                  {isMyTrade && (
                    <span className="px-1 py-0.1 bg-blue-600 text-white text-[9px] font-sans font-bold rounded">
                      Anda
                    </span>
                  )}
                </div>
                <span className="text-slate-300">
                  {formatCrypto(trade.quantity, pair.baseDecimals)}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {formatTimestamp(trade.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
