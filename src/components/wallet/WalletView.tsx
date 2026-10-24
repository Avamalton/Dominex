/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/wallet/WalletView.tsx
 * Comprehensive Wallet management with IDR Virtual Accounts, KYC name-check withdrawals,
 * crypto deposit address generation, and blockchain block confirmation simulator.
 */

import React, { useState } from 'react';
import { UserBalance, UserProfile } from '../../types/index.js';
import { formatIDR, formatCrypto } from '../../lib/formatters.js';

interface Props {
  balances: UserBalance[];
  user: UserProfile | null;
  onRefreshBalances: () => void;
  onOpenAuthModal: () => void;
  onOpenKycView: () => void;
}

export const WalletView: React.FC<Props> = ({
  balances,
  user,
  onRefreshBalances,
  onOpenAuthModal,
  onOpenKycView,
}) => {
  const [activeModal, setActiveModal] = useState<'NONE' | 'IDR_DEP' | 'IDR_WD' | 'CRYPTO_DEP' | 'CRYPTO_WD'>('NONE');
  const [selectedBank, setSelectedBank] = useState<'BCA' | 'MANDIRI' | 'BRI'>('BCA');
  const [depositAmount, setDepositAmount] = useState('10000000'); // 10 juta default
  const [vaDetails, setVaDetails] = useState<any>(null);

  // IDR Withdraw state
  const [wdBankName, setWdBankName] = useState('BCA');
  const [wdAccNumber, setWdAccNumber] = useState('0123456789');
  const [wdHolderName, setWdHolderName] = useState(user?.fullName || '');
  const [wdAmount, setWdAmount] = useState('5000000');
  const [wdMessage, setWdMessage] = useState<string | null>(null);
  const [wdError, setWdError] = useState<string | null>(null);

  // Crypto state
  const [cryptoCurrency, setCryptoCurrency] = useState<'BTC' | 'ETH' | 'USDT'>('BTC');
  const [cryptoAddressData, setCryptoAddressData] = useState<any>(null);
  const [cryptoSimAmount, setCryptoSimAmount] = useState('0.1');
  const [cryptoWdAddress, setCryptoWdAddress] = useState('');
  const [cryptoWdAmount, setCryptoWdAmount] = useState('0.05');

  const [isLoading, setIsLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Generate VA
  const handleGenerateVa = async () => {
    setIsLoading(true);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/wallet/idr/deposit-va', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bankCode: selectedBank, amount: depositAmount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVaDetails(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate Instant VA Payment
  const handleSimulatePayment = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/wallet/idr/simulate-deposit-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bankCode: selectedBank, amount: depositAmount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionSuccess(data.message);
      onRefreshBalances();
      setVaDetails(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle IDR Withdrawal
  const handleWithdrawIdr = async (e: React.FormEvent) => {
    e.preventDefault();
    setWdError(null);
    setWdMessage(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/wallet/idr/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bankName: wdBankName,
          accountNumber: wdAccNumber,
          accountHolderName: wdHolderName,
          amount: wdAmount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWdMessage(data.message);
      onRefreshBalances();
    } catch (err: any) {
      setWdError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Crypto Address
  const handleFetchCryptoAddress = async (curr: string) => {
    setCryptoCurrency(curr as any);
    setIsLoading(true);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch(`/api/wallet/crypto/deposit-address/${curr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCryptoAddressData(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate Blockchain Block confirmation
  const handleSimulateBlock = async () => {
    setIsLoading(true);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/wallet/crypto/simulate-deposit-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currency: cryptoCurrency,
          amount: cryptoSimAmount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionSuccess(data.message);
      onRefreshBalances();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#0b0e14] border border-[#1e2633] rounded-lg text-center">
        <h2 className="text-lg font-bold text-slate-100 mb-2">Dompet & Saldo DIMONEX</h2>
        <p className="text-sm text-slate-400 mb-6 max-w-md">
          Silakan masuk atau buat akun baru untuk melihat saldo rekening double-entry, deposit Virtual Account, dan manajemen aset kripto.
        </p>
        <button
          onClick={onOpenAuthModal}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors"
        >
          Masuk ke Akun
        </button>
      </div>
    );
  }

  // Calculate total portfolio in IDR
  const idrAcc = balances.find(b => b.currency === 'IDR');
  const btcAcc = balances.find(b => b.currency === 'BTC');
  const ethAcc = balances.find(b => b.currency === 'ETH');
  const usdtAcc = balances.find(b => b.currency === 'USDT');

  const totalEstIdr = (
    BigInt(idrAcc?.balanceTotal || '0') +
    (BigInt(btcAcc?.balanceTotal || '0') * 145000000000n) / 100000000n +
    (BigInt(ethAcc?.balanceTotal || '0') * 4850000000n) / 100000000n +
    (BigInt(usdtAcc?.balanceTotal || '0') * 1645000n) / 1000000n
  );

  return (
    <div className="space-y-6">
      {/* Portfolio Header Strip */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <span className="text-xs text-slate-500 block mb-1">Total Estimasi Nilai Portofolio</span>
          <div className="text-2xl md:text-3xl font-extrabold font-mono text-slate-100 tabular-nums">
            {formatIDR(totalEstIdr, true)}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
            <span>KYC: {user.kycStatus === 'approved' ? 'Terverifikasi (Tier 1)' : 'Belum Diverifikasi'}</span>
            <span>·</span>
            <span>Ledger: Double-Entry Immutable</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => { setActiveModal('IDR_DEP'); setActionSuccess(null); }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-md shadow-md transition-colors"
          >
            Deposit Rupiah (VA)
          </button>
          <button
            onClick={() => { setActiveModal('IDR_WD'); setWdError(null); setWdMessage(null); }}
            className="px-4 py-2 bg-[#141a23] hover:bg-[#1f2838] border border-[#1e2633] text-slate-200 font-semibold text-xs rounded-md transition-colors"
          >
            Tarik Rupiah
          </button>
          <button
            onClick={() => { setActiveModal('CRYPTO_DEP'); handleFetchCryptoAddress('BTC'); setActionSuccess(null); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-md shadow-md transition-colors"
          >
            Deposit Kripto
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded">
          {actionSuccess}
        </div>
      )}

      {/* Asset Balances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {balances.map(b => (
          <div key={b.currency} className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm text-slate-100">{b.currency}</span>
              <span className="text-[11px] text-slate-500 font-mono">
                {b.currency === 'IDR' ? 'Quote Asset' : 'Crypto Asset'}
              </span>
            </div>

            <div className="space-y-2 font-mono tabular-nums text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Tersedia:</span>
                <span className="font-semibold text-slate-100">{b.displayAvailable}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Terkunci di Order:</span>
                <span className="text-slate-400">{b.displayLocked}</span>
              </div>
              <div className="pt-2 border-t border-[#141a23] flex justify-between font-bold">
                <span className="text-slate-300">Total:</span>
                <span className="text-emerald-400">{b.displayTotal}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL 1: IDR VIRTUAL ACCOUNT DEPOSIT */}
      {activeModal === 'IDR_DEP' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-[#1e2633] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#1e2633] pb-3">
              <h3 className="text-sm font-bold text-slate-100">Deposit Rupiah via Virtual Account</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {!vaDetails ? (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Pilih Bank Virtual Account:</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['BCA', 'MANDIRI', 'BRI'] as const).map(bank => (
                      <button
                        key={bank}
                        type="button"
                        onClick={() => setSelectedBank(bank)}
                        className={`py-2 rounded font-semibold border transition-colors ${
                          selectedBank === bank
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-[#141a23] border-[#1e2633] text-slate-300 hover:bg-[#1a2230]'
                        }`}
                      >
                        {bank} VA
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Nominal Deposit (IDR):</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 font-mono text-slate-100 focus:outline-none focus:border-blue-500"
                    placeholder="10000000"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Konversi: {formatIDR(BigInt(depositAmount || '0') * 100n)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleGenerateVa}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors"
                >
                  {isLoading ? 'Membuat Nomor VA...' : 'Generate Nomor Virtual Account'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="bg-[#101622] border border-[#1e2633] rounded p-4 text-center">
                  <span className="text-slate-400 block mb-1">Nomor Virtual Account {vaDetails.bankName}</span>
                  <div className="text-xl font-mono font-extrabold text-blue-400 tracking-wider">
                    {vaDetails.vaNumber}
                  </div>
                  <span className="text-slate-300 block mt-2 font-mono">
                    Nominal: {vaDetails.formattedAmount}
                  </span>
                </div>

                <div className="bg-[#141a23]/60 rounded p-3 space-y-1 text-slate-300 text-[11px]">
                  {vaDetails.instructions.map((inst: string, i: number) => (
                    <div key={i}>{inst}</div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSimulatePayment}
                    disabled={isLoading}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-colors"
                  >
                    {isLoading ? 'Memproses Ledger...' : 'Simulasi Pembayaran Selesai (Payment Gateway)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVaDetails(null)}
                    className="px-4 py-2.5 bg-[#141a23] hover:bg-[#1e2633] text-slate-300 rounded"
                  >
                    Kembali
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: IDR WITHDRAWAL */}
      {activeModal === 'IDR_WD' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-[#1e2633] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#1e2633] pb-3">
              <h3 className="text-sm font-bold text-slate-100">Penarikan Dana Rupiah (Bank Transfer)</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded text-[11px] text-blue-300">
              Peraturan Kepatuhan: Nama pemilik rekening bank <strong>HARUS PERSIS SAMA</strong> dengan nama identitas KYC Anda ({user.fullName || 'Belum Terverifikasi'}). Penarikan ke rekening pihak ketiga dilarang.
            </div>

            {wdError && (
              <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded">
                {wdError}
              </div>
            )}
            {wdMessage && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded">
                {wdMessage}
              </div>
            )}

            <form onSubmit={handleWithdrawIdr} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nama Bank Tujuan:</label>
                <input
                  type="text"
                  value={wdBankName}
                  onChange={e => setWdBankName(e.target.value)}
                  className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nomor Rekening Bank:</label>
                <input
                  type="text"
                  value={wdAccNumber}
                  onChange={e => setWdAccNumber(e.target.value)}
                  className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Nama Pemilik Rekening (Wajib Match KYC):</label>
                <input
                  type="text"
                  value={wdHolderName}
                  onChange={e => setWdHolderName(e.target.value)}
                  className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Jumlah Penarikan (IDR):</label>
                <input
                  type="number"
                  value={wdAmount}
                  onChange={e => setWdAmount(e.target.value)}
                  className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 font-mono text-slate-100 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors"
              >
                {isLoading ? 'Memvalidasi...' : 'Kirim Permintaan Penarikan IDR'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CRYPTO DEPOSIT */}
      {activeModal === 'CRYPTO_DEP' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-[#1e2633] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#1e2633] pb-3">
              <h3 className="text-sm font-bold text-slate-100">Deposit Aset Kripto On-Chain</h3>
              <button onClick={() => setActiveModal('NONE')} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="flex gap-2">
              {(['BTC', 'ETH', 'USDT'] as const).map(curr => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => handleFetchCryptoAddress(curr)}
                  className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                    cryptoCurrency === curr
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#141a23] border-[#1e2633] text-slate-300'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            {cryptoAddressData && (
              <div className="space-y-4 text-xs">
                <div className="bg-[#101622] border border-[#1e2633] rounded p-4 text-center space-y-2">
                  <span className="text-slate-400 block text-[11px]">
                    Alamat Deposit {cryptoAddressData.currency} ({cryptoAddressData.chain}):
                  </span>
                  <div className="p-2 bg-[#0b0e14] rounded border border-[#141a23] font-mono text-emerald-400 break-all select-all text-xs font-bold">
                    {cryptoAddressData.address}
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    Konfirmasi Dibutuhkan: {cryptoAddressData.confirmationsRequired} Blok
                  </span>
                </div>

                {/* Simulated Blockchain Listener */}
                <div className="p-3 bg-[#141a23] border border-[#1e2633] rounded space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Simulasi Block Listener Generator:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      value={cryptoSimAmount}
                      onChange={e => setCryptoSimAmount(e.target.value)}
                      className="flex-1 bg-[#0b0e14] border border-[#1e2633] rounded px-3 py-1.5 font-mono text-slate-100 text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleSimulateBlock}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded"
                    >
                      Kirim Blok TX
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
