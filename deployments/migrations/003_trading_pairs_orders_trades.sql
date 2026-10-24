-- Migration 003: Trading Pairs, Orders, and Matched Trades
CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type AS ENUM ('LIMIT', 'MARKET');
CREATE TYPE time_in_force AS ENUM ('GTC', 'IOC');
CREATE TYPE order_status AS ENUM ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED');

CREATE TABLE trading_pairs (
    id VARCHAR(32) PRIMARY KEY,
    base_currency VARCHAR(16) NOT NULL,
    quote_currency VARCHAR(16) NOT NULL,
    base_precision INT NOT NULL DEFAULT 8,
    quote_precision INT NOT NULL DEFAULT 2,
    min_order_size NUMERIC(38, 0) NOT NULL,
    max_order_size NUMERIC(38, 0) NOT NULL,
    maker_fee_bps INT NOT NULL DEFAULT 10,
    taker_fee_bps INT NOT NULL DEFAULT 20,
    is_active BOOLEAN DEFAULT TRUE,
    is_halted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    pair_id VARCHAR(32) NOT NULL REFERENCES trading_pairs(id),
    side order_side NOT NULL,
    order_type order_type NOT NULL,
    time_in_force time_in_force NOT NULL DEFAULT 'GTC',
    price NUMERIC(38, 0) NOT NULL,
    quantity NUMERIC(38, 0) NOT NULL,
    filled_quantity NUMERIC(38, 0) NOT NULL DEFAULT 0,
    status order_status NOT NULL DEFAULT 'NEW',
    locked_amount NUMERIC(38, 0) NOT NULL,
    locked_currency VARCHAR(16) NOT NULL,
    client_order_id VARCHAR(128) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pair_id VARCHAR(32) NOT NULL REFERENCES trading_pairs(id),
    maker_order_id UUID NOT NULL REFERENCES orders(id),
    taker_order_id UUID NOT NULL REFERENCES orders(id),
    maker_user_id UUID NOT NULL REFERENCES users(id),
    taker_user_id UUID NOT NULL REFERENCES users(id),
    price NUMERIC(38, 0) NOT NULL,
    quantity NUMERIC(38, 0) NOT NULL,
    quote_volume NUMERIC(38, 0) NOT NULL,
    maker_fee NUMERIC(38, 0) NOT NULL,
    taker_fee NUMERIC(38, 0) NOT NULL,
    taker_side order_side NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_trades_pair_time ON trades(pair_id, created_at DESC);
