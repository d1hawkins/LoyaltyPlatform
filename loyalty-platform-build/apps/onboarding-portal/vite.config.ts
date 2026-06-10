import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api/onboard': {
        target: 'http://localhost:3099',
        changeOrigin: true,
      },
      '/api/tenants': {
        target: 'http://localhost:3099',
        changeOrigin: true,
      },
    },
  },
});
