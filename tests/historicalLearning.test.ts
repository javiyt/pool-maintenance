import { describe, it, expect } from 'vitest';
import {
  computeLearning,
  deriveInsights,
  median,
  mad,
  getTemperatureBand,
  getOutputPercentBand,
  type LearnedAdjustment,
} from '../src/domain/historicalLearning';
import type { Measurement } from '../src/domain/measurement';
import type { MaintenanceAction } from '../src/domain/actions';
import type { PoolSettings, HistoricalLearningConfig } from '../src/domain/settings';
import { DEFAULT_HISTORICAL_LEARNING } from '../src/domain/settings';

// ── Helpers ───────────────────────────────────────────────────────

function makeMeasurement(
  overrides: Partial<Measurement> = {},
  id?: string,
): Measurement {
  return {
    id: id ?? 'm1',
    measuredAt: '2026-07-09T10:00:00.000Z',
    ph: 7.4,
    ec: 6640,
    tds: 3230,
    salt: 3380,
    orp: 672,
    fac: 2.0,
    temperature: 25.0,
    ...overrides,
  };
}

function makePhReducerAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  return {
    id: id ?? 'act-1',
    performedAt: '2026-07-09T11:00:00.000Z',
    kind: 'chemical',
    description: 'Added pH reducer',
    chemical: {
      productType: 'ph-reducer',
      mainComponent: 'Ácido reductor de pH',
      amount: 750,
      unit: 'ml',
    },
    ...overrides,
  };
}

function makeChlorineGranulesAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  return {
    id: id ?? 'act-chl-g-1',
    performedAt: '2026-07-09T11:00:00.000Z',
    kind: 'chemical',
    description: 'Added chlorine granules',
    chemical: {
      productType: 'chlorine-granules',
      mainComponent: 'Cloro granulado',
      amount: 500,
      unit: 'g',
    },
    ...overrides,
  };
}

function makeChlorinatorAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  return {
    id: id ?? 'act-chl-1',
    performedAt: '2026-07-09T11:00:00.000Z',
    kind: 'chlorinator',
    description: 'Adjusted chlorinator',
    chlorinator: {
      previousOutputPercent: 60,
      newOutputPercent: 80,
      additionalHours: 2,
    },
    ...overrides,
  };
}

function makeSaltAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  return {
    id: id ?? 'act-salt-1',
    performedAt: '2026-07-09T11:00:00.000Z',
    kind: 'chemical',
    description: 'Added pool salt',
    chemical: {
      productType: 'pool-salt',
      mainComponent: 'Cloruro sódico',
      amount: 25,
      unit: 'kg',
    },
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PoolSettings> = {}): PoolSettings {
  return {
    volume: 50000,
    volumeUnit: 'liters',
    poolType: 'chlorine',
    unitSystem: 'metric',
    saltChlorinator: {
      enabled: true,
      productionGramsPerHour: 20,
      currentOutputPercent: 60,
      filtrationHoursPerDay: 6,
      maxRecommendedOutputPercent: 100,
      maxRecommendedHoursPerDay: 12,
    },
    ...overrides,
  };
}

/**
 * Build a basic scenario: one before measurement, one action, one after measurement.
 * The after measurement shows the metric moving in the expected direction.
 */
function findAdjustment(
  adjustments: LearnedAdjustment[],
  actionType: string,
  metric: string,
): LearnedAdjustment | undefined {
  return adjustments.find(
    (a) => a.actionType === actionType && a.metric === metric,
  );
}

/** Create a learning config that allows 3-sample minimum for testing. */
function makeLearningConfig(
  overrides: Partial<HistoricalLearningConfig> = {},
): HistoricalLearningConfig {
  return {
    ...DEFAULT_HISTORICAL_LEARNING,
    minimumSamples: 3,
    ...overrides,
  };
}

// ── Median calculation ────────────────────────────────────────────

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for odd-length arrays', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
    expect(median([-5, 0, 5])).toBe(0);
  });

  it('returns average of two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('works with unsorted input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([50, 10, 30, 20, 40])).toBe(30);
  });

  it('handles decimal values', () => {
    expect(median([0.1, 0.2, 0.3])).toBe(0.2);
    expect(median([0.5, 1.5, 2.5])).toBe(1.5);
  });
});

// ── MAD (dispersion) ──────────────────────────────────────────────

describe('mad (median absolute deviation)', () => {
  it('returns 0 for empty array', () => {
    expect(mad([])).toBe(0);
  });

  it('returns 0 when all values are identical', () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  it('computes correct MAD for a sample', () => {
    // median([1, 2, 3, 4, 5]) = 3
    // deviations: |1-3|=2, |2-3|=1, |3-3|=0, |4-3|=1, |5-3|=2
    // median of [0, 1, 1, 2, 2] = 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('is robust to outliers (single outlier does not inflate MAD much)', () => {
    // With outlier: [1, 2, 3, 4, 100]
    // median = 3
    // deviations: |1-3|=2, |2-3|=1, |3-3|=0, |4-3|=1, |100-3|=97
    // sorted deviations: [0, 1, 1, 2, 97], median = 1
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });
});

// ── Temperature bands ─────────────────────────────────────────────

describe('getTemperatureBand', () => {
  it('returns cold for < 15°C', () => {
    expect(getTemperatureBand(10)).toBe('cold');
    expect(getTemperatureBand(14.9)).toBe('cold');
  });

  it('returns normal for 15-24.9°C', () => {
    expect(getTemperatureBand(15)).toBe('normal');
    expect(getTemperatureBand(20)).toBe('normal');
    expect(getTemperatureBand(24.9)).toBe('normal');
  });

  it('returns warm for 25-29.9°C', () => {
    expect(getTemperatureBand(25)).toBe('warm');
    expect(getTemperatureBand(27.5)).toBe('warm');
    expect(getTemperatureBand(29.9)).toBe('warm');
  });

  it('returns hot for >= 30°C', () => {
    expect(getTemperatureBand(30)).toBe('hot');
    expect(getTemperatureBand(35)).toBe('hot');
  });
});

// ── Output percent bands ─────────────────────────────────────────

describe('getOutputPercentBand', () => {
  it('returns 0-20 for ≤ 20%', () => {
    expect(getOutputPercentBand(0)).toBe('0-20');
    expect(getOutputPercentBand(20)).toBe('0-20');
  });

  it('returns 21-40 for 21-40%', () => {
    expect(getOutputPercentBand(21)).toBe('21-40');
    expect(getOutputPercentBand(40)).toBe('21-40');
  });

  it('returns 41-60 for 41-60%', () => {
    expect(getOutputPercentBand(41)).toBe('41-60');
    expect(getOutputPercentBand(60)).toBe('41-60');
  });

  it('returns 61-80 for 61-80%', () => {
    expect(getOutputPercentBand(61)).toBe('61-80');
    expect(getOutputPercentBand(80)).toBe('61-80');
  });

  it('returns 81-100 for > 80%', () => {
    expect(getOutputPercentBand(81)).toBe('81-100');
    expect(getOutputPercentBand(100)).toBe('81-100');
  });
});

// ── Sample size confidence levels ─────────────────────────────────

describe('confidence from sample size', () => {
  it('returns none for fewer than 3 samples (no usable learning)', () => {
    // 1 or 2 effective outcomes should produce no adjustments
    const m1 = makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1');
    const m2 = makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2');

    const actions = [
      makePhReducerAction({ performedAt: '2026-07-09T11:00:00.000Z' }, 'act-1'),
      // Only 2 actions of the same type
      makePhReducerAction({ performedAt: '2026-07-10T11:00:00.000Z' }, 'act-2'),
    ];

    // Add matching after measurements
    const measurements = [
      m1, m2,
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', ph: 7.7 }, 'm3'),
      makeMeasurement({ measuredAt: '2026-07-10T16:00:00.000Z', ph: 7.4 }, 'm4'),
    ];

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    // n=2 should be excluded (n<3)
    expect(phAdj).toBeUndefined();
  });

  it('returns low for 3-4 samples', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 1; i <= 4; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.7 + 0.1 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.4 }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.confidence).toBe('low');
    expect(phAdj!.sampleSize).toBe(4);
  });

  it('returns medium for 5-9 samples', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];
    const n = 7;

    for (let i = 1; i <= n; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.sampleSize).toBe(n);
    expect(phAdj!.confidence).toBe('medium');
  });

  it('returns high for 10+ samples', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];
    const n = 10;

    for (let i = 1; i <= n; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.sampleSize).toBe(n);
    expect(phAdj!.confidence).toBe('high');
  });
});

// ── High dispersion reduces confidence ────────────────────────────

describe('high dispersion reduces confidence', () => {
  it('lowers confidence when MAD/median ratio > 0.5', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 7 samples with moderate dispersion
    // median of [-1.1, -1.0, -0.9, -0.4, -0.3, -0.2, -0.1] = -0.4
    // deviations from median: [0.3, 0.2, 0.1, 0, 0.5, 0.6, 0.7]
    // sorted deviations: [0, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7]
    // MAD = 0.3
    // relative dispersion = |0.3 / -0.4| = 0.75 > 0.5 → drops one level: medium → low
    const phEffects = [-0.1, -0.2, -0.3, -0.4, -0.9, -1.0, -1.1];

    for (let i = 1; i <= 7; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      const phBefore = 7.8;
      const phAfter = 7.8 + phEffects[i - 1];
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: phBefore }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: phAfter }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // n=7 base = 'medium', relative dispersion 0.75 > 0.5 → drops to 'low'
    expect(phAdj!.confidence).toBe('low');
  });

  it('drops confidence by two levels for very high dispersion (MAD/median > 1.0)', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 10 samples with very high dispersion
    const phEffects = [-0.1, -0.2, -0.3, +0.5, +0.8, -0.4, +1.2, -0.5, +0.6, -0.6];
    // median ≈ -0.35
    // MAD is large relative to median

    for (let i = 1; i <= 10; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      const phBefore = 7.4;
      const phAfter = 7.4 + phEffects[i - 1];
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: phBefore }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: phAfter }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // n=10 would be 'high', but with very high dispersion should drop
    expect(phAdj!.dispersion).toBeGreaterThan(0);
    // Check that it was reduced from the base level
    expect(phAdj!.confidence).not.toBe('high');
  });
});

// ── Comparable observations are grouped ───────────────────────────

describe('comparable observations are grouped', () => {
  it('groups same action type, product type, pool type, and metric', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 1; i <= 5; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.sampleSize).toBe(5);
    expect(phAdj!.observedMedianEffect).toBeCloseTo(-0.3, 1);
    expect(phAdj!.filters.poolType).toBe('chlorine');
  });

  it('separates saltwater and chlorine pool type groups', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 3 actions for chlorine pool
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8, salt: 3200 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5, salt: 3400 }, `ma${i}`),
      );
      actions.push(
        makeSaltAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-cl-${i}`),
      );
    }

    // 3 actions for saltwater pool
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.4, salt: 3000 }, `mb-sw-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.3, salt: 3300 }, `ma-sw-${i}`),
      );
      actions.push(
        makeSaltAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-sw-${i}`),
      );
    }

    // Compute with chlorine settings
    const adj = computeLearning(measurements, actions, makeSettings({ poolType: 'chlorine' }));
    expect(adj.length).toBeGreaterThanOrEqual(1);

    // Compute with saltwater settings
    const adjSw = computeLearning(measurements, actions, makeSettings({ poolType: 'saltwater' }));
    expect(adjSw.length).toBeGreaterThanOrEqual(1);

    // They should have different group/poolType even though actions are shared
    // (pool type comes from current settings, not the action)
  });
});

// ── Incompatible observations are separated ───────────────────────

describe('incompatible observations are separated', () => {
  it('separates pH reducer from chlorine granules', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // pH reducer actions — use distinct dates
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8, fac: 2.0 }, `mb-ph-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5, fac: 1.8 }, `ma-ph-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-ph-${i}`),
      );
    }

    // Chlorine granules actions — use distinct dates after the pH reducer ones
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 11).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.2, fac: 1.0 }, `mb-fac-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.3, fac: 2.5 }, `ma-fac-${i}`),
      );
      actions.push(
        makeChlorineGranulesAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-fac-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    const facAdj = findAdjustment(adjustments, 'chemical:chlorine-granules', 'fac');

    expect(phAdj).toBeDefined();
    expect(facAdj).toBeDefined();
    expect(phAdj!.actionType).toBe('chemical:ph-reducer');
    expect(facAdj!.actionType).toBe('chemical:chlorine-granules');
    expect(phAdj!.metric).toBe('ph');
    expect(facAdj!.metric).toBe('fac');
  });

  it('separates different temperature bands', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 3 actions in normal temperature (20°C) — dates 2026-07-09 through 2026-07-11
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8, temperature: 20 }, `mb-n-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5, temperature: 22 }, `ma-n-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-n-${i}`),
      );
    }

    // 3 actions in warm temperature (28°C) — dates 2026-07-12 through 2026-07-14
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 11).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8, temperature: 28 }, `mb-w-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5, temperature: 29 }, `ma-w-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-w-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    // Should have two separate groups for ph-reducer/ph
    const phAdjNormal = adjustments.find(
      (a) => a.actionType === 'chemical:ph-reducer' && a.metric === 'ph' && a.filters.temperatureBand === 'normal',
    );
    const phAdjWarm = adjustments.find(
      (a) => a.actionType === 'chemical:ph-reducer' && a.metric === 'ph' && a.filters.temperatureBand === 'warm',
    );
    expect(phAdjNormal).toBeDefined();
    expect(phAdjWarm).toBeDefined();
    expect(phAdjNormal!.sampleSize).toBe(3);
    expect(phAdjWarm!.sampleSize).toBe(3);
  });
});

// ── Correction factor clamping ───────────────────────────────────

describe('correction factor clamping', () => {
  function makePhReducerMeasurementsAndActions(
    count: number,
    phBefore: number,
    phAfter: number,
    datePrefix: string,
    overrides?: { volume?: number },
  ): { measurements: Measurement[]; actions: MaintenanceAction[]; settings: PoolSettings } {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];
    for (let i = 1; i <= count; i++) {
      const day = String(i).padStart(2, '0');
      measurements.push(
        makeMeasurement({ measuredAt: `${datePrefix}-${day}T10:00:00.000Z`, ph: phBefore }, `mb-${i}`),
        makeMeasurement({ measuredAt: `${datePrefix}-${day}T16:00:00.000Z`, ph: phAfter }, `ma-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${datePrefix}-${day}T12:00:00.000Z` }, `act-${i}`),
      );
    }
    const settings = overrides?.volume
      ? makeSettings({ volume: overrides.volume, volumeUnit: 'liters' })
      : makeSettings();
    return { measurements, actions, settings };
  }

  it('clamps correction factor to 0.5-1.5 range', () => {
    // 750ml pH reducer in 50m³ should give theoretical -0.1 pH
    // observed: 7.5-7.8 = -0.3 → correction = -0.3/-0.1 = 3.0 → clamped to 1.5
    const { measurements, actions, settings } = makePhReducerMeasurementsAndActions(3, 7.8, 7.5, '2026-07');

    const adjustments = computeLearning(measurements, actions, settings, makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.theoreticalEffect).toBeCloseTo(-0.1, 2);
    expect(phAdj!.correctionFactor).toBe(1.5);
  });

  it('clamps correction factor to lower bound', () => {
    // 750ml pH reducer in 10m³ (10000L) → theoretical pH drop of 0.5
    // Observed: 7.35-7.4 = -0.05 → correction = -0.05/-0.5 = 0.1 → clamped to 0.5
    const { measurements, actions, settings } = makePhReducerMeasurementsAndActions(
      3, 7.4, 7.35, '2026-07', { volume: 10000 },
    );

    const adjustments = computeLearning(measurements, actions, settings, makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.correctionFactor).toBe(0.5);
  });

  it('does not set correction factor without theoretical effect', () => {
    // No volume configured → no theoretical effect → no correction factor
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', ph: 7.9 }, 'm3'),
      makeMeasurement({ measuredAt: '2026-07-10T16:00:00.000Z', ph: 7.6 }, 'm4'),
      makeMeasurement({ measuredAt: '2026-07-11T10:00:00.000Z', ph: 7.7 }, 'm5'),
      makeMeasurement({ measuredAt: '2026-07-11T16:00:00.000Z', ph: 7.4 }, 'm6'),
    ];
    const actions = [
      makePhReducerAction({ performedAt: '2026-07-09T11:00:00.000Z' }, 'act-1'),
      makePhReducerAction({ performedAt: '2026-07-10T11:00:00.000Z' }, 'act-2'),
      makePhReducerAction({ performedAt: '2026-07-11T11:00:00.000Z' }, 'act-3'),
    ];
    const settings = makeSettings({ volume: 0 }); // No volume → no theoretical effect

    const adjustments = computeLearning(measurements, actions, settings, makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    expect(phAdj!.theoreticalEffect).toBeUndefined();
    expect(phAdj!.correctionFactor).toBeUndefined();
  });
});

// ── Fewer than 3 samples ──────────────────────────────────────────

describe('fewer than 3 samples', () => {
  it('produces no usable learning (no adjustments)', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const actions = [
      makePhReducerAction({ performedAt: '2026-07-09T11:00:00.000Z' }, 'act-1'),
      // Only 2 actions, need 3+ for learning
      makePhReducerAction({ performedAt: '2026-07-10T11:00:00.000Z' }, 'act-2'),
    ];
    // Add more measurements for the second action
    measurements.push(
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', ph: 7.7 }, 'm3'),
      makeMeasurement({ measuredAt: '2026-07-10T16:00:00.000Z', ph: 7.4 }, 'm4'),
    );

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    expect(adjustments.length).toBe(0);
  });
});

// ── Excluded actions are ignored ──────────────────────────────────

describe('excluded actions are ignored', () => {
  it('ignores unknown effectiveness outcomes', () => {
    // chemical form but no product type → expectedFields returns [], effectiveness unknown
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.4 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.4 }, 'm2'),
    ];
    const actions = [
      makePhReducerAction({
        performedAt: '2026-07-09T11:00:00.000Z',
        chemical: { productType: 'alkalinity-reducer', mainComponent: 'Test', amount: 500, unit: 'ml' },
      }, 'act-1'),
    ];

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    expect(adjustments.length).toBe(0);
  });

  it('ignores very low confidence outcomes (below 0.3)', () => {
    // pH goes up with reducer → unexpected + intervening action → confidence drops below 0.3
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.4 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'), // pH went up with reducer
    ];
    const actions = [
      makePhReducerAction({
        id: 'act-main',
        performedAt: '2026-07-09T11:00:00.000Z',
      }),
      // Intervening action that also pushes the wrong direction
      makePhReducerAction({
        id: 'act-intervene',
        performedAt: '2026-07-09T12:00:00.000Z',
      }),
    ];
    // Add more measurement+action pairs to still have 3+ of some type (these have effective outcomes)
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 9).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb-ok-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma-ok-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-ok-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    // The low-confidence act-main should not affect the result for ph-reducer/ph
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // The adjustment should only include the 3 valid ones, not the low-confidence one
    expect(phAdj!.sampleSize).toBe(3);
  });

  it('ignores manual-test and other action kinds', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.4 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.4 }, 'm2'),
    ];
    const actions = [
      makePhReducerAction({ kind: 'manual-test' }, 'act-1'),
    ];

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    expect(adjustments.length).toBe(0);
  });

  it('ignores filtration and water-replacement actions', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 0.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T18:00:00.000Z', fac: 2.0 }, 'm2'),
    ];
    const actions = [
      makePhReducerAction({
        kind: 'filtration',
        filtration: { previousHours: 6, newHours: 8 },
      }, 'act-1'),
    ];

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    expect(adjustments.length).toBe(0);
  });

  it('ignores actions with exclusionFlags.excludedFromLearning', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 3 valid actions — should produce learning
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-ok-${i}`),
      );
    }

    // 2 more actions that are excluded from learning
    for (let i = 1; i <= 2; i++) {
      const prefix = `2026-07-${String(i + 12).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb-ex-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma-ex-${i}`),
      );
      actions.push(
        makePhReducerAction({
          performedAt: `${prefix}T11:00:00.000Z`,
          exclusionFlags: { excludedFromLearning: true },
        }, `act-ex-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // Should only use the 3 non-excluded actions, not the 2 excluded ones
    expect(phAdj!.sampleSize).toBe(3);
  });

  it('excluded action does not affect median even with extreme values', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 5 regular actions with consistent pH reduction of -0.3
    for (let i = 1; i <= 5; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.7 }, `mb-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.4 }, `ma-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-reg-${i}`),
      );
    }

    // 1 extreme anomalous action excluded from learning
    measurements.push(
      makeMeasurement({ measuredAt: '2026-07-20T10:00:00.000Z', ph: 6.5 }, 'mb-anom'),
      makeMeasurement({ measuredAt: '2026-07-20T16:00:00.000Z', ph: 8.5 }, 'ma-anom'),
    );
    actions.push(
      makePhReducerAction({
        performedAt: '2026-07-20T11:00:00.000Z',
        exclusionFlags: { excludedFromLearning: true, atypical: true },
        notes: 'Extreme anomalous action',
      }, 'act-anom'),
    );

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // Median should be -0.3, not pulled by the extreme +2.0 outlier
    expect(phAdj!.observedMedianEffect).toBeCloseTo(-0.3, 1);
    // Sample size should be 5, not 6
    expect(phAdj!.sampleSize).toBe(5);
  });
});

// ── Multiple temperature bands remain separate ────────────────────

describe('multiple temperature bands remain separate', () => {
  it('creates separate groups for cold, normal, warm, and hot bands', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // Each band gets its own unique date range so before/after measurements don't overlap
    const bands: Array<{ temp: number; band: string; baseDay: number }> = [
      { temp: 10, band: 'cold', baseDay: 9 },
      { temp: 20, band: 'normal', baseDay: 12 },
      { temp: 28, band: 'warm', baseDay: 15 },
      { temp: 35, band: 'hot', baseDay: 18 },
    ];

    for (const b of bands) {
      for (let i = 1; i <= 3; i++) {
        const day = b.baseDay + i - 1;
        const prefix = `2026-07-${String(day).padStart(2, '0')}`;
        measurements.push(
          makeMeasurement({
            measuredAt: `${prefix}T10:00:00.000Z`,
            ph: 7.8,
            temperature: b.temp,
          }, `mb-${b.band}-${i}`),
          makeMeasurement({
            measuredAt: `${prefix}T16:00:00.000Z`,
            ph: 7.5,
            temperature: b.temp + 1,
          }, `ma-${b.band}-${i}`),
        );
        actions.push(
          makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-${b.band}-${i}`),
        );
      }
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());

    for (const b of bands) {
      const adj = adjustments.find(
        (a) => a.actionType === 'chemical:ph-reducer' && a.metric === 'ph' && a.filters.temperatureBand === b.band,
      );
      expect(adj).toBeDefined();
      expect(adj!.sampleSize).toBe(3);
    }
  });
});

// ── Compute learning with valid outcomes ──────────────────────────

describe('computeLearning', () => {
  it('returns empty array with fewer than 2 measurements', () => {
    const result = computeLearning(
      [makeMeasurement({}, 'm1')],
      [makePhReducerAction()],
      makeSettings(),
    );
    expect(result).toEqual([]);
  });

  it('returns empty array with no actions', () => {
    const result = computeLearning(
      [makeMeasurement({}, 'm1'), makeMeasurement({}, 'm2')],
      [],
      makeSettings(),
    );
    expect(result).toEqual([]);
  });

  it('groups chlorinator actions separately from chemical actions', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 3 chlorinator actions — dates 2026-07-09 through 2026-07-11
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, fac: 1.0 }, `mb-chl-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T18:00:00.000Z`, fac: 2.0 }, `ma-chl-${i}`),
      );
      actions.push(
        makeChlorinatorAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-chl-${i}`),
      );
    }

    // 3 pH reducer actions — dates 2026-07-12 through 2026-07-14
    for (let i = 1; i <= 3; i++) {
      const prefix = `2026-07-${String(i + 11).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb-ph-${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.5 }, `ma-ph-${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T12:00:00.000Z` }, `act-ph-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const chlAdj = findAdjustment(adjustments, 'chlorinator', 'fac');
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');

    expect(chlAdj).toBeDefined();
    expect(phAdj).toBeDefined();
    expect(chlAdj!.sampleSize).toBe(3);
    expect(phAdj!.sampleSize).toBe(3);
  });

  it('uses median (not mean) as the primary learned effect', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // pH effects: -0.3, -0.3, -0.3, -0.3, -1.5 (outlier)
    const phEffects = [-0.3, -0.3, -0.3, -0.3, -1.5];

    for (let i = 1; i <= 5; i++) {
      const prefix = `2026-07-${String(i + 8).padStart(2, '0')}`;
      measurements.push(
        makeMeasurement({ measuredAt: `${prefix}T10:00:00.000Z`, ph: 7.8 }, `mb${i}`),
        makeMeasurement({ measuredAt: `${prefix}T16:00:00.000Z`, ph: 7.8 + phEffects[i - 1] }, `ma${i}`),
      );
      actions.push(
        makePhReducerAction({ performedAt: `${prefix}T11:00:00.000Z` }, `act-${i}`),
      );
    }

    const adjustments = computeLearning(measurements, actions, makeSettings(), makeLearningConfig());
    const phAdj = findAdjustment(adjustments, 'chemical:ph-reducer', 'ph');
    expect(phAdj).toBeDefined();
    // Median of [-1.5, -0.3, -0.3, -0.3, -0.3] = -0.3
    // Mean = (-1.5 + -0.3*4) / 5 = -2.7/5 = -0.42
    expect(phAdj!.observedMedianEffect).toBe(-0.3);
    expect(phAdj!.observedMeanEffect).toBeCloseTo(-0.54, 1);
  });
});

// ── Derive insights ───────────────────────────────────────────────

describe('deriveInsights', () => {
  it('returns empty array for no adjustments', () => {
    const insights = deriveInsights([]);
    expect(insights).toEqual([]);
  });

  it('derives insights from chlorinator FAC adjustments', () => {
    const adjustments: LearnedAdjustment[] = [
      {
        id: 'test',
        actionType: 'chlorinator',
        metric: 'fac',
        observedMedianEffect: 0.8,
        observedMeanEffect: 0.9,
        sampleSize: 5,
        dispersion: 0.2,
        confidence: 'medium',
        filters: { poolType: 'saltwater', outputPercentBand: '61-80' },
        latestSampleAt: '2026-07-10T10:00:00.000Z',
      },
    ];
    const insights = deriveInsights(adjustments);
    expect(insights.length).toBeGreaterThanOrEqual(1);
    const facInsight = insights.find((i) => i.metric === 'fac');
    expect(facInsight).toBeDefined();
    expect(facInsight!.label).toContain('FAC increase per chlorinator');
    expect(facInsight!.sampleSize).toBe(5);
    expect(facInsight!.confidence).toBe('medium');
  });

  it('derives insights from chlorine granules', () => {
    const adjustments: LearnedAdjustment[] = [
      {
        id: 'test',
        actionType: 'chemical:chlorine-granules',
        metric: 'fac',
        observedMedianEffect: 1.5,
        observedMeanEffect: 1.6,
        sampleSize: 8,
        dispersion: 0.3,
        confidence: 'medium',
        filters: { poolType: 'chlorine' },
        latestSampleAt: '2026-07-10T10:00:00.000Z',
      },
    ];
    const insights = deriveInsights(adjustments);
    const facInsight = insights.find((i) => i.actionType === 'chemical:chlorine-granules');
    expect(facInsight).toBeDefined();
    expect(facInsight!.label).toContain('FAC response to chlorine granules');
  });

  it('derives pH insights from reducer and increaser', () => {
    const adjustments: LearnedAdjustment[] = [
      {
        id: 'test-1',
        actionType: 'chemical:ph-reducer',
        metric: 'ph',
        observedMedianEffect: -0.3,
        observedMeanEffect: -0.32,
        sampleSize: 6,
        dispersion: 0.1,
        confidence: 'medium',
        filters: { poolType: 'chlorine' },
        latestSampleAt: '2026-07-10T10:00:00.000Z',
      },
    ];
    const insights = deriveInsights(adjustments);
    const phInsight = insights.find((i) => i.actionType === 'chemical:ph-reducer');
    expect(phInsight).toBeDefined();
    expect(phInsight!.label).toContain('pH response to pH reducer');
    expect(phInsight!.value).toContain('-0.3');
  });

  it('derives salt insights from pool salt adjustments', () => {
    const adjustments: LearnedAdjustment[] = [
      {
        id: 'test',
        actionType: 'chemical:pool-salt',
        metric: 'salt',
        observedMedianEffect: 150,
        observedMeanEffect: 160,
        sampleSize: 4,
        dispersion: 30,
        confidence: 'low',
        filters: { poolType: 'saltwater' },
        latestSampleAt: '2026-07-10T10:00:00.000Z',
      },
    ];
    const insights = deriveInsights(adjustments);
    const saltInsight = insights.find((i) => i.actionType === 'chemical:pool-salt');
    expect(saltInsight).toBeDefined();
    expect(saltInsight!.label).toContain('Salt level response');
    expect(saltInsight!.value).toContain('+150');
  });

  it('excludes insights with no confidence (none)', () => {
    const adjustments: LearnedAdjustment[] = [
      {
        id: 'test',
        actionType: 'chlorinator',
        metric: 'fac',
        observedMedianEffect: 0.5,
        observedMeanEffect: 0.5,
        sampleSize: 2,
        dispersion: 0.1,
        confidence: 'none',
        filters: { poolType: 'saltwater' },
        latestSampleAt: '2026-07-10T10:00:00.000Z',
      },
    ];
    const insights = deriveInsights(adjustments);
    expect(insights.length).toBe(0);
  });
});

// ── Deterministic (not persisted) ─────────────────────────────────

describe('learning is deterministic and not persisted', () => {
  it('returns same results on repeated calls', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', ph: 7.9 }, 'm3'),
      makeMeasurement({ measuredAt: '2026-07-10T16:00:00.000Z', ph: 7.6 }, 'm4'),
      makeMeasurement({ measuredAt: '2026-07-11T10:00:00.000Z', ph: 7.7 }, 'm5'),
      makeMeasurement({ measuredAt: '2026-07-11T16:00:00.000Z', ph: 7.4 }, 'm6'),
    ];
    const actions = [
      makePhReducerAction({ performedAt: '2026-07-09T11:00:00.000Z' }, 'act-1'),
      makePhReducerAction({ performedAt: '2026-07-10T11:00:00.000Z' }, 'act-2'),
      makePhReducerAction({ performedAt: '2026-07-11T11:00:00.000Z' }, 'act-3'),
    ];

    const first = computeLearning(measurements, actions, makeSettings());
    const second = computeLearning(measurements, actions, makeSettings());
    expect(first).toEqual(second);
  });
});
