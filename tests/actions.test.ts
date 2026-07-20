import { describe, it, expect, beforeEach } from 'vitest';
import type { MaintenanceAction } from '../src/domain/actions';
import { generateActionId } from '../src/domain/actions';
import { evaluateActionOutcomes } from '../src/domain/actionOutcomeEvaluator';
import {
  loadActions,
  saveActions,
  addAction,
  deleteAction,
  exportData,
  parseImportData,
  mergeActions,
  EXPORT_SCHEMA_VERSION,
  loadMeasurements,
  saveMeasurements,
  addUserChemicalProduct,
  loadUserChemicalProducts,
} from '../src/domain/storage';
import type { PoolSettings } from '../src/domain/settings';
import type { Measurement } from '../src/domain/measurement';
import { getProductById } from '../src/domain/chemicalCatalog';

// ── localStorage mock ─────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────

const SAMPLE_ACTION: MaintenanceAction = {
  id: 'act-1',
  performedAt: '2026-07-09T10:35:00.000Z',
  kind: 'chemical',
  description: 'Added pH reducer',
  chemical: {
    productType: 'ph-reducer',
    mainComponent: 'Ácido reductor de pH',
    amount: 750,
    unit: 'ml',
  },
};

const SAMPLE_ACTION_CHLORINATOR: MaintenanceAction = {
  id: 'act-2',
  performedAt: '2026-07-10T14:00:00.000Z',
  kind: 'chlorinator',
  description: 'Adjusted chlorinator output',
  chlorinator: {
    previousOutputPercent: 60,
    newOutputPercent: 80,
    additionalHours: 2,
    totalHours: 8,
  },
};

const SAMPLE_ACTION_FILTRATION: MaintenanceAction = {
  id: 'act-3',
  performedAt: '2026-07-11T09:00:00.000Z',
  kind: 'filtration',
  description: 'Increased filtration hours',
  filtration: {
    previousHours: 6,
    newHours: 8,
  },
};

const SAMPLE_ACTION_WATER: MaintenanceAction = {
  id: 'act-4',
  performedAt: '2026-07-12T16:00:00.000Z',
  kind: 'water-replacement',
  description: 'Partial water change',
  waterReplacement: {
    estimatedLiters: 5000,
    estimatedPercent: 10,
  },
};

const SAMPLE_ACTION_CLEANING: MaintenanceAction = {
  id: 'act-5',
  performedAt: '2026-07-13T08:00:00.000Z',
  kind: 'cleaning',
  description: 'Cleaned skimmer basket',
};

const SAMPLE_ACTION_MANUAL_TEST: MaintenanceAction = {
  id: 'act-6',
  performedAt: '2026-07-14T11:00:00.000Z',
  kind: 'manual-test',
  description: 'Tested alkalinity with kit',
  notes: 'Alkalinity was 90 ppm',
};

const SAMPLE_ACTION_OTHER: MaintenanceAction = {
  id: 'act-7',
  performedAt: '2026-07-15T10:00:00.000Z',
  kind: 'other',
  description: 'Replaced pump seal',
  notes: 'Old seal was leaking',
};

const SAMPLE_ACTION_RELATED: MaintenanceAction = {
  id: 'act-8',
  performedAt: '2026-07-09T11:00:00.000Z',
  kind: 'chemical',
  description: 'Added chlorine granules',
  relatedMeasurementId: 'meas-1',
  chemical: {
    productType: 'chlorine-granules',
    mainComponent: 'Cloro de disolución rápida',
    amount: 500,
    unit: 'g',
  },
};

const FIXED_NOW = new Date('2026-07-09T10:35:00.000Z');

const SAMPLE_POOL_CONFIG: PoolSettings = {
  volume: 50000,
  volumeUnit: 'liters',
  poolType: 'chlorine',
  unitSystem: 'metric',
  appearance: 'system',
};

const SAMPLE_MEASUREMENT: Measurement = {
  id: 'meas-1',
  measuredAt: '2026-07-09T10:35:00.000Z',
  ph: 7.4,
  ec: 6640,
  tds: 3230,
  salt: 3380,
  orp: 672,
  fac: 2.0,
  temperature: 25.0,
};

// ── Action ID generation ──────────────────────────────────────────

describe('generateActionId', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateActionId());
    }
    expect(ids.size).toBe(100);
  });

  it('includes "act-" prefix', () => {
    expect(generateActionId()).toMatch(/^act-/);
  });
});

// ── Action persistence ────────────────────────────────────────────

describe('action persistence', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadActions()).toEqual([]);
  });

  it('round-trips a single action', () => {
    saveActions([SAMPLE_ACTION]);
    const loaded = loadActions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('act-1');
    expect(loaded[0].kind).toBe('chemical');
    expect(loaded[0].chemical?.productType).toBe('ph-reducer');
    expect(loaded[0].chemical?.amount).toBe(750);
  });

  it('round-trips multiple actions of different kinds', () => {
    const actions = [
      SAMPLE_ACTION,
      SAMPLE_ACTION_CHLORINATOR,
      SAMPLE_ACTION_FILTRATION,
      SAMPLE_ACTION_WATER,
      SAMPLE_ACTION_CLEANING,
      SAMPLE_ACTION_MANUAL_TEST,
      SAMPLE_ACTION_OTHER,
      SAMPLE_ACTION_RELATED,
    ];
    saveActions(actions);
    const loaded = loadActions();
    expect(loaded).toHaveLength(8);

    // Verify each action kind
    const chlorinatorAction = loaded.find((a) => a.kind === 'chlorinator')!;
    expect(chlorinatorAction.chlorinator?.newOutputPercent).toBe(80);
    expect(chlorinatorAction.chlorinator?.previousOutputPercent).toBe(60);

    const filtrationAction = loaded.find((a) => a.kind === 'filtration')!;
    expect(filtrationAction.filtration?.newHours).toBe(8);
    expect(filtrationAction.filtration?.previousHours).toBe(6);

    const waterAction = loaded.find((a) => a.kind === 'water-replacement')!;
    expect(waterAction.waterReplacement?.estimatedLiters).toBe(5000);
    expect(waterAction.waterReplacement?.estimatedPercent).toBe(10);

    const relatedAction = loaded.find((a) => a.relatedMeasurementId === 'meas-1')!;
    expect(relatedAction.chemical?.productType).toBe('chlorine-granules');
  });

  it('adds an action', () => {
    const list = addAction(SAMPLE_ACTION);
    expect(list).toHaveLength(1);
    expect(loadActions()).toHaveLength(1);
  });

  it('deletes an action by id', () => {
    const a1 = { ...SAMPLE_ACTION, id: 'a1' };
    const a2 = { ...SAMPLE_ACTION, id: 'a2' };
    saveActions([a1, a2]);
    const result = deleteAction('a1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
    expect(loadActions()).toHaveLength(1);
  });

  it('deleting an action does not delete measurements', () => {
    const m1: Measurement = { ...SAMPLE_MEASUREMENT, id: 'm1' };
    saveMeasurements([m1]);
    saveActions([SAMPLE_ACTION_RELATED]);

    deleteAction(SAMPLE_ACTION_RELATED.id);

    // Action should be gone
    expect(loadActions()).toHaveLength(0);
    // Measurement should remain
    expect(loadMeasurements()).toHaveLength(1);
  });

  it('handles corrupted storage gracefully', () => {
    store.set('pool-maintenance:actions', 'not-json');
    expect(loadActions()).toEqual([]);
  });

  it('returns empty array for non-array stored value', () => {
    store.set('pool-maintenance:actions', JSON.stringify({}));
    expect(loadActions()).toEqual([]);
  });
});

// ── Action export / import ────────────────────────────────────────

describe('action export', () => {
  beforeEach(() => {
    store.clear();
  });

  it('includes actions in current export', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveActions([SAMPLE_ACTION, SAMPLE_ACTION_CHLORINATOR]);
    const data = exportData(FIXED_NOW);
    expect(data.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(data.actions).toHaveLength(2);
    expect(data.actions[0].kind).toBe('chemical');
    expect(data.actions[1].kind).toBe('chlorinator');
  });

  it('returns empty actions array when none saved', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    const data = exportData(FIXED_NOW);
    expect(data.actions).toEqual([]);
  });

  it('includes actions alongside measurements and config', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    saveActions([SAMPLE_ACTION_RELATED]);
    const data = exportData(FIXED_NOW);
    expect(data.measurements).toHaveLength(1);
    expect(data.actions).toHaveLength(1);
    expect(data.poolConfig).toEqual(SAMPLE_POOL_CONFIG);
  });
});

describe('action import', () => {
  beforeEach(() => {
    store.clear();
  });

  it('restores actions from v4 format', () => {
    const json = JSON.stringify({
      schemaVersion: 4,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      actions: [SAMPLE_ACTION, SAMPLE_ACTION_CHLORINATOR],
    });
    const result = parseImportData(json);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].kind).toBe('chemical');
    expect(result.actions[1].kind).toBe('chlorinator');
  });

  it('returns empty actions array from v3 format (no actions field)', () => {
    const json = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
    });
    const result = parseImportData(json);
    expect(result.actions).toEqual([]);
    expect(result.measurements).toHaveLength(1);
  });

  it('returns empty actions from legacy array format', () => {
    const json = JSON.stringify([SAMPLE_MEASUREMENT]);
    const result = parseImportData(json);
    expect(result.actions).toEqual([]);
    expect(result.measurements).toHaveLength(1);
  });

  it('imports linked action with relatedMeasurementId', () => {
    const json = JSON.stringify({
      schemaVersion: 4,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      actions: [SAMPLE_ACTION_RELATED],
    });
    const result = parseImportData(json);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].relatedMeasurementId).toBe('meas-1');
    expect(result.actions[0].chemical?.productType).toBe('chlorine-granules');
  });

  it('throws on invalid action items', () => {
    const json = JSON.stringify({
      schemaVersion: 4,
      exportedAt: '2026-07-09T10:35:00.000Z',
      actions: ['not-an-object'],
      measurements: [],
    });
    expect(() => parseImportData(json)).toThrow(
      'actions must be an array of objects',
    );
  });
});

// ── Action merge ─────────────────────────────────────────────────

describe('mergeActions', () => {
  it('appends new actions to existing list', () => {
    const existing = [SAMPLE_ACTION, SAMPLE_ACTION_CHLORINATOR];
    const incoming = [SAMPLE_ACTION_FILTRATION];
    const merged = mergeActions(existing, incoming);
    expect(merged).toHaveLength(3);
  });

  it('skips duplicate actions with the same id', () => {
    const existing = [SAMPLE_ACTION, SAMPLE_ACTION_CHLORINATOR];
    const incoming = [SAMPLE_ACTION_CHLORINATOR, SAMPLE_ACTION_FILTRATION];
    const merged = mergeActions(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged.filter((a) => a.id === SAMPLE_ACTION_CHLORINATOR.id)).toHaveLength(1);
  });

  it('returns existing list unchanged when all incoming are duplicates', () => {
    const existing = [SAMPLE_ACTION];
    const incoming = [SAMPLE_ACTION];
    const merged = mergeActions(existing, incoming);
    expect(merged).toHaveLength(1);
  });
});

// ── Action sort by date-time ──────────────────────────────────────

describe('action sorting', () => {
  it('loadActions maintains stored order', () => {
    const actions = [SAMPLE_ACTION, SAMPLE_ACTION_CHLORINATOR, SAMPLE_ACTION_FILTRATION];
    saveActions(actions);
    const loaded = loadActions();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].performedAt).toBe('2026-07-09T10:35:00.000Z');
    expect(loaded[1].performedAt).toBe('2026-07-10T14:00:00.000Z');
    expect(loaded[2].performedAt).toBe('2026-07-11T09:00:00.000Z');
  });

  it('actions can be sorted newest first by performedAt', () => {
    const actions = [
      SAMPLE_ACTION,                    // 2026-07-09
      SAMPLE_ACTION_CHLORINATOR,         // 2026-07-10
      SAMPLE_ACTION_FILTRATION,          // 2026-07-11
    ];
    const sorted = [...actions].sort((a, b) =>
      b.performedAt.localeCompare(a.performedAt),
    );
    expect(sorted[0].performedAt).toBe('2026-07-11T09:00:00.000Z');
    expect(sorted[1].performedAt).toBe('2026-07-10T14:00:00.000Z');
    expect(sorted[2].performedAt).toBe('2026-07-09T10:35:00.000Z');
  });
});

// ── Schema version ────────────────────────────────────────────────

describe('schema version', () => {
  it('is version 11', () => {
    expect(EXPORT_SCHEMA_VERSION).toBe(11);
  });
});

// ── Manual action domain requirements ────────────────────────────

describe('manual maintenance action requirements', () => {
  it('registers an action without a recommendation', () => {
    addAction({
      id: 'manual-1',
      performedAt: '2026-07-16T10:00:00.000Z',
      kind: 'inspection',
      category: 'inspection',
      description: 'Checked pump pressure',
      origin: 'manual',
    });

    const action = loadActions()[0];
    expect(action.origin).toBe('manual');
    expect(action.recommendationId).toBeUndefined();
    expect(action.relatedRecommendationId).toBeUndefined();
  });

  it('registers a chemical cover with a preserved one-off product snapshot and no required amount', () => {
    addAction({
      id: 'cover-1',
      performedAt: '2026-07-16T11:00:00.000Z',
      kind: 'chemical-cover',
      category: 'chemical',
      description: 'Added summer chemical cover',
      origin: 'manual',
      chemical: {
        product: {
          source: 'one-off',
          snapshot: {
            name: 'Cubierta liquida',
            category: 'chemical-cover',
            physicalForm: 'liquid',
          },
        },
      },
    });

    const action = loadActions()[0];
    expect(action.chemical?.product?.source).toBe('one-off');
    expect(action.chemical?.product?.snapshot.category).toBe('chemical-cover');
    expect(action.chemical?.amount).toBeUndefined();
    expect(action.evaluationEligibility).toBe('not-evaluable');
  });

  it('creates a custom product and uses it later with independent snapshots', () => {
    const product = addUserChemicalProduct({
      name: 'My pH down',
      brand: 'Local',
      category: 'ph-reducer',
      activeIngredients: [{ name: 'Acid blend', concentrationPercent: 15 }],
    }, FIXED_NOW);

    addAction({
      id: 'custom-product-action',
      performedAt: '2026-07-17T10:00:00.000Z',
      kind: 'chemical',
      description: 'Used saved product',
      origin: 'manual',
      chemical: {
        amount: 100,
        unit: 'ml',
        product: {
          source: 'user-catalog',
          productId: product.id,
          snapshot: { ...product.snapshot },
        },
      },
    });

    const products = loadUserChemicalProducts();
    products[0] = {
      ...products[0],
      snapshot: { ...products[0].snapshot, name: 'Renamed pH down' },
    };
    store.set('pool-maintenance:userChemicalProducts', JSON.stringify(products));

    const action = loadActions()[0];
    expect(action.chemical?.product?.snapshot.name).toBe('My pH down');
    expect(loadUserChemicalProducts()[0].snapshot.name).toBe('Renamed pH down');
  });

  it('exports and imports a one-off custom action without losing product detail', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveActions([{
      id: 'one-off-1',
      performedAt: '2026-07-17T12:00:00.000Z',
      kind: 'chemical',
      description: 'Used a product once',
      origin: 'manual',
      chemical: {
        amount: 2,
        unit: 'l',
        product: {
          source: 'one-off',
          snapshot: {
            name: 'No-store clarifier',
            brand: 'Unlisted',
            category: 'clarifier',
            notes: 'Borrowed from neighbour',
          },
        },
      },
    }]);

    const imported = parseImportData(JSON.stringify(exportData(FIXED_NOW)));
    expect(imported.actions[0].chemical?.product?.source).toBe('one-off');
    expect(imported.actions[0].chemical?.product?.snapshot.brand).toBe('Unlisted');
  });

  it('records recommendation deviations for more, less, and different quantities', () => {
    const more = addAction({
      id: 'more',
      performedAt: '2026-07-18T10:00:00.000Z',
      kind: 'chemical',
      description: 'Added more than recommended',
      origin: 'recommendation',
      recommendationId: 'rec-1',
      performedComparison: {
        recommendationId: 'rec-1',
        recommended: { amount: 100, unit: 'g' },
        performed: { amount: 150, unit: 'g' },
      },
      chemical: { amount: 150, unit: 'g', productType: 'chlorine-granules' },
    })[0];
    const less = addAction({
      id: 'less',
      performedAt: '2026-07-18T11:00:00.000Z',
      kind: 'chemical',
      description: 'Added less than recommended',
      origin: 'recommendation',
      recommendationId: 'rec-2',
      performedComparison: {
        recommendationId: 'rec-2',
        recommended: { amount: 100, unit: 'g' },
        performed: { amount: 50, unit: 'g' },
      },
      chemical: { amount: 50, unit: 'g', productType: 'chlorine-granules' },
    })[1];

    expect(more.performedComparison?.performed.amount).toBe(150);
    expect(less.performedComparison?.performed.amount).toBe(50);
    expect(more.performedComparison?.recommended?.amount).toBe(100);
    expect(more.performedComparison?.deviation?.amountAbsolute).toBe(50);
    expect(less.performedComparison?.deviation?.amountAbsolute).toBe(-50);
  });

  it('does not evaluate an unknown chemical product', () => {
    const before: Measurement = { ...SAMPLE_MEASUREMENT, id: 'before', measuredAt: '2026-07-18T08:00:00.000Z' };
    const after: Measurement = { ...SAMPLE_MEASUREMENT, id: 'after', measuredAt: '2026-07-18T14:00:00.000Z', fac: 3.0 };
    const action: MaintenanceAction = {
      id: 'unknown-action',
      performedAt: '2026-07-18T10:00:00.000Z',
      kind: 'chemical',
      description: 'Unknown chemical',
      origin: 'manual',
      chemical: {
        product: {
          source: 'unknown',
          snapshot: { name: 'Unknown', category: 'other' },
        },
      },
    };

    saveActions([action]);
    expect(loadActions()[0].evaluationEligibility).toBe('unknown-product');
    expect(evaluateActionOutcomes([before, after], loadActions())).toHaveLength(0);
  });

  it('preserves normalized system product metadata in action snapshots', () => {
    const product = getProductById('multiaction-tablet')!;
    saveActions([{
      id: 'multi-action',
      performedAt: '2026-07-18T10:00:00.000Z',
      kind: 'chemical',
      description: 'Added multifunction tablet',
      origin: 'manual',
      chemical: {
        amount: 1,
        unit: 'tablet',
        product: {
          source: 'system-catalog',
          productId: product.id,
          snapshot: {
            productId: product.id,
            capturedAt: '2026-07-18T10:00:00.000Z',
            name: product.genericName,
            category: product.primaryCategory,
            secondaryCategories: product.secondaryCategories,
            functions: product.functions,
            activeIngredients: product.activeIngredients,
            physicalForm: product.physicalForm,
            applicationTarget: product.applicationTarget,
            evaluationEligibility: product.evaluationEligibility,
          },
        },
      },
    }]);

    const action = loadActions()[0];
    expect(action.chemical?.product?.snapshot.functions).toEqual(expect.arrayContaining(['sanitation', 'clarification']));
    expect(action.chemical?.product?.snapshot.activeIngredients?.[0]?.name).toBe('Componentes múltiples no especificados');
    expect(action.chemical?.product?.snapshot.applicationTarget).toBe('pool-water');
    expect(action.evaluationEligibility).toBe('conditionally-evaluable');
  });

  it('keeps exclusion flags for learning', () => {
    addAction({
      id: 'exclude-learning',
      performedAt: '2026-07-18T10:00:00.000Z',
      kind: 'chemical',
      description: 'Excluded action',
      origin: 'manual',
      exclusionFlags: {
        atypical: true,
        incorrectlyRecorded: false,
        excludedFromLearning: true,
      },
      chemical: { productType: 'ph-reducer', amount: 100, unit: 'ml' },
    });

    expect(loadActions()[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('migrates legacy recommendation actions without claiming exact performed values', () => {
    store.set('pool-maintenance:actions', JSON.stringify([{
      id: 'legacy-rec',
      performedAt: '2026-07-18T10:00:00.000Z',
      kind: 'chemical',
      description: 'Legacy pH reducer',
      relatedRecommendationId: 'rec-old',
      chemical: {
        productType: 'ph-reducer',
        mainComponent: 'Acid',
        amount: 250,
        unit: 'ml',
      },
    }]));

    const action = loadActions()[0];
    expect(action.origin).toBe('recommendation');
    expect(action.performedValuesProvenance).toBe('assumed-from-legacy-recommendation');
    expect(action.chemical?.product?.snapshot.capturedAt).toBe('2026-07-18T10:00:00.000Z');
    expect(action.chemical?.product?.snapshot.name).toBe('Acid');
  });
});

// ── Helper for import test ────────────────────────────────────────
// Need to also save settings for export tests
function saveSettings(settings: PoolSettings): void {
  store.set('pool-maintenance:settings', JSON.stringify(settings));
}
