import type { AppLanguage, TranslationParams, TranslationKey } from './types';
export type { AppLanguage, TranslationKey, TranslationParams, TranslationPrimitive } from './types';
import { en } from './en';
import { es } from './es';

// ── Translation dictionary ────────────────────────────────────────

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = { en, es };

// ── Current language (mutable, updated by setLanguage) ────────────

let currentLanguage: AppLanguage = 'en';

/**
 * Get the current application language.
 */
export function getLanguage(): AppLanguage {
  return currentLanguage;
}

/**
 * Set the current application language and update <html lang>.
 */
export function setLanguage(lang: AppLanguage): void {
  currentLanguage = lang;
  try {
    document.documentElement.lang = lang === 'en' ? 'en' : 'es';
  } catch {
    // document may not be available in test environments
  }
}

/**
 * Detect browser language.
 * Returns 'es' for Spanish browser languages, 'en' for everything else.
 */
export function detectBrowserLanguage(): AppLanguage {
  try {
    const navLang = navigator.language?.toLowerCase() ?? '';
    // Accept es, es-ES, es-MX, etc.
    if (navLang.startsWith('es')) return 'es';
  } catch {
    // navigator.language may be unavailable in some environments
  }
  return 'en';
}

/**
 * Validate a language value, falling back to English if invalid.
 */
export function validateLanguage(lang: unknown): AppLanguage {
  if (lang === 'en' || lang === 'es') return lang;
  return 'en';
}

// ── Translation function ─────────────────────────────────────────

const MISSING_KEY_MARKER = '⚠ MISSING TRANSLATION: ';

/**
 * Translate a key to the selected language, optionally interpolating
 * parameters.
 *
 * @param key The translation key.
 * @param params Optional key-value pairs for interpolation ({foo} in the
 *               translation string is replaced by params.foo).
 * @param language Optional override language. Defaults to current language.
 * @returns The translated string, or the English fallback, or a missing-key
 *          marker as last resort.
 */
export function t(
  key: TranslationKey,
  params?: TranslationParams,
  language?: AppLanguage,
): string {
  const lang = language ?? currentLanguage;
  const dict = dictionaries[lang];

  // Try requested language
  let value = dict?.[key];
  if (value !== undefined) {
    return interpolate(value, params);
  }

  // Try English fallback
  if (lang !== 'en') {
    const enValue = dictionaries.en[key];
    if (enValue !== undefined) {
      return interpolate(enValue, params);
    }
  }

  // Last resort: missing key marker
  return `${MISSING_KEY_MARKER}${key}`;
}

/**
 * Interpolate {param} placeholders in a string with the given params.
 * Escapes HTML-sensitive characters in string parameter values.
 */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined || value === null) return `{${key}}`;
    if (typeof value === 'string') {
      return escapeHtml(value);
    }
    return String(value);
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Locale-aware formatting ──────────────────────────────────────

const LOCALE_MAP: Record<AppLanguage, string> = {
  en: 'en-GB',
  es: 'es-ES',
};

/**
 * Get the locale string for the current (or specified) language.
 */
export function getLocale(language?: AppLanguage): string {
  return LOCALE_MAP[language ?? currentLanguage] ?? 'en-GB';
}

/**
 * Format a number using locale-aware formatting.
 *
 * en-GB: 1,234.56
 * es-ES: 1.234,56
 */
export function formatNumber(
  value: number,
  language?: AppLanguage,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(getLocale(language), options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Format an ISO date-time string using locale-aware formatting.
 *
 * en-GB: 12 Jul 2026, 10:35
 * es-ES: 12 jul 2026, 10:35
 */
export function formatDateTime(
  iso: string,
  language?: AppLanguage,
): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(getLocale(language), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Format an amount with its unit, using locale-aware number formatting.
 *
 * Examples: "750 ml", "1.5 L", "2.000 g", "3,5 kg"
 */
export function formatAmount(
  value: number,
  unit: string,
  language?: AppLanguage,
): string {
  if (value <= 0) return '—';

  // Special case: ml → L if >= 1000
  if (unit === 'ml' && value >= 1000) {
    return `${formatNumber(value / 1000, language)} L`;
  }

  return `${formatNumber(value, language)} ${unit}`;
}

/**
 * Get the locale string for a given language.
 */
export function getLocaleForLanguage(language: AppLanguage): string {
  return LOCALE_MAP[language];
}
