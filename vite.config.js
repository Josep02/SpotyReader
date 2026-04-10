import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : '/SpotyReader/',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
}))
