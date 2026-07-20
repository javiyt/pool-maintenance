import { describe, expect, it } from 'vitest';
import { analyzePool } from '../src/application/analyzePool';
import type { MaintenanceAction } from '../src/domain/actions';
import { runDiagnosisEngine } from '../src/domain/diagnosis/diagnosisEngine';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';

function settings(): PoolSettings {
  return {
    volume: 30000,
    volumeUnit: 'liters',
    poolType: 'saltwater',
    unitSystem: 'metric',
  };
}

function measurement(overrides: Partial<Measurement> = {}, id = 'm1'): Measurement {
  return {
    id,
    measuredAt: '2026-07-09T10:00:00.000Z',
    ph: 7.4,
    ec: 6500,
    tds: 3250,
    salt: 3200,
    orp: 700,
    fac: 1.5,
    temperature: 28,
    ...overrides,
  } as Measurement;
}

describe('EC/TDS decision matrix', () => {
  it('allows partial measurement but blocks complete sanitary evaluation without FAC or pH', () => {
    const partial = {
      id: 'partial',
      measuredAt: '2026-07-09T10:00:00.000Z',
      ec: 6500,
      salt: 3200,
      temperature: 28,
      completeness: {
        kind: 'partial',
        missingBasicParameters: ['fac', 'ph'],
        blockedConclusions: ['seguridad sanitaria completa'],
      },
    } as Partial<Measurement> as Measurement;

    const result = runDiagnosisEngine({ settings: settings(), measurements: [partial] });
    const codes = result.diagnoses.map((diagnosis) => diagnosis.code);

    expect(codes).not.toContain('FAC_IN_RANGE');
    expect(codes).not.toContain('PH_IN_RANGE');
    expect(codes).not.toContain('SANITATION_COMPROMISED');
    expect(codes).toContain('INSUFFICIENT_EVIDENCE');
  });

  it('uses EC as the primary signal when TDS is derived and does not duplicate evidence', () => {
    const measurements = [
      measurement({ ec: 6000, tds: 3000, salt: 3200, measuredAt: '2026-07-07T10:00:00.000Z' }, 'm1'),
      measurement({ ec: 6400, tds: 3200, salt: 3210, measuredAt: '2026-07-08T10:00:00.000Z' }, 'm2'),
      measurement({
        ec: 6900,
        tds: 3450,
        salt: 3220,
        measuredAt: '2026-07-09T10:00:00.000Z',
        values: {
          tds: {
            parameterCode: 'tds',
            method: 'digital-multiparameter',
            capability: 'calculated',
            originalUnit: 'ppm',
            sourceParameterCode: 'ec',
            conversionFactor: 0.5,
            derived: true,
          },
        },
      }, 'm3'),
    ];

    const result = analyzePool({ settings: settings(), measurements, actions: [] });
    const diagnosis = result.diagnosis.diagnoses.find((item) => item.code === 'EC_TDS_ACCUMULATION_SUSPECTED');
    const recommendation = result.recommendation.recommendations.find((item) => item.code === 'MEASURE_SATURATION_PARAMETERS');

    expect(diagnosis).toBeDefined();
    expect(diagnosis?.evidence).toHaveLength(1);
    expect(diagnosis?.evidence[0].field).toBe('ec');
    expect(recommendation?.decisionTrace?.redundantValues).toContain('tds');
    expect(result.recommendation.recommendations.filter((item) => item.category === 'chemical')).toHaveLength(0);
  });

  it('requests repeated measurement when salt drops abruptly but EC remains stable', () => {
    const result = analyzePool({
      settings: settings(),
      measurements: [
        measurement({ salt: 3400, ec: 6500, measuredAt: '2026-07-08T10:00:00.000Z' }, 'before'),
        measurement({ salt: 3000, ec: 6500, measuredAt: '2026-07-09T10:00:00.000Z' }, 'after'),
      ],
      actions: [],
    });

    expect(result.diagnosis.diagnoses.map((item) => item.code)).toContain('SALT_EC_INCONSISTENCY_SUSPECTED');
    expect(result.recommendation.recommendations.map((item) => item.code)).toContain('REPEAT_SALT_EC_MEASUREMENT');
    expect(result.recommendation.recommendations.map((item) => item.code)).not.toContain('ADD_SALT');
  });

  it('pauses chemical escalation when EC/TDS rises after repeated corrections', () => {
    const actions: MaintenanceAction[] = [1, 2, 3].map((index) => ({
      id: `chem-${index}`,
      performedAt: `2026-07-0${index + 5}T08:00:00.000Z`,
      kind: 'chemical',
      description: 'Correction',
      chemical: { productType: 'ph-reducer', mainComponent: 'Acid', amount: 250, unit: 'ml' },
    }));
    const result = analyzePool({
      settings: settings(),
      measurements: [
        measurement({ ec: 6000, measuredAt: '2026-07-06T10:00:00.000Z' }, 'm1'),
        measurement({ ec: 6400, measuredAt: '2026-07-07T10:00:00.000Z' }, 'm2'),
        measurement({ ec: 6900, measuredAt: '2026-07-08T10:00:00.000Z' }, 'm3'),
      ],
      actions,
    });

    expect(result.diagnosis.diagnoses.map((item) => item.code)).toContain('EC_TDS_DOSING_ESCALATION_RISK');
    expect(result.recommendation.recommendations.map((item) => item.code)).toContain('PAUSE_CHEMICAL_ESCALATION_RETEST');
  });
});
