-- Migration 004: Fiat Virtual Accounts, Crypto Wallets, and Audit Logs
CREATE TYPE tx_flow_type AS ENUM ('DEPOSIT', 'WITHDRAW');
CREATE TYPE tx_status AS ENUM ('PENDING', 'CONFIRMING', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE fiat_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type tx_flow_type NOT NULL,
    method VARCHAR(32) NOT NULL,
    amount NUMERIC(38, 0) NOT NULL,
    status tx_status DEFAULT 'PENDING',
    account_number VARCHAR(64) NOT NULL,
    account_holder_name VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE crypto_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    type tx_flow_type NOT NULL,
    currency VARCHAR(16) NOT NULL,
    chain VARCHAR(64) NOT NULL,
    address VARCHAR(128) NOT NULL,
    amount NUMERIC(38, 0) NOT NULL,
    tx_hash VARCHAR(128) NOT NULL,
    status tx_status DEFAULT 'PENDING',
    confirmations INT DEFAULT 0,
    required_confirmations INT DEFAULT 12,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    key_id VARCHAR(64) UNIQUE NOT NULL,
    secret_hash VARCHAR(255) NOT NULL,
    label VARCHAR(128) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '["read"]',
    ip_whitelist TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID NULL,
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(128) NOT NULL,
    details TEXT NOT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);
CREATE INDEX idx_api_keys_id ON api_keys(key_id);
