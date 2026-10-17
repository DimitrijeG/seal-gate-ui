import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// seal-gate sends no CORS headers, so the console must share its origin.
// In development and preview, Vite forwards the API prefix to the server.
const proxy = {
  '/v1': process.env.SEAL_GATE_URL ?? 'http://127.0.0.1:8080',
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
