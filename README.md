# DIMONEX — Spot Crypto Exchange (Quote Currency IDR)

**DIMONEX** (*Dimension + Money + Exchange*) adalah platform bursa spot aset kripto teregulasi lokal dengan quote currency Rupiah (IDR). Sistem mengutamakan **kebenaran mutasi saldo (financial ledger correctness)** di atas segalanya, didukung *single-threaded in-memory matching engine* per pair dengan *event sourcing log*, autentikasi berlapis, KYC bertingkat, serta antarmuka trading modern berdensitas tinggi.

***

## Prinsip Rekayasa Inti (Non-Negotiable)

1. **Zero-Float Math**: Seluruh perhitungan finansial, saldo akun, harga, volume, dan fee menggunakan integer satuan terkecil (BigInt):
   - IDR: dalam sen ($10^{-2}$, 100 sen = 1 IDR)
   - BTC: dalam Satoshis ($10^{-8}$, 100,000,000 sats = 1 BTC)
   - ETH: dalam 8 desimal ($10^{-8}$)
   - USDT: dalam micro-units ($10^{-6}$)
2. **Double-Entry Immutable Ledger**:
   - $\sum \text{Debit} \equiv \sum \text{Credit}$ untuk setiap transaksi jurnal.
   - Saldo Tersedia (*Available*) + Saldo Terkunci (*Locked*) = Total Saldo.
   - Tidak ada saldo negatif (*no overdraft*), tidak ada pembatalan mutasi tanpa jurnal koreksi berpasangan.
3. **Deterministic Single-Threaded Matching Engine**:
   - Price-time priority (FIFO di level harga yang sama).
   - Order types: Limit & Market.
   - Time-In-Force: GTC (*Good-Til-Cancelled*) & IOC (*Immediate-Or-Cancel*).
   - Self-Trade Prevention (STP: Cancel Maker) untuk mencegah wash trading.
   - Append-Only Event Sourcing Log (dapat di-replay 100% konsisten).

***

## Arsitektur Folder

```
dimonex/
├── backend-go/                      # Implementasi Go produksi
│   ├── cmd/
│   │   └── engine/main.go           # Daemon matching engine
│   ├── internal/domain/
│   │   └── orderbook.go             # Order book BigInt Go
│   └── go.mod
├── deployments/                     # Docker & PostgreSQL Migrations
│   ├── docker-compose.yml           # Postgres, Redis, NATS, Engine
│   └── migrations/                  # 001_init_users_kyc.sql ... 004_wallets_api_keys_audit.sql
├── openapi/                         # Spesifikasi OpenAPI 3.1
│   └── dimonex-api.yaml
├── server/                          # Live full-stack execution engine (Node/Express/TS)
│   ├── engine/                      # In-memory OrderBook & MatchingEngine
│   ├── ledger/                      # Double-Entry Ledger & PrecisionMath
│   ├── db/                          # ACID in-memory transactional database
│   ├── routes/                      # Auth, KYC, Trading, Wallet, API Keys, Admin, Risk, Metrics
│   ├── websocket/                   # Real-time L2 depth & trade streaming
│   └── tests/                       # Property-based tests & performance benchmark
├── src/                             # Frontend UI (React 19 + Tailwind + Lightweight Charts)
│   ├── components/                  # Chart, OrderBook, Trades, Form, Wallet, KYC, Security, Admin
│   ├── types/                       # Shared domain types & kamus bilingual (ID / EN)
│   └── App.tsx                      # Master application view router
├── RUNBOOK_INSIDEN.md               # SOP tanggap darurat dan audit keuangan
└── server.ts                        # Dev server entrypoint (port 3000)
```

***

## Menjalankan Suite Pengujian Finansial

Untuk memvalidasi integritas matematis zero-float, double-entry ledger, matching engine, dan benchmark 1.000 order/detik:

```bash
npx tsx server/tests/run_tests.ts
```

Output:
```
====================================================
   DIMONEX EXCHANGE TEST SUITE: FINANCIAL CORE
====================================================
  ✓ PASS: Parse 0.15000000 BTC to 15,000,000 sats
  ✓ PASS: Parse Rp 1,450,000,000.50 to 145000000050 sen
  ✓ PASS: 1.0 BTC @ 1,450,000,000 IDR yields exact 1,450,000,000.00 IDR
  ✓ PASS: Maker fee 0.10% on 1.45B IDR is exactly Rp 1,450,000.00
  ✓ PASS: Invariant holds after User A deposit
  ✓ PASS: Invariant holds after User B deposit
  ✓ PASS: Locking IDR correctly adjusts available and locked without changing total
  ✓ PASS: Unlocking returns funds to available
  ✓ PASS: Limit Buy is placed in order book when book is empty
  ✓ PASS: Orders matched and trade generated
  ✓ PASS: Full match quantity 1.0 ETH
  ✓ PASS: Taker order filled
  ✓ PASS: STP cancels maker order and prevents wash trading between same user
  ✓ PASS: Unmatched IOC order is immediately cancelled
  ✓ PASS: IOC immediately unlocks all pre-locked funds on cancellation
  ✓ PASS: Target 1,000 orders/sec met (Achieved: ~27,000 orders/sec)
  ✓ PASS: Final global ledger balance invariants 100% verified
====================================================
RESULT: 17 Passed, 0 Failed
====================================================
```

***

## Akun Demo Pengujian Cepat

- **Trader 1**: `budi@dimonex.id` / `TraderDimonex123!` (Saldo: Rp 10.000.000.000 IDR & 10 BTC)
- **Trader 2**: `siti@dimonex.id` / `TraderDimonex123!` (Saldo: Rp 5.000.000.000 IDR & 20 BTC)
- **Super Admin**: `admin@dimonex.id` / `AdminDimonex2026!` (Akses penuh ke Admin Console & Risk Monitor)
