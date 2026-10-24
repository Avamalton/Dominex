/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * database.ts
 * In-memory ACID Transactional Database Store for DIMONEX.
 * Supports thread-safe operations, optimistic locking, indexing, and seed bootstrap.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { 
  User, UserKyc, LedgerAccount, JournalTransaction, LedgerEntry, 
  TradingPair, Order, Trade, FiatTransaction, CryptoTransaction, ApiKey, AuditLog,
  BotInstance, RiskControlsConfig 
} from './types.js';
import { PrecisionMath } from '../ledger/PrecisionMath.js';

export const SYSTEM_TREASURY_ID = 'sys-treasury-0000-0000-000000000000';
export const SYSTEM_FEE_ID = 'sys-fees-0000-0000-000000000000';
export const SYSTEM_HOT_WALLET_ID = 'sys-hotwallet-0000-0000-000000000000';

export const DEFAULT_RISK_CONTROLS: RiskControlsConfig = {
  maxActiveBots: 50,
  maxOpenOrdersPerBot: 100,
  maxOrderSize: '5000000000', // 50 BTC
  maxNotionalExposureIdr: '5000000000000', // 50B IDR
  maxDailyTradingNotionalIdr: '20000000000000', // 200B IDR
  maxPriceDeviationPct: 15, // 15% from last price
  maxOrderSubmissionRatePerMin: 120,
  maxTotalReservedBalancePct: 90,
  maxRetryCount: 5,
  maxRuntimeMinutes: 1440,
  maxConsecutiveErrors: 10,
  maxAllowedSlippagePct: 2.5,
  selfTradePreventionPolicy: 'CANCEL_MAKER',
  isKillSwitchActive: false
};

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STATE_FILE = path.join(DATA_DIR, 'exchange_state.json');

export interface PersistedExchangeState {
  version: number;
  savedAt: number;
  users: [string, User][];
  kyc: [string, UserKyc][];
  ledgerAccounts: [string, LedgerAccount][];
  accountIndex: [string, string][];
  journalTransactions: [string, JournalTransaction][];
  journalIdempotencyIndex: [string, string][];
  ledgerEntries: LedgerEntry[];
  tradingPairs: [string, TradingPair][];
  orders: [string, Order][];
  trades: Trade[];
  fiatTransactions: [string, FiatTransaction][];
  cryptoTransactions: [string, CryptoTransaction][];
  apiKeys: [string, ApiKey][];
  auditLogs: AuditLog[];
  sessions: [string, { userId: string; token: string; device: string; ip: string; expiresAt: number }][];
  botInstances?: [string, BotInstance][];
  riskControls?: RiskControlsConfig;
}

class DatabaseStore {
  users: Map<string, User> = new Map();
  kyc: Map<string, UserKyc> = new Map(); // key: userId
  ledgerAccounts: Map<string, LedgerAccount> = new Map(); // key: accountId
  accountIndex: Map<string, string> = new Map(); // key: `${userId}:${currency}` -> accountId
  journalTransactions: Map<string, JournalTransaction> = new Map();
  journalIdempotencyIndex: Map<string, string> = new Map(); // key: idempotencyKey -> journalId
  ledgerEntries: LedgerEntry[] = [];
  tradingPairs: Map<string, TradingPair> = new Map();
  orders: Map<string, Order> = new Map();
  trades: Trade[] = [];
  fiatTransactions: Map<string, FiatTransaction> = new Map();
  cryptoTransactions: Map<string, CryptoTransaction> = new Map();
  apiKeys: Map<string, ApiKey> = new Map();
  auditLogs: AuditLog[] = [];
  sessions: Map<string, { userId: string; token: string; device: string; ip: string; expiresAt: number }> = new Map();
  botInstances: Map<string, BotInstance> = new Map();
  riskControls: RiskControlsConfig = { ...DEFAULT_RISK_CONTROLS };
  
  private saveTimer: NodeJS.Timeout | null = null;
  private isSaving = false;

  constructor() {
    const loaded = this.loadFromDisk();
    if (!loaded) {
      console.log('[DIMONEX Database] Menginisialisasi data awal (seed bootstrap)...');
      this.seedInitialData();
      this.saveToDisk();
    } else {
      this.ensureTradingPairs();
      this.ensureRequiredAccounts();
      this.cleanExpiredSessions();
    }

    // Register exit handlers to ensure state is flushed to disk
    const onExit = () => {
      this.flushSync();
    };
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
  }

  // Hash password using PBKDF2
  hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  seedInitialData() {
    // 1. Setup Trading Pairs (BTC/IDR, ETH/IDR, USDT/IDR)
    const pairs: TradingPair[] = [
      {
        id: 'BTC-IDR',
        baseCurrency: 'BTC',
        quoteCurrency: 'IDR',
        baseDecimals: 8,
        quoteDecimals: 2,
        minOrderSize: '1000', // 0.00001 BTC
        maxOrderSize: '1000000000', // 10 BTC
        makerFeeBps: 10, // 0.10%
        takerFeeBps: 20, // 0.20%
        isActive: true,
        isHalted: false,
        lastPrice: '145000000000', // Rp 1,450,000,000.00
        high24h: '148000000000',
        low24h: '143500000000',
        volume24h: '2450000000', // 24.5 BTC
        priceChange24h: '+2.85'
      },
      {
        id: 'ETH-IDR',
        baseCurrency: 'ETH',
        quoteCurrency: 'IDR',
        baseDecimals: 8,
        quoteDecimals: 2,
        minOrderSize: '100000', // 0.001 ETH
        maxOrderSize: '5000000000', // 50 ETH
        makerFeeBps: 10,
        takerFeeBps: 20,
        isActive: true,
        isHalted: false,
        lastPrice: '4850000000', // Rp 48,500,000.00
        high24h: '4920000000',
        low24h: '4790000000',
        volume24h: '18500000000', // 185 ETH
        priceChange24h: '+1.42'
      },
      {
        id: 'USDT-IDR',
        baseCurrency: 'USDT',
        quoteCurrency: 'IDR',
        baseDecimals: 6,
        quoteDecimals: 2,
        minOrderSize: '1000000', // 1 USDT
        maxOrderSize: '100000000000', // 100,000 USDT
        makerFeeBps: 10,
        takerFeeBps: 20,
        isActive: true,
        isHalted: false,
        lastPrice: '1645000', // Rp 16,450.00
        high24h: '1650000',
        low24h: '1640000',
        volume24h: '450000000000', // 450,000 USDT
        priceChange24h: '-0.12'
      }
    ];

    pairs.forEach(p => this.tradingPairs.set(p.id, p));

    // 2. Setup System Accounts (Treasury, Fee Collector, Hot Wallets)
    const systemCurrencies = ['IDR', 'BTC', 'ETH', 'USDT'];
    const systemUsers = [
      { id: SYSTEM_TREASURY_ID, name: 'System Treasury' },
      { id: SYSTEM_FEE_ID, name: 'System Fee Collector' },
      { id: SYSTEM_HOT_WALLET_ID, name: 'System Hot Wallet' }
    ];

    for (const sysUser of systemUsers) {
      for (const curr of systemCurrencies) {
        const accId = crypto.randomUUID();
        const initialBalance = sysUser.id === SYSTEM_TREASURY_ID ? '1000000000000000' : '0';
        const account: LedgerAccount = {
          id: accId,
          userId: sysUser.id,
          currency: curr,
          balanceAvailable: initialBalance,
          balanceLocked: '0',
          version: 1,
          updatedAt: Date.now()
        };
        this.ledgerAccounts.set(accId, account);
        this.accountIndex.set(`${sysUser.id}:${curr}`, accId);
      }
    }

    // 3. Seed Default Admin User
    const adminSalt = this.generateSalt();
    const adminUser: User = {
      id: 'usr-admin-0000-0000-000000000001',
      email: 'admin@dimonex.id',
      passwordSalt: adminSalt,
      passwordHash: this.hashPassword('AdminDimonex2026!', adminSalt),
      role: 'ADMIN',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(adminUser.id, adminUser);
    this.kyc.set(adminUser.id, {
      id: crypto.randomUUID(),
      userId: adminUser.id,
      fullName: 'Super Admin DIMONEX',
      nik: '3171012345670001',
      birthDate: '1988-08-17',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now(),
      reviewedAt: Date.now()
    });

    // Give Admin starting balance
    this.createOrGetAccount(adminUser.id, 'IDR', '5000000000000'); // Rp 50,000,000,000.00
    this.createOrGetAccount(adminUser.id, 'BTC', '10000000000');   // 100.0 BTC
    this.createOrGetAccount(adminUser.id, 'ETH', '10000000000');   // 100.0 ETH
    this.createOrGetAccount(adminUser.id, 'USDT', '500000000000'); // 500,000 USDT

    // 4. Seed MM (Market Maker Operator) Account
    const mmSalt = this.generateSalt();
    const mmUser: User = {
      id: 'usr-mm-0000-0000-000000000001',
      email: 'mm@dimonex.id',
      passwordSalt: mmSalt,
      passwordHash: this.hashPassword('MarketMaker2026!', mmSalt),
      role: 'MM',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(mmUser.id, mmUser);
    this.kyc.set(mmUser.id, {
      id: crypto.randomUUID(),
      userId: mmUser.id,
      fullName: 'Market Maker Operator DIMONEX',
      nik: '3172011102900002',
      birthDate: '1990-02-11',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now(),
      reviewedAt: Date.now()
    });
    this.createOrGetAccount(mmUser.id, 'IDR', '5000000000000'); // 50B IDR
    this.createOrGetAccount(mmUser.id, 'BTC', '5000000000');   // 50.0 BTC
    this.createOrGetAccount(mmUser.id, 'ETH', '10000000000');  // 100.0 ETH
    this.createOrGetAccount(mmUser.id, 'USDT', '500000000000'); // 500,000 USDT

    // 5. Seed user1 (Regular Trading User 1)
    const u1Salt = this.generateSalt();
    const user1: User = {
      id: 'usr-user1-0000-0000-000000000001',
      email: 'user1@dimonex.id',
      passwordSalt: u1Salt,
      passwordHash: this.hashPassword('User1Dimonex2026!', u1Salt),
      role: 'USER',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(user1.id, user1);
    this.kyc.set(user1.id, {
      id: crypto.randomUUID(),
      userId: user1.id,
      fullName: 'User Satu Trading',
      nik: '3273012908850001',
      birthDate: '1991-03-15',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now()
    });
    this.createOrGetAccount(user1.id, 'IDR', '1000000000000'); // 10B IDR
    this.createOrGetAccount(user1.id, 'BTC', '1000000000');   // 10.0 BTC
    this.createOrGetAccount(user1.id, 'ETH', '1000000000');   // 10.0 ETH
    this.createOrGetAccount(user1.id, 'USDT', '25000000000'); // 25,000 USDT

    // 6. Seed user2 (Regular Trading User 2)
    const u2Salt = this.generateSalt();
    const user2: User = {
      id: 'usr-user2-0000-0000-000000000002',
      email: 'user2@dimonex.id',
      passwordSalt: u2Salt,
      passwordHash: this.hashPassword('User2Dimonex2026!', u2Salt),
      role: 'USER',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(user2.id, user2);
    this.kyc.set(user2.id, {
      id: crypto.randomUUID(),
      userId: user2.id,
      fullName: 'User Dua Trading',
      nik: '3175026112920002',
      birthDate: '1993-07-20',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now()
    });
    this.createOrGetAccount(user2.id, 'IDR', '500000000000'); // 5B IDR
    this.createOrGetAccount(user2.id, 'BTC', '2000000000');  // 20.0 BTC
    this.createOrGetAccount(user2.id, 'ETH', '500000000');   // 5.0 ETH
    this.createOrGetAccount(user2.id, 'USDT', '10000000000'); // 10,000 USDT

    // 7. Seed Trader Budi & Trader Siti (Aliases for existing test setups)
    const trader1Salt = this.generateSalt();
    const trader1: User = {
      id: 'usr-budi-0000-0000-000000000002',
      email: 'budi@dimonex.id',
      passwordSalt: trader1Salt,
      passwordHash: this.hashPassword('TraderDimonex123!', trader1Salt),
      role: 'USER',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(trader1.id, trader1);
    this.kyc.set(trader1.id, {
      id: crypto.randomUUID(),
      userId: trader1.id,
      fullName: 'Budi Santoso',
      nik: '3273012908850003',
      birthDate: '1985-08-29',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now()
    });

    const trader2Salt = this.generateSalt();
    const trader2: User = {
      id: 'usr-siti-0000-0000-000000000003',
      email: 'siti@dimonex.id',
      passwordSalt: trader2Salt,
      passwordHash: this.hashPassword('TraderDimonex123!', trader2Salt),
      role: 'USER',
      status: 'active',
      isTotpEnabled: false,
      failedLoginAttempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.users.set(trader2.id, trader2);
    this.kyc.set(trader2.id, {
      id: crypto.randomUUID(),
      userId: trader2.id,
      fullName: 'Siti Rahmawati',
      nik: '3175026112920005',
      birthDate: '1992-12-21',
      status: 'approved',
      tierLevel: 2,
      createdAt: Date.now()
    });

    // Starting balances for budi and siti
    this.createOrGetAccount(trader1.id, 'IDR', '1000000000000');
    this.createOrGetAccount(trader1.id, 'BTC', '1000000000');
    this.createOrGetAccount(trader1.id, 'ETH', '1000000000');
    this.createOrGetAccount(trader1.id, 'USDT', '25000000000');

    this.createOrGetAccount(trader2.id, 'IDR', '500000000000');
    this.createOrGetAccount(trader2.id, 'BTC', '2000000000');
    this.createOrGetAccount(trader2.id, 'ETH', '500000000');
    this.createOrGetAccount(trader2.id, 'USDT', '10000000000');

    // Give Trader 1 starting balance: Rp 10,000,000,000 IDR and 10 BTC
    this.createOrGetAccount(trader1.id, 'IDR', '1000000000000'); // Rp 10,000,000,000.00
    this.createOrGetAccount(trader1.id, 'BTC', '1000000000');   // 10.0 BTC
    this.createOrGetAccount(trader1.id, 'ETH', '1000000000');  // 10 ETH
    this.createOrGetAccount(trader1.id, 'USDT', '25000000000'); // 25,000 USDT

    // Give Trader 2 starting balance: Rp 5,000,000,000 IDR and 20.0 BTC
    this.createOrGetAccount(trader2.id, 'IDR', '500000000000'); // Rp 5,000,000,000.00
    this.createOrGetAccount(trader2.id, 'BTC', '2000000000');   // 20.0 BTC
    this.createOrGetAccount(trader2.id, 'ETH', '500000000');   // 5 ETH
    this.createOrGetAccount(trader2.id, 'USDT', '10000000000'); // 10,000 USDT

    // Seed Initial Realistic Order Book depth for BTC-IDR, ETH-IDR, USDT-IDR
    this.seedInitialMarketOrders();
  }

  seedInitialMarketOrders() {
    const btcMid = 145000000000n; // Rp 1,450,000,000.00
    const trader1Id = 'usr-budi-0000-0000-000000000002';
    const trader2Id = 'usr-siti-0000-0000-000000000003';

    // Bids (Buy orders below mid price)
    const bids = [
      { price: btcMid - 25000000n, qty: 35000000n },  // -250k IDR, 0.35 BTC
      { price: btcMid - 50000000n, qty: 50000000n },  // -500k IDR, 0.50 BTC
      { price: btcMid - 100000000n, qty: 85000000n }, // -1M IDR, 0.85 BTC
      { price: btcMid - 180000000n, qty: 120000000n },// -1.8M IDR, 1.2 BTC
      { price: btcMid - 300000000n, qty: 250000000n },// -3M IDR, 2.5 BTC
    ];

    // Asks (Sell orders above mid price)
    const asks = [
      { price: btcMid + 25000000n, qty: 28000000n },  // +250k IDR, 0.28 BTC
      { price: btcMid + 60000000n, qty: 45000000n },  // +600k IDR, 0.45 BTC
      { price: btcMid + 120000000n, qty: 75000000n }, // +1.2M IDR, 0.75 BTC
      { price: btcMid + 220000000n, qty: 150000000n },// +2.2M IDR, 1.50 BTC
      { price: btcMid + 350000000n, qty: 300000000n },// +3.5M IDR, 3.00 BTC
    ];

    let totalBidsLockedIdr = 0n;
    bids.forEach((bid, idx) => {
      const orderId = `seed-btc-bid-${idx + 1}`;
      const lockedIdr = PrecisionMath.calculateQuoteAmount(bid.qty, 8, bid.price);
      totalBidsLockedIdr += lockedIdr;
      this.orders.set(orderId, {
        id: orderId,
        userId: trader1Id,
        pairId: 'BTC-IDR',
        side: 'BUY',
        orderType: 'LIMIT',
        timeInForce: 'GTC',
        price: bid.price.toString(),
        quantity: bid.qty.toString(),
        filledQuantity: '0',
        status: 'NEW',
        lockedAmount: lockedIdr.toString(),
        lockedCurrency: 'IDR',
        createdAt: Date.now() - (10 - idx) * 60000,
        updatedAt: Date.now() - (10 - idx) * 60000
      });
    });

    let totalAsksLockedBtc = 0n;
    asks.forEach((ask, idx) => {
      const orderId = `seed-btc-ask-${idx + 1}`;
      totalAsksLockedBtc += ask.qty;
      this.orders.set(orderId, {
        id: orderId,
        userId: trader2Id,
        pairId: 'BTC-IDR',
        side: 'SELL',
        orderType: 'LIMIT',
        timeInForce: 'GTC',
        price: ask.price.toString(),
        quantity: ask.qty.toString(),
        filledQuantity: '0',
        status: 'NEW',
        lockedAmount: ask.qty.toString(),
        lockedCurrency: 'BTC',
        createdAt: Date.now() - (10 - idx) * 60000,
        updatedAt: Date.now() - (10 - idx) * 60000
      });
    });

    // Update trader1 locked IDR and trader2 locked BTC
    const trader1IdrAcc = this.createOrGetAccount(trader1Id, 'IDR');
    const t1Avail = BigInt(trader1IdrAcc.balanceAvailable);
    trader1IdrAcc.balanceAvailable = (t1Avail - totalBidsLockedIdr).toString();
    trader1IdrAcc.balanceLocked = totalBidsLockedIdr.toString();

    const trader2BtcAcc = this.createOrGetAccount(trader2Id, 'BTC');
    const t2Avail = BigInt(trader2BtcAcc.balanceAvailable);
    trader2BtcAcc.balanceAvailable = (t2Avail - totalAsksLockedBtc).toString();
    trader2BtcAcc.balanceLocked = totalAsksLockedBtc.toString();

    // Seed some initial trade history
    const trade1: Trade = {
      id: crypto.randomUUID(),
      pairId: 'BTC-IDR',
      makerOrderId: 'seed-maker-1',
      takerOrderId: 'seed-taker-1',
      makerUserId: trader1Id,
      takerUserId: trader2Id,
      price: '144950000000',
      quantity: '25000000', // 0.25 BTC
      quoteVolume: '36237500000', // Rp 362,375,000.00
      makerFee: '36237500', // 0.10% = Rp 362,375
      takerFee: '72475000', // 0.20% = Rp 724,750
      takerSide: 'BUY',
      createdAt: Date.now() - 120000
    };
    this.trades.push(trade1);
  }

  createOrGetAccount(userId: string, currency: string, initialBalance = '0'): LedgerAccount {
    const key = `${userId}:${currency}`;
    const existingId = this.accountIndex.get(key);
    if (existingId && this.ledgerAccounts.has(existingId)) {
      return this.ledgerAccounts.get(existingId)!;
    }

    const newId = crypto.randomUUID();
    const account: LedgerAccount = {
      id: newId,
      userId,
      currency,
      balanceAvailable: initialBalance,
      balanceLocked: '0',
      version: 1,
      updatedAt: Date.now()
    };
    this.ledgerAccounts.set(newId, account);
    this.accountIndex.set(key, newId);
    this.scheduleSave();
    return account;
  }

  getAccount(userId: string, currency: string): LedgerAccount | undefined {
    const accountId = this.accountIndex.get(`${userId}:${currency}`);
    if (!accountId) return undefined;
    return this.ledgerAccounts.get(accountId);
  }

  getUserAccounts(userId: string): LedgerAccount[] {
    const result: LedgerAccount[] = [];
    for (const curr of ['IDR', 'BTC', 'ETH', 'USDT']) {
      result.push(this.createOrGetAccount(userId, curr));
    }
    return result;
  }

  public scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveToDisk();
      this.saveTimer = null;
    }, 300);
  }

  public flushSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveToDisk();
  }

  public cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.scheduleSave();
    }
  }

  public ensureTradingPairs() {
    const defaultPairs = [
      { id: 'BTC-IDR', base: 'BTC', quote: 'IDR', baseDec: 8, quoteDec: 2, min: '1000', max: '1000000000', price: '145000000000' },
      { id: 'ETH-IDR', base: 'ETH', quote: 'IDR', baseDec: 8, quoteDec: 2, min: '100000', max: '5000000000', price: '4850000000' },
      { id: 'USDT-IDR', base: 'USDT', quote: 'IDR', baseDec: 6, quoteDec: 2, min: '1000000', max: '100000000000', price: '1645000' }
    ];

    for (const dp of defaultPairs) {
      if (!this.tradingPairs.has(dp.id)) {
        this.tradingPairs.set(dp.id, {
          id: dp.id,
          baseCurrency: dp.base,
          quoteCurrency: dp.quote,
          baseDecimals: dp.baseDec,
          quoteDecimals: dp.quoteDec,
          minOrderSize: dp.min,
          maxOrderSize: dp.max,
          makerFeeBps: 10,
          takerFeeBps: 20,
          isActive: true,
          isHalted: false,
          lastPrice: dp.price,
          high24h: dp.price,
          low24h: dp.price,
          volume24h: '0',
          priceChange24h: '0.00'
        });
      }
    }
  }

  public ensureRequiredAccounts() {
    // 1. Admin
    let admin = Array.from(this.users.values()).find(u => u.email === 'admin@dimonex.id');
    if (!admin) {
      const salt = this.generateSalt();
      admin = {
        id: 'usr-admin-0000-0000-000000000001',
        email: 'admin@dimonex.id',
        passwordSalt: salt,
        passwordHash: this.hashPassword('AdminDimonex2026!', salt),
        role: 'ADMIN',
        status: 'active',
        isTotpEnabled: false,
        failedLoginAttempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.users.set(admin.id, admin);
      this.kyc.set(admin.id, {
        id: crypto.randomUUID(),
        userId: admin.id,
        fullName: 'Super Admin DIMONEX',
        nik: '3171012345670001',
        birthDate: '1988-08-17',
        status: 'approved',
        tierLevel: 2,
        createdAt: Date.now(),
        reviewedAt: Date.now()
      });
    } else {
      admin.role = 'ADMIN';
    }
    this.createOrGetAccount(admin.id, 'IDR', '5000000000000');
    this.createOrGetAccount(admin.id, 'BTC', '10000000000');
    this.createOrGetAccount(admin.id, 'ETH', '10000000000');
    this.createOrGetAccount(admin.id, 'USDT', '500000000000');

    // 2. MM (Market Maker Operator)
    let mm = Array.from(this.users.values()).find(u => u.email === 'mm@dimonex.id');
    if (!mm) {
      const salt = this.generateSalt();
      mm = {
        id: 'usr-mm-0000-0000-000000000001',
        email: 'mm@dimonex.id',
        passwordSalt: salt,
        passwordHash: this.hashPassword('MarketMaker2026!', salt),
        role: 'MM',
        status: 'active',
        isTotpEnabled: false,
        failedLoginAttempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.users.set(mm.id, mm);
      this.kyc.set(mm.id, {
        id: crypto.randomUUID(),
        userId: mm.id,
        fullName: 'Market Maker Operator DIMONEX',
        nik: '3172011102900002',
        birthDate: '1990-02-11',
        status: 'approved',
        tierLevel: 2,
        createdAt: Date.now(),
        reviewedAt: Date.now()
      });
    } else {
      mm.role = 'MM';
    }
    this.createOrGetAccount(mm.id, 'IDR', '5000000000000');
    this.createOrGetAccount(mm.id, 'BTC', '5000000000');
    this.createOrGetAccount(mm.id, 'ETH', '10000000000');
    this.createOrGetAccount(mm.id, 'USDT', '500000000000');

    // 3. user1
    let user1 = Array.from(this.users.values()).find(u => u.email === 'user1@dimonex.id');
    if (!user1) {
      const salt = this.generateSalt();
      user1 = {
        id: 'usr-user1-0000-0000-000000000001',
        email: 'user1@dimonex.id',
        passwordSalt: salt,
        passwordHash: this.hashPassword('User1Dimonex2026!', salt),
        role: 'USER',
        status: 'active',
        isTotpEnabled: false,
        failedLoginAttempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.users.set(user1.id, user1);
      this.kyc.set(user1.id, {
        id: crypto.randomUUID(),
        userId: user1.id,
        fullName: 'User Satu Trading',
        nik: '3273012908850001',
        birthDate: '1991-03-15',
        status: 'approved',
        tierLevel: 2,
        createdAt: Date.now()
      });
    }
    this.createOrGetAccount(user1.id, 'IDR', '1000000000000');
    this.createOrGetAccount(user1.id, 'BTC', '1000000000');
    this.createOrGetAccount(user1.id, 'ETH', '1000000000');
    this.createOrGetAccount(user1.id, 'USDT', '25000000000');

    // 4. user2
    let user2 = Array.from(this.users.values()).find(u => u.email === 'user2@dimonex.id');
    if (!user2) {
      const salt = this.generateSalt();
      user2 = {
        id: 'usr-user2-0000-0000-000000000002',
        email: 'user2@dimonex.id',
        passwordSalt: salt,
        passwordHash: this.hashPassword('User2Dimonex2026!', salt),
        role: 'USER',
        status: 'active',
        isTotpEnabled: false,
        failedLoginAttempts: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.users.set(user2.id, user2);
      this.kyc.set(user2.id, {
        id: crypto.randomUUID(),
        userId: user2.id,
        fullName: 'User Dua Trading',
        nik: '3175026112920002',
        birthDate: '1993-07-20',
        status: 'approved',
        tierLevel: 2,
        createdAt: Date.now()
      });
    }
    this.createOrGetAccount(user2.id, 'IDR', '500000000000');
    this.createOrGetAccount(user2.id, 'BTC', '2000000000');
    this.createOrGetAccount(user2.id, 'ETH', '500000000');
    this.createOrGetAccount(user2.id, 'USDT', '10000000000');
  }

  public saveToDisk(): boolean {
    if (this.isSaving) return false;
    this.isSaving = true;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const state: PersistedExchangeState = {
        version: 1,
        savedAt: Date.now(),
        users: Array.from(this.users.entries()),
        kyc: Array.from(this.kyc.entries()),
        ledgerAccounts: Array.from(this.ledgerAccounts.entries()),
        accountIndex: Array.from(this.accountIndex.entries()),
        journalTransactions: Array.from(this.journalTransactions.entries()),
        journalIdempotencyIndex: Array.from(this.journalIdempotencyIndex.entries()),
        ledgerEntries: this.ledgerEntries,
        tradingPairs: Array.from(this.tradingPairs.entries()),
        orders: Array.from(this.orders.entries()),
        trades: this.trades,
        fiatTransactions: Array.from(this.fiatTransactions.entries()),
        cryptoTransactions: Array.from(this.cryptoTransactions.entries()),
        apiKeys: Array.from(this.apiKeys.entries()),
        auditLogs: this.auditLogs,
        sessions: Array.from(this.sessions.entries()),
        botInstances: Array.from(this.botInstances.entries()),
        riskControls: this.riskControls
      };

      const tempFile = `${STATE_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempFile, STATE_FILE);
      return true;
    } catch (err) {
      console.error('[DIMONEX Database] Gagal menyimpan snapshot ke disk:', err);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return false;
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const data: PersistedExchangeState = JSON.parse(raw);
      if (!data || !Array.isArray(data.users) || !Array.isArray(data.ledgerAccounts)) {
        return false;
      }

      this.users = new Map(data.users);
      this.kyc = new Map(data.kyc || []);
      this.ledgerAccounts = new Map(data.ledgerAccounts);
      this.accountIndex = new Map(data.accountIndex || []);
      this.journalTransactions = new Map(data.journalTransactions || []);
      this.journalIdempotencyIndex = new Map(data.journalIdempotencyIndex || []);
      this.ledgerEntries = data.ledgerEntries || [];
      this.tradingPairs = new Map(data.tradingPairs || []);
      this.orders = new Map(data.orders || []);
      this.trades = data.trades || [];
      this.fiatTransactions = new Map(data.fiatTransactions || []);
      this.cryptoTransactions = new Map(data.cryptoTransactions || []);
      this.apiKeys = new Map(data.apiKeys || []);
      this.auditLogs = data.auditLogs || [];
      this.sessions = new Map(data.sessions || []);
      this.botInstances = new Map(data.botInstances || []);
      if (data.riskControls) {
        this.riskControls = { ...DEFAULT_RISK_CONTROLS, ...data.riskControls };
      }

      console.log(`[DIMONEX Database] Berhasil memuat snapshot disk: ${this.users.size} pengguna, ${this.orders.size} order, ${this.trades.length} transaksi, ${this.sessions.size} sesi login aktif.`);
      return true;
    } catch (err) {
      console.warn('[DIMONEX Database] Snapshot file ditemukan namun tidak valid, memakai seed:', err);
      return false;
    }
  }
}

export const db = new DatabaseStore();
