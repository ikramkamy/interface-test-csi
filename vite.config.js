import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'react-router': fileURLToPath(new URL('./src/test-shims/react-router.js', import.meta.url)),
      'react-i18next': fileURLToPath(new URL('./src/test-shims/react-i18next.js', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
  },
})
