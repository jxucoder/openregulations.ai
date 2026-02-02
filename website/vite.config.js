import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages deployment
  // Update this to your repo name if deploying to https://username.github.io/repo-name/
  base: '/openregulations.ai/',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  
  server: {
    port: 3000,
    open: true,
  },
});
