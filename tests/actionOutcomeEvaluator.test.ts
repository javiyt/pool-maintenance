import { describe, it, expect } from 'vitest';
import { evaluateActionOutcomes } from '../src/domain/actionOutcomeEvaluator';
import type { ActionOutcome } from '../src/domain/actionOutcomeEvaluator';
import type { Measurement } from '../src/domain/measurement';
import type { MaintenanceAction } from '../src/domain/actions';

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

function makeChemicalAction(
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

function findOutcome(outcomes: ActionOutcome[], actionId: string): ActionOutcome | undefined {
  return outcomes.find((o) => o.actionId === actionId);
}

// ── Tests ─────────────────────────────────────────────────────────

describe('evaluateActionOutcomes', () => {
  it('returns empty array when no measurements', () => {
    const result = evaluateActionOutcomes([], [makeChemicalAction()]);
    expect(result).toEqual([]);
  });

  it('returns empty array when no actions', () => {
    const result = evaluateActionOutcomes([makeMeasurement()], []);
    expect(result).toEqual([]);
  });

  it('skips non-evaluable action kinds (manual-test, other)', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z' }, 'm2'),
    ];
    const actions = [
      makeChemicalAction({ kind: 'manual-test' }, 'act-mt'),
      makeChemicalAction({ kind: 'other' }, 'act-other'),
    ];
    const outcomes = evaluateActionOutcomes(measurements, actions);
    expect(outcomes).toEqual([]);
  });
});

// ── Before/after measurement finding ──────────────────────────────

describe('measurement finding', () => {
  it('correctly finds before and after measurements', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z' }, 'm2'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].beforeMeasurementId).toBe('m1');
    expect(outcomes[0].afterMeasurementId).toBe('m2');
    expect(outcomes[0].elapsedHours).toBe(5); // 16:00 - 11:00
  });

  it('prefers explicitly linked measurement', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z' }, 'm2'),
      makeMeasurement({ measuredAt: '2026-07-09T09:00:00.000Z' }, 'm3'), // closer before but not linked
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm1',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].beforeMeasurementId).toBe('m1');
  });

  it('handles no prior measurement', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z' }, 'm2'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T15:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toEqual([]);
  });

  it('handles no later measurement', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toEqual([]);
  });

  it('rejects measurement taken too soon (before minHours)', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      // After measurement only 2 hours later — chemical needs min 4h
      makeMeasurement({ measuredAt: '2026-07-09T12:30:00.000Z' }, 'm2'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    // The closest after is at 12:30, which is 1.5h after action — below min 4h
    expect(outcomes).toEqual([]);
  });

  it('keeps late measurements as late inconclusive observations', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      // After measurement 72 hours later — chemical max is 48h
      makeMeasurement({ measuredAt: '2026-07-12T11:00:00.000Z' }, 'm2'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].timing).toBe('late');
    expect(outcomes[0].effectiveness).toBe('inconclusive');
  });

  it('uses closest valid measurement when multiple exist', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T17:00:00.000Z' }, 'm2'), // 6h after — valid but not closest
      makeMeasurement({ measuredAt: '2026-07-09T15:30:00.000Z' }, 'm3'), // 4.5h after — valid and closest
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].afterMeasurementId).toBe('m3');
    expect(outcomes[0].elapsedHours).toBe(4.5);
  });
});

// ── Delta calculation ─────────────────────────────────────────────

describe('delta calculation', () => {
  it('calculates FAC, pH, ORP, and salt deltas', () => {
    const measurements = [
      makeMeasurement({
        measuredAt: '2026-07-09T10:00:00.000Z',
        ph: 7.8,
        fac: 0.5,
        orp: 600,
        salt: 3200,
      }, 'm1'),
      makeMeasurement({
        measuredAt: '2026-07-09T16:00:00.000Z',
        ph: 7.4,
        fac: 1.8,
        orp: 680,
        salt: 3300,
      }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].changes.ph).toBe(-0.4);
    expect(outcomes[0].changes.fac).toBe(1.3);
    expect(outcomes[0].changes.orp).toBe(80);
    expect(outcomes[0].changes.salt).toBe(100);
  });
});

// ── Effectiveness evaluation ──────────────────────────────────────

describe('effectiveness evaluation', () => {
  it('chlorinator action followed by FAC increase is effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 0.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T18:00:00.000Z', fac: 1.8 }, 'm2'),
    ];
    const action = makeChlorinatorAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
    expect(outcomes[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('pH reducer followed by pH decrease is effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
  });

  it('pH increaser followed by pH increase is effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.0 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.3 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-increaser', mainComponent: 'Base', amount: 1000, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
  });

  it('chlorine granules followed by FAC and ORP increase is effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 0.5, orp: 580 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', fac: 2.5, orp: 720 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 500, unit: 'g' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
  });

  it('pool salt followed by salt increase is effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', salt: 2800 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-11T10:00:00.000Z', salt: 3200 }, 'm2'), // 48h later
    ];
    const action = makeSaltAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
  });

  it('opposite-direction result is unexpected', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.2 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 8.0 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('unexpected');
  });

  it('tiny/noisy change is inconclusive', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 1.9 }, 'm1'),
      // FAC change of 0.1 is below significance threshold of 0.2
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', fac: 2.0 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 100, unit: 'g' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('inconclusive');
  });

  it('does not mark a chlorinator action with negative noisy FAC evidence as partially effective', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 1.0, orp: 650 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', fac: 0.9, orp: 599 }, 'm2'),
    ];
    const action = makeChlorinatorAction({ performedAt: '2026-07-09T11:00:00.000Z' });

    const outcomes = evaluateActionOutcomes(measurements, [action]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].changes.fac).toBe(-0.1);
    expect(outcomes[0].changes.orp).toBe(-51);
    expect(outcomes[0].effectiveness).toBe('inconclusive');
    expect(outcomes[0].effectiveness).not.toBe('partially-effective');
    expect(outcomes[0].explanationCodes).toContain('CHANGE_WITHIN_MEASUREMENT_ERROR');
  });
});

// ── Confidence and intervening actions ────────────────────────────

describe('confidence', () => {
  it('reduces confidence with multiple intervening actions', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T22:00:00.000Z', ph: 7.5 }, 'm2'), // 11h after action
    ];
    const action = makeChemicalAction({
      id: 'main-act',
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const other1 = makeChemicalAction({
      id: 'other-1',
      performedAt: '2026-07-09T13:00:00.000Z',
      description: 'Added chlorine',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 200, unit: 'g' },
    });
    const other2 = makeChemicalAction({
      id: 'other-2',
      performedAt: '2026-07-09T15:00:00.000Z',
      description: 'Added more pH reducer',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 500, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action, other1, other2]);
    expect(outcomes).toHaveLength(3);

    const mainOutcome = findOutcome(outcomes, 'main-act');
    expect(mainOutcome).toBeDefined();
    // With 2 intervening actions (0.3 each = 0.6 reduction) + no linked meas (0.2 reduction)
    // Base 0.8 - 0.2 (no link) - 0.6 (intervening) = 0.0, minimum clamped to 0.1
    expect(mainOutcome!.confidence).toBeLessThan(0.5);
    expect(mainOutcome!.confidenceReasonCodes?.some((r) => r.code === 'outcome.confidenceReason.interveningActions')).toBe(true);
  });

  it('higher confidence with explicitly linked measurement', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm1',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    // With linked measurement and no context reductions: base confidence is 0.85
    expect(outcomes[0].confidence).toBe(0.85);
  });
});

// ── Expected fields by action type ──────────────────────────────

describe('expectedFields for action types', () => {
  it('chlorine-stabilizer has no measurable fields → unknown', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 1.0 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', fac: 2.0 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'chlorine-stabilizer', mainComponent: 'Stabilizer', amount: 500, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('unknown');
    expect(outcomes[0].confidence).toBe(0.1);
  });

  it('alkalinity-reducer has no measurable fields → unknown', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'alkalinity-reducer', mainComponent: 'Reducer', amount: 500, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('unknown');
  });

  it('filtration action expects FAC increase', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 1.0 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-10T06:00:00.000Z', fac: 1.8 }, 'm2'), // 19h later — within 12-72h window
    ];
    const action: MaintenanceAction = {
      id: 'act-filt',
      performedAt: '2026-07-09T11:00:00.000Z',
      kind: 'filtration',
      description: 'Extended filtration',
      filtration: { previousHours: 6, newHours: 10 },
    };
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('effective');
  });
});

// ── Fields already in range ─────────────────────────────────────

describe('fields already in range before action', () => {
  it('is inconclusive when fields were already in range and stayed', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.4, fac: 1.5 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.4, fac: 1.5 }, 'm2'), // No change at all
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('inconclusive');
    expect(outcomes[0].explanationDetails?.some((r) => r.code === 'outcome.reason.fieldsAlreadyInRange')).toBe(true);
  });

  it('is inconclusive when chlorine applied but FAC already in range', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 2.0 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', fac: 2.1 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 500, unit: 'g' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).toBe('inconclusive');
    expect(outcomes[0].actionSuitability).toBe('unnecessary');
    expect(outcomes[0].explanationCodes).toContain('FIELDS_ALREADY_IN_RANGE');
  });

  it('does not call chemical action partially effective only because FAC was already in range', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 2.0, orp: 610 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', fac: 2.0, orp: 660 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 500, unit: 'g' },
    });

    const outcomes = evaluateActionOutcomes(measurements, [action]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].effectiveness).not.toBe('partially-effective');
    expect(outcomes[0].actionSuitability).toBe('unnecessary');
  });
});

// ── Linked measurement after action ─────────────────────────────

describe('linked after measurement', () => {
  it('uses explicitly linked after measurement when within window', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T14:00:00.000Z', ph: 7.6 }, 'm2'), // 3h after — below min 4h
      makeMeasurement({ measuredAt: '2026-07-09T17:00:00.000Z', ph: 7.5 }, 'm3'), // 6h after — valid
    ];
    // Link to m1 (before) and m3 (after, within window)
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm3',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    // After measurement should be m3 (6h after action, linked)
    expect(outcomes[0].afterMeasurementId).toBe('m3');
  });

  it('linked measurement after action can be used inside the maximum window', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-11T10:00:00.000Z', ph: 7.5 }, 'm2'), // 47h later — still within window
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm2',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].afterMeasurementId).toBe('m2');
    expect(outcomes[0].elapsedHours).toBe(47);
  });

  it('linked measurement after action is kept as late when outside maximum window', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-11T12:00:00.000Z', ph: 7.5 }, 'm2'), // 49h later — above max 48h
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm2',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].timing).toBe('late');
  });
});

// ── Before measurement edge cases ───────────────────────────────

describe('before measurement edge cases', () => {
  it('falls back to nearest before when linked measurement is after action', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
      makeMeasurement({ measuredAt: '2026-07-09T12:00:00.000Z', ph: 7.7 }, 'm3'), // after action!
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      relatedMeasurementId: 'm3', // m3 is after the action → should fall back to m1
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].beforeMeasurementId).toBe('m1');
  });

  it('returns no outcome when no before measurement within 7 days', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-06-01T10:00:00.000Z', ph: 7.8 }, 'm1'), // >7 days before
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const action = makeChemicalAction({ performedAt: '2026-07-09T11:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    // m1 is ~38 days before → outside 7-day window → no before measurement
    expect(outcomes).toEqual([]);
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe('edge cases', () => {
  it('water-replacement produces partially-effective outcome', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', salt: 4000, tds: 3800, ec: 7500 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', salt: 3500, tds: 3400, ec: 7000 }, 'm2'),
    ];
    const action: MaintenanceAction = {
      id: 'act-water',
      performedAt: '2026-07-09T14:00:00.000Z',
      kind: 'water-replacement',
      description: 'Partial water change',
      waterReplacement: { estimatedLiters: 5000, estimatedPercent: 10 },
    };
    const outcomes = evaluateActionOutcomes(measurements, [action]);
    expect(outcomes).toHaveLength(1);
    // Water replacement expected direction is 0 (any), so significant changes
    // in salt/TDS/EC should count as "matched"
    expect(outcomes[0].effectiveness).toBe('effective');
  });

  it('multiple actions between same measurements detected', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 1.0 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T20:00:00.000Z', fac: 2.0 }, 'm2'),
    ];
    const action1 = makeChlorinatorAction({ id: 'c1', performedAt: '2026-07-09T11:00:00.000Z' });
    const action2 = makeChlorinatorAction({ id: 'c2', performedAt: '2026-07-09T12:00:00.000Z' });
    const action3 = makeChlorinatorAction({ id: 'c3', performedAt: '2026-07-09T13:00:00.000Z' });
    const outcomes = evaluateActionOutcomes(measurements, [action1, action2, action3]);
    expect(outcomes).toHaveLength(3);

    // c1 should see 2 intervening (c2 and c3) between its before (m1, 10:00) and after (m2, 20:00)
    const o1 = findOutcome(outcomes, 'c1');
    expect(o1).toBeDefined();
    expect(o1!.confidenceReasonCodes?.some((r) => r.code === 'outcome.confidenceReason.interveningActions' && r.params?.count === 2)).toBe(true);

    // c2 should see 2 intervening (c1 and c3) since all share the same before/after pair
    const o2 = findOutcome(outcomes, 'c2');
    expect(o2).toBeDefined();
    expect(o2!.confidenceReasonCodes?.some((r) => r.code === 'outcome.confidenceReason.interveningActions' && r.params?.count === 2)).toBe(true);
  });
});

// ── Evaluator is deterministic (not persisted) ────────────────────

describe('derived outcomes are not persisted', () => {
  it('returns fresh outcomes each call', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.8 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-09T16:00:00.000Z', ph: 7.5 }, 'm2'),
    ];
    const action = makeChemicalAction({
      performedAt: '2026-07-09T11:00:00.000Z',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    });
    const first = evaluateActionOutcomes(measurements, [action]);
    const second = evaluateActionOutcomes(measurements, [action]);
    // Strip evaluatedAt (clock-dependent) and compare the rest
    const { evaluatedAt: _a, ...firstRest } = first[0];
    const { evaluatedAt: _b, ...secondRest } = second[0];
    expect(firstRest).toEqual(secondRest);
    expect(first).toHaveLength(1);
  });
});
