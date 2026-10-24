/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/admin/AdminView.tsx
 * Admin & Compliance Console: KYC reviews, trading halts, fee tuning,
 * withdrawal approvals, AML monitor, and global ledger invariant verifier.
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, TradingPairItem } from '../../types/index.js';
import { formatIDR, formatDateTime } from '../../lib/formatters.js';

interface Props {
  user: UserProfile | null;
  tradingPairs: TradingPairItem[];
  onRefreshPairs: () => void;
  onOpenAuthModal: () => void;
}

export const AdminView: React.FC<Props> = ({ user, tradingPairs, onRefreshPairs, onOpenAuthModal }) => {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [pendingWd, setPendingWd] = useState<{ fiat: any[]; crypto: any[] }>({ fiat: [], crypto: [] });
  const [riskAlerts, setRiskAlerts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [invariantStatus, setInvariantStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'PAIRS' | 'KYC' | 'WITHDRAWALS' | 'RISK' | 'AUDIT'>('PAIRS');
  const [freezeReason, setFreezeReason] = useState('Pemeriksaan AML transaksi');

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'superadmin')) {
      loadAdminData();
    }
  }, [user]);

  const loadAdminData = async () => {
    const token = localStorage.getItem('dimonex_auth_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [uRes, wdRes, rRes, audRes, invRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/withdrawals/pending', { headers }),
        fetch('/api/risk/suspicious-activity', { headers }),
        fetch('/api/admin/audit-logs', { headers }),
        fetch('/api/ledger/verify-invariants')
      ]);

      if (uRes.ok) setUsersList(await uRes.json());
      if (wdRes.ok) setPendingWd(await wdRes.json());
      if (rRes.ok) setRiskAlerts(await rRes.json());
      if (audRes.ok) setAuditLogs(await audRes.json());
      if (invRes.ok) setInvariantStatus(await invRes.json());
    } catch (e) {}
  };

  // Halt / Resume Pair
  const handleToggleHalt = async (pairId: string, currentHalt: boolean) => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/admin/pairs/toggle-halt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pairId, isHalted: !currentHalt })
      });
      if (res.ok) {
        onRefreshPairs();
        loadAdminData();
      }
    } catch (e) {}
  };

  // Update Fees
  const handleUpdateFees = async (pairId: string) => {
    const makerStr = prompt('Masukkan Maker Fee baru (basis points, 10 bps = 0.10%):', '10');
    const takerStr = prompt('Masukkan Taker Fee baru (basis points, 20 bps = 0.20%):', '20');
    if (!makerStr || !takerStr) return;

    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/admin/pairs/update-fees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pairId,
          makerFeeBps: parseInt(makerStr, 10),
          takerFeeBps: parseInt(takerStr, 10)
        })
      });
      if (res.ok) {
        onRefreshPairs();
        loadAdminData();
      }
    } catch (e) {}
  };

  // Approve KYC
  const handleReviewKyc = async (userId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      await fetch('/api/admin/kyc/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, action, tierLevel: 2 })
      });
      loadAdminData();
    } catch (e) {}
  };

  // Approve Withdrawal
  const handleApproveWd = async (txId: string, txType: 'FIAT' | 'CRYPTO') => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      await fetch('/api/admin/withdrawals/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ txId, txType })
      });
      loadAdminData();
    } catch (e) {}
  };

  // Freeze / Unfreeze Account
  const handleToggleFreeze = async (userId: string, currentStatus: string) => {
    const isFrozen = currentStatus === 'frozen';
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      await fetch('/api/risk/account-freeze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId,
          freeze: !isFrozen,
          reason: freezeReason
        })
      });
      loadAdminData();
    } catch (e) {}
  };

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return (
      <div className="p-8 text-center bg-[#0b0e14] border border-[#1e2633] rounded-lg">
        <h2 className="text-base font-bold text-slate-100 mb-2">Konsol Operator Khusus Administrator</h2>
        <p className="text-xs text-slate-400 mb-4">
          Halaman ini khusus untuk peran Administrator dan Tim Kepatuhan DIMONEX.
        </p>
        <button
          onClick={onOpenAuthModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded"
        >
          Masuk sebagai Admin
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Health & Invariant Card */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            Konsol Manajemen Exchange DIMONEX
            <span className="text-xs font-normal text-slate-400">({user.email})</span>
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs font-mono">
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              ● Ledger Invariant: {invariantStatus?.isConsistent ? '100% KONSISTEN (Sum Debit == Sum Credit)' : 'MEMERIKSA...'}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">Total Pengguna: {usersList.length}</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap gap-1 bg-[#141a23] p-1 rounded-md border border-[#1e2633] text-xs font-medium">
          <button
            onClick={() => setActiveTab('PAIRS')}
            className={`px-3 py-1.5 rounded transition-colors ${activeTab === 'PAIRS' ? 'bg-[#1e2633] text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pairs & Fees ({tradingPairs.length})
          </button>
          <button
            onClick={() => setActiveTab('KYC')}
            className={`px-3 py-1.5 rounded transition-colors ${activeTab === 'KYC' ? 'bg-[#1e2633] text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Review KYC ({usersList.filter(u => u.kycStatus === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('WITHDRAWALS')}
            className={`px-3 py-1.5 rounded transition-colors ${activeTab === 'WITHDRAWALS' ? 'bg-[#1e2633] text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Antrean Penarikan ({pendingWd.fiat.length + pendingWd.crypto.length})
          </button>
          <button
            onClick={() => setActiveTab('RISK')}
            className={`px-3 py-1.5 rounded transition-colors ${activeTab === 'RISK' ? 'bg-[#1e2633] text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Risk & AML ({riskAlerts.length})
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1.5 rounded transition-colors ${activeTab === 'AUDIT' ? 'bg-[#1e2633] text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Audit Log
          </button>
        </div>
      </div>

      {/* TAB 1: PAIRS & FEES */}
      {activeTab === 'PAIRS' && (
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2633] bg-[#0d121b]">
            <h3 className="text-xs font-bold text-slate-200">Manajemen Trading Pair & Fee Bursa</h3>
          </div>
          <table className="w-full text-left text-xs font-mono tabular-nums">
            <thead className="bg-[#101622] text-[11px] text-slate-400 border-b border-[#1e2633] font-sans">
              <tr>
                <th className="px-4 py-2">Pair</th>
                <th className="px-4 py-2">Harga Terakhir</th>
                <th className="px-4 py-2">Maker Fee</th>
                <th className="px-4 py-2">Taker Fee</th>
                <th className="px-4 py-2">Status Trading</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141a23]">
              {tradingPairs.map(p => (
                <tr key={p.id} className="hover:bg-[#141a23]/40">
                  <td className="px-4 py-3 font-bold text-slate-100">{p.id}</td>
                  <td className="px-4 py-3 text-slate-300">{formatIDR(p.lastPrice, true)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{p.makerFeeBps / 100}% ({p.makerFeeBps} bps)</td>
                  <td className="px-4 py-3 text-blue-400 font-semibold">{p.takerFeeBps / 100}% ({p.takerFeeBps} bps)</td>
                  <td className="px-4 py-3 font-sans">
                    <span className={p.isHalted ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {p.isHalted ? 'DIHENTIKAN (HALTED)' : 'BERJALAN NORMAL'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 font-sans">
                    <button
                      type="button"
                      onClick={() => handleUpdateFees(p.id)}
                      className="px-2.5 py-1 text-[11px] bg-[#141a23] hover:bg-[#1e2633] text-slate-200 rounded border border-[#1e2633]"
                    >
                      Ubah Fee
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleHalt(p.id, p.isHalted)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded border ${
                        p.isHalted
                          ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300 hover:bg-emerald-900/50'
                          : 'bg-red-950/40 border-red-700 text-red-300 hover:bg-red-900/50'
                      }`}
                    >
                      {p.isHalted ? 'Aktifkan Kembali' : 'Halt Trading'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: KYC REVIEWS */}
      {activeTab === 'KYC' && (
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2633] bg-[#0d121b]">
            <h3 className="text-xs font-bold text-slate-200">Daftar Pengguna & Review KYC</h3>
          </div>
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-[#101622] text-[11px] text-slate-400 border-b border-[#1e2633]">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Nama Lengkap (KTP)</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status Akun</th>
                <th className="px-4 py-2">Status KYC</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141a23]">
              {usersList.map(u => (
                <tr key={u.id} className="hover:bg-[#141a23]/40">
                  <td className="px-4 py-3 font-mono text-slate-300">{u.email}</td>
                  <td className="px-4 py-3 font-medium text-slate-200">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={u.status === 'frozen' ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={u.kycStatus === 'approved' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {u.kycStatus} (Tier {u.kycTier})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {u.kycStatus === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleReviewKyc(u.id, 'APPROVE')}
                        className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                      >
                        Approve Tier 2
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleFreeze(u.id, u.status)}
                      className={`px-2.5 py-1 text-[11px] rounded border ${
                        u.status === 'frozen'
                          ? 'bg-blue-950/40 border-blue-700 text-blue-300'
                          : 'bg-red-950/40 border-red-800 text-red-300'
                      }`}
                    >
                      {u.status === 'frozen' ? 'Buka Beku' : 'Bekukan Akun'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: WITHDRAWAL APPROVALS */}
      {activeTab === 'WITHDRAWALS' && (
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2633] bg-[#0d121b]">
            <h3 className="text-xs font-bold text-slate-200">Antrean Persetujuan Penarikan Dana Nominal Besar</h3>
          </div>
          {pendingWd.fiat.length === 0 && pendingWd.crypto.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              Tidak ada antrean penarikan yang menunggu persetujuan saat ini.
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {pendingWd.fiat.map(wd => (
                <div key={wd.id} className="flex items-center justify-between p-3 bg-[#101622] border border-[#1e2633] rounded text-xs">
                  <div>
                    <span className="font-bold text-slate-200 block">Penarikan IDR: {formatIDR(wd.amount, true)}</span>
                    <span className="text-slate-400 text-[11px] font-mono">
                      Rekening: {wd.accountNumber} ({wd.accountHolderName})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApproveWd(wd.id, 'FIAT')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs"
                  >
                    Setujui & Selesaikan
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: RISK & AML */}
      {activeTab === 'RISK' && (
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-200">Sistem Deteksi Anomali & Risiko Transaksi (AML)</h3>
          {riskAlerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-600">
              Sistem beroperasi normal: Belum ada anomali atau pola transaksi mencurigakan terdeteksi.
            </div>
          ) : (
            <div className="space-y-2">
              {riskAlerts.map(a => (
                <div key={a.id} className="p-3 bg-[#101622] border border-[#1e2633] rounded text-xs flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${a.severity === 'HIGH' ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400'}`}>
                        {a.severity}
                      </span>
                      <span className="font-bold text-slate-200">{a.category}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1">{a.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AUDIT LOGS */}
      {activeTab === 'AUDIT' && (
        <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2633] bg-[#0d121b]">
            <h3 className="text-xs font-bold text-slate-200">Audit Log Append-Only (Aktivitas Sistem & Admin)</h3>
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
            {auditLogs.length === 0 ? (
              <div className="text-center text-slate-600">Belum ada audit log</div>
            ) : (
              auditLogs.map((log, idx) => (
                <div key={idx} className="p-2.5 bg-[#101622] rounded border border-[#141a23] text-slate-300 flex justify-between">
                  <div>
                    <span className="font-bold text-blue-400">[{log.action}]</span> {log.details}
                  </div>
                  <span className="text-[11px] text-slate-500">{formatDateTime(log.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
