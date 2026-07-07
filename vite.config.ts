import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // CJS dep reached via dynamic import — pre-bundle so dev doesn't reload mid-session
    include: ['@neslinesli93/qpdf-wasm'],
  },
})
