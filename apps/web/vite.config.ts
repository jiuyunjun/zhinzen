import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Workspace packages are consumed straight from TypeScript source (see each
// package's `main`/`exports` pointing at src/index.ts), so Vite/esbuild compiles
// them as part of the app build — no separate package build step needed.
export default defineConfig({
  plugins: [react()],
  // Load .env files from the monorepo root, where the user keeps .env.local.
  envDir: '../..',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendors into their own chunks so they
        // download in parallel and stay cached across app deploys (app code
        // changes far more often than firebase/react).
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'react';
          }
          return undefined;
        },
      },
    },
    // Firebase alone is ~500KB; the meaningful budget is per-chunk after the split.
    chunkSizeWarningLimit: 600,
  },
});
