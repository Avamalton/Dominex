/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * observability.ts
 * Prometheus metrics, system health checks, and Ledger Invariant verifier.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { LedgerService } from '../ledger/LedgerService.js';

export const observabilityRouter = Router();

// Health Check Endpoint
observabilityRouter.get('/health', (req, res) => {
  const invariantCheck = LedgerService.verifyGlobalInvariants();
  res.json({
    status: invariantCheck.isConsistent ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    invariants: {
      isConsistent: invariantCheck.isConsistent,
      errors: invariantCheck.errors
    },
    engine: {
      pairsActive: Array.from(db.tradingPairs.values()).filter(p => p.isActive && !p.isHalted).length,
      openOrders: Array.from(db.orders.values()).filter(o => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED').length,
      totalTradesExecuted: db.trades.length
    }
  });
});

// Prometheus Standard /metrics Endpoint
observabilityRouter.get('/metrics', (req, res) => {
  const openOrdersCount = Array.from(db.orders.values()).filter(o => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED').length;
  const invariant = LedgerService.verifyGlobalInvariants();

  let metrics = `# HELP dimonex_uptime_seconds Process uptime in seconds
# TYPE dimonex_uptime_seconds gauge
dimonex_uptime_seconds ${Math.floor(process.uptime())}

# HELP dimonex_users_total Total registered users
# TYPE dimonex_users_total gauge
dimonex_users_total ${db.users.size}

# HELP dimonex_orders_open Current count of open orders in memory
# TYPE dimonex_orders_open gauge
dimonex_orders_open ${openOrdersCount}

# HELP dimonex_trades_total Total trades executed by matching engine
# TYPE dimonex_trades_total counter
dimonex_trades_total ${db.trades.length}

# HELP dimonex_ledger_accounts_total Total active ledger accounts
# TYPE dimonex_ledger_accounts_total gauge
dimonex_ledger_accounts_total ${db.ledgerAccounts.size}

# HELP dimonex_invariants_valid 1 if sum(debit)==sum(credit) and zero overdraft, 0 otherwise
# TYPE dimonex_invariants_valid gauge
dimonex_invariants_valid ${invariant.isConsistent ? 1 : 0}
`;

  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});

// Explicit Ledger Invariant Verification API
observabilityRouter.get('/api/ledger/verify-invariants', (req, res) => {
  const check = LedgerService.verifyGlobalInvariants();
  res.json(check);
});
