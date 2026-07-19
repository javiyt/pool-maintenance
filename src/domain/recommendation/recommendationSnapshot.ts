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
  schemaVersion: 2;
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
  diagnosticOrigin?: {
    diagnosisCode?: MaintenanceRecommendation['diagnosisCode'];
    relatedFields: MaintenanceRecommendation['relatedFields'];
  };
  category: MaintenanceRecommendation['kind'];
  type?: string;
  severity: MaintenanceRecommendation['severity'];
  status?: MaintenanceRecommendation['state'];
  stage?: number;
  currentValues: Partial<Measurement>;
  targetRanges?: MaintenanceRecommendation['rangePolicy'];
  calculationInputs: {
    latestMeasurement?: Measurement;
    poolSettings: PoolSettings;
    relatedFields: MaintenanceRecommendation['relatedFields'];
  };
  calculationResults: {
    estimatedAmount?: MaintenanceRecommendation['estimatedAmount'];
    suggestedOutputPercent?: MaintenanceRecommendation['suggestedOutputPercent'];
    suggestedAdditionalHours?: MaintenanceRecommendation['suggestedAdditionalHours'];
    suggestedFiltrationHours?: MaintenanceRecommendation['suggestedFiltrationHours'];
  };
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
  confidence?: NonNullable<MaintenanceRecommendation['personalization']>['confidence'];
  confidenceReasons: string[];
  engineVersions: {
    application: string;
    recommendationEngine: string;
    outcomeEvaluator: string;
    chemicalCatalog: string;
  };
  notes: string[];
}

export function buildRecommendationSnapshot(input: {
  recommendation: MaintenanceRecommendation;
  latestMeasurement?: Measurement;
  settings: PoolSettings;
  capturedAt?: Date;
}): RecommendationSnapshot {
  const rec = input.recommendation;
  const latest = input.latestMeasurement;
  return {
    schemaVersion: 2,
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
    diagnosticOrigin: {
      diagnosisCode: rec.diagnosisCode,
      relatedFields: rec.relatedFields,
    },
    category: rec.kind,
    type: rec.chemicalProductId ?? rec.equipmentName ?? rec.chlorineCorrectionType ?? rec.kind,
    severity: rec.severity,
    status: rec.state,
    stage: rec.stage,
    currentValues: rec.relatedFields.reduce<Partial<Measurement>>((acc, field) => {
      if (latest && latest[field] !== undefined) {
        (acc as Record<string, unknown>)[field] = latest[field];
      }
      return acc;
    }, {}),
    targetRanges: rec.rangePolicy,
    calculationInputs: {
      latestMeasurement: input.latestMeasurement,
      poolSettings: input.settings,
      relatedFields: rec.relatedFields,
    },
    calculationResults: {
      estimatedAmount: rec.estimatedAmount,
      suggestedOutputPercent: rec.suggestedOutputPercent,
      suggestedAdditionalHours: rec.suggestedAdditionalHours,
      suggestedFiltrationHours: rec.suggestedFiltrationHours,
    },
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
    confidence: rec.personalization?.confidence,
    confidenceReasons: rec.personalization ? [rec.personalization.explanation] : [],
    engineVersions: {
      application: APPLICATION_VERSION,
      recommendationEngine: RECOMMENDATION_ENGINE_VERSION,
      outcomeEvaluator: OUTCOME_EVALUATOR_VERSION,
      chemicalCatalog: CHEMICAL_CATALOG_VERSION,
    },
    notes: rec.calculationNotes,
  };
}
