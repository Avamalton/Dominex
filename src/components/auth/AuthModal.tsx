/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/auth/AuthModal.tsx
 * Login and Registration modal with 2FA TOTP handling and instant demo account presets.
 */

import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (token: string, user: any) => void;
}

export const AuthModal: React.FC<Props> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [tab, setTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const endpoint = tab === 'LOGIN' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode: requiresTotp ? totpCode : undefined })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.requiresTotp) {
        setRequiresTotp(true);
        setIsLoading(false);
        return;
      }

      localStorage.setItem('dimonex_auth_token', data.token);
      onAuthSuccess(data.token, data.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    setRequiresTotp(false);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-xl max-w-md w-full p-6 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#1e2633] pb-3">
          <div className="flex gap-4">
            <button
              onClick={() => { setTab('LOGIN'); setRequiresTotp(false); setErrorMessage(null); }}
              className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                tab === 'LOGIN' ? 'text-blue-400 border-blue-500' : 'text-slate-400 border-transparent'
              }`}
            >
              Masuk
            </button>
            <button
              onClick={() => { setTab('REGISTER'); setRequiresTotp(false); setErrorMessage(null); }}
              className={`text-sm font-bold pb-1 border-b-2 transition-colors ${
                tab === 'REGISTER' ? 'text-blue-400 border-blue-500' : 'text-slate-400 border-transparent'
              }`}
            >
              Daftar Akun
            </button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 mb-1">Email:</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Kata Sandi:</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2.5 text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {requiresTotp && (
            <div className="p-3 bg-blue-950/30 border border-blue-800 rounded space-y-1">
              <label className="block font-semibold text-blue-300">Masukkan 6-Digit Kode 2FA TOTP:</label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-[#0b0e14] border border-[#1e2633] rounded p-2 font-mono text-center text-lg text-slate-100 tracking-widest focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors"
          >
            {isLoading ? 'Memproses...' : tab === 'LOGIN' ? 'Masuk ke Platform' : 'Daftar Akun Baru'}
          </button>
        </form>

        {/* Demo Fast Account Presets */}
        <div className="pt-3 border-t border-[#141a23]">
          <span className="text-[11px] text-slate-500 block mb-2 font-medium">Akun Pengujian Demo Cepat:</span>
          <div className="space-y-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickLogin('budi@dimonex.id', 'TraderDimonex123!')}
              className="w-full p-2 bg-[#141a23] hover:bg-[#1a2230] text-slate-300 rounded text-left border border-[#1e2633] flex justify-between"
            >
              <span>👤 <strong>Budi Santoso</strong> (Trader 1 - IDR & BTC)</span>
              <span className="text-blue-400">Pilih</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('siti@dimonex.id', 'TraderDimonex123!')}
              className="w-full p-2 bg-[#141a23] hover:bg-[#1a2230] text-slate-300 rounded text-left border border-[#1e2633] flex justify-between"
            >
              <span>👤 <strong>Siti Rahmawati</strong> (Trader 2 - IDR & BTC)</span>
              <span className="text-blue-400">Pilih</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@dimonex.id', 'AdminDimonex2026!')}
              className="w-full p-2 bg-[#141a23] hover:bg-[#1a2230] text-slate-300 rounded text-left border border-[#1e2633] flex justify-between"
            >
              <span>🛡️ <strong>Super Admin</strong> (Operator & Compliance)</span>
              <span className="text-blue-400">Pilih</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
