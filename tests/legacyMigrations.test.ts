import { describe, expect, it } from 'vitest';
import { importLegacyExport } from '../src/infrastructure/migrations/legacyExportImporter';
import { legacySnapshotMarker } from '../src/infrastructure/migrations/legacyExportMapper';
import { mapStructuredRecommendationToLegacy } from '../src/infrastructure/migrations/legacyRecommendationAdapter';
import type { Recommendation } from '../src/domain/recommendation/recommendation';

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-structured',
    code: 'APPLY_FAST_CHLORINE_CORRECTION',
    generatedAt: '2026-07-09T10:00:00.000Z',
    sourceDiagnosisIds: ['diag-fac'],
    generatedByRuleIds: ['rule.chemical.fast-chlorine-correction'],
    category: 'chemical',
    severity: 'critical',
    priority: 3,
    state: 'active',
    relatedFields: ['fac', 'orp'],
    action: {
      type: 'chemical-dose',
      productId: 'chlorine-granules',
      amount: 12,
      unit: 'g',
    },
    calculation: {
      input: { currentFac: 0.2 },
      result: { amount: 12 },
      notesCodes: ['CATALOG_AVAILABLE_CHLORINE_USED'],
      engineVersion: '1.0.0',
    },
    dependencies: [],
    contraindications: [],
    followUp: {
      preferredAfterHours: 6,
      measurementFields: ['fac', 'orp'],
    },
    safetyCodes: ['USE_PPE'],
    explanationCodes: ['FAST_CHLORINE_CORRECTION_FROM_DEFICIT_AND_CATALOG'],
    version: '1.0.0',
    conflictResolutionCodes: [],
    ...overrides,
  };
}

describe('legacy migration adapters', () => {
  it('maps structured recommendations to the legacy UI shape', () => {
    const legacy = mapStructuredRecommendationToLegacy(makeRecommendation());

    expect(legacy.kind).toBe('chemical');
    expect(legacy.severity).toBe('danger');
    expect(legacy.chemicalProductId).toBe('chlorine-granules');
    expect(legacy.estimatedAmount).toBe(12);
    expect(legacy.unit).toBe('g');
    expect(legacy.safetyNotes).toEqual(['USE_PPE']);
    expect(legacy.followUpActions).toEqual(['RETEST_FAC', 'RETEST_ORP']);
  });

  it('maps non-chemical categories and blocked state conservatively', () => {
    const equipment = mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'equipment',
      code: 'INSPECT_CHLORINATOR_CELL',
      severity: 'high',
      state: 'blocked',
      action: { type: 'inspection', unit: 'hours', amount: 1 },
    }));
    expect(equipment.kind).toBe('equipment');
    expect(equipment.state).toBe('blocked');
    expect(equipment.unit).toBeUndefined();

    expect(mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'manual-test',
      code: 'MEASURE_CYA',
      severity: 'informational',
      action: undefined,
    })).severity).toBe('info');
    expect(mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'safety',
      code: 'RESTRICT_SWIMMING',
      action: undefined,
    })).kind).toBe('warning');
    expect(mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'monitoring',
      code: 'MONITOR_PARAMETER',
    })).kind).toBe('monitor');
    expect(mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'maintenance',
      code: 'IMPROVE_FILTRATION',
    })).kind).toBe('filtration');
    expect(mapStructuredRecommendationToLegacy(makeRecommendation({
      category: 'informational',
      code: 'MONITOR_PARAMETER',
      state: 'superseded',
    })).kind).toBe('no-action');
  });

  it('marks unavailable historical snapshots for legacy imports', () => {
    expect(legacySnapshotMarker(7)).toEqual({
      migratedFromSchemaVersion: 7,
      snapshotAvailability: 'legacy-unavailable',
    });
    expect(legacySnapshotMarker('legacy')).toEqual({
      migratedFromSchemaVersion: undefined,
      snapshotAvailability: 'legacy-unavailable',
    });
  });

  it('imports legacy export data through the compatibility adapter', () => {
    const result = importLegacyExport(JSON.stringify([{
      id: 'm1',
      measuredAt: '2026-07-09T10:00:00.000Z',
      ph: 7.4,
      ec: 6640,
      tds: 3230,
      salt: 3200,
      orp: 700,
      fac: 1.5,
      temperature: 28,
    }]));

    expect(result.measurements).toHaveLength(1);
    expect(result.actions).toEqual([]);
    expect(result.followUps).toEqual([]);
  });
});
