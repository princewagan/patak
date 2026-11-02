import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5199, host: true },
  build: { chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});
