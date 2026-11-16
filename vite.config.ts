import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { getVersion } from './deploy/scripts/version.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The version this bundle was built from; see deploy/scripts/version.mjs.
  define: { __APP_VERSION__: JSON.stringify(getVersion()) },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
});
