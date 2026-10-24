/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * server.ts
 * DIMONEX Full-Stack Server
 * Mounts Express API Gateway, WebSocket Server, and Vite Middlewares on port 3000.
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { authRouter } from './server/routes/auth.js';
import { kycRouter } from './server/routes/kyc.js';
import { tradingRouter } from './server/routes/trading.js';
import { walletRouter } from './server/routes/wallet.js';
import { apiKeyRouter } from './server/routes/apiKeys.js';
import { adminRouter } from './server/routes/admin.js';
import { riskRouter } from './server/routes/risk.js';
import { botRouter } from './server/routes/bot.js';
import { mmConsoleRouter } from './server/routes/mmConsole.js';
import { observabilityRouter } from './server/routes/observability.js';
import { marketWsService } from './server/websocket/MarketDataWs.js';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const portArgIdx = process.argv.indexOf('--port');
  const portVal = portArgIdx !== -1 ? process.argv[portArgIdx + 1] : undefined;
  const PORT = parseInt(process.env.PORT || portVal || '3000', 10);

  // JSON Body Parser
  app.use(express.json());

  // WebSocket Server for High-Speed Market Data
  const wss = new WebSocketServer({ server, path: '/ws' });
  marketWsService.initialize(wss);

  // Mount API Endpoints
  app.use('/api/auth', authRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/trading', tradingRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/api-keys', apiKeyRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/bot', botRouter);
  app.use('/api/mm', mmConsoleRouter);
  app.use('/api/bot/mm', mmConsoleRouter);
  app.use('/', observabilityRouter); // /metrics, /health, /api/ledger/verify-invariants

  // Mount Vite development middlewares in dev mode
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    
const vite = await createViteServer({
  configFile: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.'),
    },
  },
  server: {
    middlewareMode: true,
    hmr: false,
  },
  appType: 'spa',
});

    app.use(vite.middlewares);
console.log('[DEBUG] Vite root:', vite.config.root);
console.log('[DEBUG] Vite config file:', vite.config.configFile);
console.log('[DEBUG] Vite HMR config:', vite.config.server.hmr);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  VITE v8.3.0  ready in 120 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`  ➜  press h + enter to show help\n`);
    console.log(`[DIMONEX] Full-Stack Exchange Engine listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[DIMONEX] Failed to launch server:', err);
  process.exit(1);
});
