import { defineConfig } from 'vitest/config';

const isGitHubPages = process.env.DEPLOY_TARGET === 'github-pages';

export default defineConfig({
  base: isGitHubPages ? '/pool-maintenance/' : '/',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/ui/**',
        'src/**/*.d.ts',
        '**/*.config.ts',
        '**/dist/**',
        '**/coverage/**',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
