import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the built app works under any path (served at takher.ca/pdf/
  // via a Netlify proxy, and standalone at the netlify.app root).
  base: './',
  plugins: [react()],
  optimizeDeps: {
    // CJS dep reached via dynamic import — pre-bundle so dev doesn't reload mid-session
    include: ['@neslinesli93/qpdf-wasm'],
  },
})
