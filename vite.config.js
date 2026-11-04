import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend address lives in src/config.js; the panel calls it directly.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: 'jsdom', setupFiles: './src/setupTests.js', globals: true },
});
