import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ai-collab/protocol': path.resolve(__dirname, '../../packages/protocol/src'),
      '@ai-collab/sdk': path.resolve(__dirname, '../../packages/sdk/src'),
      '@ai-collab/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-router': ['@tanstack/react-router'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-sdk': ['@ai-collab/sdk', '@ai-collab/protocol'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:42688',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:42688',
        ws: true,
      },
    },
  },
});
