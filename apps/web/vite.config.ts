import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Workspace packages are consumed straight from TypeScript source (see each
// package's `main`/`exports` pointing at src/index.ts), so Vite/esbuild compiles
// them as part of the app build — no separate package build step needed.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
