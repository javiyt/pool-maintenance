import { describe, expect, it } from 'vitest';
import { analyzePool } from '../src/application/analyzePool';
import type { MaintenanceAction } from '../src/domain/actions';
import { runRecommendationEngine } from '../src/domain/recommendation/recommendationEngine';
import type { PoolSettings } from '../src/domain/settings';
import type { Measurement } from '../src/domain/measurement';
import type { Diagnosis } from '../src/domain/diagnosis/diagnosis';

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

function diagnosis(code: Diagnosis['code'], overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: `diag-${code}`,
    code,
    detectedAt: '2026-07-09T10:00:00.000Z',
    measurementId: 'm1',
    status: 'detected',
    severity: 'high',
    confidence: 0.8,
    relatedFields: code.includes('ORP') ? ['orp'] : ['fac'],
    evidence: [{
      type: 'measurement',
      code: `${code}_EVIDENCE`,
      field: code.includes('ORP') ? 'orp' : 'fac',
      observedValue: code.includes('ORP') ? 524 : 0.2,
      measurementId: 'm1',
      weight: 0.4,
    }],
    contradictoryEvidence: [],
    alternativeExplanations: [],
    sourceMeasurementIds: ['m1'],
    sourceActionIds: [],
    sourceOutcomeIds: [],
    sourceContextIds: [],
    missingInputs: [],
    lastObservedAt: '2026-07-09T10:00:00.000Z',
    occurrenceCount: 1,
    ruleIds: [`rule-${code}`],
    version: '1.0.0',
    ...overrides,
  };
}

describe('Structured Recommendation Engine', () => {
  it('generates one recommendation per applicable diagnosis rule with traceability', () => {
    const result = runRecommendationEngine({
      settings: makeSettings(),
      diagnoses: [
        diagnosis('FAC_CRITICALLY_LOW'),
        diagnosis('ORP_VERY_LOW'),
        diagnosis('PH_IN_RANGE', { relatedFields: ['ph'], severity: 'informational' }),
        diagnosis('SANITATION_COMPROMISED', { relatedFields: ['fac', 'orp', 'ph'], severity: 'critical' }),
      ],
      generatedAt: '2026-07-09T10:00:00.000Z',
    });

    expect(result.recommendations.map((recommendation) => recommendation.code)).toEqual(expect.arrayContaining([
      'RESTRICT_SWIMMING',
      'MEASURE_FAC_MANUALLY',
      'APPLY_FAST_CHLORINE_CORRECTION',
      'RETEST_FAC_AND_ORP',
    ]));
    expect(result.recommendations.every((recommendation) => recommendation.sourceDiagnosisIds.length > 0)).toBe(true);
    expect(result.recommendations.every((recommendation) => recommendation.generatedByRuleIds.length > 0)).toBe(true);
  });

  it('resolves conflicts by superseding chlorinator-only advice when fast chlorine correction is needed', () => {
    const result = runRecommendationEngine({
      settings: makeSettings(),
      diagnoses: [
        diagnosis('FAC_LOW'),
        diagnosis('FAC_CRITICALLY_LOW'),
        diagnosis('ORP_VERY_LOW'),
        diagnosis('PH_IN_RANGE', { relatedFields: ['ph'], severity: 'informational' }),
        diagnosis('SANITATION_COMPROMISED', { relatedFields: ['fac', 'orp', 'ph'], severity: 'critical' }),
      ],
      generatedAt: '2026-07-09T10:00:00.000Z',
    });

    expect(result.recommendations.find((recommendation) => recommendation.code === 'APPLY_FAST_CHLORINE_CORRECTION')).toBeDefined();
    expect(result.recommendations.find((recommendation) => recommendation.code === 'INCREASE_CHLORINATOR_RUNTIME')).toBeUndefined();
  });

  it('builds structured staged plans', () => {
    const result = runRecommendationEngine({
      settings: makeSettings(),
      diagnoses: [
        diagnosis('FAC_CRITICALLY_LOW'),
        diagnosis('ORP_VERY_LOW'),
        diagnosis('PH_IN_RANGE', { relatedFields: ['ph'], severity: 'informational' }),
        diagnosis('SANITATION_COMPROMISED', { relatedFields: ['fac', 'orp', 'ph'], severity: 'critical' }),
        diagnosis('FAC_NOT_RESPONDING_TO_CHLORINATION'),
        diagnosis('CHLORINATOR_UNDERPERFORMANCE_SUSPECTED', { relatedFields: ['fac', 'orp', 'salt'] }),
        diagnosis('CYA_UNKNOWN'),
      ],
      generatedAt: '2026-07-09T10:00:00.000Z',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].code).toBe('RECOVER_SANITIZATION');
    expect(result.plans[0].stages.map((stage) => stage.code)).toEqual([
      'CONFIRM_AND_RESTRICT',
      'RETEST_AFTER_CORRECTION',
      'DIAGNOSE_CHLORINATION_FAILURE',
    ]);
  });

  it('calculates fast chlorine dose from catalog concentration, not fixed shock dose', () => {
    const result = runRecommendationEngine({
      settings: makeSettings(),
      diagnoses: [
        diagnosis('FAC_CRITICALLY_LOW'),
        diagnosis('ORP_VERY_LOW'),
        diagnosis('PH_IN_RANGE', { relatedFields: ['ph'], severity: 'informational' }),
        diagnosis('SANITATION_COMPROMISED', { relatedFields: ['fac', 'orp', 'ph'], severity: 'critical' }),
      ],
      generatedAt: '2026-07-09T10:00:00.000Z',
    });

    const rec = result.recommendations.find((recommendation) => recommendation.code === 'APPLY_FAST_CHLORINE_CORRECTION');

    expect(rec?.action?.amount).toBeDefined();
    expect(rec?.calculation?.notesCodes).toContain('CATALOG_AVAILABLE_CHLORINE_USED');
    expect(JSON.stringify(rec)).not.toContain('25 g/m');
  });

  it('acceptance scenario escalates beyond chlorinator-only recommendations', () => {
    const facValues = [0.5, 0.6, 0.6, 0.5, 0.2, 0.5, 0.5, 0.4, 0.5, 0.2];
    const measurements = facValues.map((fac, index) =>
      makeMeasurement({
        fac,
        orp: index === 9 ? 524 : index === 8 ? 575 : 610,
        measuredAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
        context: index === 9
          ? {
              batherLoad: 'high',
              chlorinatorOutputPercent: 90,
              chlorinatorHoursSincePreviousMeasurement: 8,
              filtrationHoursSincePreviousMeasurement: 8,
            }
          : undefined,
      }, `m${index + 1}`),
    );
    const actions: MaintenanceAction[] = [{
      id: 'chlorinator-failed',
      performedAt: '2026-07-09T12:00:00.000Z',
      kind: 'chlorinator',
      description: 'High chlorinator output',
      chlorinator: { previousOutputPercent: 80, newOutputPercent: 100, additionalHours: 2 },
    }];

    const result = analyzePool({ measurements, actions, settings: makeSettings() });
    const diagnosisCodes = result.diagnosis.diagnoses.map((item) => item.code);
    const recommendationCodes = result.recommendation.recommendations.map((item) => item.code);

    expect(diagnosisCodes).toEqual(expect.arrayContaining([
      'FAC_CRITICALLY_LOW',
      'FAC_PERSISTENTLY_LOW',
      'FAC_NOT_RESPONDING_TO_CHLORINATION',
      'ORP_VERY_LOW',
      'SANITATION_COMPROMISED',
      'CHLORINATOR_UNDERPERFORMANCE_SUSPECTED',
      'CYA_UNKNOWN',
    ]));
    expect(recommendationCodes).toEqual(expect.arrayContaining([
      'RESTRICT_SWIMMING',
      'MEASURE_FAC_MANUALLY',
      'APPLY_FAST_CHLORINE_CORRECTION',
      'RETEST_FAC_AND_ORP',
      'INSPECT_CHLORINATOR_CELL',
      'CLEAN_CHLORINATOR_CELL',
      'VERIFY_CHLORINATOR_PRODUCTION',
      'CHECK_WATER_FLOW',
      'MEASURE_CYA',
      'MEASURE_TOTAL_CHLORINE',
    ]));
    expect(recommendationCodes).not.toContain('INCREASE_CHLORINATOR_RUNTIME');
    expect(result.recommendation.plans[0].stages).toHaveLength(3);
  });
});

