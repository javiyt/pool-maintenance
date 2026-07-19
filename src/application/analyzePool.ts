import { evaluateActionOutcomes } from '../domain/actionOutcomeEvaluator';
import type { MaintenanceAction } from '../domain/actions';
import { runDiagnosisEngine, type DiagnosisEngineResult } from '../domain/diagnosis/diagnosisEngine';
import type { Measurement } from '../domain/measurement';
import { runRecommendationEngine, type RecommendationEngineInput } from '../domain/recommendation/recommendationEngine';
import type { RecommendationEngineResult } from '../domain/recommendation/recommendation';
import type { PoolSettings } from '../domain/settings';

export interface AnalyzePoolResult {
  diagnosis: DiagnosisEngineResult;
  recommendation: RecommendationEngineResult;
}

export function analyzePool(input: {
  measurements: Measurement[];
  actions: MaintenanceAction[];
  settings: PoolSettings;
  recommendationRules?: RecommendationEngineInput['rules'];
}): AnalyzePoolResult {
  const outcomes = evaluateActionOutcomes(input.measurements, input.actions);
  const diagnosis = runDiagnosisEngine({
    settings: input.settings,
    measurements: input.measurements,
    actions: input.actions,
    outcomes,
  });
  const recommendation = runRecommendationEngine({
    settings: input.settings,
    diagnoses: diagnosis.diagnoses,
    generatedAt: diagnosis.evaluatedAt,
    rules: input.recommendationRules,
  });
  return { diagnosis, recommendation };
}

