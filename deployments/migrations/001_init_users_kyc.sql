-- Migration 001: Users and KYC
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('user', 'compliance', 'admin', 'superadmin');
CREATE TYPE user_status AS ENUM ('active', 'frozen', 'suspended');
CREATE TYPE kyc_status AS ENUM ('unverified', 'pending', 'approved', 'rejected');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    role user_role DEFAULT 'user',
    status user_status DEFAULT 'active',
    totp_secret VARCHAR(255) NULL,
    is_totp_enabled BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_kyc (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    nik VARCHAR(64) NOT NULL,
    birth_date DATE NOT NULL,
    id_card_url TEXT,
    selfie_url TEXT,
    status kyc_status DEFAULT 'unverified',
    rejection_reason TEXT,
    tier_level INT DEFAULT 1,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_kyc_user_id ON user_kyc(user_id);
