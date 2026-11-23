import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:' + (process.env.ZERO_API_PORT || '8765') }
  }
})
