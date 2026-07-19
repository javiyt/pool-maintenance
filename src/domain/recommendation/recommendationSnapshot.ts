import type { MaintenanceRecommendation } from '../maintenanceAssistant';
import type { Measurement } from '../measurement';
import type { PoolSettings } from '../settings';
import {
  APPLICATION_VERSION,
  CHEMICAL_CATALOG_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from './versions';

export interface RecommendationSnapshot {
  recommendationId: string;
  applicationVersion: string;
  recommendationEngineVersion: string;
  outcomeEvaluatorVersion: string;
  chemicalCatalogVersion: string;
  capturedAt: string;
  input: {
    latestMeasurement?: Measurement;
    poolSettings: PoolSettings;
  };
  result: MaintenanceRecommendation;
  theoreticalAmount?: number;
  personalizedAmount?: number;
  state?: string;
  priority: number;
  explanations: {
    summary: string;
    reason: string;
    calculationNotes: string[];
    safetyNotes: string[];
    followUpActions: string[];
  };
  dependencies: MaintenanceRecommendation['dependencies'];
  notes: string[];
}

export function buildRecommendationSnapshot(input: {
  recommendation: MaintenanceRecommendation;
  latestMeasurement?: Measurement;
  settings: PoolSettings;
  capturedAt?: Date;
}): RecommendationSnapshot {
  const rec = input.recommendation;
  return {
    recommendationId: rec.id,
    applicationVersion: APPLICATION_VERSION,
    recommendationEngineVersion: RECOMMENDATION_ENGINE_VERSION,
    outcomeEvaluatorVersion: OUTCOME_EVALUATOR_VERSION,
    chemicalCatalogVersion: CHEMICAL_CATALOG_VERSION,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    input: {
      latestMeasurement: input.latestMeasurement,
      poolSettings: input.settings,
    },
    result: rec,
    theoreticalAmount: rec.personalization?.theoreticalValue ?? rec.estimatedAmount ?? rec.suggestedAdditionalHours,
    personalizedAmount: rec.personalization?.personalizedValue,
    state: rec.state,
    priority: rec.priority,
    explanations: {
      summary: rec.summary,
      reason: rec.reason,
      calculationNotes: rec.calculationNotes,
      safetyNotes: rec.safetyNotes,
      followUpActions: rec.followUpActions,
    },
    dependencies: rec.dependencies,
    notes: rec.calculationNotes,
  };
}

