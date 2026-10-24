/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * kyc.ts
 * KYC management with Indonesian KTP & Selfie verification, OCR simulation, and Tier limits.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from './auth.js';
import { db } from '../db/database.js';
import { UserKyc } from '../db/types.js';

export const kycRouter = Router();

// Get Current User's KYC status
kycRouter.get('/status', requireAuth, (req, res) => {
  const user = (req as any).user;
  const kyc = db.kyc.get(user.id);
  
  if (!kyc) {
    return res.json({
      status: 'unverified',
      tierLevel: 0,
      limits: {
        dailyDepositIdr: '0',
        dailyWithdrawalIdr: '0'
      }
    });
  }

  const limits = {
    dailyDepositIdr: kyc.tierLevel === 2 ? '500000000' : '25000000',
    dailyWithdrawalIdr: kyc.tierLevel === 2 ? '500000000' : '25000000'
  };

  res.json({
    ...kyc,
    limits
  });
});

// Submit KYC Documents (KTP + Selfie)
kycRouter.post('/submit', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { fullName, nik, birthDate, idCardUrl, selfieUrl } = req.body;

    if (!fullName || !nik || !birthDate) {
      return res.status(400).json({ error: 'Nama Lengkap (sesuai KTP), NIK, dan Tanggal Lahir wajib diisi' });
    }

    if (!/^\d{16}$/.test(nik.trim())) {
      return res.status(400).json({ error: 'Format NIK harus tepat 16 digit angka' });
    }

    let existingKyc = db.kyc.get(user.id);

    // Simulated vendor verification adapter (e.g. Sumsub / Verihubs Dukcapil lookup)
    const newKyc: UserKyc = {
      id: existingKyc ? existingKyc.id : crypto.randomUUID(),
      userId: user.id,
      fullName: fullName.trim(),
      nik: nik.trim(),
      birthDate,
      idCardUrl: idCardUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="%231e293b"/><text x="100" y="60" fill="%23fff" text-anchor="middle">KTP Valid</text></svg>',
      selfieUrl: selfieUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="50" fill="%233b82f6"/></svg>',
      status: 'approved', // Auto-approved in MVP simulation for seamless UX
      tierLevel: 1,
      reviewedBy: 'system-kyc-engine',
      reviewedAt: Date.now(),
      createdAt: existingKyc ? existingKyc.createdAt : Date.now()
    };

    db.kyc.set(user.id, newKyc);

    // Audit log
    db.auditLogs.push({
      id: crypto.randomUUID(),
      actorId: user.id,
      action: 'KYC_SUBMITTED',
      resource: `user_kyc:${newKyc.id}`,
      details: `KYC submitted for NIK ${nik.slice(0, 6)}****** with full name: ${fullName}`,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      message: 'KYC berhasil diverifikasi! Akun Anda kini berstatus Terverifikasi (Tier 1)',
      kyc: newKyc
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
