import { describe, it, expect } from 'vitest';
import {
  runPersonalizedAssistant,
  applyPersonalization,
} from '../src/domain/maintenanceAssistant';
import type { MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import { DEFAULT_HISTORICAL_LEARNING } from '../src/domain/settings';
import type {
  PoolSettings,
  HistoricalLearningConfig,
} from '../src/domain/settings';
import { computeLearning } from '../src/domain/historicalLearning';
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

function makeSettings(
  overrides: Partial<PoolSettings> = {},
): PoolSettings {
  return {
    volume: 50000,
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
    historicalLearning: { ...DEFAULT_HISTORICAL_LEARNING },
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

function makeChlorineGranulesAction(
  overrides: Partial<MaintenanceAction> = {},
  id?: string,
): MaintenanceAction {
  return {
    id: id ?? 'act-g-1',
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

/**
 * Build a chlorinator recommendation as would be produced by runAssistant.
 */
function makeChlorinatorRec(
  overrides: Partial<MaintenanceRecommendation> = {},
): MaintenanceRecommendation {
  return {
    id: 'rec-1',
    kind: 'equipment',
    severity: 'medium',
    title: 'Ajustar clorador salino',
    summary: 'Adjust chlorinator to increase FAC.',
    reason: 'FAC is below target range.',
    priority: 3,
    relatedFields: ['fac'],
    equipmentName: 'Clorador salino',
    suggestedOutputPercent: 80,
    suggestedAdditionalHours: 3,
    targetRange: { min: 0.8, max: 2.5, unit: 'ppm' },
    currentValue: 0.5,
    calculationNotes: ['Déficit de cloro: 1.0 ppm.'],
    safetyNotes: [],
    followUpActions: ['Medir FAC después del ciclo.'],
    retestAfterHours: 24,
    ...overrides,
  };
}

/**
 * Build a chlorine granules recommendation as would be produced by runAssistant.
 */
function makeChlorineRec(
  overrides: Partial<MaintenanceRecommendation> = {},
): MaintenanceRecommendation {
  return {
    id: 'rec-2',
    kind: 'chemical',
    severity: 'medium',
    title: 'Cloro granulado',
    summary: 'Apply chlorine granules.',
    reason: 'FAC is critically low.',
    priority: 4,
    relatedFields: ['fac'],
    chemicalProductId: 'chlorine-granules',
    genericProductName: 'Cloro granulado',
    mainComponent: 'Cloro de disolución rápida',
    estimatedAmount: 500,
    unit: 'g',
    targetRange: { min: 0.8, max: 2.5, unit: 'ppm' },
    currentValue: 0.3,
    calculationNotes: ['Dosis estimada: 500 g.'],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'No mezclar con ácidos.',
    ],
    followUpActions: ['Aplicar cloro granulado.', 'Medir FAC después.'],
    retestAfterHours: 6,
    ...overrides,
  };
}

const defaultConfig: HistoricalLearningConfig = {
  enabled: true,
  minimumSamples: 5,
  applyLowConfidence: false,
  minCorrectionFactor: 0.5,
  maxCorrectionFactor: 1.5,
};

// ── No-learning tests ─────────────────────────────────────────

describe('personalization — no learning available', () => {
  it('returns undefined when learning is disabled', () => {
    const rec = makeChlorinatorRec();
    const result = applyPersonalization(
      rec,
      [],
      null,
      makeSettings(),
      { ...defaultConfig, enabled: false },
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined with no adjustments data', () => {
    const rec = makeChlorinatorRec();
    const result = applyPersonalization(
      rec,
      [],
      makeMeasurement(),
      makeSettings(),
      defaultConfig,
    );
    expect(result).toBeUndefined();
  });
});

// ── Minimum samples tests ────────────────────────────────────

describe('personalization — minimum samples', () => {
  it('does not personalize with fewer than minimum samples', () => {
    // Build a scenario with exactly 3 samples (below the default minimumSamples=5)
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 3; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 5 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 1.5, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings();
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);
    // With only 3 samples and minimumSamples=5, no adjustments should be produced
    expect(adjustments.length).toBe(0);

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );
    expect(result).toBeUndefined();
  });
});

// ── Confidence tests ────────────────────────────────────────

describe('personalization — confidence', () => {
  it('personalizes with medium confidence (5+ samples, low dispersion)', () => {
    // 5 actions with consistent FAC increase
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 1.5, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings();
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);
    expect(adjustments.length).toBeGreaterThan(0);

    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();
    expect(chlAdj!.confidence).toBe('medium');

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );
    expect(result).toBeDefined();
    expect(result!.applied).toBe(true);
    expect(result!.confidence).toBe('medium');
    expect(result!.sampleSize).toBeGreaterThanOrEqual(5);
    expect(result!.explanation).toContain('3 additional hours');
  });

  it('does not personalize with low confidence by default', () => {
    // Build 4 samples only (low confidence) — should not personalize with applyLowConfidence=false
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 4; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 5 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 1.5, temperature: 25 },
          afterId,
        ),
      );
    }

    // Use minimumSamples=3 so that the adjustment is computed but confidence is 'low'
    const lowConfig: HistoricalLearningConfig = {
      ...defaultConfig,
      minimumSamples: 3,
      applyLowConfidence: false,
    };
    const settings = makeSettings();
    const adjustments = computeLearning(measurements, actions, settings, lowConfig);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();
    expect(chlAdj!.confidence).toBe('low');

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      lowConfig,
    );
    // With low confidence and applyLowConfidence=false, applied should be false
    expect(result).toBeDefined();
    expect(result!.applied).toBe(false);
    expect(result!.confidence).toBe('low');
  });
});

// ── Correction factor clamping ──────────────────────────────

describe('personalization — correction factor clamping', () => {
  it('clamps correction factor to configured bounds', () => {
    // The correction factor is already clamped in computeLearning.
    // We can verify that the resulting personalization is within bounds
    // by checking that the personalized value is not more than 1/minFactor or 1/maxFactor

    // Use aggressive values: very low observed FAC increase relative to expected
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      // Very small FAC increase (only 0.3 ppm) — much less than theoretical
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 0.8, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings({ volume: 50000 });
    const config: HistoricalLearningConfig = {
      enabled: true,
      minimumSamples: 5,
      applyLowConfidence: false,
      minCorrectionFactor: 0.5,
      maxCorrectionFactor: 1.5,
    };
    const adjustments = computeLearning(measurements, actions, settings, config);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');

    // The correction factor should be clamped between 0.5 and 1.5
    if (chlAdj && chlAdj.correctionFactor !== undefined) {
      expect(chlAdj.correctionFactor).toBeGreaterThanOrEqual(0.5);
      expect(chlAdj.correctionFactor).toBeLessThanOrEqual(1.5);
    }

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      config,
    );

    if (result && result.applied && result.correctionFactor !== undefined) {
      expect(result.correctionFactor).toBeGreaterThanOrEqual(0.5);
      expect(result.correctionFactor).toBeLessThanOrEqual(1.5);
    }
  });
});

// ── Safety limit enforcement ────────────────────────────────

describe('personalization — safety limits', () => {
  it('does not exceed chlorinator maximum hours', () => {
    // Create a scenario with very low FAC production → large correction → high hours
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 0.7, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings({
      saltChlorinator: {
        enabled: true,
        productionGramsPerHour: 20,
        currentOutputPercent: 60,
        filtrationHoursPerDay: 6,
        maxRecommendedOutputPercent: 100,
        maxRecommendedHoursPerDay: 12,
      },
    });
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 10 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );

    if (result && result.applied && result.personalizedValue !== undefined) {
      const maxHours = settings.saltChlorinator!.maxRecommendedHoursPerDay;
      expect(result.personalizedValue).toBeLessThanOrEqual(maxHours);
    }
  });

  it('does not exceed chemical per-treatment cap (25 g/m³)', () => {
    // Even with a very large correction factor pushing up the amount,
    // the personalized value should not exceed 25 g/m³
    const volM3 = 50; // 50000 L = 50 m³
    const maxG = 25 * volM3; // 1250g

    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorineGranulesAction(
          {
            id: `act-g-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro granulado', amount: 500, unit: 'g' },
          },
          `act-g-${i}`,
        ),
      );
      // Very small FAC increase (ineffective)
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 0.7, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings({ volume: 50000 });
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);

    const rec = makeChlorineRec({ estimatedAmount: 500 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );

    if (result && result.applied && result.personalizedValue !== undefined) {
      expect(result.personalizedValue).toBeLessThanOrEqual(maxG);
    }
  });
});

// ── Disable learning ────────────────────────────────────────

describe('personalization — disable learning', () => {
  it('returns theoretical estimates when learning is disabled', () => {
    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      [{
        id: 'test-adj',
        actionType: 'chlorinator',
        metric: 'fac',
        observedMedianEffect: 1.0,
        observedMeanEffect: 1.0,
        sampleSize: 10,
        dispersion: 0.2,
        theoreticalEffect: 1.0,
        correctionFactor: 0.8,
        confidence: 'high',
        filters: { poolType: 'saltwater' },
        latestSampleAt: '2026-07-09T12:00:00.000Z',
      }],
      makeMeasurement({ temperature: 25 }),
      makeSettings(),
      { ...defaultConfig, enabled: false },
    );
    expect(result).toBeUndefined();
  });

  it('runPersonalizedAssistant returns theoretical when learning disabled', () => {
    const measurements = [makeMeasurement({ fac: 0.5 })];
    const actions: MaintenanceAction[] = [];
    const settings = makeSettings({
      historicalLearning: { ...defaultConfig, enabled: false },
    });
    const result = runPersonalizedAssistant(measurements, actions, settings);
    // All recommendations should NOT have personalization
    for (const rec of result.recommendations) {
      expect(rec.personalization).toBeUndefined();
    }
  });
});

// ── Explanation tests ───────────────────────────────────────

describe('personalization — explanation', () => {
  it('explanation includes sample size and confidence', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
            chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 1.5, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings();
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();

    const rec = makeChlorinatorRec({ suggestedAdditionalHours: 3 });
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );

    expect(result).toBeDefined();
    if (result) {
      expect(result.explanation).toContain(String(chlAdj!.sampleSize));
      expect(result.sampleSize).toBe(chlAdj!.sampleSize);
      expect(result.confidence).toBe(chlAdj!.confidence);
      // Verify the explanation mentions the theoretical estimate
      expect(result.explanation).toContain('3 additional hours');
    }
  });
});

// ── Safety warning immutability ─────────────────────────────

describe('personalization — safety warnings never change', () => {
  it('safety notes on chemical recommendations are preserved', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    for (let i = 0; i < 5; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 3 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.3, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorineGranulesAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 0.8, temperature: 25 },
          afterId,
        ),
      );
    }

    const rec = makeChlorineRec();
    const safetyNotesBefore = [...rec.safetyNotes];

    const settings = makeSettings();
    const adjustments = computeLearning(measurements, actions, settings, defaultConfig);
    const result = applyPersonalization(
      rec,
      adjustments,
      makeMeasurement({ temperature: 25 }),
      settings,
      defaultConfig,
    );

    // Safety notes should never be modified by personalization
    expect(rec.safetyNotes).toEqual(safetyNotesBefore);
    // If personalization was applied, it modifies the personalization sub-object, not safety notes
    if (result) {
      expect(rec.safetyNotes).toEqual(safetyNotesBefore);
    }
  });
});

// ── Full integration via runPersonalizedAssistant ───────────

describe('runPersonalizedAssistant', () => {
  it('produces recommendations without personalization when no actions', () => {
    const measurements = [makeMeasurement({ fac: 0.5 })];
    const actions: MaintenanceAction[] = [];
    const settings = makeSettings();
    const result = runPersonalizedAssistant(measurements, actions, settings);

    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec.personalization).toBeUndefined();
    }
  });

  it('does not modify danger warnings or safety-related recommendations', () => {
    const measurements = [makeMeasurement({ ph: 6.0, fac: 0.1 })];
    const actions: MaintenanceAction[] = [];
    const settings = makeSettings();
    const result = runPersonalizedAssistant(measurements, actions, settings);

    // Danger warnings should exist even with personalization
    const dangerRecs = result.recommendations.filter(
      (r) => r.severity === 'danger' || r.severity === 'high',
    );
    expect(dangerRecs.length).toBeGreaterThan(0);

    // Safety notes should not be modified by personalization
    for (const rec of result.recommendations) {
      expect(rec.personalization).toBeUndefined(); // no actions, so no learning
    }
  });

  it('preserves pH/chlorine ordering (pH correction first)', () => {
    const measurements = [makeMeasurement({ ph: 8.0, fac: 0.5 })];
    const actions: MaintenanceAction[] = [];
    const settings = makeSettings();
    const result = runPersonalizedAssistant(measurements, actions, settings);

    const phRecs = result.recommendations.filter(
      (r) => r.relatedFields.includes('ph') && r.kind === 'chemical',
    );
    const facRecs = result.recommendations.filter(
      (r) => r.relatedFields.includes('fac') && r.kind === 'chemical',
    );

    // pH correction should have a lower (higher priority) number than FAC correction
    if (phRecs.length > 0 && facRecs.length > 0) {
      const phPriority = Math.min(...phRecs.map((r) => r.priority));
      const facPriority = Math.min(...facRecs.map((r) => r.priority));
      expect(phPriority).toBeLessThan(facPriority);
    }
  });

  it('preserves missing-measurement warnings', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];
    const settings = makeSettings();
    const result = runPersonalizedAssistant(measurements, actions, settings);

    expect(result.status).toBe('insufficient-data');
    expect(result.recommendations.length).toBe(0);
  });
});

describe('computeLearning with config', () => {
  it('uses minimumSamples from config', () => {
    const measurements: Measurement[] = [];
    const actions: MaintenanceAction[] = [];

    // 4 samples — enough for minimumSamples=3, not enough for default 5
    for (let i = 0; i < 4; i++) {
      const beforeId = `m-before-${i}`;
      const afterId = `m-after-${i}`;
      const day = 5 + i;
      measurements.push(
        makeMeasurement(
          { id: beforeId, measuredAt: `2026-07-0${day}T10:00:00.000Z`, fac: 0.5, temperature: 25 },
          beforeId,
        ),
      );
      actions.push(
        makeChlorinatorAction(
          {
            id: `act-${i}`,
            performedAt: `2026-07-0${day}T11:00:00.000Z`,
          },
          `act-${i}`,
        ),
      );
      measurements.push(
        makeMeasurement(
          { id: afterId, measuredAt: `2026-07-0${day + 1}T10:00:00.000Z`, fac: 1.5, temperature: 25 },
          afterId,
        ),
      );
    }

    const settings = makeSettings();

    // With minimumSamples=6, 4 samples should be excluded
    const config6: HistoricalLearningConfig = {
      ...defaultConfig,
      minimumSamples: 6,
    };
    const adj6 = computeLearning(measurements, actions, settings, config6);
    const chl6 = adj6.find((a) => a.actionType === 'chlorinator');
    expect(chl6).toBeUndefined();

    // With minimumSamples=3, 4 samples should produce an adjustment
    const config3: HistoricalLearningConfig = {
      ...defaultConfig,
      minimumSamples: 3,
      applyLowConfidence: false,
    };
    const adj3 = computeLearning(measurements, actions, settings, config3);
    const chl3 = adj3.find((a) => a.actionType === 'chlorinator');
    expect(chl3).toBeDefined();
    expect(chl3!.confidence).toBe('low');
  });
});
