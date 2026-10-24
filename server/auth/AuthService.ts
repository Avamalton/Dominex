/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AuthService.ts
 * Multi-layer Authentication, RFC-6238 TOTP 2FA, Anti-Brute-Force, and Session Manager.
 */

import crypto from 'crypto';
import { db } from '../db/database.js';
import { User, UserRole } from '../db/types.js';

// Base32 character set for RFC-3548 / RFC-6238 TOTP
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class AuthService {
  /**
   * RFC 6238 TOTP Secret Generator (Base32 encoded)
   */
  static generateTotpSecret(): { secret: string; otpauthUrl: string } {
    const randomBytes = crypto.randomBytes(20);
    let secret = '';
    for (let i = 0; i < randomBytes.length; i++) {
      secret += BASE32_CHARS[randomBytes[i] % 32];
    }
    const otpauthUrl = `otpauth://totp/DIMONEX:trader?secret=${secret}&issuer=DIMONEX`;
    return { secret, otpauthUrl };
  }

  /**
   * Verify standard RFC 6238 6-digit TOTP code
   */
  static verifyTotpCode(secret: string, code: string, window = 1): boolean {
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) return false;

    // Decode base32
    let bits = '';
    for (let i = 0; i < secret.length; i++) {
      const val = BASE32_CHARS.indexOf(secret.charAt(i).toUpperCase());
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    const key = Buffer.from(bytes);

    const currentTimeStep = Math.floor(Date.now() / 1000 / 30);

    for (let step = currentTimeStep - window; step <= currentTimeStep + window; step++) {
      const stepBuffer = Buffer.alloc(8);
      stepBuffer.writeBigInt64BE(BigInt(step));

      const hmac = crypto.createHmac('sha1', key).update(stepBuffer).digest();
      const offset = hmac[hmac.length - 1] & 0x0f;
      const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, '0');
      if (otp === cleanCode) {
        return true;
      }
    }

    return false;
  }

  /**
   * Register a new user with default role 'user' and pending KYC.
   */
  static register(email: string, password: string): { user: Omit<User, 'passwordHash' | 'passwordSalt'>; token: string } {
    const cleanEmail = email.trim().toLowerCase();
    
    // Check existing
    for (const [_, u] of db.users.entries()) {
      if (u.email === cleanEmail) {
        throw new Error('Email sudah terdaftar. Silakan gunakan email lain atau masuk.');
      }
    }

    if (password.length < 8) {
      throw new Error('Kata sandi harus minimal 8 karakter');
    }

    const salt = db.generateSalt();
    const hash = db.hashPassword(password, salt);
    const userId = crypto.randomUUID();
    const now = Date.now();

    const user: User = {
      id: userId,
      email: cleanEmail,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'user',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now
    };

    db.users.set(user.id, user);

    // Initial default zero accounts
    db.createOrGetAccount(user.id, 'IDR', '0');
    db.createOrGetAccount(user.id, 'BTC', '0');
    db.createOrGetAccount(user.id, 'ETH', '0');
    db.createOrGetAccount(user.id, 'USDT', '0');

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.set(token, {
      userId: user.id,
      token,
      device: 'Web Browser / Chrome',
      ip: '127.0.0.1',
      expiresAt: Date.now() + 7 * 24 * 3600 * 1000 // 7 days
    });
    db.scheduleSave();

    const { passwordHash, passwordSalt, ...safeUser } = user;
    return { user: safeUser, token };
  }

  /**
   * Login with anti-brute force and 2FA TOTP enforcement.
   */
  static login(email: string, password: string, totpCode?: string, ip = '127.0.0.1'): { 
    user?: Omit<User, 'passwordHash' | 'passwordSalt'>; 
    token?: string; 
    requiresTotp?: boolean; 
  } {
    const cleanEmail = email.trim().toLowerCase();
    let targetUser: User | undefined;

    for (const [_, u] of db.users.entries()) {
      if (u.email === cleanEmail) {
        targetUser = u;
        break;
      }
    }

    if (!targetUser) {
      throw new Error('Email atau kata sandi tidak valid');
    }

    const now = Date.now();

    // Check account lockout
    if (targetUser.lockedUntil && targetUser.lockedUntil > now) {
      const waitMinutes = Math.ceil((targetUser.lockedUntil - now) / 60000);
      throw new Error(`Akun terkunci sementara karena percobaan gagal berulang. Coba lagi dalam ${waitMinutes} menit.`);
    }

    // Verify Password
    const computedHash = db.hashPassword(password, targetUser.passwordSalt);
    if (computedHash !== targetUser.passwordHash) {
      targetUser.failedLoginAttempts += 1;
      if (targetUser.failedLoginAttempts >= 5) {
        targetUser.lockedUntil = now + 15 * 60 * 1000; // 15 mins lock
        targetUser.failedLoginAttempts = 0;
        throw new Error('Terlalu banyak percobaan gagal. Akun dibekukan selama 15 menit untuk keamanan.');
      }
      throw new Error('Email atau kata sandi tidak valid');
    }

    // Reset failed counter on successful password
    targetUser.failedLoginAttempts = 0;
    targetUser.lockedUntil = undefined;

    // Check 2FA TOTP
    if (targetUser.isTotpEnabled && targetUser.totpSecret) {
      if (!totpCode) {
        return { requiresTotp: true };
      }
      const isTotpValid = this.verifyTotpCode(targetUser.totpSecret, totpCode);
      if (!isTotpValid) {
        throw new Error('Kode 2FA TOTP tidak valid atau kedaluwarsa.');
      }
    }

    // Issue Session Token
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.set(token, {
      userId: targetUser.id,
      token,
      device: 'Web Client / Dimonex Desktop',
      ip,
      expiresAt: now + 7 * 24 * 3600 * 1000
    });
    db.scheduleSave();

    const { passwordHash, passwordSalt, ...safeUser } = targetUser;
    return { user: safeUser, token };
  }

  /**
   * Validate bearer token and return user
   */
  static authenticateToken(token: string): Omit<User, 'passwordHash' | 'passwordSalt'> | null {
    if (!token) return null;
    const session = db.sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      return null;
    }
    const user = db.users.get(session.userId);
    if (!user || user.status !== 'active') {
      return null;
    }
    const { passwordHash, passwordSalt, ...safeUser } = user;
    return safeUser;
  }
}
