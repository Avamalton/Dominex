# DIMONEX — Spot Crypto Exchange (Quote Currency IDR)

Platform bursa spot aset kripto teregulasi lokal dengan quote currency Rupiah (IDR). Sistem mengutamakan kebenaran mutasi saldo (*financial ledger correctness*) di atas segalanya, didukung *single-threaded in-memory matching engine* per pair dengan *event sourcing log*, autentikasi berlapis, KYC bertingkat, serta antarmuka trading modern berdensitas tinggi.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan arsitektur utama telah diselaraskan dengan spesifikasi:
> - **Runtime Environment**: Full-stack engine Node.js/TypeScript live di dev server (agar platform dapat langsung ditradingkan, diuji unit/integrasi, dan diverifikasi di browser) dilengkapi direktori spesifikasi Go (`backend-go/`), skema PostgreSQL/migrasi versioned, Docker Compose, dan OpenAPI spec.
> - **Fee Structure**: 0.10% Maker / 0.20% Taker untuk BTC/IDR, ETH/IDR, dan USDT/IDR (dapat dikonfigurasi secara dinamis via Admin Panel).
> - **Deposit & Integrasi**: Virtual Account payment gateway simulation adapter (BCA, Mandiri, BRI) + on-chain deposit block listener simulator dengan konfirmasi N-blok; hot/cold wallet separation interface tanpa menyimpan private key di DB aplikasi.
> - **Precision Math**: Tidak ada tipe data `float` atau `number` IEEE-754 pada kalkulasi saldo, fee, order, atau matching. Seluruh representasi moneter menggunakan integer fixed-point satuan terkecil (IDR dalam sen/rupiah integer, BTC dalam Satoshis $10^{-8}$, ETH dalam Wei $10^{-18}$ atau Gwei $10^{-9}$, USDT dalam micro-units $10^{-6}$) dengan library BigInt/Decimal immutable.

- **Confirmed Decision 1**: Engine live terintegrasi penuh di dev server (server.ts + client React 19/Tailwind) dengan kode Go backend, Docker Compose, dan OpenAPI di root project.
- **Confirmed Decision 2**: Zero float rule di seluruh lapisan database, matching engine, ledger, dan API request/response format.
- **Confirmed Decision 3**: Double-entry ledger immutable dengan verifikasi invarian balance: $\sum \text{Debit} = \sum \text{Credit}$ dan $\text{Saldo Tersedia} + \text{Saldo Terkunci} = \text{Total Saldo}$.

***

## 1. Overview & Core Concept

- **Nama Platform**: **DIMONEX** (*Dimension + Money + Exchange*).
- **Core Purpose**: Bursa kripto spot lokal ramah kepatuhan (Bappebti/OJK compliant posture), aman, dan deterministik dengan quote currency IDR.
- **Target Persona**:
  1. *Retail Traders*: Pengguna lokal Indonesia yang menukar Rupiah ke BTC, ETH, USDT dengan biaya transparan, eksekusi cepat, dan chart interaktif.
  2. *API & Algorithmic Traders*: Trader yang membutuhkan API Key terautentikasi HMAC-SHA256, rate limiting, dan WebSocket low-latency.
  3. *Exchange Operator & Compliance Officer*: Tim admin yang memvalidasi KYC KTP/selfie, menyetujui penarikan (withdrawal approval queue), memantau transaksi mencurigakan, dan mengontrol halt trading per-pair.

***

## 2. User Experience & Visual Design

Mengikuti panduan domain **SaaS & Financial Trading Console**:
- **Aesthetic Direction**: High-density dark fintech canvas (`#0B0E14` obsidian base, `#141A23` structural surface, `#1E2633` hairline borders).
- **Color Palette & Discipline**:
  - Dominant Neutral: 60% deep slate obsidian canvas (`#0B0E14`).
  - Structural Surface: 30% border hairline & cards (`#141A23` & `#1F2937`).
  - Accent Budget: 10% strictly reserved for order actions:
    - Hijau Beli / Bid / Up-tick: `#16A34A` (Emerald / Forest green)
    - Merah Jual / Ask / Down-tick: `#DC2626` (Crimson red)
    - Brand Primary: `#3B82F6` (Electric Blue Dimonex)
- **Typographic Hierarchy**:
  - Navigation & Headers: `Plus Jakarta Sans` clean title-case.
  - Financial Data & Order Book: Monospace tabular numerals (`JetBrains Mono` / `font-mono tabular-nums`) untuk memastikan digit harga dan volume selalu sejajar vertikal tanpa layout jitter.
- **Top Bar Contract**:
  - Zone 1: Wordmark tunggal **DIMONEX**
  - Zone 2: Navigasi ringkas (Pasar, Trading, Wallet, Riwayat, Admin Console)
  - Zone 3: Akun pengguna / Login status & Switcher Bahasa (ID / EN)
- **Komponen Halaman Trading**:
  1. **Ticker Bar**: Harga terakhir, perubahan 24 jam, volume 24 jam, status pasar.
  2. **Interactive Candlestick Chart**: TradingView Lightweight Chart canvas dengan interval 1m, 5m, 15m, 1h, 1D, visualisasi MA/EMA.
  3. **Real-time Order Book Depth**: Visualisasi bids (hijau) dan asks (merah) dengan depth meter visual akumulatif dan spread real-time.
  4. **Recent Market Trades**: Feed transaksi yang cocok secara live.
  5. **Order Placement Form**: Tab Beli/Jual, Limit vs Market, TIF (GTC / IOC), persentase saldo (25%, 50%, 75%, 100%), estimasi fee, dan validasi saldo instan.
  6. **Open Orders & Trade History**: Pembatalan order instan, status partial fill, detail fee yang dipotong.

***

## 3. Key Product Decisions & Trade-Offs

### A. Double-Entry Immutable Ledger
- **Pendekatan**: Setiap pergerakan dana (deposit, lock saldo saat create order, trade settlement, unlock cancel order, fee collection, withdraw) dicatat sebagai pasangan entri `Debit` dan `Credit` di tabel `ledger_entries` dengan `journal_transactions` berafiliasi.
- **Rasional**: Mencegah saldo negatif (*no overdraft*), mencegah double-spend, serta memungkinkan pembuktian audit independen (Proof-of-Reserves).

### B. Single-Threaded In-Memory Matching Engine per Pair dengan Event Sourcing
- **Pendekatan**: Setiap order book pair (`BTC-IDR`, `ETH-IDR`, `USDT-IDR`) dijalankan oleh worker tunggal in-memory yang mengonsumsi antrean order secara sekuensial (FIFO price-time priority).
- **Rasional**: Meniadakan kebutuhan mutex locking yang berat dan mencegah *race condition* atau *deadlock* saat dua order berlawanan masuk bersamaan.
- **Event Log**: Setiap event (`ORDER_PLACED`, `ORDER_CANCELLED`, `ORDER_MATCHED`) dicatat append-only ke WAL / event stream sehingga state in-memory dapat dibangun ulang (*replay*) 100% identik dari awal atau dari snapshot terakhir jika terjadi restart.

### C. Self-Trade Prevention (STP)
- **Pendekatan**: Jika taker order bertemu dengan maker order milik `account_id` yang sama pada harga yang cocok, engine menolak eksekusi (Cancel Maker / Cancel Taker mode) untuk mencegah wash trading manipulatif.

### D. Separation of Wallets: Hot & Cold Interface
- **Pendekatan**: Database tidak pernah menyimpan private key blockchain. Sistem hanya menyimpan alamat publik deposit pengguna (`public_key` / address) dan antrean penarikan (*withdrawal requests*). Penarikan nominal besar memerlukan persetujuan admin manual (multi-sig cold wallet queue).

***

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DIMONEX CLIENT (Browser / Mobile)                     │
│   React 19 + TypeScript + Tailwind + Lightweight Charts + WebSocket Client  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WSS
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    API GATEWAY & SECURITY LAYER                             │
│  - JWT + Refresh Token Rotation      - HMAC-SHA256 Public API Signing       │
│  - IP Whitelist & Rate Limiter       - Anti-Brute-Force & Session Manager   │
└───────────────────┬───────────────────────────────────┬─────────────────────┘
                    │                                   │
┌───────────────────▼─────────────────┐   ┌─────────────▼─────────────────────┐
│         STATELESS REST API          │   │      WEBSOCKET DISPATCHER         │
│  - Auth & 2FA TOTP (Speakeasy)      │   │  - Order Book Depth L2 (100ms)    │
│  - KYC Review (KTP/Selfie OCR mock) │   │  - Live Trade Stream              │
│  - IDR Payment Gateway Adapter      │   │  - Ticker & 24h Stats             │
│  - Admin Operations & Risk Monitor  │   │  - Real-time User Order Updates   │
└───────────────────┬─────────────────┘   └─────────────▲─────────────────────┘
                    │                                   │
┌───────────────────▼───────────────────────────────────┴─────────────────────┐
│                MATCHING ENGINE ROUTER (Single-Thread per Pair)              │
│                                                                             │
│   ┌────────────────────────┐  ┌────────────────────────┐  ┌─────────────┐   │
│   │   BTC/IDR Order Book   │  │   ETH/IDR Order Book   │  │  USDT/IDR   │   │
│   │ Price-Time Priority    │  │ Price-Time Priority    │  │ Order Book  │   │
│   │ GTC / IOC / STP Engine │  │ GTC / IOC / STP Engine │  │ In-Memory   │   │
│   └───────────┬────────────┘  └───────────┬────────────┘  └──────┬──────┘   │
│               │                           │                      │          │
│               └───────────────────────────┼──────────────────────┘          │
│                                           │ Matches / Events                │
└───────────────────────────────────────────┼─────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────────────────┐
│                    DOUBLE-ENTRY ATOMIC LEDGER ENGINE                        │
│                                                                             │
│  - Idempotency Key Enforcer          - Invariant: Sum(Debit) == Sum(Credit) │
│  - User Available & Locked Balances  - Maker/Taker Fee Calculation Engine   │
│  - System Hot Wallet / VA Ledger     - Append-Only Event Log Journal        │
└───────────────────────────────────────────┬─────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────────────────┐
│                       PERSISTENCE & OBSERVABILITY                           │
│  - SQLite (Dev/Test Live Engine) & PostgreSQL Versioned Migrations (001-006)│
│  - Structured JSON Logging + Prometheus Metrics (/metrics)                  │
│  - Go Backend Spec & Docker Compose (backend-go/, postgres, redis, nats)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema (Relational & Normalized)

1. **`users`**
   - `id`: UUID (PK)
   - `email`: VARCHAR(255) UNIQUE NOT NULL
   - `password_hash`: VARCHAR(255) NOT NULL (Argon2id/Bcrypt)
   - `totp_secret`: VARCHAR(255) NULLABLE (Encrypted)
   - `is_totp_enabled`: BOOLEAN DEFAULT FALSE
   - `role`: ENUM ('user', 'compliance', 'admin', 'superadmin')
   - `status`: ENUM ('active', 'frozen', 'suspended')
   - `failed_login_attempts`: INT DEFAULT 0
   - `locked_until`: TIMESTAMP NULLABLE
   - `created_at`, `updated_at`: TIMESTAMP

2. **`user_kyc`**
   - `id`: UUID (PK)
   - `user_id`: UUID (FK -> users.id) UNIQUE
   - `full_name`: VARCHAR(255) NOT NULL (Nama sesuai KTP)
   - `nik`: VARCHAR(64) NOT NULL (Nomor KTP/Passport terenkripsi)
   - `date_of_birth`: DATE
   - `id_card_url`: TEXT
   - `selfie_url`: TEXT
   - `status`: ENUM ('unverified', 'pending', 'approved', 'rejected')
   - `rejection_reason`: TEXT
   - `tier_level`: INT DEFAULT 1 (Tier 1: Max IDR 25M/hari, Tier 2: Max IDR 500M/hari)
   - `reviewed_by`: UUID NULLABLE
   - `reviewed_at`: TIMESTAMP NULLABLE

3. **`ledger_accounts`**
   - `id`: UUID (PK)
   - `user_id`: UUID (FK -> users.id, or SYSTEM_TREASURY_ID, SYSTEM_FEE_ID)
   - `currency`: VARCHAR(16) NOT NULL ('IDR', 'BTC', 'ETH', 'USDT')
   - `balance_available`: VARCHAR(64) NOT NULL (BigInt string representation)
   - `balance_locked`: VARCHAR(64) NOT NULL (BigInt string representation)
   - `version`: BIGINT NOT NULL DEFAULT 0 (Optimistic concurrency control)
   - `updated_at`: TIMESTAMP NOT NULL
   - *Constraint*: `UNIQUE(user_id, currency)`

4. **`journal_transactions`**
   - `id`: UUID (PK)
   - `idempotency_key`: VARCHAR(128) UNIQUE NOT NULL
   - `transaction_type`: ENUM ('DEPOSIT', 'WITHDRAW', 'ORDER_LOCK', 'ORDER_UNLOCK', 'TRADE_SETTLEMENT', 'FEE_COLLECTION')
   - `reference_id`: VARCHAR(128) NOT NULL (Order ID, Trade ID, atau Deposit TXID)
   - `description`: TEXT
   - `created_at`: TIMESTAMP NOT NULL

5. **`ledger_entries`**
   - `id`: UUID (PK)
   - `journal_id`: UUID (FK -> journal_transactions.id)
   - `account_id`: UUID (FK -> ledger_accounts.id)
   - `entry_type`: ENUM ('DEBIT', 'CREDIT')
   - `amount`: VARCHAR(64) NOT NULL (BigInt string)
   - `balance_after`: VARCHAR(64) NOT NULL
   - `created_at`: TIMESTAMP NOT NULL

6. **`trading_pairs`**
   - `id`: VARCHAR(32) (PK, e.g. 'BTC-IDR', 'ETH-IDR', 'USDT-IDR')
   - `base_currency`: VARCHAR(16) NOT NULL ('BTC', 'ETH', 'USDT')
   - `quote_currency`: VARCHAR(16) NOT NULL ('IDR')
   - `base_precision`: INT NOT NULL (BTC: 8, ETH: 8, USDT: 6)
   - `quote_precision`: INT NOT NULL (IDR: 0 atau 2)
   - `min_order_size`: VARCHAR(64) NOT NULL
   - `max_order_size`: VARCHAR(64) NOT NULL
   - `maker_fee_bps`: INT NOT NULL DEFAULT 10 (10 bps = 0.10%)
   - `taker_fee_bps`: INT NOT NULL DEFAULT 20 (20 bps = 0.20%)
   - `is_active`: BOOLEAN DEFAULT TRUE
   - `is_halted`: BOOLEAN DEFAULT FALSE

7. **`orders`**
   - `id`: UUID (PK)
   - `user_id`: UUID (FK -> users.id)
   - `pair_id`: VARCHAR(32) (FK -> trading_pairs.id)
   - `side`: ENUM ('BUY', 'SELL')
   - `order_type`: ENUM ('LIMIT', 'MARKET')
   - `time_in_force`: ENUM ('GTC', 'IOC')
   - `price`: VARCHAR(64) NOT NULL (BigInt quote units; 0 jika MARKET)
   - `quantity`: VARCHAR(64) NOT NULL (BigInt base units)
   - `filled_quantity`: VARCHAR(64) NOT NULL DEFAULT '0'
   - `status`: ENUM ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED')
   - `client_order_id`: VARCHAR(128) NULLABLE
   - `created_at`, `updated_at`: TIMESTAMP

8. **`trades`**
   - `id`: UUID (PK)
   - `pair_id`: VARCHAR(32)
   - `maker_order_id`: UUID (FK -> orders.id)
   - `taker_order_id`: UUID (FK -> orders.id)
   - `maker_user_id`: UUID
   - `taker_user_id`: UUID
   - `price`: VARCHAR(64) NOT NULL
   - `quantity`: VARCHAR(64) NOT NULL
   - `quote_volume`: VARCHAR(64) NOT NULL
   - `maker_fee`: VARCHAR(64) NOT NULL
   - `taker_fee`: VARCHAR(64) NOT NULL
   - `created_at`: TIMESTAMP NOT NULL

9. **`fiat_deposits_withdrawals`**
   - `id`: UUID (PK)
   - `user_id`: UUID
   - `type`: ENUM ('DEPOSIT', 'WITHDRAW')
   - `method`: ENUM ('BCA_VA', 'MANDIRI_VA', 'BRI_VA', 'BANK_TRANSFER')
   - `amount`: VARCHAR(64) NOT NULL (IDR)
   - `status`: ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')
   - `account_number`: VARCHAR(64) NOT NULL
   - `account_holder_name`: VARCHAR(255) NOT NULL (Wajib match KYC)
   - `idempotency_key`: VARCHAR(128) UNIQUE
   - `created_at`: TIMESTAMP

10. **`crypto_addresses_and_transactions`**
    - Deposit address unik per user/chain
    - Withdrawal request queue dengan approval gate

11. **`api_keys`**
    - `id`: UUID (PK)
    - `user_id`: UUID
    - `key_id`: VARCHAR(64) UNIQUE NOT NULL
    - `secret_hash`: VARCHAR(255) NOT NULL
    - `permissions`: JSON (e.g. `["read", "trade"]`)
    - `ip_whitelist`: TEXT NULLABLE (CIDR / IP array)
    - `created_at`: TIMESTAMP

12. **`audit_logs`**
    - Append-only event store mencatat aksi pengguna, perubahan status admin, dan anomali risiko.

***

## Folder Structure

```
dimonex/
├── backend-go/                      # Arsitektur & implementasi Go produksi
│   ├── cmd/
│   │   ├── api/main.go              # REST API gateway
│   │   └── engine/main.go           # Dedicated matching engine daemon
│   ├── internal/
│   │   ├── domain/                  # Entity, model, value objects (Decimal)
│   │   ├── ledger/                  # Double-entry balance calculation
│   │   ├── engine/                  # Order book, matching, event log WAL
│   │   ├── auth/                    # JWT, TOTP, sessions
│   │   └── repository/              # PostgreSQL pgx queries
│   ├── go.mod
│   └── Dockerfile
├── deployments/                     # Docker & infrastruktur
│   ├── docker-compose.yml           # Postgres, Redis, NATS, Engine, API, Web
│   └── migrations/                  # Versioned SQL migrations (001_init.sql ... 006_audit.sql)
├── openapi/                         # OpenAPI 3.1 REST & WebSocket specification
│   └── dimonex-api.yaml
├── server/                          # Live full-stack execution engine (Node/Express/TS)
│   ├── engine/                      # In-memory Matching Engine (single-thread FIFO)
│   │   ├── OrderBook.ts             # Price-time priority tree, STP, partial fills
│   │   ├── MatchingEngine.ts        # Pair manager & event emitter
│   │   └── EventLog.ts              # Append-only WAL & snapshot replay
│   ├── ledger/                      # Atomic Double-Entry Ledger
│   │   ├── LedgerService.ts         # Multi-account balanced journal transactions
│   │   ├── PrecisionMath.ts         # BigInt fixed-point arithmetic (zero float)
│   │   └── Invariants.ts            # Balance consistency verification
│   ├── db/                          # Database access layer (SQLite live / SQL files)
│   │   ├── schema.ts                # DDL & tables
│   │   └── repository.ts            # Atomic transactions & idempotency
│   ├── routes/
│   │   ├── auth.ts                  # Register, login, 2FA TOTP, sessions
│   │   ├── kyc.ts                   # Upload KTP/selfie, approval, tier limits
│   │   ├── trading.ts               # Place order, cancel, open orders, trades
│   │   ├── wallet.ts                # Balance, IDR VA deposit/withdraw, crypto
│   │   ├── apiKeys.ts               # HMAC API key issuance & auth middleware
│   │   ├── admin.ts                 # Pair management, fee tuning, withdraw review
│   │   ├── risk.ts                  # Anomaly monitoring, freeze, audit logs
│   │   └── observability.ts         # Prometheus /metrics & health checks
│   ├── websocket/
│   │   └── MarketDataWs.ts          # Depth L2, trades, ticker, kline broadcasts
│   └── tests/
│       ├── ledger.test.ts           # Property-based consistency tests
│       ├── engine.test.ts           # Limit, market, IOC, GTC, STP unit tests
│       └── integration.test.ts      # Deposit -> Order -> Match -> Withdraw flow
├── src/                             # Frontend Next-style UI (React 19 + Tailwind)
│   ├── components/
│   │   ├── layout/                  # Navbar, Top Bar, Footer, Currency Switcher
│   │   ├── trading/                 # Chart, OrderBook, RecentTrades, OrderForm
│   │   ├── wallet/                  # BalanceOverview, DepositModal, WithdrawModal
│   │   ├── kyc/                     # VerificationWizard, DocumentUpload
│   │   ├── security/                # TwoFactorSetup, ActiveSessions, ApiKeys
│   │   └── admin/                   # AdminDashboard, KycReview, WithdrawApprovals
│   ├── hooks/                       # WebSocket hook, ledger query hook
│   ├── lib/                         # Formatters (IDR currency, crypto satoshis)
│   ├── types/                       # Shared TypeScript contracts
│   └── App.tsx                      # View Router (Landing, Trade, Wallet, Admin)
├── server.ts                        # Dev server entrypoint mounting Vite + Express + WS
├── metadata.json
└── package.json
```

***

## Eksekusi Fase Bertahap

1. **Fase 1: Auth & Double-Entry Ledger**
   - Implementasi registrasi, login, password hash, JWT + Refresh rotation, 2FA TOTP speakeasy, session tracker.
   - Implementasi `PrecisionMath` (BigInt fixed-point) & `LedgerService` (double-entry atomic journal).
   - Invariant verifier: $\sum \text{Debit} \equiv \sum \text{Credit}$. Unit tests & property tests.

2. **Fase 2: Matching Engine & Public/Private API**
   - In-memory order book (`BTC-IDR`, `ETH-IDR`, `USDT-IDR`) dengan price-time priority.
   - Limit & Market orders, TIF (`GTC`, `IOC`), Self-Trade Prevention (STP).
   - Event sourcing log (append-only WAL) & snapshot recovery.
   - WebSocket streaming (L2 depth 100ms, live trades, tickers, klines).
   - Public HMAC signature auth verification middleware.

3. **Fase 3: Frontend Trading Console & UX**
   - Tampilan TradingView Lightweight Chart interaktif.
   - Visualisasi order book depth berdensitas tinggi (tabular-nums).
   - Form order Beli/Jual dengan kalkulator saldo & fee real-time.
   - Feed transaksi pasar & riwayat order aktif dengan tombol cancel instan.
   - Tampilan multi-bahasa (ID / EN) dan responsif desktop/mobile.

4. **Fase 4: Wallet & Integrasi IDR / Blockchain**
   - Simulasi Payment Gateway Virtual Account (BCA, Mandiri, BRI) dengan verifikasi kecocokan nama rekening vs nama KYC.
   - Deposit listener simulator (konfirmasi block) & antrean withdrawal dengan approval threshold.
   - Whitelist alamat penarikan dan proteksi freeze saldo.

5. **Fase 5: Admin Panel, Risk & Compliance**
   - Review berkas KYC (KTP/Selfie) & penyesuaian tier limit.
   - Kontrol darurat (Halt/Resume trading per-pair).
   - Review & approval penarikan dana nominal besar.
   - Konfigurasi maker/taker fee secara dinamis.
   - Deteksi pola transaksi mencurigakan & audit log append-only.

6. **Fase 6: Hardening, Observability, Tests & Dokumen Produksi**
   - Endpoint Prometheus `/metrics` dan health check `/health`.
   - Menjalankan suite pengujian: Unit test engine, Ledger property-based invariant test, Integration test alur lengkap (*deposit → order → match → withdraw*).
   - Penyediaan berkas arsitektur Go (`backend-go/`), OpenAPI spec (`dimonex-api.yaml`), Docker Compose, dan Runbook Insiden Produksi.

***

## Rencana Pengujian

1. **Unit Testing**:
   - `LedgerInvariantTest`: Menguji 500 transaksi acak; memverifikasi bahwa total debit selalu tepat sama dengan total kredit tanpa selisih 1 satoshi/sen pun.
   - `OrderBookTest`: Memverifikasi eksekusi limit order, market sweep, partial fills, GTC rollover, pembatalan sisa kuantitas IOC, dan proteksi Self-Trade Prevention.
2. **Integration Testing**:
   - Alur E2E: User A deposit IDR via VA → User B deposit BTC → User A pasang Limit Buy → User B pasang Market Sell → Order Match → Fee dipotong ke akun fee bursa → Saldo BTC bertambah di User A, Saldo IDR bertambah di User B → User A request penarikan BTC dengan whitelist address.
3. **Load Performance**:
   - Benchmark in-memory matching engine untuk memvalidasi target $\ge 1.000$ order/detik per pair tanpa memory leak atau race condition.

***

## 7. Catatan Pembaruan & Perbaikan Bug: Visibilitas Order Aktif di Order Book
- **Akar Masalah**:
  1. Pemotongan baris hardcoded `slice(0, 12)` pada asks dan bids di `OrderBookView.tsx` menyembunyikan order aktif yang berada di luar 12 baris pertama.
  2. Server hanya mengandalkan interval broadcast 150ms tanpa broadcast instan saat order baru dipasang atau dibatalkan di REST API `tradingRouter.post('/order')` dan `/order/cancel`.
  3. Client frontend tidak melakukan refetch `fetchPairMarketData()` saat order berhasil dipasang atau dibatalkan, serta WebSocket tidak memiliki auto-reconnect logic jika koneksi tertutup.
  4. Format lookup perbandingan harga string vs BigInt rawan tidak cocok, dan bot order ID dari worker manager (`-ord-` & `-vol-`) tidak terdeteksi sebagai bot.
- **Solusi yang Diterapkan**:
  1. Server `broadcastDepth(pairId)` dipicu langsung setelah eksekusi order & pembatalan order. Kedalaman level L2 ditingkatkan dari 20/30 menjadi 60 level dengan sorting deterministik dan guard `rem > 0n`.
  2. Ditambahkan WebSocket auto-reconnect timer dan background fallback polling setiap 2.5 detik pada client frontend.
  3. Di `OrderBookView.tsx`, jumlah baris yang ditampilkan ditingkatkan ke 25 baris dengan container scrollable (`max-h-[230px] overflow-y-auto`). Order aktif milik pengguna/bot dijamin **selalu disertakan (guaranteed visibility)** di baris order book meskipun berada di kedalaman yang lebih dalam.
  4. Ditambahkan **Active Orders Quick Ribbon** di bagian atas order book yang menampilkan chip interaktif untuk semua order aktif pengguna di trading pair tersebut (`★ SAYA`, `🤖 BOT KITA`, `👑 ADMIN KITA`).
  5. Semua 20/20 acceptance tests tetap lulus 100%.
