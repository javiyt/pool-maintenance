import { describe, expect, it } from 'vitest';
import { evaluateActionOutcomes } from '../src/domain/actionOutcomeEvaluator';
import type { MaintenanceAction } from '../src/domain/actions';
import { runDiagnosisEngine } from '../src/domain/diagnosis/diagnosisEngine';
import type { DiagnosisCode } from '../src/domain/diagnosis/diagnosisCode';
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
    orp: 700,
    fac: 1.5,
    temperature: 28,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PoolSettings> = {}): PoolSettings {
  return {
    volume: 3000,
    volumeUnit: 'liters',
    poolType: 'saltwater',
    unitSystem: 'metric',
    saltChlorinator: {
      enabled: true,
      productionGramsPerHour: 20,
      currentOutputPercent: 90,
      filtrationHoursPerDay: 8,
      maxRecommendedOutputPercent: 100,
      maxRecommendedHoursPerDay: 12,
    },
    ...overrides,
  };
}

function codes(measurements: Measurement[], actions: MaintenanceAction[] = []): DiagnosisCode[] {
  return runDiagnosisEngine({ settings: makeSettings(), measurements, actions }).diagnoses.map((diagnosis) => diagnosis.code);
}

describe('Diagnosis Engine', () => {
  it('detects atomic diagnoses from current values only as diagnoses, not recommendations', () => {
    const result = runDiagnosisEngine({
      settings: makeSettings(),
      measurements: [makeMeasurement({ ph: 8.0, fac: 0.2, orp: 524 }, 'latest')],
    });

    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toEqual(expect.arrayContaining([
      'PH_HIGH',
      'FAC_CRITICALLY_LOW',
      'ORP_VERY_LOW',
      'CYA_UNKNOWN',
      'ALKALINITY_UNKNOWN',
    ]));
    expect(JSON.stringify(result.diagnoses)).not.toContain('chlorine-granules');
  });

  it('detects FAC trend and persistence when low measurements are sufficiently spaced', () => {
    const measurements = [0.5, 0.6, 0.6, 0.5].map((fac, index) =>
      makeMeasurement({ fac, measuredAt: `2026-07-0${index + 1}T10:00:00.000Z` }, `m${index + 1}`),
    );

    const result = runDiagnosisEngine({ settings: makeSettings(), measurements });

    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toContain('FAC_PERSISTENTLY_LOW');
    const persistent = result.diagnoses.find((diagnosis) => diagnosis.code === 'FAC_PERSISTENTLY_LOW');
    expect(persistent?.persistence?.consecutiveMeasurements).toBe(4);
    expect(persistent?.persistence?.durationHours).toBe(72);
  });

  it('does not treat measurements that are too close as persistence', () => {
    const measurements = [0, 1, 2, 3].map((hour, index) =>
      makeMeasurement({ fac: 0.5, measuredAt: `2026-07-09T${String(10 + hour).padStart(2, '0')}:00:00.000Z` }, `m${index}`),
    );

    const result = runDiagnosisEngine({ settings: makeSettings(), measurements });

    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).not.toContain('FAC_PERSISTENTLY_LOW');
    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toContain('INSUFFICIENT_EVIDENCE');
  });

  it('does not treat excessive gaps as persistence', () => {
    const measurements = [
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-01T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-02T10:00:00.000Z' }, 'm2'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-10T10:00:00.000Z' }, 'm3'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-11T10:00:00.000Z' }, 'm4'),
    ];

    const result = runDiagnosisEngine({ settings: makeSettings(), measurements });

    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).not.toContain('FAC_PERSISTENTLY_LOW');
    expect(result.diagnoses.find((diagnosis) => diagnosis.code === 'INSUFFICIENT_EVIDENCE')?.evidence[0].code).toBe('MEASUREMENTS_TOO_CLOSE_OR_GAP_TOO_LARGE');
  });

  it('detects failed chlorination attempts from action outcomes', () => {
    const measurements = [
      makeMeasurement({ measuredAt: '2026-07-09T10:00:00.000Z', fac: 0.5, orp: 575 }, 'before'),
      makeMeasurement({ measuredAt: '2026-07-10T10:00:00.000Z', fac: 0.4, orp: 524 }, 'after'),
    ];
    const actions: MaintenanceAction[] = [{
      id: 'chlorinator',
      performedAt: '2026-07-09T12:00:00.000Z',
      kind: 'chlorinator',
      description: 'High chlorinator output',
      chlorinator: { previousOutputPercent: 80, newOutputPercent: 100, additionalHours: 2 },
    }];

    const outcomes = evaluateActionOutcomes(measurements, actions);
    const result = runDiagnosisEngine({ settings: makeSettings(), measurements, actions, outcomes });

    expect(outcomes[0].changes.fac).toBe(-0.1);
    expect(outcomes[0].changes.orp).toBe(-51);
    expect(outcomes[0].effectiveness).not.toBe('partially-effective');
    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toContain('FAC_NOT_RESPONDING_TO_CHLORINATION');
  });

  it('uses context as evidence and lowers confidence with alternatives/missing data', () => {
    const result = runDiagnosisEngine({
      settings: makeSettings(),
      measurements: [makeMeasurement({
        fac: 0.2,
        orp: 524,
        context: {
          batherLoad: 'high',
          sunlight: 'high',
          visibleAlgae: true,
          waterClarity: 'cloudy',
        },
      }, 'latest')],
    });

    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toEqual(expect.arrayContaining([
      'HIGH_CHLORINE_DEMAND_SUSPECTED',
      'VISIBLE_ALGAE',
      'WATER_CLOUDY',
    ]));
    expect(result.diagnoses.find((diagnosis) => diagnosis.code === 'CYA_UNKNOWN')?.missingInputs).toHaveLength(1);
  });

  it('detects composite sanitation and chlorinator-underperformance diagnoses without cycles', () => {
    const measurements = [0.5, 0.6, 0.6, 0.5, 0.2].map((fac, index) =>
      makeMeasurement({
        fac,
        orp: index === 4 ? 524 : 575,
        measuredAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
      }, `m${index + 1}`),
    );
    const actions: MaintenanceAction[] = [{
      id: 'chlorinator',
      performedAt: '2026-07-04T12:00:00.000Z',
      kind: 'chlorinator',
      description: 'High chlorinator output',
      chlorinator: { previousOutputPercent: 80, newOutputPercent: 100, additionalHours: 2 },
    }];
    const outcomes = evaluateActionOutcomes(measurements, actions);

    const result = runDiagnosisEngine({ settings: makeSettings(), measurements, actions, outcomes });

    expect(result.ruleOrder).toEqual([
      'atomic-value-diagnoses',
      'trend-diagnoses',
      'persistence-diagnoses',
      'action-outcome-diagnoses',
      'composite-diagnoses',
    ]);
    expect(result.diagnoses.map((diagnosis) => diagnosis.code)).toEqual(expect.arrayContaining([
      'SANITATION_COMPROMISED',
      'CHLORINATOR_UNDERPERFORMANCE_SUSPECTED',
    ]));
  });

  it('is deterministic for the same inputs', () => {
    const measurements = [
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-01T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-02T10:00:00.000Z' }, 'm2'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-03T10:00:00.000Z' }, 'm3'),
      makeMeasurement({ fac: 0.2, orp: 524, measuredAt: '2026-07-04T10:00:00.000Z' }, 'm4'),
    ];

    expect(runDiagnosisEngine({ settings: makeSettings(), measurements })).toEqual(
      runDiagnosisEngine({ settings: makeSettings(), measurements }),
    );
  });

  it('does not emit persistence when the latest measurement is back in range', () => {
    expect(codes([
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-01T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ fac: 0.5, measuredAt: '2026-07-02T10:00:00.000Z' }, 'm2'),
      makeMeasurement({ fac: 1.5, measuredAt: '2026-07-03T10:00:00.000Z' }, 'm3'),
    ])).not.toContain('FAC_PERSISTENTLY_LOW');
  });
});

