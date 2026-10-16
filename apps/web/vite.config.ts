import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/sennet/' : '/',
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1100 }
});
