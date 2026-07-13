// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  t,
  getLanguage,
  setLanguage,
  applyStaticTranslations,
  validateLanguage,
  detectBrowserLanguage,
} from '../src/i18n/index';
import {
  saveSettings,
  loadSettings,
  exportData,
  parseImportData,
} from '../src/domain/storage';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Collect all data-i18n attribute values used in index.html.
 * These are the keys that should exist in both translation dictionaries.
 */
const HTML_DATA_I18N_KEYS: readonly string[] = [
  'app.title',
  'settings.title',
  'settings.language',
  'settings.volume',
  'settings.volumeUnit.liters',
  'settings.volumeUnit.cubicMeters',
  'settings.poolType',
  'settings.poolType.chlorine',
  'settings.poolType.saltwater',
  'settings.unitSystem',
  'settings.unitSystem.metric',
  'settings.unitSystem.imperial',
  'settings.chlorinator.title',
  'settings.chlorinator.enabled',
  'settings.chlorinator.production',
  'settings.chlorinator.output',
  'settings.chlorinator.hours',
  'settings.chlorinator.maxOutput',
  'settings.chlorinator.maxHours',
  'settings.learning.title',
  'settings.learning.enabled',
  'settings.learning.minSamples',
  'settings.learning.applyLow',
  'settings.learning.applyLowHint',
  'settings.learning.minFactor',
  'settings.learning.maxFactor',
  'settings.save',
  'measurement.title',
  'measurement.dateTime',
  'measurement.ph',
  'measurement.ph.hint',
  'measurement.ec',
  'measurement.tds',
  'measurement.salt',
  'measurement.salt.hint',
  'measurement.orp',
  'measurement.orp.hint',
  'measurement.fac',
  'measurement.fac.hint',
  'measurement.temperature',
  'measurement.notes',
  'measurement.notes.optional',
  'context.section.title',
  'context.sunlight',
  'context.sunlight.none',
  'context.sunlight.low',
  'context.sunlight.medium',
  'context.sunlight.high',
  'context.poolCovered',
  'context.poolCovered.yes',
  'context.poolCovered.no',
  'context.batherLoad',
  'context.batherLoad.none',
  'context.batherLoad.low',
  'context.batherLoad.medium',
  'context.batherLoad.high',
  'context.rainSincePrevious',
  'context.waterAdded',
  'context.backwashPerformed',
  'context.chlorinatorOutput',
  'context.chlorinatorHours',
  'context.filtrationHours',
  'context.visibleAlgae',
  'context.waterClarity',
  'context.waterClarity.clear',
  'context.waterClarity.slightlyCloudy',
  'context.waterClarity.cloudy',
  'measurement.save',
  'rec.section.title',
  'actionForm.title',
  'actionForm.dateTime',
  'actionForm.type',
  'actionForm.type.chemical',
  'actionForm.type.chlorinator',
  'actionForm.type.filtration',
  'actionForm.type.waterReplacement',
  'actionForm.type.cleaning',
  'actionForm.type.manualTest',
  'actionForm.type.other',
  'actionForm.description',
  'actionForm.productType',
  'productType.phReducer',
  'productType.phIncreaser',
  'productType.chlorineGranules',
  'productType.chlorineStabilizer',
  'productType.alkalinityReducer',
  'productType.poolSalt',
  'actionForm.mainComponent',
  'actionForm.amount',
  'actionForm.unit',
  'actionForm.prevOutput',
  'actionForm.newOutput',
  'actionForm.addHours',
  'actionForm.totalHours',
  'actionForm.prevHours',
  'actionForm.filtrationNewHours',
  'actionForm.estimatedLiters',
  'actionForm.estimatedPercent',
  'actionForm.notes',
  'actionForm.notes.optional',
  'actionForm.linkedMeasurement',
  'actionForm.linkedMeasurement.none',
  'actionForm.save',
  'followup.title',
  'followup.empty',
  'history.title',
  'history.export',
  'history.import',
  'history.empty',
  'actionHistory.title',
  'actionHistory.empty',
  'insights.title',
  'insights.empty',
  'footer.disclaimer',
];

const HTML_DATA_I18N_PLACEHOLDER_KEYS: readonly string[] = [
  'actionForm.description.placeholder',
  'actionForm.mainComponent.placeholder',
];

const HTML_DATA_I18N_TITLE_KEYS: readonly string[] = [
  'settings.open',
  'settings.close',
  'actionForm.close',
];

// ── Static translation key completeness ──────────────────────────

describe('HTML data-i18n keys exist in both dictionaries', () => {
  for (const key of HTML_DATA_I18N_KEYS) {
    it(`key "${key}" exists in English dictionary`, () => {
      expect(en).toHaveProperty(key);
      expect(typeof (en as Record<string, string>)[key]).toBe('string');
      expect((en as Record<string, string>)[key].length).toBeGreaterThan(0);
    });

    it(`key "${key}" exists in Spanish dictionary`, () => {
      expect(es).toHaveProperty(key);
      expect(typeof (es as Record<string, string>)[key]).toBe('string');
      expect((es as Record<string, string>)[key].length).toBeGreaterThan(0);
    });
  }

  for (const key of HTML_DATA_I18N_PLACEHOLDER_KEYS) {
    it(`placeholder key "${key}" exists in English`, () => {
      expect(en).toHaveProperty(key);
    });

    it(`placeholder key "${key}" exists in Spanish`, () => {
      expect(es).toHaveProperty(key);
    });
  }

  for (const key of HTML_DATA_I18N_TITLE_KEYS) {
    it(`title key "${key}" exists in English`, () => {
      expect(en).toHaveProperty(key);
    });

    it(`title key "${key}" exists in Spanish`, () => {
      expect(es).toHaveProperty(key);
    });
  }
});

// ── applyStaticTranslations ──────────────────────────────────────

describe('applyStaticTranslations()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLanguage('en');
  });

  it('translates plain elements via data-i18n', () => {
    document.body.innerHTML = `<h1 data-i18n="app.title">Fallback</h1>`;
    applyStaticTranslations();
    expect(document.body.querySelector('h1')!.textContent).toBe(
      'Pool Maintenance Assistant',
    );

    setLanguage('es');
    applyStaticTranslations();
    expect(document.body.querySelector('h1')!.textContent).toBe(
      'Asistente de mantenimiento de piscina',
    );
  });

  it('translates placeholders via data-i18n-placeholder', () => {
    document.body.innerHTML = `<input data-i18n-placeholder="actionForm.description.placeholder" />`;
    applyStaticTranslations();
    expect(
      (document.body.querySelector('input') as HTMLInputElement).placeholder,
    ).toBe('e.g. Added pH reducer');

    setLanguage('es');
    applyStaticTranslations();
    expect(
      (document.body.querySelector('input') as HTMLInputElement).placeholder,
    ).toBe('Ej. Añadí reductor de pH');
  });

  it('translates titles via data-i18n-title', () => {
    document.body.innerHTML = `<button data-i18n-title="settings.open">X</button>`;
    applyStaticTranslations();
    expect(document.body.querySelector('button')!.title).toBe(
      'Open pool settings',
    );

    setLanguage('es');
    applyStaticTranslations();
    expect(document.body.querySelector('button')!.title).toBe(
      'Abrir configuración',
    );
  });

  it('preserves child elements inside labels with data-i18n', () => {
    document.body.innerHTML = `
      <label for="testInput" data-i18n="context.rainSincePrevious">
        <input type="checkbox" id="testInput" />
        Rain since previous measurement
      </label>
    `;

    setLanguage('en');
    applyStaticTranslations();
    const label = document.querySelector('label')!;
    expect(label.querySelector('input')).not.toBeNull();
    expect(label.textContent).toContain('Rain since previous measurement');

    setLanguage('es');
    applyStaticTranslations();
    expect(label.querySelector('input')).not.toBeNull();
    expect(label.textContent).toContain('Lluvia desde la medición anterior');
  });

  it('preserves nested span elements inside labels', () => {
    document.body.innerHTML = `
      <label for="testNotes" data-i18n="actionForm.notes">Notes
        <span class="optional" data-i18n="actionForm.notes.optional">optional</span>
      </label>
    `;

    setLanguage('en');
    applyStaticTranslations();
    const label = document.querySelector('label')!;
    const span = label.querySelector('.optional')!;
    expect(span).not.toBeNull();
    // The span should have its own translation applied
    expect(span.textContent).toBe('optional');

    setLanguage('es');
    applyStaticTranslations();
    expect(label.querySelector('.optional')).not.toBeNull();
    expect(label.querySelector('.optional')!.textContent).toBe('opcional');
  });

  it('is safe to call when document is undefined', () => {
    // Should not throw
    const origDoc = (globalThis as Record<string, unknown>).document;
    try {
      delete (globalThis as Record<string, unknown>).document;
      expect(() => applyStaticTranslations()).not.toThrow();
    } finally {
      (globalThis as Record<string, unknown>).document = origDoc;
    }
  });

  it('translates option elements in selects', () => {
    document.body.innerHTML = `
      <select>
        <option value="liters" data-i18n="settings.volumeUnit.liters">Liters</option>
        <option value="cubicMeters" data-i18n="settings.volumeUnit.cubicMeters">Cubic meters</option>
      </select>
    `;

    setLanguage('es');
    applyStaticTranslations();
    const options = document.querySelectorAll('option');
    expect(options[0].textContent).toBe('Litros');
    expect(options[1].textContent).toBe('Metros cúbicos');
  });

  it('produces no missing-translation markers during startup', () => {
    // Render all the keys used in index.html
    let html = '';
    for (const key of HTML_DATA_I18N_KEYS) {
      if (key) {
        html += `<div data-i18n="${key}">x</div>`;
      }
    }
    document.body.innerHTML = html;
    applyStaticTranslations();

    const allText = document.body.textContent || '';
    expect(allText).not.toContain('⚠ MISSING TRANSLATION');
  });
});

// ── Language dropdown / source of truth ──────────────────────────

describe('Language source of truth', () => {
  it('getLanguage returns en after setLanguage("en")', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
  });

  it('getLanguage returns es after setLanguage("es")', () => {
    setLanguage('es');
    expect(getLanguage()).toBe('es');
  });

  it('validateLanguage normalizes invalid values to en', () => {
    expect(validateLanguage('fr')).toBe('en');
    expect(validateLanguage('')).toBe('en');
    expect(validateLanguage(undefined)).toBe('en');
    expect(validateLanguage(null)).toBe('en');
  });

  it('detectBrowserLanguage picks es for Spanish browser', () => {
    const orig = Object.getOwnPropertyDescriptor(navigator, 'language');
    try {
      Object.defineProperty(navigator, 'language', {
        value: 'es-ES',
        configurable: true,
      });
      expect(detectBrowserLanguage()).toBe('es');
    } finally {
      if (orig) Object.defineProperty(navigator, 'language', orig);
    }
  });

  it('detectBrowserLanguage picks en for non-Spanish browser', () => {
    const orig = Object.getOwnPropertyDescriptor(navigator, 'language');
    try {
      Object.defineProperty(navigator, 'language', {
        value: 'en-US',
        configurable: true,
      });
      expect(detectBrowserLanguage()).toBe('en');
    } finally {
      if (orig) Object.defineProperty(navigator, 'language', orig);
    }
  });
});

// ── Static translation updates ──────────────────────────────────

describe('UI updates immediately on language change', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLanguage('en');
  });

  it('English → Spanish updates static headings', () => {
    document.body.innerHTML = `
      <h1 data-i18n="app.title">x</h1>
      <h2 data-i18n="settings.title">x</h2>
    `;
    setLanguage('es');
    applyStaticTranslations();
    const h1 = document.querySelector('h1')!;
    const h2 = document.querySelector('h2')!;
    expect(h1.textContent).toBe('Asistente de mantenimiento de piscina');
    expect(h2.textContent).toBe('Configuración');
  });

  it('Spanish → English updates static headings', () => {
    document.body.innerHTML = `
      <h1 data-i18n="app.title">x</h1>
    `;
    setLanguage('es');
    applyStaticTranslations();
    setLanguage('en');
    applyStaticTranslations();
    expect(document.querySelector('h1')!.textContent).toBe(
      'Pool Maintenance Assistant',
    );
  });

  it('document.title is updated by fullReRender equivalent', () => {
    setLanguage('es');
    document.title = t('app.title');
    expect(document.title).toBe('Asistente de mantenimiento de piscina');

    setLanguage('en');
    document.title = t('app.title');
    expect(document.title).toBe('Pool Maintenance Assistant');
  });

  it('<html lang> is updated by setLanguage', () => {
    document.documentElement.lang = 'en';
    setLanguage('es');
    expect(document.documentElement.lang).toBe('es');
    setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

// ── Settings persistence (storage-level) ─────────────────────────

describe('Language persistence (storage-level)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => store.set(key, val),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('saving language preserves all other settings', () => {
    // First save settings without language
    saveSettings({
      volume: 10000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      saltChlorinator: {
        enabled: true,
        productionGramsPerHour: 20,
        currentOutputPercent: 60,
        filtrationHoursPerDay: 6,
        maxRecommendedOutputPercent: 100,
        maxRecommendedHoursPerDay: 12,
      },
    });

    // Then language-only save
    const current = loadSettings();
    saveSettings({ ...current, language: 'es' });
    const loaded = loadSettings();
    expect(loaded.language).toBe('es');
    expect(loaded.volume).toBe(10000);
    expect(loaded.poolType).toBe('saltwater');
    expect(loaded.saltChlorinator).toBeDefined();
    expect(loaded.saltChlorinator!.enabled).toBe(true);
  });

  it('saving other settings preserves language', () => {
    saveSettings({
      volume: 10000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      language: 'es',
    });

    // Save again with different volume
    saveSettings({
      volume: 20000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      language: 'es',
    });
    const loaded = loadSettings();
    expect(loaded.language).toBe('es');
    expect(loaded.volume).toBe(20000);
  });

  it('old settings without language remain valid', () => {
    const oldSettings = JSON.stringify({
      volume: 10000,
      volumeUnit: 'liters',
      poolType: 'chlorine',
      unitSystem: 'metric',
    });
    store.set('pool-maintenance:settings', oldSettings);

    const loaded = loadSettings();
    expect(loaded.language).toBeUndefined();
    expect(loaded.volume).toBe(10000);
    expect(loaded.poolType).toBe('chlorine');
  });

  it('invalid language values are normalized on load', () => {
    store.set(
      'pool-maintenance:settings',
      JSON.stringify({
        volume: 10000,
        volumeUnit: 'liters',
        poolType: 'chlorine',
        unitSystem: 'metric',
        language: 'fr',
      }),
    );
    const loaded = loadSettings();
    // validateLanguage should normalize on use, not on load
    // The raw stored value is 'fr', but application code validates it
    expect(validateLanguage(loaded.language)).toBe('en');
  });

  it('export/import round trip preserves language', () => {
    saveSettings({
      volume: 15000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      language: 'es',
    });

    const exported = exportData(new Date('2026-07-13T12:00:00.000Z'));
    const imported = parseImportData(JSON.stringify(exported));
    expect(imported.poolConfig?.language).toBe('es');

    // Import without language should not overwrite current preference unexpectedly
    const exportedNoLang = exportData(new Date('2026-07-13T12:00:00.000Z'));
    delete exportedNoLang.poolConfig.language;
    const importedNoLang = parseImportData(JSON.stringify(exportedNoLang));
    expect(importedNoLang.poolConfig?.language).toBeUndefined();
  });

  it('language-only save does not erase historical learning settings', () => {
    saveSettings({
      volume: 10000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      historicalLearning: {
        enabled: true,
        minimumSamples: 8,
        applyLowConfidence: false,
        minCorrectionFactor: 0.3,
        maxCorrectionFactor: 1.8,
      },
    });

    // Language-only save
    const current = loadSettings();
    saveSettings({ ...current, language: 'es' });
    const loaded = loadSettings();
    expect(loaded.language).toBe('es');
    expect(loaded.historicalLearning).toBeDefined();
    expect(loaded.historicalLearning!.minimumSamples).toBe(8);
    expect(loaded.historicalLearning!.maxCorrectionFactor).toBe(1.8);
  });
});

// ── Language change does not require valid volume ────────────────

describe('Language change does not require pool volume', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => store.set(key, val),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
      writable: true,
      configurable: true,
    });
    setLanguage('en');
  });

  it('setLanguage + saveSettings works with zero volume', () => {
    // Save initial settings with zero volume (no volume set)
    saveSettings({
      volume: 0,
      volumeUnit: 'liters',
      poolType: 'chlorine',
      unitSystem: 'metric',
    });

    // Change language independently
    setLanguage('es');
    const current = loadSettings();
    saveSettings({ ...current, language: 'es' });

    const loaded = loadSettings();
    expect(loaded.language).toBe('es');
    expect(loaded.volume).toBe(0);
  });

  it('setLanguage + saveSettings works with negative volume', () => {
    saveSettings({
      volume: -100,
      volumeUnit: 'liters',
      poolType: 'chlorine',
      unitSystem: 'metric',
    });

    setLanguage('es');
    const current = loadSettings();
    saveSettings({ ...current, language: 'es' });

    const loaded = loadSettings();
    expect(loaded.language).toBe('es');
  });
});
