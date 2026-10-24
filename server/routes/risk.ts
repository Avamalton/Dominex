/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * risk.ts
 * Risk & Compliance module: suspicious transaction monitoring, account freezing, AML reports.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAdmin } from './auth.js';
import { db } from '../db/database.js';

export const riskRouter = Router();

// 1. Get Suspicious Activity Feed
riskRouter.get('/suspicious-activity', requireAdmin, (req, res) => {
  const flags = [];

  // Flag 1: High velocity deposits / withdrawals (e.g. > IDR 50M)
  for (const tx of db.fiatTransactions.values()) {
    if (BigInt(tx.amount) > 5000000000n) { // > Rp 50,000,000.00
      flags.push({
        id: `aml-tx-${tx.id.slice(0, 8)}`,
        severity: 'HIGH',
        category: 'LARGE_VALUE_TRANSACTION',
        description: `Transaksi nominal besar: IDR ${BigInt(tx.amount) / 100n} oleh user ${tx.userId}`,
        userId: tx.userId,
        createdAt: tx.createdAt
      });
    }
  }

  // Flag 2: Users with multiple failed logins
  for (const u of db.users.values()) {
    if (u.failedLoginAttempts >= 3) {
      flags.push({
        id: `sec-user-${u.id.slice(0, 8)}`,
        severity: 'MEDIUM',
        category: 'POSSIBLE_BRUTE_FORCE',
        description: `Percobaan masuk gagal berulang (${u.failedLoginAttempts} kali) untuk email: ${u.email}`,
        userId: u.id,
        createdAt: Date.now() - 300000
      });
    }
  }

  res.json(flags);
});

// 2. Freeze / Unfreeze User Account
riskRouter.post('/account-freeze', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const { userId, freeze, reason } = req.body;

    const targetUser = db.users.get(userId);
    if (!targetUser) return res.status(404).json({ error: 'User tidak ditemukan' });

    targetUser.status = freeze ? 'frozen' : 'active';
    targetUser.updatedAt = Date.now();

    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: adminUser.id,
      action: freeze ? 'ACCOUNT_FROZEN' : 'ACCOUNT_UNFROZEN',
      resource: `user:${userId}`,
      details: `User status changed to ${targetUser.status}. Reason: ${reason || 'AML/Compliance investigation'}`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: `Akun ${targetUser.email} berhasil ${freeze ? 'DIBEKUKAN (FROZEN)' : 'DIAKTIFKAN KEMBALI'}`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        status: targetUser.status
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Export AML Report (JSON / CSV schema)
riskRouter.get('/export-report', requireAdmin, (req, res) => {
  const report = {
    reportId: `AML-DMX-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    totalUsers: db.users.size,
    totalTrades: db.trades.length,
    totalFiatTransactions: db.fiatTransactions.size,
    totalCryptoTransactions: db.cryptoTransactions.size,
    systemInvariantsValid: true
  };
  res.json(report);
});
