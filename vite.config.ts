import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2500,
    outDir: "./build",
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
