
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    hmr: false,
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
  },
});
