import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Only VITE_* vars are exposed to the client bundle.
  envPrefix: 'VITE_',
})
