import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeApplicationBasePath } from './src/applicationBasePath';
import { createWebAppManifest } from './src/pwa/manifest';

function appManifestPlugin(baseUrl: string): Plugin {
  const manifest = `${JSON.stringify(createWebAppManifest(baseUrl), null, 2)}\n`;
  const manifestPath = `${baseUrl}app.webmanifest`;

  return {
    name: 'pool-maintenance-app-manifest',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (pathname !== manifestPath) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/manifest+json');
        response.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app.webmanifest',
        source: manifest,
      });
    },
  };
}

function spaFallbackPlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'pool-maintenance-spa-fallback',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    writeBundle() {
      const outputDir = resolve(root, outDir);
      const indexPath = resolve(outputDir, 'index.html');
      const fallbackPath = resolve(outputDir, '404.html');

      if (!existsSync(indexPath) || existsSync(fallbackPath)) return;

      writeFileSync(fallbackPath, readFileSync(indexPath));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const { baseUrl } = normalizeApplicationBasePath(env.APP_BASE_PATH);

  return {
    base: baseUrl,
    plugins: [appManifestPlugin(baseUrl), spaFallbackPlugin()],
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
  };
});
