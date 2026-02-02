import { defineConfig } from 'vite';

export default defineConfig({
  // Base path - use '/' for Cloudflare Pages, '/repo-name/' for GitHub Pages
  base: '/',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  
  server: {
    port: 3000,
    open: true,
  },
});
