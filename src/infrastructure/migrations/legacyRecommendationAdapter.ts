import type { MaintenanceRecommendation } from '../../domain/maintenanceAssistant';
import type { Recommendation } from '../../domain/recommendation/recommendation';

export function mapStructuredRecommendationToLegacy(
  recommendation: Recommendation,
): MaintenanceRecommendation {
  return {
    id: recommendation.id,
    kind: mapCategory(recommendation.category),
    severity: mapSeverity(recommendation.severity),
    title: recommendation.code,
    summary: recommendation.explanationCodes.join(' '),
    reason: recommendation.sourceDiagnosisIds.join(', '),
    priority: recommendation.priority,
    relatedFields: recommendation.relatedFields,
    chemicalProductId: recommendation.action?.productId,
    estimatedAmount: typeof recommendation.action?.amount === 'number' ? recommendation.action.amount : undefined,
    unit: recommendation.action?.unit === 'ml' || recommendation.action?.unit === 'l' || recommendation.action?.unit === 'g' || recommendation.action?.unit === 'kg'
      ? recommendation.action.unit
      : undefined,
    calculationNotes: recommendation.calculation?.notesCodes ?? [],
    safetyNotes: recommendation.safetyCodes,
    followUpActions: recommendation.followUp?.measurementFields.map((field) => `RETEST_${field.toUpperCase()}`) ?? [],
    retestAfterHours: recommendation.followUp?.preferredAfterHours,
    state: recommendation.state === 'active' ? 'actionable' : recommendation.state === 'blocked' ? 'blocked' : 'informational',
    diagnosisCode: undefined,
  };
}

function mapCategory(category: Recommendation['category']): MaintenanceRecommendation['kind'] {
  switch (category) {
    case 'chemical': return 'chemical';
    case 'equipment': return 'equipment';
    case 'manual-test': return 'manual-test';
    case 'monitoring': return 'monitor';
    case 'safety': return 'warning';
    case 'maintenance': return 'filtration';
    case 'informational': return 'no-action';
  }
}

function mapSeverity(severity: Recommendation['severity']): MaintenanceRecommendation['severity'] {
  switch (severity) {
    case 'critical': return 'danger';
    case 'informational': return 'info';
    default: return severity;
  }
}

