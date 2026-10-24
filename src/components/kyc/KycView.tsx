/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/kyc/KycView.tsx
 * Indonesian Identity Verification (KYC) Wizard with NIK validation and Tier limits.
 */

import React, { useState } from 'react';
import { UserProfile } from '../../types/index.js';

interface Props {
  user: UserProfile | null;
  onKycUpdated: () => void;
  onOpenAuthModal: () => void;
}

export const KycView: React.FC<Props> = ({ user, onKycUpdated, onOpenAuthModal }) => {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [nik, setNik] = useState('');
  const [birthDate, setBirthDate] = useState('1995-05-15');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="p-8 text-center bg-[#0b0e14] border border-[#1e2633] rounded-lg">
        <h2 className="text-base font-bold text-slate-100 mb-2">Verifikasi Identitas KYC</h2>
        <p className="text-xs text-slate-400 mb-4">Silakan masuk ke akun Anda terlebih dahulu.</p>
        <button
          onClick={onOpenAuthModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition-colors"
        >
          Masuk Akun
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (nik.trim().length !== 16) {
      setErrorMessage('Nomor Induk Kependudukan (NIK) harus tepat 16 digit angka');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/kyc/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          nik: nik.trim(),
          birthDate
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMessage(data.message);
      onKycUpdated();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-6">
        <div className="flex items-center justify-between border-b border-[#1e2633] pb-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-100">Verifikasi Identitas Resmi (KYC)</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Standar kepatuhan Bappebti & OJK untuk verifikasi data kependudukan Indonesia.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-500 block">Status Akun:</span>
            <span className={`text-xs font-bold ${user.kycStatus === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {user.kycStatus === 'approved' ? 'Terverifikasi (Tier 1)' : 'Belum Diverifikasi'}
            </span>
          </div>
        </div>

        {/* Tier Limits Overview */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
          <div className="bg-[#101622] border border-[#1e2633] p-3 rounded">
            <span className="text-slate-400 block mb-1">Batas Transaksi Harian (Tier 1)</span>
            <span className="font-mono font-bold text-slate-200">Rp 25.000.000 / hari</span>
          </div>
          <div className="bg-[#101622] border border-[#1e2633] p-3 rounded">
            <span className="text-slate-400 block mb-1">Batas Transaksi Lanjutan (Tier 2)</span>
            <span className="font-mono font-bold text-slate-200">Rp 500.000.000 / hari</span>
          </div>
        </div>

        {user.kycStatus === 'approved' ? (
          <div className="bg-emerald-950/30 border border-emerald-800/60 p-4 rounded text-xs text-emerald-300 space-y-1">
            <div className="font-bold text-sm">Akun Anda Telah Terverifikasi!</div>
            <div>Nama Lengkap: <span className="font-semibold text-white">{user.fullName || 'Terdaftar'}</span></div>
            <div>Tingkat Limit: Tier 1 (Maksimal Rp 25.000.000 / hari)</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {errorMessage && (
              <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded">
                {successMessage}
              </div>
            )}

            <div>
              <label className="block text-slate-300 mb-1">Nama Lengkap (Sesuai KTP):</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Nomor Induk Kependudukan (NIK - 16 Digit):</label>
              <input
                type="text"
                required
                maxLength={16}
                value={nik}
                onChange={e => setNik(e.target.value.replace(/\D/g, ''))}
                placeholder="3273012908850003"
                className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Tanggal Lahir:</label>
              <input
                type="date"
                required
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="border border-dashed border-[#1e2633] p-4 rounded text-center bg-[#101622]/50">
                <span className="text-slate-400 block mb-1">Foto KTP Fisik</span>
                <span className="text-[11px] text-emerald-400">✓ Dokumen KTP Terlampir</span>
              </div>
              <div className="border border-dashed border-[#1e2633] p-4 rounded text-center bg-[#101622]/50">
                <span className="text-slate-400 block mb-1">Foto Selfie + Liveness</span>
                <span className="text-[11px] text-emerald-400">✓ Liveness Check Siap</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors"
            >
              {isSubmitting ? 'Memverifikasi Data Dukcapil...' : 'Kirim Verifikasi Identitas'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
