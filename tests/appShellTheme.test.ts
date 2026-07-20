// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeRoute } from '../src/ui/appShell';
import { applyThemePreference, resolveThemePreference, THEME_STORAGE_ATTRIBUTE } from '../src/ui/theme';

describe('app shell routing', () => {
  it('normalizes supported routes and aliases', () => {
    expect(normalizeRoute('/')).toBe('/');
    expect(normalizeRoute('/measure')).toBe('/measurements/new');
    expect(normalizeRoute('/settings/install?source=pwa')).toBe('/settings/install');
    expect(normalizeRoute('/settings/measurement-devices')).toBe('/settings/measurement-devices');
    expect(normalizeRoute('/settings/measurement-devices/device-1/edit')).toBe('/settings/measurement-devices/device-1/edit');
    expect(normalizeRoute('/unknown')).toBe('/');
    expect(normalizeRoute('/pool-maintenance/history', '/pool-maintenance')).toBe('/history');
  });
});

describe('theme preference', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(THEME_STORAGE_ATTRIBUTE);
  });

  it('resolves explicit and system preferences', () => {
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference('system', false)).toBe('light');
  });

  it('applies the resolved theme to the document element', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    applyThemePreference('system');

    expect(document.documentElement.getAttribute(THEME_STORAGE_ATTRIBUTE)).toBe('dark');
  });
});
