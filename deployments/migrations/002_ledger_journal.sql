-- Migration 002: Double-Entry Immutable Ledger
CREATE TYPE journal_tx_type AS ENUM (
    'DEPOSIT', 
    'WITHDRAW', 
    'ORDER_LOCK', 
    'ORDER_UNLOCK', 
    'TRADE_SETTLEMENT', 
    'FEE_COLLECTION'
);

CREATE TYPE ledger_entry_type AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    currency VARCHAR(16) NOT NULL,
    balance_available NUMERIC(38, 0) NOT NULL DEFAULT 0 CHECK (balance_available >= 0),
    balance_locked NUMERIC(38, 0) NOT NULL DEFAULT 0 CHECK (balance_locked >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_currency UNIQUE(user_id, currency)
);

CREATE TABLE journal_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    tx_type journal_tx_type NOT NULL,
    reference_id VARCHAR(128) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_id UUID NOT NULL REFERENCES journal_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    entry_type ledger_entry_type NOT NULL,
    amount NUMERIC(38, 0) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(38, 0) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ledger_acc_user ON ledger_accounts(user_id);
CREATE INDEX idx_journal_idemp ON journal_transactions(idempotency_key);
CREATE INDEX idx_entries_journal ON ledger_entries(journal_id);
