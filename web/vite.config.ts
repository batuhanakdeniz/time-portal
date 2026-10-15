/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // life-planner 5173'ü kullandığı için 5174
    port: 5174,
    // /api isteklerini Spring Boot backend'ine yönlendir (farklı port için: API_TARGET=http://localhost:8082 npm run dev)
    proxy: { '/api': process.env.API_TARGET || 'http://localhost:8081' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
