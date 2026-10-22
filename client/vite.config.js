import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'https://billing-software-system-deploye.onrender.com',
        changeOrigin: true,
        secure: true
      },
      '/uploads': {
        target: 'https://billing-software-system-deploye.onrender.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
