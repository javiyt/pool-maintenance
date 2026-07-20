import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const { baseUrl } = normalizeApplicationBasePath(env.APP_BASE_PATH);

  return {
    base: baseUrl,
    plugins: [appManifestPlugin(baseUrl)],
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
