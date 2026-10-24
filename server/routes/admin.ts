/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * admin.ts
 * Admin Panel routes: KYC review, pair listing/halt, fee configuration,
 * withdrawal approvals, and system audit logs.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAdmin } from './auth.js';
import { db } from '../db/database.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { TradingPair } from '../db/types.js';

export const adminRouter = Router();

// 1. Get All Users and KYC Submissions
adminRouter.get('/users', requireAdmin, (req, res) => {
  const usersList = Array.from(db.users.values()).map(u => {
    const kyc = db.kyc.get(u.id);
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      isTotpEnabled: u.isTotpEnabled,
      kycStatus: kyc ? kyc.status : 'unverified',
      kycTier: kyc ? kyc.tierLevel : 0,
      fullName: kyc ? kyc.fullName : '-',
      createdAt: u.createdAt
    };
  });
  res.json(usersList);
});

// 2. Review KYC Submission
adminRouter.post('/kyc/review', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const { userId, action, rejectionReason, tierLevel } = req.body;

    const kyc = db.kyc.get(userId);
    if (!kyc) return res.status(404).json({ error: 'Data KYC tidak ditemukan' });

    if (action === 'APPROVE') {
      kyc.status = 'approved';
      kyc.tierLevel = tierLevel || 2;
      kyc.reviewedBy = adminUser.id;
      kyc.reviewedAt = Date.now();
      kyc.rejectionReason = undefined;
    } else {
      kyc.status = 'rejected';
      kyc.rejectionReason = rejectionReason || 'Dokumen identitas tidak terbaca dengan jelas';
      kyc.reviewedBy = adminUser.id;
      kyc.reviewedAt = Date.now();
    }

    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: adminUser.id,
      action: `KYC_${action}`,
      resource: `user:${userId}`,
      details: `KYC marked as ${kyc.status} by admin ${adminUser.email}`,
      createdAt: Date.now()
    });

    res.json({ success: true, kyc });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Halt / Resume Trading per Pair
adminRouter.post('/pairs/toggle-halt', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const { pairId, isHalted } = req.body;

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair tidak ditemukan' });

    pair.isHalted = Boolean(isHalted);
    db.tradingPairs.set(pairId, pair);

    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: adminUser.id,
      action: isHalted ? 'TRADING_HALTED' : 'TRADING_RESUMED',
      resource: `pair:${pairId}`,
      details: `Trading pair ${pairId} halted status changed to: ${isHalted}`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: `Trading pair ${pairId} status: ${isHalted ? 'DIHENTIKAN SEMENTARA (HALTED)' : 'BERJALAN NORMAL'}`,
      pair
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Configure Maker & Taker Fees
adminRouter.post('/pairs/update-fees', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const { pairId, makerFeeBps, takerFeeBps } = req.body;

    const pair = db.tradingPairs.get(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair tidak ditemukan' });

    if (makerFeeBps !== undefined) pair.makerFeeBps = Number(makerFeeBps);
    if (takerFeeBps !== undefined) pair.takerFeeBps = Number(takerFeeBps);

    db.tradingPairs.set(pairId, pair);

    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: adminUser.id,
      action: 'FEES_UPDATED',
      resource: `pair:${pairId}`,
      details: `Fees updated: Maker ${pair.makerFeeBps} bps (${pair.makerFeeBps / 100}%), Taker ${pair.takerFeeBps} bps (${pair.takerFeeBps / 100}%)`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: `Biaya transaksi ${pairId} berhasil diperbarui: Maker ${pair.makerFeeBps / 100}%, Taker ${pair.takerFeeBps / 100}%`,
      pair
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Get Pending Withdrawals
adminRouter.get('/withdrawals/pending', requireAdmin, (req, res) => {
  const pendingFiat = Array.from(db.fiatTransactions.values()).filter(t => t.type === 'WITHDRAW' && t.status === 'PENDING');
  const pendingCrypto = Array.from(db.cryptoTransactions.values()).filter(t => t.type === 'WITHDRAW' && t.status === 'PENDING');

  res.json({
    fiat: pendingFiat,
    crypto: pendingCrypto
  });
});

// 6. Approve Withdrawal
adminRouter.post('/withdrawals/approve', requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user;
    const { txId, txType } = req.body; // txType: 'FIAT' | 'CRYPTO'

    if (txType === 'FIAT') {
      const tx = db.fiatTransactions.get(txId);
      if (!tx || tx.status !== 'PENDING') return res.status(404).json({ error: 'Transaksi tidak ditemukan atau sudah diproses' });

      // Release locked funds from user account permanently
      const userAcc = db.createOrGetAccount(tx.userId, 'IDR');
      const locked = BigInt(userAcc.balanceLocked);
      const amountUnits = BigInt(tx.amount);
      userAcc.balanceLocked = (locked >= amountUnits ? locked - amountUnits : 0n).toString();
      userAcc.version += 1;
      userAcc.updatedAt = Date.now();

      tx.status = 'COMPLETED';
      db.fiatTransactions.set(txId, tx);
    } else {
      const tx = db.cryptoTransactions.get(txId);
      if (!tx || tx.status !== 'PENDING') return res.status(404).json({ error: 'Transaksi kripto tidak ditemukan atau sudah diproses' });

      const userAcc = db.createOrGetAccount(tx.userId, tx.currency);
      const locked = BigInt(userAcc.balanceLocked);
      const amountUnits = BigInt(tx.amount);
      userAcc.balanceLocked = (locked >= amountUnits ? locked - amountUnits : 0n).toString();
      userAcc.version += 1;
      userAcc.updatedAt = Date.now();

      tx.status = 'COMPLETED';
      tx.confirmations = 12;
      db.cryptoTransactions.set(txId, tx);
    }

    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: adminUser.id,
      action: 'WITHDRAWAL_APPROVED',
      resource: `tx:${txId}`,
      details: `Withdrawal approved by admin ${adminUser.email}`,
      createdAt: Date.now()
    });

    res.json({ success: true, message: 'Penarikan dana berhasil disetujui dan diproses!' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Get Audit Logs
adminRouter.get('/audit-logs', requireAdmin, (req, res) => {
  res.json(db.auditLogs.slice(-100).reverse());
});
