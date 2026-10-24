/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * wallet.ts
 * Wallet management: balances, Virtual Account IDR deposits/withdrawals,
 * name matching verification with KYC, crypto address generator, and block listener.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from './auth.js';
import { db } from '../db/database.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';
import { LedgerService } from '../ledger/LedgerService.js';
import { FiatTransaction, CryptoTransaction } from '../db/types.js';

export const walletRouter = Router();

// Get User Balances (All currencies: Available vs Locked)
walletRouter.get('/balances', requireAuth, (req, res) => {
  const user = (req as any).user;
  const accounts = db.getUserAccounts(user.id);

  const formattedBalances = accounts.map(acc => {
    const availBig = BigInt(acc.balanceAvailable);
    const lockedBig = BigInt(acc.balanceLocked);
    const totalBig = availBig + lockedBig;

    return {
      currency: acc.currency,
      balanceAvailable: acc.balanceAvailable,
      balanceLocked: acc.balanceLocked,
      balanceTotal: totalBig.toString(),
      displayAvailable: acc.currency === 'IDR' 
        ? PrecisionMath.formatIDRDisplay(availBig)
        : PrecisionMath.formatCryptoDisplay(availBig, acc.currency),
      displayLocked: acc.currency === 'IDR'
        ? PrecisionMath.formatIDRDisplay(lockedBig)
        : PrecisionMath.formatCryptoDisplay(lockedBig, acc.currency),
      displayTotal: acc.currency === 'IDR'
        ? PrecisionMath.formatIDRDisplay(totalBig)
        : PrecisionMath.formatCryptoDisplay(totalBig, acc.currency)
    };
  });

  res.json(formattedBalances);
});

// Generate Virtual Account for IDR Deposit
walletRouter.post('/idr/deposit-va', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { bankCode, amount } = req.body; // amount in plain IDR (e.g. "10000000")

    if (!bankCode || !amount) {
      return res.status(400).json({ error: 'Bank dan nominal deposit wajib diisi' });
    }

    const prefixes: Record<string, string> = {
      BCA: '88001',
      MANDIRI: '89001',
      BRI: '80001'
    };
    const prefix = prefixes[bankCode.toUpperCase()] || '88801';
    // Deterministic VA per user
    const userSuffix = user.id.replace(/\D/g, '').slice(0, 10).padEnd(10, '7');
    const vaNumber = `${prefix}${userSuffix}`;

    const amountUnits = PrecisionMath.parseToUnits(amount, 2);

    res.json({
      vaNumber,
      bankName: bankCode.toUpperCase(),
      amount: amountUnits.toString(),
      formattedAmount: PrecisionMath.formatIDRDisplay(amountUnits),
      instructions: [
        `1. Buka aplikasi m-Banking ${bankCode.toUpperCase()}`,
        '2. Pilih menu Transfer > Virtual Account',
        `3. Masukkan nomor Virtual Account: ${vaNumber}`,
        `4. Pastikan nama penerima adalah DIMONEX - ${user.email}`,
        `5. Masukkan nominal tepat: ${PrecisionMath.formatIDRDisplay(amountUnits)}`,
        '6. Konfirmasi pembayaran'
      ]
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Simulate Payment Gateway Callback / Instant VA Deposit Confirmation
walletRouter.post('/idr/simulate-deposit-payment', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { bankCode, amount } = req.body;

    const amountUnits = PrecisionMath.parseToUnits(amount, 2);
    if (amountUnits <= 0n) {
      return res.status(400).json({ error: 'Nominal deposit harus lebih dari 0' });
    }

    const txId = crypto.randomUUID();
    const idempotencyKey = `dep-idr-${txId}`;

    // Execute atomic deposit in Ledger
    LedgerService.deposit(user.id, 'IDR', amountUnits, txId, idempotencyKey);

    const fiatTx: FiatTransaction = {
      id: txId,
      userId: user.id,
      type: 'DEPOSIT',
      method: `${bankCode.toUpperCase()}_VA` as any,
      amount: amountUnits.toString(),
      status: 'COMPLETED',
      accountNumber: `VA-${bankCode}-${user.id.slice(0, 6)}`,
      accountHolderName: user.email,
      idempotencyKey,
      createdAt: Date.now()
    };
    db.fiatTransactions.set(fiatTx.id, fiatTx);

    res.json({
      success: true,
      message: `Deposit ${PrecisionMath.formatIDRDisplay(amountUnits)} via ${bankCode} berhasil masuk ke saldo IDR Anda!`,
      transaction: fiatTx
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// IDR Withdrawal Request with KYC Name Matching Verification
walletRouter.post('/idr/withdraw', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { bankName, accountNumber, accountHolderName, amount } = req.body;

    if (!bankName || !accountNumber || !accountHolderName || !amount) {
      return res.status(400).json({ error: 'Seluruh data penarikan wajib diisi lengkap' });
    }

    // 1. Check KYC verification
    const kyc = db.kyc.get(user.id);
    if (!kyc || kyc.status !== 'approved') {
      return res.status(403).json({ error: 'Penarikan dana memerlukan akun KYC yang telah terverifikasi' });
    }

    // 2. Security Check: Bank account holder name MUST match KYC Full Name
    const cleanHolder = accountHolderName.trim().toLowerCase();
    const cleanKyc = kyc.fullName.trim().toLowerCase();
    if (cleanHolder !== cleanKyc) {
      return res.status(400).json({
        error: `Nama pemilik rekening bank (${accountHolderName}) TIDAK COCOK dengan nama KYC Anda (${kyc.fullName}). Penarikan ke rekening pihak ketiga dilarang keras demi kepatuhan regulasi.`
      });
    }

    const amountUnits = PrecisionMath.parseToUnits(amount, 2);
    const userAcc = db.createOrGetAccount(user.id, 'IDR');
    const avail = BigInt(userAcc.balanceAvailable);

    if (avail < amountUnits) {
      return res.status(400).json({ error: 'Saldo IDR yang tersedia tidak mencukupi' });
    }

    // Lock funds for withdrawal
    LedgerService.lockBalance(user.id, 'IDR', amountUnits);

    const txId = crypto.randomUUID();
    const idempotencyKey = `wd-idr-${txId}`;

    // Large withdrawals (> IDR 10,000,000) go to PENDING approval queue
    const isLarge = amountUnits > 1000000000n; // > Rp 10,000,000.00
    const status = isLarge ? 'PENDING' : 'COMPLETED';

    if (!isLarge) {
      // Auto-settle small withdrawal in ledger
      const locked = BigInt(userAcc.balanceLocked);
      userAcc.balanceLocked = (locked - amountUnits).toString();
      userAcc.version += 1;
      userAcc.updatedAt = Date.now();
    }

    const fiatTx: FiatTransaction = {
      id: txId,
      userId: user.id,
      type: 'WITHDRAW',
      method: 'BANK_TRANSFER',
      amount: amountUnits.toString(),
      status,
      accountNumber,
      accountHolderName: kyc.fullName,
      idempotencyKey,
      createdAt: Date.now()
    };
    db.fiatTransactions.set(fiatTx.id, fiatTx);

    res.json({
      success: true,
      message: isLarge 
        ? 'Permintaan penarikan nominal besar telah masuk antrean persetujuan tim kepatuhan DIMONEX'
        : 'Penarikan IDR berhasil diproses ke rekening bank Anda',
      transaction: fiatTx
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Generate / Get Crypto Deposit Address
walletRouter.get('/crypto/deposit-address/:currency', requireAuth, (req, res) => {
  const user = (req as any).user;
  const currency = req.params.currency.toUpperCase();

  const userHash = crypto.createHash('sha256').update(user.id + currency).digest('hex');

  let address = '';
  let chain = '';
  if (currency === 'BTC') {
    address = `bc1q${userHash.slice(0, 38)}`;
    chain = 'Bitcoin Native SegWit';
  } else if (currency === 'ETH') {
    address = `0x${userHash.slice(0, 40)}`;
    chain = 'Ethereum (ERC-20)';
  } else if (currency === 'USDT') {
    address = `T${userHash.slice(0, 33).toUpperCase()}`;
    chain = 'TRON (TRC-20)';
  } else {
    return res.status(400).json({ error: 'Aset kripto tidak didukung' });
  }

  res.json({
    currency,
    chain,
    address,
    minDeposit: currency === 'BTC' ? '0.0001 BTC' : currency === 'ETH' ? '0.005 ETH' : '10 USDT',
    confirmationsRequired: currency === 'BTC' ? 3 : currency === 'ETH' ? 12 : 20
  });
});

// Simulate Incoming Blockchain Deposit
walletRouter.post('/crypto/simulate-deposit-block', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { currency, amount } = req.body;

    const currConfig = { BTC: 8, ETH: 8, USDT: 6 }[currency.toUpperCase() as 'BTC' | 'ETH' | 'USDT'];
    if (!currConfig) return res.status(400).json({ error: 'Mata uang kripto tidak valid' });

    const amountUnits = PrecisionMath.parseToUnits(amount, currConfig);
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const txId = crypto.randomUUID();

    // Deposit to user ledger
    LedgerService.deposit(user.id, currency.toUpperCase(), amountUnits, txId, `dep-crypto-${txId}`);

    const cryptoTx: CryptoTransaction = {
      id: txId,
      userId: user.id,
      type: 'DEPOSIT',
      currency: currency.toUpperCase(),
      chain: currency === 'BTC' ? 'Bitcoin' : currency === 'ETH' ? 'Ethereum' : 'Tron',
      address: `addr-${user.id.slice(0, 8)}`,
      amount: amountUnits.toString(),
      txHash,
      status: 'COMPLETED',
      confirmations: 12,
      requiredConfirmations: 12,
      createdAt: Date.now()
    };
    db.cryptoTransactions.set(cryptoTx.id, cryptoTx);

    res.json({
      success: true,
      message: `Deposit ${amount} ${currency} berhasil dikonfirmasi di blockchain (12/12 blok)!`,
      transaction: cryptoTx
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Crypto Withdrawal
walletRouter.post('/crypto/withdraw', requireAuth, (req, res) => {
  try {
    const user = (req as any).user;
    const { currency, address, amount } = req.body;

    const currConfig = { BTC: 8, ETH: 8, USDT: 6 }[currency.toUpperCase() as 'BTC' | 'ETH' | 'USDT'];
    if (!currConfig) return res.status(400).json({ error: 'Mata uang kripto tidak valid' });

    const amountUnits = PrecisionMath.parseToUnits(amount, currConfig);
    const userAcc = db.createOrGetAccount(user.id, currency.toUpperCase());
    const avail = BigInt(userAcc.balanceAvailable);

    if (avail < amountUnits) {
      return res.status(400).json({ error: `Saldo ${currency} tidak mencukupi` });
    }

    // Lock funds
    LedgerService.lockBalance(user.id, currency.toUpperCase(), amountUnits);

    const txId = crypto.randomUUID();
    const cryptoTx: CryptoTransaction = {
      id: txId,
      userId: user.id,
      type: 'WITHDRAW',
      currency: currency.toUpperCase(),
      chain: currency === 'BTC' ? 'Bitcoin' : currency === 'ETH' ? 'Ethereum' : 'Tron',
      address,
      amount: amountUnits.toString(),
      txHash: '0x' + crypto.randomBytes(32).toString('hex'),
      status: 'PENDING', // Cold wallet approval queue
      confirmations: 0,
      requiredConfirmations: 12,
      createdAt: Date.now()
    };
    db.cryptoTransactions.set(cryptoTx.id, cryptoTx);

    res.json({
      success: true,
      message: `Permintaan penarikan ${amount} ${currency} telah masuk antrean penarikan cold wallet`,
      transaction: cryptoTx
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
