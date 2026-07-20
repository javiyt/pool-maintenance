import { describe, expect, it } from 'vitest';
import {
  detectInstallPlatform,
  isStandalone,
  readInstallDismissedAt,
  resolveInstallStatus,
  shouldShowInstallPrompt,
} from '../src/pwa/install';
import { getConnectionStatus } from '../src/pwa/offline';
import { canApplyUpdate, isServiceWorkerSupported } from '../src/pwa/update';
import { createWebAppManifest } from '../src/pwa/manifest';

describe('PWA install state', () => {
  it('detects standalone using display-mode or iOS navigator fallback', () => {
    expect(isStandalone(true, false)).toBe(true);
    expect(isStandalone(false, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
  });

  it('detects target platforms', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 1)).toBe('ios');
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe('ios');
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14)', 1)).toBe('android');
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop');
    expect(detectInstallPlatform('CustomAgent', 0)).toBe('unknown');
  });

  it('resolves install status without treating dismissed as installed', () => {
    expect(resolveInstallStatus({ standalone: true, platform: 'android', promptAvailable: false, dismissed: false })).toBe('installed');
    expect(resolveInstallStatus({ standalone: false, platform: 'android', promptAvailable: true, dismissed: false })).toBe('available');
    expect(resolveInstallStatus({ standalone: false, platform: 'ios', promptAvailable: false, dismissed: false })).toBe('manual-ios');
    expect(resolveInstallStatus({ standalone: false, platform: 'desktop', promptAvailable: false, dismissed: false })).toBe('unknown');
    expect(resolveInstallStatus({ standalone: false, platform: 'unknown', promptAvailable: false, dismissed: false })).toBe('unsupported');
    expect(resolveInstallStatus({ standalone: false, platform: 'android', promptAvailable: false, dismissed: true })).toBe('dismissed');
  });

  it('shows prompts only after a meaningful action unless iOS manual instructions are needed', () => {
    expect(shouldShowInstallPrompt({ status: 'available', hasMeaningfulAction: false, dismissedAt: null, now: 1000 })).toBe(false);
    expect(shouldShowInstallPrompt({ status: 'available', hasMeaningfulAction: true, dismissedAt: null, now: 1000 })).toBe(true);
    expect(shouldShowInstallPrompt({ status: 'manual-ios', hasMeaningfulAction: false, dismissedAt: null, now: 1000 })).toBe(true);
    expect(shouldShowInstallPrompt({ status: 'installed', hasMeaningfulAction: true, dismissedAt: null, now: 1000 })).toBe(false);
  });

  it('honors temporary dismissal', () => {
    const dismissedAt = 10_000;
    expect(shouldShowInstallPrompt({ status: 'available', hasMeaningfulAction: true, dismissedAt, now: dismissedAt + 1000 })).toBe(false);
    expect(shouldShowInstallPrompt({ status: 'available', hasMeaningfulAction: true, dismissedAt, now: dismissedAt + 8 * 24 * 60 * 60 * 1000 })).toBe(true);
  });

  it('reads dismissed timestamp defensively', () => {
    expect(readInstallDismissedAt({ getItem: () => '123' })).toBe(123);
    expect(readInstallDismissedAt({ getItem: () => 'not-a-number' })).toBeNull();
    expect(readInstallDismissedAt({ getItem: () => null })).toBeNull();
  });
});

describe('PWA offline and update helpers', () => {
  it('maps navigator online state to UI status', () => {
    expect(getConnectionStatus(true)).toBe('online');
    expect(getConnectionStatus(false)).toBe('offline');
  });

  it('does not apply updates over unsaved form changes', () => {
    expect(canApplyUpdate(false)).toBe(true);
    expect(canApplyUpdate(true)).toBe(false);
  });

  it('checks service worker support structurally', () => {
    expect(isServiceWorkerSupported({ register: () => undefined })).toBe(true);
    expect(isServiceWorkerSupported({})).toBe(false);
    expect(isServiceWorkerSupported(null)).toBe(false);
  });
});

describe('web app manifest', () => {
  it('declares installable app metadata and required icons', () => {
    const manifest = createWebAppManifest('/');

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true);
  });

  it('scopes manifest URLs to the configured app base path', () => {
    const manifest = createWebAppManifest('/pool-maintenance/');

    expect(manifest.id).toBe('/pool-maintenance/');
    expect(manifest.start_url).toBe('/pool-maintenance/?source=pwa');
    expect(manifest.scope).toBe('/pool-maintenance/');
    expect(manifest.icons[0].src).toBe('/pool-maintenance/icons/icon-32.png');
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      '/pool-maintenance/measurements/new',
      '/pool-maintenance/history',
    ]);
  });
});
