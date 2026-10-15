import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the panel calls /api/v1/... and Vite forwards it to the backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: './src/setupTests.js', globals: true },
});
