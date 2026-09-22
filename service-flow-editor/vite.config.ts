import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 4320,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4319' },
  },
});
