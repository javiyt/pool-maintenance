import type { MaintenanceAssistantResult, MaintenanceRecommendation } from '../domain/maintenanceAssistant';
import type { AppRoute } from './appShell';

export function routeAfterMeasurementSubmission(result: MaintenanceAssistantResult): AppRoute {
  if (result.recommendations.some(isCorrectiveRecommendation)) {
    return '/actions';
  }

  const correctionRequired = result.status === 'needs-correction' || result.status === 'unsafe';
  if (correctionRequired && result.recommendations.some(isVisibleNonInformationalRecommendation)) {
    return '/actions';
  }

  return '/';
}

function isCorrectiveRecommendation(recommendation: MaintenanceRecommendation): boolean {
  if (recommendation.state === 'blocked' || recommendation.state === 'informational' || recommendation.state === 'pending-retest') {
    return false;
  }

  if (recommendation.severity === 'info') {
    return false;
  }

  return recommendation.kind === 'chemical'
    || recommendation.kind === 'equipment'
    || recommendation.kind === 'filtration'
    || recommendation.kind === 'warning';
}

function isVisibleNonInformationalRecommendation(recommendation: MaintenanceRecommendation): boolean {
  if (recommendation.kind === 'no-action') return false;
  if (recommendation.state === 'blocked' || recommendation.state === 'informational' || recommendation.state === 'pending-retest') {
    return false;
  }
  return recommendation.severity !== 'info';
}
