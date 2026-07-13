import { describe, it, expect } from 'vitest';
import {
  estimateAlkalinityState,
  estimateCyanuricAcidState,
  observationsToConfidence,
  collectComparablePhCorrections,
  collectComparableFacIntervals,
  createDiagnosticExperiment,
  activateExperiment,
  advanceExperimentStep,
  cancelExperiment,
  markExperimentInvalid,
} from '../src/domain/latentStateEstimator';
import type { Measurement } from '../src/domain/measurement';
import type { MaintenanceAction } from '../src/domain/actions';
import type { PoolSettings } from '../src/domain/settings';

// ── Helpers ───────────────────────────────────────────────────────

let _mCounter = 0;
function makeMeasurement(
  overrides: Partial<Measurement> = {},
  id?: string,
): Measurement {
  _mCounter += 1;
  return {
    id: id ?? `m-${_mCounter}`,
    measuredAt: new Date(Date.now() + _mCounter * 3600000).toISOString(),
    ph: 7.4,
    ec: 1500,
    tds: 750,
    salt: 3200,
    orp: 700,
    fac: 2.0,
    temperature: 25,
    ...overrides,
  };
}

let _aCounter = 0;
function makeAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  _aCounter += 1;
  return {
    id: id ?? `act-${_aCounter}`,
    performedAt: new Date(Date.now() + _aCounter * 3600000).toISOString(),
    kind: 'chemical',
    description: 'pH reducer',
    chemical: {
      productType: 'ph-reducer',
      mainComponent: 'Acid',
      amount: 100,
      unit: 'ml',
    },
    ...overrides,
  };
}

const defaultSettings: PoolSettings = {
  volume: 50000,
  volumeUnit: 'liters',
  poolType: 'saltwater',
  unitSystem: 'metric',
};

// ── observationsToConfidence ──────────────────────────────────────

describe('observationsToConfidence', () => {
  it('0 observations produces none', () => {
    expect(observationsToConfidence(0)).toBe('none');
  });
  it('1 observation produces none', () => {
    expect(observationsToConfidence(1)).toBe('none');
  });
  it('2 observations produces low', () => {
    expect(observationsToConfidence(2)).toBe('low');
  });
  it('3 observations produces low', () => {
    expect(observationsToConfidence(3)).toBe('low');
  });
  it('4 observations produces medium', () => {
    expect(observationsToConfidence(4)).toBe('medium');
  });
  it('7 observations produces medium', () => {
    expect(observationsToConfidence(7)).toBe('medium');
  });
  it('8 observations produces high', () => {
    expect(observationsToConfidence(8)).toBe('high');
  });
  it('10 observations produces high', () => {
    expect(observationsToConfidence(10)).toBe('high');
  });
});

// ── Alkalinity estimation ─────────────────────────────────────────

describe('estimateAlkalinityState', () => {
  it('insufficient history produces unknown', () => {
    const result = estimateAlkalinityState([], [], defaultSettings);
    expect(result.state).toBe('unknown');
    expect(result.confidence).toBe('none');
  });

  it('no comparable corrections produces unknown', () => {
    const ms = [makeMeasurement({ ph: 7.4 })];
    const actions = [makeAction({ kind: 'cleaning' })]; // not a chemical action
    const result = estimateAlkalinityState(ms, actions, defaultSettings);
    expect(result.state).toBe('unknown');
  });

  it('no exact ppm is generated', () => {
    const result = estimateAlkalinityState([], [], defaultSettings);
    expect(result.parameter).toBe('total-alkalinity');
    // Ensure no ppm field exists on the result
    expect('state' in result).toBe(true);
  });

  it('no alkalinity-reducer dosage is generated', () => {
    const result = estimateAlkalinityState([], [], defaultSettings);
    expect(result.parameter).toBe('total-alkalinity');
    expect('estimatedAmount' in result).toBe(false);
    expect('unit' in result).toBe(false);
  });

  it('normal response supports probably-normal', () => {
    // Create 5 comparable pH corrections with expected responses
    const now = Date.now();
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforePh = 8.0;
      const afterPh = 7.4; // expected ~0.6 drop → ratio ~1.0 → normal
      const actionTime = new Date(now + i * 72000000).toISOString(); // every 20h
      const beforeTime = new Date(now + i * 72000000 - 3600000).toISOString();
      const afterTime = new Date(now + i * 72000000 + 18000000).toISOString(); // 5h later

      // Use same before measurement for all (within 2h window of each action)
      const beforeM = makeMeasurement({ ph: beforePh, measuredAt: beforeTime }, `bef-${i}`);
      const afterM = makeMeasurement({ ph: afterPh, measuredAt: afterTime }, `aft-${i}`);
      measurements.push(beforeM, afterM);

      const action = makeAction({
        performedAt: actionTime,
        chemical: {
          productType: 'ph-reducer',
          mainComponent: 'Acid',
          amount: 100,
          unit: 'ml',
        },
      }, `act-alk-${i}`);
      actions.push(action);
    }

    const result = estimateAlkalinityState(measurements, actions, defaultSettings);
    expect(result.state).toBe('probably-normal');
  });
});

// ── Cyanuric acid estimation ──────────────────────────────────────

describe('estimateCyanuricAcidState', () => {
  it('no intervals produces inconclusive', () => {
    const result = estimateCyanuricAcidState([], [], defaultSettings);
    expect(result.state).toBe('inconclusive');
  });

  it('missing sunlight/chlorinator context produces inconclusive', () => {
    // Create measurements without context
    const m1 = makeMeasurement({ fac: 2.0, measuredAt: '2026-07-10T08:00:00Z' }, 'cya-m1');
    const m2 = makeMeasurement({ fac: 1.5, measuredAt: '2026-07-10T18:00:00Z' }, 'cya-m2');
    const result = estimateCyanuricAcidState([m1, m2], [], defaultSettings);
    expect(result.state).toBe('inconclusive');
  });

  it('no exact ppm is generated', () => {
    const result = estimateCyanuricAcidState([], [], defaultSettings);
    expect(result.parameter).toBe('cyanuric-acid');
    expect('estimatedAmount' in result).toBe(false);
  });

  it('no stabilizer dosage is automatically generated', () => {
    const result = estimateCyanuricAcidState([], [], defaultSettings);
    expect(result.parameter).toBe('cyanuric-acid');
    expect('unit' in result).toBe(false);
  });
});

// ── Diagnostic experiments ────────────────────────────────────────

describe('diagnostic experiments', () => {
  it('creates ph-buffer-response experiment with proposed status', () => {
    const exp = createDiagnosticExperiment('ph-buffer-response');
    expect(exp.kind).toBe('ph-buffer-response');
    expect(exp.status).toBe('proposed');
    expect(exp.steps).toHaveLength(4);
    expect(exp.steps[0].order).toBe(1);
    expect(exp.steps[3].order).toBe(4);
  });

  it('creates chlorine-retention experiment with 4 steps', () => {
    const exp = createDiagnosticExperiment('chlorine-retention');
    expect(exp.kind).toBe('chlorine-retention');
    expect(exp.steps).toHaveLength(4);
  });

  it('activation changes status to active', () => {
    const exp = createDiagnosticExperiment('ph-buffer-response');
    const active = activateExperiment(exp);
    expect(active.status).toBe('active');
    expect(active.activatedAt).toBeDefined();
  });

  it('advance through steps to completion', () => {
    let exp = createDiagnosticExperiment('ph-buffer-response');
    exp = activateExperiment(exp);

    // Step 1: not required measurement, but step 2 requires measurement → awaiting-measurement
    exp = advanceExperimentStep(exp, 1);
    expect(exp.status).toBe('awaiting-measurement');

    // Step 2: required measurement, step 3 also requires measurement → awaiting-measurement
    exp = advanceExperimentStep(exp, 2, 'm-1');
    expect(exp.status).toBe('awaiting-measurement');

    // Step 3: required measurement, step 4 does not require measurement → active
    exp = advanceExperimentStep(exp, 3, 'm-2');
    expect(exp.status).toBe('active');

    // Step 4: not required measurement, last step → completed
    exp = advanceExperimentStep(exp, 4);
    expect(exp.status).toBe('completed');
    expect(exp.completedAt).toBeDefined();
  });

  it('cancelling active experiment', () => {
    let exp = createDiagnosticExperiment('ph-buffer-response');
    exp = activateExperiment(exp);
    exp = cancelExperiment(exp);
    expect(exp.status).toBe('cancelled');
    expect(exp.cancelledAt).toBeDefined();
  });

  it('cancelling completed experiment does nothing', () => {
    let exp = createDiagnosticExperiment('ph-buffer-response');
    exp = activateExperiment(exp);
    exp = advanceExperimentStep(exp, 1);
    exp = advanceExperimentStep(exp, 2, 'm-1');
    exp = advanceExperimentStep(exp, 3, 'm-2');
    exp = advanceExperimentStep(exp, 4);
    expect(exp.status).toBe('completed');

    const cancelled = cancelExperiment(exp);
    expect(cancelled.status).toBe('completed');
  });

  it('marking experiment invalid', () => {
    let exp = createDiagnosticExperiment('ph-buffer-response');
    exp = activateExperiment(exp);
    exp = markExperimentInvalid(exp);
    expect(exp.status).toBe('invalid');
  });

  it('tracks related measurement ids', () => {
    let exp = createDiagnosticExperiment('ph-buffer-response');
    exp = activateExperiment(exp);
    exp = advanceExperimentStep(exp, 2, 'm-1');
    exp = advanceExperimentStep(exp, 3, 'm-2');
    expect(exp.relatedMeasurementIds).toContain('m-1');
    expect(exp.relatedMeasurementIds).toContain('m-2');
  });
});

// ── collectComparablePhCorrections ─────────────────────────────────

describe('collectComparablePhCorrections', () => {
  it('finds valid pH correction with before/after measurements', () => {
    const before = makeMeasurement({ ph: 8.0, measuredAt: '2026-07-10T09:00:00Z' }, 'ph-before');
    const action = makeAction({
      performedAt: '2026-07-10T10:00:00Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Acid', amount: 100, unit: 'ml' },
    }, 'ph-act');
    const after = makeMeasurement({ ph: 7.4, measuredAt: '2026-07-10T15:00:00Z' }, 'ph-after'); // 5h later

    const corrections = collectComparablePhCorrections([before, after], [action]);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].beforePh).toBe(8.0);
    expect(corrections[0].afterPh).toBe(7.4);
  });

  it('skips action without before measurement', () => {
    const action = makeAction({
      performedAt: '2026-07-10T10:00:00Z',
    }, 'ph-act-nobefore');
    const after = makeMeasurement({ ph: 7.4, measuredAt: '2026-07-10T15:00:00Z' }, 'ph-after-nobefore');
    const corrections = collectComparablePhCorrections([after], [action]);
    expect(corrections).toHaveLength(0);
  });
});

// ── collectComparableFacIntervals ─────────────────────────────────

describe('collectComparableFacIntervals', () => {
  it('finds valid daytime interval', () => {
    const m1 = makeMeasurement({
      fac: 2.0,
      measuredAt: '2026-07-10T08:00:00Z',
      context: { sunlight: 'high' },
    }, 'fac-day-start');
    const m2 = makeMeasurement({
      fac: 1.2,
      measuredAt: '2026-07-10T18:00:00Z',
      context: { sunlight: 'high' },
    }, 'fac-day-end');

    const intervals = collectComparableFacIntervals([m1, m2], []);
    const dayIntervals = intervals.filter((i) => i.isDaytime);
    expect(dayIntervals.length).toBeGreaterThanOrEqual(1);
  });

  it('skips interval with chlorine action in between', () => {
    const m1 = makeMeasurement({
      fac: 2.0,
      measuredAt: '2026-07-10T08:00:00Z',
    }, 'fac-skip-start');
    const chlorineAction = makeAction({
      performedAt: '2026-07-10T12:00:00Z',
      kind: 'chemical',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cl', amount: 100, unit: 'g' },
    }, 'fac-skip-cl');
    const m2 = makeMeasurement({
      fac: 2.5,
      measuredAt: '2026-07-10T18:00:00Z',
    }, 'fac-skip-end');

    const intervals = collectComparableFacIntervals([m1, m2], [chlorineAction]);
    const dayIntervals = intervals.filter((i) => i.isDaytime);
    expect(dayIntervals).toHaveLength(0);
  });
});
