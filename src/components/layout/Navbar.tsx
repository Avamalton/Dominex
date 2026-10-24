/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/layout/Navbar.tsx
 * Top Navigation Bar adhering to the Top Bar Contract (Wordmark - Links - Primary Action).
 */

import React from 'react';
import { UserProfile, AppLanguage, I18N } from '../../types/index.js';

interface Props {
  currentView: 'TRADE' | 'BOT' | 'WALLET' | 'KYC' | 'SECURITY' | 'ADMIN';
  onSelectView: (view: 'TRADE' | 'BOT' | 'WALLET' | 'KYC' | 'SECURITY' | 'ADMIN') => void;
  user: UserProfile | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  lang: AppLanguage;
  onToggleLang: () => void;
}

export const Navbar: React.FC<Props> = ({
  currentView,
  onSelectView,
  user,
  onOpenAuthModal,
  onLogout,
  lang,
  onToggleLang,
}) => {
  const t = I18N[lang];

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0b0e14] border-b border-[#1e2633] sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => onSelectView('TRADE')}
          className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2 text-left"
        >
          <span className="text-blue-500 font-black">DIMONEX</span>
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">SPOT IDR</span>
        </button>
      </div>

      {/* Zone 2: Concise single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
        <button
          onClick={() => onSelectView('TRADE')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'TRADE' ? 'text-blue-400 font-bold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          {t.navTrade}
        </button>
        <button
          onClick={() => onSelectView('BOT')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            currentView === 'BOT' ? 'text-blue-400 font-bold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          <span className="text-emerald-400 font-mono text-[10px]">🤖</span>
          {t.navBot}
        </button>
        <button
          onClick={() => onSelectView('WALLET')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'WALLET' ? 'text-blue-400 font-bold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          {t.navWallet}
        </button>
        <button
          onClick={() => onSelectView('KYC')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'KYC' ? 'text-blue-400 font-bold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          {t.navKyc}
        </button>
        <button
          onClick={() => onSelectView('SECURITY')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'SECURITY' ? 'text-blue-400 font-bold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          {t.navSecurity}
        </button>
        {user && (user.role === 'admin' || user.role === 'superadmin') && (
          <button
            onClick={() => onSelectView('ADMIN')}
            className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 ${
              currentView === 'ADMIN' ? 'text-amber-400 font-bold border-b border-amber-500 pb-0.5' : 'text-amber-400/90'
            }`}
          >
            {t.navAdmin}
          </button>
        )}
      </nav>

      {/* Zone 3: 1 primary action / Account & Language toggle */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Language switch */}
        <button
          type="button"
          onClick={onToggleLang}
          className="px-2 py-1 text-[11px] font-mono font-semibold bg-[#141a23] hover:bg-[#1f2838] border border-[#1e2633] text-slate-300 rounded transition-colors whitespace-nowrap"
        >
          {lang === 'ID' ? 'ID 🇮🇩' : 'EN 🇬🇧'}
        </button>

        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold text-slate-200 block truncate max-w-[140px]">
                {user.fullName || user.email.split('@')[0]}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {user.role} · {user.kycStatus === 'approved' ? 'KYC Terverifikasi' : 'Belum KYC'}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#141a23] hover:bg-[#1f2838] border border-[#1e2633] rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {t.logout}
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            {t.login} / {t.register}
          </button>
        )}
      </div>
    </header>
  );
};
