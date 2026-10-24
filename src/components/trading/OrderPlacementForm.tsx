/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/trading/OrderPlacementForm.tsx
 * Order placement panel with Limit/Market tabs, GTC/IOC, balance sliders, and live fee preview.
 */

import React, { useState, useEffect } from 'react';
import { TradingPairItem, UserProfile, UserBalance } from '../../types/index.js';
import { formatIDR, formatCrypto } from '../../lib/formatters.js';

interface Props {
  pair: TradingPairItem;
  user: UserProfile | null;
  balances: UserBalance[];
  selectedPriceUnits: string | null;
  onOrderPlaced: () => void;
  onOpenAuthModal: () => void;
}

export const OrderPlacementForm: React.FC<Props> = ({
  pair,
  user,
  balances,
  selectedPriceUnits,
  onOrderPlaced,
  onOpenAuthModal,
}) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [timeInForce, setTimeInForce] = useState<'GTC' | 'IOC'>('GTC');
  const [priceInput, setPriceInput] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync selected price from order book click
  useEffect(() => {
    if (selectedPriceUnits) {
      const rupiah = BigInt(selectedPriceUnits) / 100n;
      setPriceInput(rupiah.toString());
    } else if (!priceInput && pair.lastPrice) {
      const rupiah = BigInt(pair.lastPrice) / 100n;
      setPriceInput(rupiah.toString());
    }
  }, [selectedPriceUnits, pair.id]);

  // Find relevant balances
  const quoteBalance = balances.find(b => b.currency === pair.quoteCurrency);
  const baseBalance = balances.find(b => b.currency === pair.baseCurrency);

  const availableQuoteBig = quoteBalance ? BigInt(quoteBalance.balanceAvailable) : 0n;
  const availableBaseBig = baseBalance ? BigInt(baseBalance.balanceAvailable) : 0n;

  // Handle balance percentage fill
  const handlePercentageClick = (percent: number) => {
    if (!user) {
      onOpenAuthModal();
      return;
    }

    if (side === 'BUY') {
      const priceRupiah = orderType === 'LIMIT' ? Number(priceInput || '0') : Number(BigInt(pair.lastPrice) / 100n);
      if (priceRupiah <= 0) return;

      const availableRupiah = Number(availableQuoteBig / 100n);
      const budgetRupiah = (availableRupiah * percent) / 100;
      // Account for 0.20% taker fee buffer
      const netBudget = budgetRupiah * 0.998;
      const calculatedQty = netBudget / priceRupiah;
      setQuantityInput(calculatedQty.toFixed(pair.baseDecimals === 8 ? 6 : 4));
    } else {
      const baseUnits = (availableBaseBig * BigInt(percent)) / 100n;
      const scale = 10 ** pair.baseDecimals;
      const qtyNum = Number(baseUnits) / scale;
      setQuantityInput(qtyNum.toFixed(pair.baseDecimals === 8 ? 6 : 4));
    }
  };

  // Estimate total quote amount & fee
  const priceUnits = orderType === 'LIMIT' 
    ? (priceInput ? BigInt(Math.floor(Number(priceInput) * 100)) : 0n)
    : BigInt(pair.lastPrice);

  const scale = 10n ** BigInt(pair.baseDecimals);
  const qtyUnits = quantityInput ? BigInt(Math.floor(Number(quantityInput) * Number(scale))) : 0n;

  const quoteVolumeUnits = scale > 0n ? (qtyUnits * priceUnits) / scale : 0n;
  const estimatedFeeUnits = (quoteVolumeUnits * BigInt(pair.takerFeeBps)) / 10000n;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!user) {
      onOpenAuthModal();
      return;
    }

    if (pair.isHalted) {
      setErrorMessage(`Trading untuk pair ${pair.id} sedang dihentikan sementara.`);
      return;
    }

    if (qtyUnits <= 0n) {
      setErrorMessage('Jumlah aset harus lebih besar dari 0');
      return;
    }

    if (orderType === 'LIMIT' && priceUnits <= 0n) {
      setErrorMessage('Harga limit harus lebih besar dari 0');
      return;
    }

    // Check balance
    if (side === 'BUY') {
      const totalNeeded = quoteVolumeUnits + estimatedFeeUnits;
      if (availableQuoteBig < totalNeeded) {
        setErrorMessage(`Saldo IDR tidak cukup: Butuh ${formatIDR(totalNeeded)}, tersedia ${formatIDR(availableQuoteBig)}`);
        return;
      }
    } else {
      if (availableBaseBig < qtyUnits) {
        setErrorMessage(`Saldo ${pair.baseCurrency} tidak cukup: Butuh ${formatCrypto(qtyUnits, pair.baseDecimals)}, tersedia ${formatCrypto(availableBaseBig, pair.baseDecimals)}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const response = await fetch('/api/trading/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pairId: pair.id,
          side,
          orderType,
          timeInForce,
          price: orderType === 'LIMIT' ? priceUnits.toString() : undefined,
          quantity: qtyUnits.toString(),
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memasang order');
      }

      setSuccessMessage(`Order ${side} ${pair.baseCurrency} berhasil dipasang! (Status: ${data.order.status})`);
      setQuantityInput('');
      onOrderPlaced();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col bg-[#0b0e14] border border-[#1e2633] rounded-lg p-4">
      {/* Side Selector: BUY (Green) vs SELL (Red) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => { setSide('BUY'); setErrorMessage(null); }}
          className={`py-2 text-xs font-bold rounded-md transition-all ${
            side === 'BUY'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
              : 'bg-[#141a23] text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
          }`}
        >
          Beli {pair.baseCurrency}
        </button>
        <button
          type="button"
          onClick={() => { setSide('SELL'); setErrorMessage(null); }}
          className={`py-2 text-xs font-bold rounded-md transition-all ${
            side === 'SELL'
              ? 'bg-red-600 text-white shadow-lg shadow-red-950/40'
              : 'bg-[#141a23] text-slate-400 hover:text-slate-200 hover:bg-[#1a2230]'
          }`}
        >
          Jual {pair.baseCurrency}
        </button>
      </div>

      {/* Order Type & TIF Selector */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-1 bg-[#141a23] p-1 rounded-md border border-[#1e2633]">
          <button
            type="button"
            onClick={() => setOrderType('LIMIT')}
            className={`px-3 py-1 font-medium rounded transition-colors ${
              orderType === 'LIMIT' ? 'bg-[#1e2633] text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Limit
          </button>
          <button
            type="button"
            onClick={() => setOrderType('MARKET')}
            className={`px-3 py-1 font-medium rounded transition-colors ${
              orderType === 'MARKET' ? 'bg-[#1e2633] text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Market
          </button>
        </div>

        {orderType === 'LIMIT' && (
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <span>TIF:</span>
            <select
              value={timeInForce}
              onChange={e => setTimeInForce(e.target.value as any)}
              className="bg-[#141a23] border border-[#1e2633] rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-none"
            >
              <option value="GTC">GTC</option>
              <option value="IOC">IOC</option>
            </select>
          </div>
        )}
      </div>

      {/* Available Balance Glance */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3 bg-[#101622] p-2 rounded border border-[#141a23]">
        <span>Saldo Tersedia:</span>
        <span className="font-mono font-medium text-slate-200">
          {side === 'BUY'
            ? formatIDR(availableQuoteBig, true)
            : formatCrypto(availableBaseBig, pair.baseDecimals, pair.baseCurrency)}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Price Input */}
        {orderType === 'LIMIT' ? (
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Harga ({pair.quoteCurrency})
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                placeholder="1450000000"
                className="w-full bg-[#141a23] border border-[#1e2633] rounded px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-medium">IDR</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#141a23]/60 border border-[#1e2633] rounded p-2.5 text-xs text-slate-400 text-center">
            Harga Pasar Terbaik (Market Execution)
          </div>
        )}

        {/* Quantity Input */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Jumlah ({pair.baseCurrency})
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              value={quantityInput}
              onChange={e => setQuantityInput(e.target.value)}
              placeholder={`Min ${formatCrypto(BigInt(pair.minOrderSize), pair.baseDecimals)}`}
              className="w-full bg-[#141a23] border border-[#1e2633] rounded px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-medium">{pair.baseCurrency}</span>
          </div>
        </div>

        {/* Quick Percent Buttons */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentageClick(pct)}
              className="py-1 text-[11px] font-medium bg-[#141a23] text-slate-400 hover:text-slate-100 hover:bg-[#1f2838] border border-[#1e2633] rounded transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Order Summary */}
        <div className="pt-2 border-t border-[#141a23] space-y-1 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>Estimasi Nilai:</span>
            <span className="text-slate-200">{formatIDR(quoteVolumeUnits, true)}</span>
          </div>
          <div className="flex justify-between text-slate-400 text-[11px]">
            <span>Estimasi Fee ({pair.takerFeeBps / 100}%):</span>
            <span className="text-slate-300">{formatIDR(estimatedFeeUnits, true)}</span>
          </div>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="p-2.5 text-xs text-red-300 bg-red-950/40 border border-red-800/60 rounded">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="p-2.5 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded">
            {successMessage}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || pair.isHalted}
          className={`w-full py-2.5 rounded font-semibold text-xs tracking-wide text-white transition-all ${
            pair.isHalted
              ? 'bg-slate-700 cursor-not-allowed text-slate-400'
              : side === 'BUY'
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/40'
              : 'bg-red-600 hover:bg-red-500 shadow-md shadow-red-950/40'
          }`}
        >
          {isSubmitting ? (
            'Memproses Transaksi...'
          ) : pair.isHalted ? (
            'TRADING SEDANG DIHENTIKAN'
          ) : !user ? (
            'Masuk untuk Trading'
          ) : (
            `${side === 'BUY' ? 'Beli' : 'Jual'} ${pair.baseCurrency}`
          )}
        </button>
      </form>
    </div>
  );
};
