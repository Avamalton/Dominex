/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/trading/UserOrdersTable.tsx
 * Pro-tier User Orders Table with:
 * - Pagination for both Active Orders (Order Aktif) and Order History (Riwayat Order)
 * - Source filtering (Bot vs Manual), Pair filtering, and Side filtering
 * - Search by Client Order ID / Order ID
 * - Visual ownership indicators (Admin vs User) and strategy tags
 * - 1-click single & batch cancellation
 */

import React, { useState, useMemo } from 'react';
import { OrderItem } from '../../types/index.js';
import { formatIDR, formatCrypto, formatDateTime } from '../../lib/formatters.js';

interface Props {
  openOrders: OrderItem[];
  orderHistory: OrderItem[];
  onCancelOrder: (orderId: string, pairId: string) => Promise<void>;
  isLoading: boolean;
  currentUserEmail?: string;
  userRole?: string;
}

export const UserOrdersTable: React.FC<Props> = ({
  openOrders,
  orderHistory,
  onCancelOrder,
  isLoading,
  currentUserEmail,
  userRole,
}) => {
  const [activeTab, setActiveTab] = useState<'OPEN' | 'HISTORY'>('OPEN');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'BOT_ONLY' | 'MANUAL_ONLY'>('ALL');
  const [pairFilter, setPairFilter] = useState<string>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isCancellingAllBots, setIsCancellingAllBots] = useState(false);

  // Reset page to 1 when changing filters or tabs
  const handleTabChange = (tab: 'OPEN' | 'HISTORY') => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSourceFilterChange = (filter: 'ALL' | 'BOT_ONLY' | 'MANUAL_ONLY') => {
    setSourceFilter(filter);
    setCurrentPage(1);
  };

  const handlePairFilterChange = (pair: string) => {
    setPairFilter(pair);
    setCurrentPage(1);
  };

  const handleSideFilterChange = (side: 'ALL' | 'BUY' | 'SELL') => {
    setSideFilter(side);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleCancel = async (orderId: string, pairId: string) => {
    setCancellingId(orderId);
    try {
      await onCancelOrder(orderId, pairId);
    } finally {
      setCancellingId(null);
    }
  };

  const handleCancelAllBots = async () => {
    if (!confirm('Batalkan seluruh order aktif yang dihasilkan oleh bot?')) return;
    setIsCancellingAllBots(true);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      await fetch('/api/bot/cancel-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      window.location.reload();
    } catch (e) {
    } finally {
      setIsCancellingAllBots(false);
    }
  };

  // Distinct pair options
  const uniquePairs = useMemo(() => {
    const set = new Set<string>();
    openOrders.forEach(o => set.add(o.pairId));
    orderHistory.forEach(o => set.add(o.pairId));
    return Array.from(set);
  }, [openOrders, orderHistory]);

  const isBotOrder = (clientOrderId?: string) =>
    Boolean(clientOrderId && (clientOrderId.startsWith('bot-') || clientOrderId.includes('-ord-') || clientOrderId.includes('-vol-')));

  const botOrdersCount = openOrders.filter(o => isBotOrder(o.clientOrderId)).length;

  const getSourceBadge = (clientOrderId?: string) => {
    if (!isBotOrder(clientOrderId)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#141a23] border border-[#1e2633] text-slate-300 text-[10px] rounded font-mono font-medium">
          👤 MANUAL
        </span>
      );
    }
    if (clientOrderId?.includes('-ord-')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-950/80 border border-indigo-700/80 text-indigo-300 text-[10px] rounded font-mono font-bold">
            🤖 MM (Order Bot)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    if (clientOrderId?.includes('-vol-')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-950/80 border border-cyan-700/80 text-cyan-300 text-[10px] rounded font-mono font-bold">
            ⚡ MM (Volume Bot)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    if (clientOrderId!.includes('grid')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-950/80 border border-purple-700/80 text-purple-300 text-[10px] rounded font-mono font-bold">
            🤖 BOT (Spot Grid)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    if (clientOrderId!.includes('layer')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-950/80 border border-blue-700/80 text-blue-300 text-[10px] rounded font-mono font-bold">
            🤖 BOT (Layer Ladder)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    if (clientOrderId!.includes('smart') || clientOrderId!.includes('slice')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/80 border border-amber-700/80 text-amber-300 text-[10px] rounded font-mono font-bold">
            🎯 BOT (Smart Trade)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    if (clientOrderId!.includes('vol')) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-950/80 border border-rose-700/80 text-rose-300 text-[10px] rounded font-mono font-bold">
            🔥 BOT (Volume Maker)
          </span>
          <span className="text-[9px] text-slate-500 font-mono truncate max-w-[120px]">{clientOrderId}</span>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-950/70 border border-blue-800 text-blue-300 text-[10px] rounded font-mono font-bold">
        🤖 BOT ({clientOrderId!.slice(0, 10)})
      </span>
    );
  };

  // 1. Filter dataset
  const baseList = activeTab === 'OPEN' ? openOrders : orderHistory;
  const filteredList = useMemo(() => {
    return baseList.filter(o => {
      // Source filter
      const isBot = isBotOrder(o.clientOrderId);
      if (sourceFilter === 'BOT_ONLY' && !isBot) {
        return false;
      }
      if (sourceFilter === 'MANUAL_ONLY' && isBot) {
        return false;
      }

      // Pair filter
      if (pairFilter !== 'ALL' && o.pairId !== pairFilter) {
        return false;
      }

      // Side filter
      if (sideFilter !== 'ALL' && o.side !== sideFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesId = o.id.toLowerCase().includes(query);
        const matchesClient = o.clientOrderId ? o.clientOrderId.toLowerCase().includes(query) : false;
        const matchesPair = o.pairId.toLowerCase().includes(query);
        if (!matchesId && !matchesClient && !matchesPair) return false;
      }

      return true;
    });
  }, [baseList, sourceFilter, pairFilter, sideFilter, searchQuery]);

  // 2. Pagination calculation
  const totalItems = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedOrders = filteredList.slice(startIndex, endIndex);

  // Generate page numbers to display
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  return (
    <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-xl overflow-hidden shadow-lg">
      {/* Top Informative Banner */}
      <div className="px-4 py-2 bg-[#0e131d] border-b border-[#1e2633] flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-blue-400 font-bold">Penanda Order:</span>
          <span>
            Seluruh data di bawah ini adalah milik <strong>Akun Anda</strong> ({userRole === 'admin' ? '👑 Administrator' : '👤 Trader'}: {currentUserEmail || 'Aktif'}).
            Di Buku Order, penawaran Anda ditandai dengan badge <strong>★ SAYA</strong>.
          </span>
        </div>
        {botOrdersCount > 0 && activeTab === 'OPEN' && (
          <button
            type="button"
            onClick={handleCancelAllBots}
            disabled={isCancellingAllBots}
            className="px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-semibold rounded-md transition-colors shadow-xs"
          >
            {isCancellingAllBots ? 'Membatalkan...' : `Batalkan ${botOrdersCount} Order Bot`}
          </button>
        )}
      </div>

      {/* Tabs & Controls Header */}
      <div className="p-3 border-b border-[#1e2633] bg-[#0d121b] space-y-3">
        {/* Main Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-[#141a23] p-1 rounded-lg border border-[#1e2633]">
            <button
              onClick={() => handleTabChange('OPEN')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'OPEN'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
              }`}
            >
              <span>Order Aktif</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'OPEN' ? 'bg-blue-700 text-white' : 'bg-[#1e2633] text-slate-400'
              }`}>
                {openOrders.length}
              </span>
            </button>
            <button
              onClick={() => handleTabChange('HISTORY')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${
                activeTab === 'HISTORY'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
              }`}
            >
              <span>Riwayat Order</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'HISTORY' ? 'bg-blue-700 text-white' : 'bg-[#1e2633] text-slate-400'
              }`}>
                {orderHistory.length}
              </span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Cari Order ID / Client ID..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full bg-[#141a23] border border-[#1e2633] rounded-lg px-3 py-1.5 pl-8 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1.5 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            {/* Source Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Sumber:</span>
              <div className="flex items-center bg-[#141a23] p-0.5 rounded-md border border-[#1e2633]">
                {(['ALL', 'BOT_ONLY', 'MANUAL_ONLY'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => handleSourceFilterChange(f)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      sourceFilter === f
                        ? 'bg-[#1e2633] text-blue-400 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f === 'ALL' ? 'Semua' : f === 'BOT_ONLY' ? `Bot (${botOrdersCount})` : 'Manual'}
                  </button>
                ))}
              </div>
            </div>

            {/* Pair Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Pair:</span>
              <select
                value={pairFilter}
                onChange={e => handlePairFilterChange(e.target.value)}
                className="bg-[#141a23] border border-[#1e2633] rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-200 cursor-pointer focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Semua Pair</option>
                {uniquePairs.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Side Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Sisi:</span>
              <div className="flex items-center bg-[#141a23] p-0.5 rounded-md border border-[#1e2633]">
                {(['ALL', 'BUY', 'SELL'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => handleSideFilterChange(s)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      sideFilter === s
                        ? s === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 font-bold border border-emerald-700/50'
                          : s === 'SELL'
                          ? 'bg-red-950 text-red-400 font-bold border border-red-700/50'
                          : 'bg-[#1e2633] text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 'ALL' ? 'Semua' : s === 'BUY' ? 'Beli' : 'Jual'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reset Filters */}
          {(sourceFilter !== 'ALL' || pairFilter !== 'ALL' || sideFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setSourceFilter('ALL');
                setPairFilter('ALL');
                setSideFilter('ALL');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-[11px] text-blue-400 hover:text-blue-300 underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto min-h-[240px]">
        <table className="w-full text-left text-xs font-mono tabular-nums">
          <thead className="bg-[#101622] text-[11px] text-slate-400 font-sans border-b border-[#1e2633]">
            <tr>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Akun</th>
              <th className="px-4 py-2.5">Sumber / Strategi</th>
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5">Sisi</th>
              <th className="px-4 py-2.5">Tipe</th>
              <th className="px-4 py-2.5 text-right">Harga Limit</th>
              <th className="px-4 py-2.5 text-right">Jumlah</th>
              <th className="px-4 py-2.5 text-right">Kemajuan Terisi</th>
              <th className="px-4 py-2.5 text-center">Status</th>
              {activeTab === 'OPEN' && <th className="px-4 py-2.5 text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141a23]">
            {paginatedOrders.length === 0 ? (
              <tr>
                <td colSpan={activeTab === 'OPEN' ? 11 : 10} className="px-4 py-16 text-center text-slate-500 font-sans">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data order...</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-400">Tidak ada order yang ditemukan</p>
                      <p className="text-xs text-slate-600">
                        {filteredList.length === 0 && baseList.length > 0
                          ? 'Coba sesuaikan filter sumber, pair, atau kata kunci pencarian Anda.'
                          : activeTab === 'OPEN'
                          ? 'Anda tidak memiliki limit order aktif saat ini.'
                          : 'Belum ada riwayat transaksi.'}
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedOrders.map(order => {
                const isBuy = order.side === 'BUY';
                const baseDecimals = order.pairId.startsWith('BTC') ? 8 : order.pairId.startsWith('ETH') ? 8 : 6;
                const percentFilled =
                  BigInt(order.quantity) > 0n
                    ? Math.min(100, Number((BigInt(order.filledQuantity) * 100n) / BigInt(order.quantity)))
                    : 0;

                return (
                  <tr key={order.id} className="hover:bg-[#141a23]/60 transition-colors group">
                    <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-sans whitespace-nowrap">
                      {userRole === 'admin' ? (
                        <span className="px-2 py-0.5 bg-amber-950/80 border border-amber-700/80 text-amber-300 text-[10px] rounded font-bold">
                          👑 Admin (Anda)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-950/80 border border-blue-800 text-blue-300 text-[10px] rounded font-medium">
                          👤 Akun Anda
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-sans">
                      {getSourceBadge(order.clientOrderId)}
                    </td>
                    <td className="px-4 py-3 font-sans font-bold text-slate-100 whitespace-nowrap">
                      {order.pairId}
                    </td>
                    <td className="px-4 py-3 font-bold whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        isBuy
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {isBuy ? 'BELI' : 'JUAL'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {order.orderType} · {order.timeInForce}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-100 font-bold whitespace-nowrap">
                      {order.price === '0' ? 'Market' : formatIDR(order.price, false)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 whitespace-nowrap">
                      {formatCrypto(order.quantity, baseDecimals)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-slate-300 font-medium">
                          {formatCrypto(order.filledQuantity, baseDecimals)} ({percentFilled}%)
                        </span>
                        <div className="w-20 bg-[#1e2633] h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentFilled === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${percentFilled}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-sans text-[11px] whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        order.status === 'FILLED'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60'
                          : order.status === 'PARTIALLY_FILLED'
                          ? 'bg-blue-950/80 text-blue-400 border border-blue-700/60'
                          : order.status === 'CANCELLED'
                          ? 'bg-slate-800/80 text-slate-400 border border-slate-700'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    {activeTab === 'OPEN' && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancel(order.id, order.pairId)}
                          className="px-3 py-1 text-xs font-sans font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/60 rounded-md transition-colors border border-red-900/60 shadow-xs"
                        >
                          {cancellingId === order.id ? 'Batal...' : 'Batalkan'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 bg-[#0d121b] border-t border-[#1e2633] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        {/* Left: Summary of items */}
        <div className="flex items-center gap-3">
          <span>
            {totalItems === 0
              ? 'Menampilkan 0 order'
              : `Menampilkan ${startIndex + 1} - ${endIndex} dari ${totalItems} order`}
          </span>

          {/* Page Size Selector */}
          <div className="flex items-center gap-1.5 border-l border-[#1e2633] pl-3">
            <span className="text-[11px] text-slate-500">Baris:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#141a23] border border-[#1e2633] rounded px-2 py-0.5 text-xs text-slate-200 cursor-pointer focus:outline-none focus:border-blue-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Right: Page Navigation Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            {/* First Page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              title="Halaman Pertama"
              className="px-2 py-1 text-xs rounded bg-[#141a23] border border-[#1e2633] hover:bg-[#1e2633] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              «
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              title="Halaman Sebelumnya"
              className="px-2.5 py-1 text-xs rounded bg-[#141a23] border border-[#1e2633] hover:bg-[#1e2633] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ‹
            </button>

            {/* Page Number Chips */}
            {pageNumbers.map((p, idx) => {
              if (p === 'ellipsis') {
                return (
                  <span key={`ellipsis-${idx}`} className="px-1 text-slate-600">
                    ...
                  </span>
                );
              }
              const isCurrent = p === safeCurrentPage;
              return (
                <button
                  key={`page-${p}`}
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[28px] h-7 px-2 text-xs font-mono font-bold rounded transition-colors ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[#141a23] border border-[#1e2633] text-slate-300 hover:bg-[#1e2633] hover:text-white'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            {/* Next Page */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              title="Halaman Berikutnya"
              className="px-2.5 py-1 text-xs rounded bg-[#141a23] border border-[#1e2633] hover:bg-[#1e2633] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ›
            </button>

            {/* Last Page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              title="Halaman Terakhir"
              className="px-2 py-1 text-xs rounded bg-[#141a23] border border-[#1e2633] hover:bg-[#1e2633] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              »
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
