import type { Diagnosis } from '../diagnosis/diagnosis';
import type { PoolSettings } from '../settings';
import { STRUCTURED_RECOMMENDATION_ENGINE_VERSION } from '../shared/version';
import { type RecommendationEngineResult } from './recommendation';
import { createRecommendationRuleContext } from './recommendationRuleContext';
import { resolveRecommendations } from './recommendationResolver';
import { CORE_RECOMMENDATION_RULES } from './rules/coreRules';
import type { RecommendationRule } from './recommendationRule';
import type { RecommendationPlan } from './recommendationPlan';

export interface RecommendationEngineInput {
  settings: PoolSettings;
  diagnoses: Diagnosis[];
  generatedAt?: string;
  rules?: RecommendationRule[];
}

export function runRecommendationEngine(input: RecommendationEngineInput): RecommendationEngineResult {
  const generatedAt = input.generatedAt ?? input.diagnoses[0]?.detectedAt ?? new Date(0).toISOString();
  const context = createRecommendationRuleContext({
    settings: input.settings,
    diagnoses: input.diagnoses,
    generatedAt,
  });
  const rules = [...(input.rules ?? CORE_RECOMMENDATION_RULES)].sort((a, b) => a.priority - b.priority);
  const generated = rules.flatMap((rule) => rule.matches(context) ? rule.generate(context) : []);
  const resolved = resolveRecommendations(generated);
  const plans = buildPlans(resolved.recommendations);

  return {
    recommendations: resolved.recommendations,
    plans,
    generatedAt,
    version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
    resolverEvents: resolved.events,
  };
}

function buildPlans(recommendations: RecommendationEngineResult['recommendations']): RecommendationPlan[] {
  const recoveryRecommendations = recommendations.filter((recommendation) =>
    recommendation.sourceDiagnosisIds.length > 0 &&
    (
      recommendation.code === 'RESTRICT_SWIMMING' ||
      recommendation.code === 'MEASURE_FAC_MANUALLY' ||
      recommendation.code === 'APPLY_FAST_CHLORINE_CORRECTION' ||
      recommendation.code === 'RETEST_FAC_AND_ORP' ||
      recommendation.code === 'INSPECT_CHLORINATOR_CELL' ||
      recommendation.code === 'CLEAN_CHLORINATOR_CELL' ||
      recommendation.code === 'VERIFY_CHLORINATOR_PRODUCTION' ||
      recommendation.code === 'CHECK_WATER_FLOW' ||
      recommendation.code === 'MEASURE_CYA' ||
      recommendation.code === 'MEASURE_TOTAL_CHLORINE'
    )
  );

  if (recoveryRecommendations.length === 0) return [];

  const byCode = new Map(recoveryRecommendations.map((recommendation) => [recommendation.code, recommendation]));
  const sourceDiagnosisIds = [...new Set(recoveryRecommendations.flatMap((recommendation) => recommendation.sourceDiagnosisIds))];

  return [{
    id: `plan-recover-sanitization-${recoveryRecommendations[0].generatedAt}`,
    code: 'RECOVER_SANITIZATION',
    sourceDiagnosisIds,
    status: 'active',
    stages: [
      {
        order: 1,
        code: 'CONFIRM_AND_RESTRICT',
        recommendationIds: [
          byCode.get('RESTRICT_SWIMMING')?.id,
          byCode.get('MEASURE_FAC_MANUALLY')?.id,
          byCode.get('APPLY_FAST_CHLORINE_CORRECTION')?.id,
        ].filter((id): id is string => Boolean(id)),
        status: 'active',
      },
      {
        order: 2,
        code: 'RETEST_AFTER_CORRECTION',
        recommendationIds: [
          byCode.get('RETEST_FAC_AND_ORP')?.id,
        ].filter((id): id is string => Boolean(id)),
        status: 'active',
      },
      {
        order: 3,
        code: 'DIAGNOSE_CHLORINATION_FAILURE',
        recommendationIds: [
          byCode.get('INSPECT_CHLORINATOR_CELL')?.id,
          byCode.get('CLEAN_CHLORINATOR_CELL')?.id,
          byCode.get('VERIFY_CHLORINATOR_PRODUCTION')?.id,
          byCode.get('CHECK_WATER_FLOW')?.id,
          byCode.get('MEASURE_CYA')?.id,
          byCode.get('MEASURE_TOTAL_CHLORINE')?.id,
        ].filter((id): id is string => Boolean(id)),
        status: 'active',
      },
    ],
  }];
}

