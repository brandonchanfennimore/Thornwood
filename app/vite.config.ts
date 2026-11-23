import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The rules engine and AI live in ../public and are shared with the original site, so the dev server may read the parent folder.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, fs: { allow: ['..'] } },
});
