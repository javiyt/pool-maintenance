import { describe, expect, it } from 'vitest';
import type { MaintenanceAssistantResult, MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import { routeAfterMeasurementSubmission } from '../src/ui/postMeasurementNavigation';

function recommendation(overrides: Partial<MaintenanceRecommendation> = {}): MaintenanceRecommendation {
  return {
    id: 'rec-1',
    kind: 'chemical',
    severity: 'medium',
    title: 'Corregir pH',
    summary: 'Aplicar corrector.',
    reason: 'El pH está fuera de rango.',
    priority: 1,
    relatedFields: ['ph'],
    calculationNotes: [],
    safetyNotes: [],
    followUpActions: [],
    ...overrides,
  };
}

function result(
  recommendations: MaintenanceRecommendation[],
  status: MaintenanceAssistantResult['status'] = 'balanced',
): MaintenanceAssistantResult {
  return {
    status,
    summary: '',
    recommendations,
    trends: [],
    nextCheckSuggestion: { reason: '' },
  };
}

describe('post-measurement navigation', () => {
  it('routes to actions when a corrective recommendation exists', () => {
    expect(routeAfterMeasurementSubmission(result([recommendation({ kind: 'chemical' })]))).toBe('/actions');
    expect(routeAfterMeasurementSubmission(result([recommendation({ kind: 'equipment', equipmentName: 'Clorador salino' })]))).toBe('/actions');
    expect(routeAfterMeasurementSubmission(result([recommendation({ kind: 'warning', title: 'Sal alta' })]))).toBe('/actions');
  });

  it('routes home when recommendations do not require a corrective action', () => {
    expect(routeAfterMeasurementSubmission(result([
      recommendation({ kind: 'no-action', severity: 'info', title: 'Todo en orden' }),
      recommendation({ kind: 'manual-test', severity: 'info', title: 'Medir alcalinidad' }),
    ]))).toBe('/');
  });

  it('routes home for blocked or retest-only recommendations', () => {
    expect(routeAfterMeasurementSubmission(result([
      recommendation({ kind: 'chemical', state: 'blocked' }),
      recommendation({ kind: 'retest', severity: 'low', state: 'pending-retest' }),
    ]))).toBe('/');
  });

  it('routes to actions when the assistant requires correction through a non-info recommendation', () => {
    expect(routeAfterMeasurementSubmission(
      result([recommendation({ kind: 'monitor', severity: 'high' })], 'needs-correction'),
    )).toBe('/actions');
  });
});
