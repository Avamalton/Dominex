/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * FxConversionService.ts
 * USDT/IDR Conversion Engine with Admin Manual Overrides, Validity Duration,
 * Safeguards, and Audit History.
 */

import crypto from 'crypto';
import { db } from '../../db/database.js';
import { FxRateRecord, FxRateAuditEntry } from './ExternalFeedTypes.js';

export class FxConversionService {
  private currentRate: FxRateRecord;
  private auditHistory: FxRateAuditEntry[] = [];
  private maxChangeWithoutConfirmPct = 10.0; // 10% max jump without explicit confirmation

  constructor() {
    const now = Date.now();
    // Default initial rate: 16,350 IDR per USDT, valid for 48 hours
    this.currentRate = {
      rate: 16350.00,
      source: 'SYSTEM_DEFAULT',
      updatedBy: 'system@dimonex.id',
      updatedAt: now,
      validUntil: now + 48 * 60 * 60 * 1000,
      isStale: false,
      notes: 'Initial production baseline USDT/IDR rate.'
    };

    this.auditHistory.push({
      id: `fx-audit-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      actor: 'system@dimonex.id',
      previousRate: 16350.00,
      newRate: 16350.00,
      percentChange: 0,
      source: 'SYSTEM_DEFAULT',
      notes: 'Initial baseline setup'
    });
  }

  /**
   * Get current active FX rate record with freshness validation
   */
  public getCurrentRate(): FxRateRecord {
    const now = Date.now();
    const isExpired = now > this.currentRate.validUntil;
    return {
      ...this.currentRate,
      isStale: isExpired
    };
  }

  /**
   * Admin updates manual USDT/IDR rate
   */
  public updateManualRate(
    newRate: number, 
    actorEmail: string, 
    notes?: string, 
    validityHours = 24, 
    confirmOutOfBand = false
  ): { success: boolean; error?: string; rateRecord?: FxRateRecord } {
    if (isNaN(newRate) || newRate <= 0) {
      return { success: false, error: 'Kurs USDT/IDR harus berupa angka positif lebih dari 0.' };
    }

    const prevRate = this.currentRate.rate;
    const pctChange = Math.abs((newRate - prevRate) / prevRate) * 100;

    if (pctChange > this.maxChangeWithoutConfirmPct && !confirmOutOfBand) {
      return {
        success: false,
        error: `Perubahan kurs (${pctChange.toFixed(2)}%) melebihi batas toleransi ${this.maxChangeWithoutConfirmPct}%. Berikan konfirmasi untuk menyetujui deviasi besar ini.`
      };
    }

    const now = Date.now();
    const validUntil = now + Math.max(1, validityHours) * 60 * 60 * 1000;

    this.currentRate = {
      rate: parseFloat(newRate.toFixed(2)),
      source: 'MANUAL_ADMIN',
      updatedBy: actorEmail,
      updatedAt: now,
      validUntil,
      isStale: false,
      notes: notes || `Diperbarui secara manual oleh ${actorEmail}`
    };

    const auditEntry: FxRateAuditEntry = {
      id: `fx-audit-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      actor: actorEmail,
      previousRate: prevRate,
      newRate: this.currentRate.rate,
      percentChange: parseFloat(pctChange.toFixed(2)),
      source: 'MANUAL_ADMIN',
      notes: notes || 'Update manual via Admin / MM Console'
    };

    this.auditHistory.unshift(auditEntry);
    if (this.auditHistory.length > 200) this.auditHistory.pop();

    // Record in global audit logs
    db.auditLogs.unshift({
      id: `audit-${crypto.randomUUID().slice(0, 8)}`,
      actorId: actorEmail,
      action: 'FX_RATE_UPDATE',
      resource: 'USDT-IDR',
      details: `Kurs USDT/IDR diubah dari Rp ${prevRate.toLocaleString()} ke Rp ${this.currentRate.rate.toLocaleString()} (Δ ${pctChange.toFixed(2)}%). Berlaku sampai ${new Date(validUntil).toISOString()}`,
      createdAt: now
    });
    db.scheduleSave();

    return { success: true, rateRecord: this.getCurrentRate() };
  }

  /**
   * Sync USDT/IDR FX rate with CoinMarketCap live market price
   */
  public syncWithCoinMarketCap(
    cmcRate: number,
    actorEmail = 'system@dimonex.id',
    validityHours = 6
  ): { success: boolean; rateRecord: FxRateRecord } {
    const prevRate = this.currentRate.rate;
    const pctChange = Math.abs((cmcRate - prevRate) / prevRate) * 100;
    const now = Date.now();
    const validUntil = now + Math.max(1, validityHours) * 60 * 60 * 1000;

    this.currentRate = {
      rate: parseFloat(cmcRate.toFixed(2)),
      source: 'COINMARKETCAP',
      updatedBy: actorEmail,
      updatedAt: now,
      validUntil,
      isStale: false,
      notes: `Disinkronkan secara otomatis dari CoinMarketCap live price feed`
    };

    const auditEntry: FxRateAuditEntry = {
      id: `fx-audit-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      actor: actorEmail,
      previousRate: prevRate,
      newRate: this.currentRate.rate,
      percentChange: parseFloat(pctChange.toFixed(2)),
      source: 'COINMARKETCAP',
      notes: 'Sinkronisasi kurs USDT/IDR dari CoinMarketCap'
    };

    this.auditHistory.unshift(auditEntry);
    if (this.auditHistory.length > 200) this.auditHistory.pop();

    db.auditLogs.unshift({
      id: `audit-${crypto.randomUUID().slice(0, 8)}`,
      actorId: actorEmail,
      action: 'FX_RATE_CMC_SYNC',
      resource: 'USDT-IDR',
      details: `Kurs USDT/IDR disinkronkan dari CoinMarketCap: Rp ${this.currentRate.rate.toLocaleString()} (Δ ${pctChange.toFixed(2)}%)`,
      createdAt: now
    });
    db.scheduleSave();

    return { success: true, rateRecord: this.getCurrentRate() };
  }

  /**
   * Convert USDT price to IDR quote price
   */
  public convertUsdtToIdr(usdtPrice: number): {
    idrPrice: number;
    isValid: boolean;
    reason?: string;
  } {
    const fx = this.getCurrentRate();
    if (fx.isStale) {
      return {
        idrPrice: 0,
        isValid: false,
        reason: 'Kurs USDT/IDR telah kedaluwarsa (STALE). Diperlukan konfirmasi pembaruan oleh Administrator.'
      };
    }
    const idrPrice = Math.round(usdtPrice * fx.rate);
    return {
      idrPrice,
      isValid: true
    };
  }

  /**
   * Convert target IDR base/quote pair symbol to external USDT symbol
   */
  public getExternalSymbolForPair(pairId: string): string | null {
    const upper = pairId.toUpperCase();
    if (upper === 'BTC-IDR') return 'BTCUSDT';
    if (upper === 'ETH-IDR') return 'ETHUSDT';
    if (upper === 'USDT-IDR') return 'USDTUSDT';
    return null;
  }

  public getAuditHistory(): FxRateAuditEntry[] {
    return [...this.auditHistory];
  }
}

export const fxConversionService = new FxConversionService();
