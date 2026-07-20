import type { ThemePreference } from '../domain/settings';

export const THEME_STORAGE_ATTRIBUTE = 'data-theme';

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export function applyThemePreference(preference: ThemePreference): void {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  document.documentElement.setAttribute(
    THEME_STORAGE_ATTRIBUTE,
    resolveThemePreference(preference, prefersDark),
  );
}
