import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': backendUrl,
      '/ws': { target: backendUrl.replace(/^http/, 'ws'), ws: true },
      '/storage': backendUrl,
    },
  },
})
