import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The robot service serves the front end at http://localhost:8000/demo/, and n8n puts
// http://localhost:8000/demo/phone.html?s=<session_id> in the QR code. So the build keeps
// both page names under the /demo/ base: index.html (the demo stage) and phone.html.
const BACKEND = 'http://localhost:8000'
const proxied = ['/webhook', '/tour', '/store', '/health', '/log', '/logs', '/mirror']

export default defineConfig({
  base: '/demo/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // React + Astryx core form one shared chunk (about 170 kB gzipped), cached across both pages.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        phone: resolve(import.meta.dirname, 'phone.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // '/log' must not swallow '/logs', so each prefix is matched exactly or with a slash after it.
    proxy: Object.fromEntries(proxied.map((p) => [`^${p}(/.*|\\?.*)?$`, { target: BACKEND, changeOrigin: false }])),
  },
})
