/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * auth.ts
 * Authentication endpoints: register, login, 2FA TOTP setup, sessions.
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/AuthService.js';
import { db } from '../db/database.js';

export const authRouter = Router();

// Middleware to extract logged-in user
export const requireAuth = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Otorisasi diperlukan: Token tidak ditemukan' });
  }
  const token = authHeader.slice(7);
  const user = AuthService.authenticateToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Sesi telah kedaluwarsa atau tidak valid' });
  }
  (req as any).user = user;
  (req as any).token = token;
  next();
};

// Middleware for Admin role
export const requireAdmin = (req: Request, res: Response, next: Function) => {
  requireAuth(req, res, () => {
    const user = (req as any).user;
    const role = (user.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'Akses ditolak: Memerlukan hak akses administrator (ADMIN)' });
    }
    next();
  });
};

// Middleware for MM (Market Maker) role
export const requireMM = (req: Request, res: Response, next: Function) => {
  requireAuth(req, res, () => {
    const user = (req as any).user;
    const role = (user.role || '').toUpperCase();
    if (role !== 'MM' && role !== 'ADMIN' && role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'Akses ditolak: Memerlukan hak akses Market Maker (MM)' });
    }
    next();
  });
};

authRouter.post('/register', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });
    }
    const result = AuthService.register(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post('/login', (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });
    }
    const ip = req.ip || '127.0.0.1';
    const result = AuthService.login(email, password, totpCode, ip);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = (req as any).user;
  const kyc = db.kyc.get(user.id);
  res.json({ user, kyc });
});

// Setup 2FA TOTP: Generate Secret & QR uri
authRouter.post('/2fa/generate', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { secret, otpauthUrl } = AuthService.generateTotpSecret();
  // Store secret temporarily until verified
  const dbUser = db.users.get(user.id)!;
  dbUser.totpSecret = secret;
  res.json({ secret, otpauthUrl });
});

// Verify & Activate 2FA TOTP
authRouter.post('/2fa/enable', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { code } = req.body;
  const dbUser = db.users.get(user.id)!;

  if (!dbUser.totpSecret) {
    return res.status(400).json({ error: 'Silakan generate kunci 2FA terlebih dahulu' });
  }

  const isValid = AuthService.verifyTotpCode(dbUser.totpSecret, code);
  if (!isValid) {
    return res.status(400).json({ error: 'Kode TOTP salah atau kedaluwarsa' });
  }

  dbUser.isTotpEnabled = true;
  dbUser.updatedAt = Date.now();
  res.json({ success: true, message: '2FA TOTP berhasil diaktifkan' });
});

// Disable 2FA TOTP
authRouter.post('/2fa/disable', requireAuth, (req, res) => {
  const user = (req as any).user;
  const { code } = req.body;
  const dbUser = db.users.get(user.id)!;

  if (dbUser.isTotpEnabled && dbUser.totpSecret) {
    const isValid = AuthService.verifyTotpCode(dbUser.totpSecret, code);
    if (!isValid) {
      return res.status(400).json({ error: 'Kode TOTP diperlukan untuk menonaktifkan 2FA' });
    }
  }

  dbUser.isTotpEnabled = false;
  dbUser.totpSecret = undefined;
  res.json({ success: true, message: '2FA TOTP berhasil dinonaktifkan' });
});

// List Active Sessions
authRouter.get('/sessions', requireAuth, (req, res) => {
  const user = (req as any).user;
  const currentToken = (req as any).token;

  const userSessions = Array.from(db.sessions.values())
    .filter(s => s.userId === user.id)
    .map(s => ({
      device: s.device,
      ip: s.ip,
      isCurrent: s.token === currentToken,
      expiresAt: s.expiresAt
    }));

  res.json(userSessions);
});

// Logout
authRouter.post('/logout', requireAuth, (req, res) => {
  const token = (req as any).token;
  db.sessions.delete(token);
  res.json({ success: true, message: 'Berhasil keluar' });
});
