import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
