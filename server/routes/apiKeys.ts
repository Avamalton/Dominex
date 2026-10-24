/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * apiKeys.ts
 * Public API & API Key Management with HMAC-SHA256 signature authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireAuth } from './auth.js';
import { db } from '../db/database.js';
import { ApiKey } from '../db/types.js';

export const apiKeyRouter = Router();

// Middleware to verify HMAC signature for public REST endpoints
export const requireHmacAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-dimonex-apikey'] as string;
  const signature = req.headers['x-dimonex-signature'] as string;
  const timestamp = req.headers['x-dimonex-timestamp'] as string;

  if (!apiKey || !signature || !timestamp) {
    return res.status(401).json({ error: 'Header autentikasi HMAC tidak lengkap (X-DIMONEX-APIKEY, X-DIMONEX-SIGNATURE, X-DIMONEX-TIMESTAMP)' });
  }

  // Check timestamp drift (5 seconds window)
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 30000) {
    return res.status(401).json({ error: 'Permintaan kedaluwarsa atau perbedaan waktu jam (timestamp drift > 30s)' });
  }

  // Find API Key
  let foundKey: ApiKey | undefined;
  for (const k of db.apiKeys.values()) {
    if (k.keyId === apiKey && k.isActive) {
      foundKey = k;
      break;
    }
  }

  if (!foundKey) {
    return res.status(401).json({ error: 'API Key tidak valid atau telah dinonaktifkan' });
  }

  // Check IP whitelist if configured
  if (foundKey.ipWhitelist) {
    const clientIp = req.ip || req.socket.remoteAddress || '';
    const allowedIps = foundKey.ipWhitelist.split(',').map(s => s.trim());
    if (!allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
      return res.status(403).json({ error: `Alamat IP ${clientIp} tidak terdaftar di IP whitelist kunci ini` });
    }
  }

  // Validate HMAC SHA256 signature
  // Payload string = method + path + timestamp + body
  const bodyStr = req.body ? JSON.stringify(req.body) : '';
  const message = `${req.method}${req.originalUrl}${timestamp}${bodyStr}`;
  const computedSig = crypto.createHmac('sha256', foundKey.secretHash).update(message).digest('hex');

  if (computedSig !== signature) {
    return res.status(401).json({ error: 'Tanda tangan digital HMAC-SHA256 tidak cocok' });
  }

  const user = db.users.get(foundKey.userId);
  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'Akun pemilik API Key ini tidak aktif' });
  }

  (req as any).user = user;
  (req as any).apiKey = foundKey;
  next();
};

// Create New API Key
apiKeyRouter.post('/create', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { label, permissions, ipWhitelist } = req.body;

    const keyId = 'dmx_live_' + crypto.randomBytes(16).toString('hex');
    const secretKey = crypto.randomBytes(32).toString('hex'); // shown only once to user

    const newKey: ApiKey = {
      id: crypto.randomUUID(),
      userId: user.id,
      keyId,
      secretHash: secretKey,
      label: label || 'Trading Bot Key',
      permissions: permissions || ['read', 'trade'],
      ipWhitelist: ipWhitelist || '',
      isActive: true,
      createdAt: Date.now()
    };

    db.apiKeys.set(newKey.id, newKey);

    res.json({
      success: true,
      apiKey: keyId,
      apiSecret: secretKey, // CRITICAL: displayed once
      label: newKey.label,
      permissions: newKey.permissions,
      message: 'Simpan API Secret Anda sekarang. Secret tidak akan pernah ditampilkan kembali demi keamanan!'
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// List User's API Keys
apiKeyRouter.get('/list', requireAuth, (req, res) => {
  const user = (req as any).user;
  const userKeys = Array.from(db.apiKeys.values())
    .filter(k => k.userId === user.id)
    .map(k => ({
      id: k.id,
      keyId: k.keyId,
      label: k.label,
      permissions: k.permissions,
      ipWhitelist: k.ipWhitelist,
      isActive: k.isActive,
      createdAt: k.createdAt
    }));

  res.json(userKeys);
});

// Revoke / Delete API Key
apiKeyRouter.post('/revoke', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { id } = req.body;

  const key = db.apiKeys.get(id);
  if (!key || key.userId !== user.id) {
    return res.status(404).json({ error: 'Kunci API tidak ditemukan' });
  }

  db.apiKeys.delete(id);
  res.json({ success: true, message: 'Kunci API berhasil dicabut' });
});
