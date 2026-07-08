import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Absolute /pdf/ base so asset URLs resolve with OR without a trailing slash
  // (takher.ca/pdf and takher.ca/pdf/ both work). A Netlify rewrite maps
  // /pdf/* -> /:splat on the standalone site so the app also serves at the root.
  base: '/pdf/',
  plugins: [react()],
  optimizeDeps: {
    // CJS dep reached via dynamic import — pre-bundle so dev doesn't reload mid-session
    include: ['@neslinesli93/qpdf-wasm'],
  },
})
