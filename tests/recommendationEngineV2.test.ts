import { describe, expect, it } from 'vitest';
import { runAssistant, type MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import {
  calculateFacDose,
  calculatePhDose,
  classifyChlorineCorrection,
} from '../src/domain/recommendation/chemicalDoseCalculator';
import { estimateChlorinatorFacModel } from '../src/domain/recommendation/chlorineModel';
import { buildRecommendationSnapshot } from '../src/domain/recommendation/recommendationSnapshot';
import { evaluateActionOutcomes } from '../src/domain/actionOutcomeEvaluator';
import { getProductById } from '../src/domain/chemicalCatalog';
import type { MaintenanceAction } from '../src/domain/actions';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';

function makeMeasurement(overrides: Partial<Measurement> = {}, id = 'm1'): Measurement {
  return {
    id,
    measuredAt: '2026-07-09T10:00:00.000Z',
    ph: 7.4,
    ec: 6640,
    tds: 3230,
    salt: 3200,
    orp: 610,
    fac: 0.5,
    temperature: 28,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PoolSettings> = {}): PoolSettings {
  return {
    volume: 50000,
    volumeUnit: 'liters',
    poolType: 'saltwater',
    unitSystem: 'metric',
    saltChlorinator: {
      enabled: true,
      productionGramsPerHour: 20,
      currentOutputPercent: 80,
      filtrationHoursPerDay: 8,
      maxRecommendedOutputPercent: 100,
      maxRecommendedHoursPerDay: 12,
    },
    ...overrides,
  };
}

function makeChlorinatorAction(id: string, at: string, measurementId: string): MaintenanceAction {
  return {
    id,
    performedAt: at,
    kind: 'chlorinator',
    description: 'Adjusted chlorinator',
    relatedMeasurementId: measurementId,
    chlorinator: {
      previousOutputPercent: 60,
      newOutputPercent: 90,
      additionalHours: 2,
    },
  };
}

describe('chemical dose calculator', () => {
  it('calculates chlorine dose from FAC deficit, volume, and available chlorine percent', () => {
    const dose = calculateFacDose({
      productId: 'chlorine-granules',
      settings: makeSettings(),
      currentFac: 0.2,
      targetFac: 2.0,
      correctionType: 'rapid-correction',
    });

    expect(dose.theoreticalAmount).toBe(164);
    expect(dose.unit).toBe('g');
    expect(dose.notes.join(' ')).toContain('55%');
  });

  it('classifies maintenance, rapid, and shock chlorine corrections deterministically', () => {
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0 })).toBe('maintenance-correction');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, persistentLowFac: true })).toBe('rapid-correction');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, orp: 640 })).toBe('rapid-correction');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, batherLoad: 'high' })).toBe('rapid-correction');
    expect(classifyChlorineCorrection({ fac: 0.2, targetFac: 2.0 })).toBe('shock-treatment');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, visibleAlgae: true })).toBe('shock-treatment');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, waterClarity: 'cloudy' })).toBe('shock-treatment');
    expect(classifyChlorineCorrection({ fac: 1.4, targetFac: 2.0, orp: 590 })).toBe('shock-treatment');
  });

  it('does not calculate FAC amount when product, volume, or chlorine percent is missing', () => {
    const settings = makeSettings();
    const unknown = calculateFacDose({
      productId: 'missing-product',
      settings,
      currentFac: 0.5,
      targetFac: 2,
    });
    const noVolume = calculateFacDose({
      productId: 'chlorine-granules',
      settings: makeSettings({ volume: 0 }),
      currentFac: 0.5,
      targetFac: 2,
    });
    const noAvailableChlorine = calculateFacDose({
      productId: 'pool-salt',
      settings,
      currentFac: 0.5,
      targetFac: 2,
    });

    expect(unknown.theoreticalAmount).toBeUndefined();
    expect(noVolume.theoreticalAmount).toBeUndefined();
    expect(noAvailableChlorine.theoreticalAmount).toBeUndefined();
    expect(noAvailableChlorine.notes.join(' ')).toContain('porcentaje de cloro disponible');
  });

  it('calculates pH doses with cap, missing volume fallback, and missing dosage rule fallback', () => {
    const phReducer = getProductById('ph-reducer-liquid')!;
    const alkalinityReducer = getProductById('total-alkalinity-reducer')!;

    const capped = calculatePhDose({
      product: phReducer,
      settings: makeSettings(),
      currentPh: 8.0,
      targetPh: 7.4,
      maxStep: 0.2,
    });
    const noVolume = calculatePhDose({
      product: phReducer,
      settings: makeSettings({ volume: 0 }),
      currentPh: 8.0,
      targetPh: 7.4,
      maxStep: 0.2,
    });
    const noRule = calculatePhDose({
      product: alkalinityReducer,
      settings: makeSettings(),
      currentPh: 8.0,
      targetPh: 7.4,
      maxStep: 0.2,
    });

    expect(capped.theoreticalAmount).toBe(1500);
    expect(capped.delta).toBe(-0.2);
    expect(capped.notes.join(' ')).toContain('Corrección limitada');
    expect(noVolume.theoreticalAmount).toBeUndefined();
    expect(noVolume.notes.join(' ')).toContain('volumen');
    expect(noRule.theoreticalAmount).toBeUndefined();
  });
});

describe('chlorine production model', () => {
  it('separates production, demand, and expected observable FAC', () => {
    const baseConfig = makeSettings().saltChlorinator!;
    const calm = estimateChlorinatorFacModel({
      deltaPpm: 1,
      poolVolumeLiters: 50000,
      config: baseConfig,
      hours: 4,
      batherLoad: 'medium',
      sunlight: 'medium',
    });
    const demanding = estimateChlorinatorFacModel({
      deltaPpm: 1,
      poolVolumeLiters: 50000,
      config: baseConfig,
      hours: 4,
      temperature: 32,
      batherLoad: 'high',
      sunlight: 'high',
    });
    const noVolume = estimateChlorinatorFacModel({
      deltaPpm: 1,
      poolVolumeLiters: 0,
      config: baseConfig,
      hours: 4,
    });

    expect(calm.theoreticalProductionGrams).toBe(64);
    expect(calm.grossFacIncreasePpm).toBe(1.3);
    expect(calm.demandReservePpm).toBe(0.6);
    expect(demanding.demandReservePpm).toBeGreaterThan(calm.demandReservePpm);
    expect(noVolume.grossFacIncreasePpm).toBe(0);
  });
});

describe('recommendation escalation engine integration', () => {
  it('escalates persistent low FAC after ineffective chlorinator attempts', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-01T10:00:00.000Z', fac: 0.5 }, 'm1'),
      makeMeasurement({ measuredAt: '2026-07-02T10:00:00.000Z', fac: 0.2 }, 'm2'),
      makeMeasurement({ measuredAt: '2026-07-03T10:00:00.000Z', fac: 0.5 }, 'm3'),
      makeMeasurement({ measuredAt: '2026-07-04T10:00:00.000Z', fac: 0.2 }, 'm4'),
      makeMeasurement({ measuredAt: '2026-07-05T10:00:00.000Z', fac: 0.5 }, 'm5'),
      makeMeasurement({ measuredAt: '2026-07-06T10:00:00.000Z', fac: 0.2 }, 'm6'),
    ];
    const actions = [
      makeChlorinatorAction('a1', '2026-07-01T12:00:00.000Z', 'm1'),
      makeChlorinatorAction('a2', '2026-07-03T12:00:00.000Z', 'm3'),
      makeChlorinatorAction('a3', '2026-07-05T12:00:00.000Z', 'm5'),
    ];

    const result = runAssistant(measurements, makeSettings(), actions);

    const diagnostic = result.recommendations.find((r) => r.title === 'Diagnóstico manual de cloro');
    const equipment = result.recommendations.find((r) => r.title === 'Revisar clorador salino');
    const rapid = result.recommendations.find((r) => r.title === 'Cloro rápido temporal');

    expect(diagnostic?.escalationLevel).toBe('DIAGNOSTIC');
    expect(equipment?.followUpActions.join(' ')).toContain('célula');
    expect(rapid?.chemicalProductId).toBe('chlorine-granules');
    expect(rapid?.calculationNotes.join(' ')).toContain('No es una dosis fija');
  });
});

describe('outcome evaluator v2 observations and context', () => {
  it('preserves early and preferred observations for one action', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 0.5, orp: 580 }, 'before'),
      makeMeasurement({ measuredAt: '2026-07-09T13:00:00.000Z', fac: 0.8, orp: 610 }, 'early'),
      makeMeasurement({ measuredAt: '2026-07-09T17:00:00.000Z', fac: 1.6, orp: 680 }, 'preferred'),
    ];
    const action: MaintenanceAction = {
      id: 'chlorine',
      performedAt: '2026-07-09T11:00:00.000Z',
      kind: 'chemical',
      description: 'Added chlorine',
      chemical: { productType: 'chlorine-granules', mainComponent: 'Cloro', amount: 150, unit: 'g' },
    };

    const outcomes = evaluateActionOutcomes(measurements, [action]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].afterMeasurementId).toBe('preferred');
    expect(outcomes[0].timing).toBe('preferred');
    expect(outcomes[0].observations.map((o) => o.timing)).toEqual(['early-observation', 'preferred']);
  });

  it('marks result inconclusive when context has too many external variables', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', ph: 7.9 }, 'before'),
      makeMeasurement({
        measuredAt: '2026-07-09T16:00:00.000Z',
        ph: 7.6,
        context: {
          waterAddedLiters: 2000,
          rainSincePreviousMeasurement: true,
          batherLoad: 'high',
          sunlight: 'high',
          chlorinatorHoursSincePreviousMeasurement: 4,
        },
      }, 'after'),
    ];
    const action: MaintenanceAction = {
      id: 'ph',
      performedAt: '2026-07-09T11:00:00.000Z',
      kind: 'chemical',
      description: 'Added pH reducer',
      chemical: { productType: 'ph-reducer', mainComponent: 'Ácido', amount: 750, unit: 'ml' },
    };

    const outcomes = evaluateActionOutcomes(measurements, [action]);

    expect(outcomes[0].effectiveness).toBe('inconclusive');
    expect(outcomes[0].explanationDetails?.some((r) => r.code === 'outcome.reason.tooManyExternalVariables')).toBe(true);
  });
});

describe('recommendation snapshot', () => {
  it('captures versions, input, result, calculations, and dependencies', () => {
    const recommendation: MaintenanceRecommendation = {
      id: 'rec-1',
      kind: 'chemical',
      severity: 'high',
      title: 'Cloro rápido temporal',
      summary: 'Aplicar cloro.',
      reason: 'FAC bajo persistente.',
      priority: 4,
      relatedFields: ['fac'],
      chemicalProductId: 'chlorine-granules',
      estimatedAmount: 164,
      unit: 'g',
      calculationNotes: ['Cantidad teórica calculada.'],
      safetyNotes: ['Usar protección.'],
      followUpActions: ['Medir FAC.'],
      dependencies: [],
    };

    const snapshot = buildRecommendationSnapshot({
      recommendation,
      latestMeasurement: makeMeasurement({ fac: 0.2 }),
      settings: makeSettings(),
      capturedAt: new Date('2026-07-09T12:00:00.000Z'),
    });

    expect(snapshot.recommendationEngineVersion).toBeDefined();
    expect(snapshot.outcomeEvaluatorVersion).toBeDefined();
    expect(snapshot.chemicalCatalogVersion).toBeDefined();
    expect(snapshot.input.latestMeasurement?.fac).toBe(0.2);
    expect(snapshot.result.id).toBe('rec-1');
    expect(snapshot.theoreticalAmount).toBe(164);
  });
});
