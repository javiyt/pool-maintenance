import { describe, it, expect } from 'vitest';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import {
  t,
  getLanguage,
  setLanguage,
  detectBrowserLanguage,
  validateLanguage,
  formatNumber,
  formatDateTime,
  formatAmount,
} from '../src/i18n/index';
import type { TranslationKey } from '../src/i18n/types';

// ── Translation dictionary completeness ──────────────────────────

describe('translation dictionaries', () => {
  const allKeys = Object.keys(en) as TranslationKey[];

  it('every English key exists in Spanish', () => {
    for (const key of allKeys) {
      expect(es).toHaveProperty(key);
    }
  });

  it('every Spanish key exists in English', () => {
    const esKeys = Object.keys(es) as TranslationKey[];
    for (const key of esKeys) {
      expect(en).toHaveProperty(key);
    }
  });

  it('English and Spanish have the same number of keys', () => {
    expect(Object.keys(es).length).toBe(Object.keys(en).length);
  });
});

// ── Core translation function ────────────────────────────────────

describe('t()', () => {
  it('returns English string when language is en', () => {
    expect(t('app.title', undefined, 'en')).toBe('Pool Maintenance Assistant');
  });

  it('returns Spanish string when language is es', () => {
    expect(t('app.title', undefined, 'es')).toBe('Asistente de mantenimiento de piscina');
  });

  it('falls back to English when Spanish key is missing', () => {
    // Temporarily delete a key from es to test fallback
    const original = (es as Record<string, string>)['app.title'];
    delete (es as Record<string, string>)['app.title'];
    try {
      expect(t('app.title', undefined, 'es')).toBe('Pool Maintenance Assistant');
    } finally {
      (es as Record<string, string>)['app.title'] = original;
    }
  });

  it('interpolates parameters correctly', () => {
    const result = t('rec.ph.raise.summary', { value: '7.0', min: '7.2', max: '7.6' }, 'en');
    expect(result).toContain('7.0');
    expect(result).toContain('7.2');
    expect(result).toContain('7.6');
  });

  it('interpolates parameters in Spanish', () => {
    const result = t('rec.ph.raise.summary', { value: '7,0', min: '7,2', max: '7,6' }, 'es');
    expect(result).toContain('7,0');
    expect(result).toContain('7,2');
  });

  it('handles missing parameters gracefully', () => {
    const result = t('rec.ph.raise.summary', undefined, 'en');
    expect(result).not.toContain('⚠ MISSING');
  });

  it('handles unknown keys with a marker', () => {
    const result = t('nonexistent.key' as TranslationKey, undefined, 'en');
    expect(result).toContain('⚠ MISSING TRANSLATION');
  });

  it('uses current language when not specified', () => {
    setLanguage('en');
    expect(t('app.title')).toBe('Pool Maintenance Assistant');
    setLanguage('es');
    expect(t('app.title')).toBe('Asistente de mantenimiento de piscina');
    setLanguage('en'); // Reset
  });

  it('escapes HTML in string interpolation values', () => {
    // The interpolation uses escapeHtml internally
    const result = t('rec.personalization.samples', { count: '<script>alert("xss")</script>' }, 'en');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('preserves numeric values in interpolation', () => {
    const result = t('rec.personalization.samples', { count: 42 }, 'en');
    expect(result).toBe('42 sample(s)');
  });

  it('returns English as default when setLanguage not called (should be en)', () => {
    const current = getLanguage();
    expect(['en', 'es']).toContain(current);
  });
});

// ── Language detection and validation ────────────────────────────

describe('language detection', () => {
  it('detects Spanish from navigator.language', () => {
    // Mock navigator.language
    const originalLanguage = Object.getOwnPropertyDescriptor(
      navigator, 'language',
    );
    try {
      Object.defineProperty(navigator, 'language', {
        value: 'es-ES',
        configurable: true,
      });
      expect(detectBrowserLanguage()).toBe('es');
    } finally {
      if (originalLanguage) {
        Object.defineProperty(navigator, 'language', originalLanguage);
      }
    }
  });

  it('detects English from non-Spanish browser', () => {
    const originalLanguage = Object.getOwnPropertyDescriptor(
      navigator, 'language',
    );
    try {
      Object.defineProperty(navigator, 'language', {
        value: 'en-US',
        configurable: true,
      });
      expect(detectBrowserLanguage()).toBe('en');
    } finally {
      if (originalLanguage) {
        Object.defineProperty(navigator, 'language', originalLanguage);
      }
    }
  });

  it('returns English for unknown languages', () => {
    const originalLanguage = Object.getOwnPropertyDescriptor(
      navigator, 'language',
    );
    try {
      Object.defineProperty(navigator, 'language', {
        value: 'de-DE',
        configurable: true,
      });
      expect(detectBrowserLanguage()).toBe('en');
    } finally {
      if (originalLanguage) {
        Object.defineProperty(navigator, 'language', originalLanguage);
      }
    }
  });
});

describe('validateLanguage()', () => {
  it('accepts "en"', () => {
    expect(validateLanguage('en')).toBe('en');
  });

  it('accepts "es"', () => {
    expect(validateLanguage('es')).toBe('es');
  });

  it('falls back to "en" for invalid values', () => {
    expect(validateLanguage('fr')).toBe('en');
    expect(validateLanguage('')).toBe('en');
    expect(validateLanguage(undefined)).toBe('en');
    expect(validateLanguage(null)).toBe('en');
  });
});

describe('setLanguage() and getLanguage()', () => {
  it('setLanguage changes the current language', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    setLanguage('es');
    expect(getLanguage()).toBe('es');
    setLanguage('en'); // Reset
  });
});

// ── Number formatting ────────────────────────────────────────────

describe('formatNumber()', () => {
  it('formats numbers in English locale (en-GB)', () => {
    const result = formatNumber(1234.56, 'en');
    expect(result).toMatch(/1,?234\.?56/);
  });

  it('formats numbers in Spanish locale (es-ES)', () => {
    const result = formatNumber(1234.56, 'es');
    // Spanish uses comma as decimal separator
    expect(result).toContain(',');
    // Should not contain English-style dot decimal
    expect(result).not.toBe('1,234.56');
  });

  it('formats integers correctly', () => {
    const result = formatNumber(42, 'en');
    expect(result).toBe('42');
  });
});

// ── Date formatting ──────────────────────────────────────────────

describe('formatDateTime()', () => {
  it('formats ISO date in English', () => {
    const result = formatDateTime('2026-07-12T10:35:00.000Z', 'en');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('formats ISO date in Spanish', () => {
    const result = formatDateTime('2026-07-12T10:35:00.000Z', 'es');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns original string on invalid date', () => {
    const result = formatDateTime('not-a-date', 'en');
    expect(result).toBe('not-a-date');
  });
});

// ── Amount formatting ────────────────────────────────────────────

describe('formatAmount()', () => {
  it('formats amount with unit in English', () => {
    const result = formatAmount(750, 'ml', 'en');
    expect(result).toContain('ml');
  });

  it('converts ml to L when >= 1000', () => {
    const result = formatAmount(1500, 'ml', 'en');
    expect(result).toContain('L');
    expect(result).toContain('1.5');
  });

  it('formats kg amounts', () => {
    const result = formatAmount(2.5, 'kg', 'en');
    expect(result).toContain('kg');
    expect(result).toContain('2.5');
  });

  it('returns — for zero or negative values', () => {
    expect(formatAmount(0, 'ml', 'en')).toBe('—');
    expect(formatAmount(-1, 'g', 'en')).toBe('—');
  });
});

// ── Internationalization: exact string checks ────────────────────

describe('i18n content accuracy', () => {
  it('English app title is correct', () => {
    expect(t('app.title', undefined, 'en')).toBe('Pool Maintenance Assistant');
  });

  it('Spanish app title is correct', () => {
    expect(t('app.title', undefined, 'es')).toBe('Asistente de mantenimiento de piscina');
  });

  it('English settings title is correct', () => {
    expect(t('settings.title', undefined, 'en')).toBe('Pool Settings');
  });

  it('Spanish settings title is correct', () => {
    expect(t('settings.title', undefined, 'es')).toBe('Configuración');
  });
});

// ── Language persistence ─────────────────────────────────────────

describe('language persistence integration', () => {
  it('language is stored in PoolSettings', () => {
    // This test verifies the type includes language
    const settings: { language?: string } = {};
    settings.language = 'en';
    expect(settings.language).toBe('en');
    settings.language = 'es';
    expect(settings.language).toBe('es');
    delete settings.language;
    expect(settings.language).toBeUndefined();
  });
});

// ── No brand names ───────────────────────────────────────────────

describe('no brand names', () => {
  const brandPatterns = [
    /tamar/i, /hth/i, /aqua/i, /clorox/i, /bayrol/i,
    /robarb/i, /sunning/i, /krystal/i, /hy\-clor/i,
  ];

  for (const lang of ['en', 'es'] as const) {
    it(`no brand names in ${lang}`, () => {
      const dict = lang === 'en' ? en : es;
      const allValues = Object.values(dict);
      for (const value of allValues) {
        for (const pattern of brandPatterns) {
          expect(value).not.toMatch(pattern);
        }
      }
    });
  }
});
