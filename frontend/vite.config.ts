/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // SPA yedeği: /yil/1453/yer/34/sahne gibi istemci rotaları dev ve preview sunucusunda index.html'e düşer.
  // Üretim barındırmasında da aynı kural gerekir (bilinmeyen yol → index.html, /api hariç); barındırma kararı açık.
  appType: 'spa',
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
