/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/security/SecurityView.tsx
 * Security panel: RFC-6238 2FA TOTP, API Key issuance with HMAC signing, and device sessions.
 */

import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types/index.js';
import { formatDateTime } from '../../lib/formatters.js';

interface Props {
  user: UserProfile | null;
  onUserUpdated: () => void;
  onOpenAuthModal: () => void;
}

export const SecurityView: React.FC<Props> = ({ user, onUserUpdated, onOpenAuthModal }) => {
  // 2FA state
  const [totpSecretData, setTotpSecretData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpInputCode, setTotpInputCode] = useState('');
  const [totpMessage, setTotpMessage] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('Trading Bot Alpha');
  const [newKeyIp, setNewKeyIp] = useState('');
  const [issuedSecret, setIssuedSecret] = useState<any>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadApiKeys();
      loadSessions();
    }
  }, [user]);

  const loadApiKeys = async () => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/api-keys/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setApiKeys(data);
    } catch (e) {}
  };

  const loadSessions = async () => {
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/auth/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setSessions(data);
    } catch (e) {}
  };

  // 2FA Handlers
  const handleGenerate2fa = async () => {
    setTotpError(null);
    setTotpMessage(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/auth/2fa/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTotpSecretData(data);
    } catch (err: any) {
      setTotpError(err.message);
    }
  };

  const handleEnable2fa = async () => {
    setTotpError(null);
    setTotpMessage(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: totpInputCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTotpMessage('2FA TOTP berhasil diaktifkan untuk akun Anda!');
      setTotpSecretData(null);
      setTotpInputCode('');
      onUserUpdated();
    } catch (err: any) {
      setTotpError(err.message);
    }
  };

  const handleDisable2fa = async () => {
    const code = prompt('Masukkan kode 6-digit TOTP Anda untuk menonaktifkan 2FA:');
    if (!code) return;
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('2FA berhasil dinonaktifkan');
      onUserUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // API Key Create
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      const res = await fetch('/api/api-keys/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          label: newKeyLabel,
          permissions: ['read', 'trade'],
          ipWhitelist: newKeyIp
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIssuedSecret(data);
      loadApiKeys();
    } catch (err: any) {
      setKeyError(err.message);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Yakin ingin mencabut kunci API ini?')) return;
    try {
      const token = localStorage.getItem('dimonex_auth_token');
      await fetch('/api/api-keys/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      loadApiKeys();
    } catch (err) {}
  };

  if (!user) {
    return (
      <div className="p-8 text-center bg-[#0b0e14] border border-[#1e2633] rounded-lg">
        <h2 className="text-base font-bold text-slate-100 mb-2">Pengaturan Keamanan</h2>
        <p className="text-xs text-slate-400 mb-4">Masuk untuk mengelola 2FA dan Kunci API.</p>
        <button
          onClick={onOpenAuthModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded"
        >
          Masuk Akun
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 2FA Card */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-6">
        <div className="flex items-center justify-between border-b border-[#1e2633] pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Autentikasi Dua Faktor (2FA TOTP)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Lindungi akun dari akses tanpa izin dengan Google Authenticator atau aplikasi TOTP lainnya.
            </p>
          </div>
          <span className={`text-xs font-bold ${user.isTotpEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
            {user.isTotpEnabled ? 'Aktif' : 'Tidak Aktif'}
          </span>
        </div>

        {totpError && <div className="p-3 mb-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded">{totpError}</div>}
        {totpMessage && <div className="p-3 mb-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded">{totpMessage}</div>}

        {!user.isTotpEnabled ? (
          <div>
            {!totpSecretData ? (
              <button
                type="button"
                onClick={handleGenerate2fa}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition-colors"
              >
                Aktifkan 2FA Sekarang
              </button>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-[#101622] border border-[#1e2633] rounded space-y-2">
                  <span className="text-slate-400 block font-medium">1. Masukkan Secret Key ini ke Aplikasi Authenticator:</span>
                  <div className="p-2.5 bg-[#0b0e14] border border-[#141a23] font-mono text-blue-400 font-bold select-all tracking-wider text-center text-sm rounded">
                    {totpSecretData.secret}
                  </div>
                  <span className="text-slate-500 text-[11px] block text-center">
                    (Atau buka URI: {totpSecretData.otpauthUrl})
                  </span>
                </div>

                <div className="space-y-2">
                  <span className="text-slate-300 block font-medium">2. Masukkan 6 Digit Kode dari Authenticator:</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={totpInputCode}
                      onChange={e => setTotpInputCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-48 bg-[#141a23] border border-[#1e2633] rounded px-3 py-2 font-mono text-center text-lg text-slate-100 tracking-widest focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleEnable2fa}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded"
                    >
                      Verifikasi & Aktifkan
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleDisable2fa}
            className="px-4 py-2 bg-red-950/40 hover:bg-red-900/50 border border-red-800 text-red-300 font-semibold text-xs rounded transition-colors"
          >
            Nonaktifkan 2FA
          </button>
        )}
      </div>

      {/* API Keys Card */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-6">
        <div className="border-b border-[#1e2633] pb-4 mb-4">
          <h3 className="text-sm font-bold text-slate-100">Kunci API Publik (HMAC-SHA256)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Digunakan oleh bot trading algo. Penarikan dana via API dinonaktifkan demi perlindungan modal.
          </p>
        </div>

        {issuedSecret && (
          <div className="p-4 mb-4 bg-emerald-950/30 border border-emerald-800 rounded text-xs space-y-2">
            <div className="font-bold text-emerald-300">KUNCI API BERHASIL DIBUAT (SIMPAN SEKARANG):</div>
            <div>
              <span className="text-slate-400">API Key:</span>
              <div className="p-2 bg-[#0b0e14] font-mono text-slate-200 select-all rounded mt-0.5">{issuedSecret.apiKey}</div>
            </div>
            <div>
              <span className="text-slate-400">API Secret (Hanya tampil satu kali ini):</span>
              <div className="p-2 bg-[#0b0e14] font-mono text-emerald-400 font-bold select-all rounded mt-0.5">{issuedSecret.apiSecret}</div>
            </div>
          </div>
        )}

        {keyError && <div className="p-3 mb-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded">{keyError}</div>}

        {/* Create API Key Form */}
        <form onSubmit={handleCreateApiKey} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Label Kunci:</label>
            <input
              type="text"
              value={newKeyLabel}
              onChange={e => setNewKeyLabel(e.target.value)}
              className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 text-slate-100 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">IP Whitelist (Opsional):</label>
            <input
              type="text"
              value={newKeyIp}
              onChange={e => setNewKeyIp(e.target.value)}
              placeholder="e.g. 103.24.12.5"
              className="w-full bg-[#141a23] border border-[#1e2633] rounded p-2 text-slate-100 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition-colors"
            >
              Generate API Key
            </button>
          </div>
        </form>

        {/* API Key List */}
        <div className="space-y-2">
          {apiKeys.length === 0 ? (
            <div className="text-xs text-slate-600 py-3 text-center">Belum ada Kunci API yang aktif</div>
          ) : (
            apiKeys.map(k => (
              <div key={k.id} className="flex items-center justify-between p-3 bg-[#101622] border border-[#1e2633] rounded text-xs font-mono">
                <div>
                  <span className="font-sans font-bold text-slate-200 block">{k.label}</span>
                  <span className="text-slate-400 text-[11px]">{k.keyId}</span>
                  <span className="text-slate-500 text-[11px] block mt-0.5">Izin: {k.permissions.join(', ')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeKey(k.id)}
                  className="px-3 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded border border-red-900/40 text-[11px]"
                >
                  Cabut Kunci
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-[#0b0e14] border border-[#1e2633] rounded-lg p-6">
        <h3 className="text-sm font-bold text-slate-100 mb-3">Daftar Sesi & Perangkat Aktif</h3>
        <div className="space-y-2">
          {sessions.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-[#101622] border border-[#1e2633] rounded text-xs">
              <div>
                <span className="font-semibold text-slate-200 block">{s.device}</span>
                <span className="text-slate-500 font-mono text-[11px]">IP: {s.ip} · Kedaluwarsa: {formatDateTime(s.expiresAt)}</span>
              </div>
              {s.isCurrent && (
                <span className="text-[11px] font-semibold text-emerald-400">
                  Perangkat Ini
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
