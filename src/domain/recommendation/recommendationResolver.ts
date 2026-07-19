import type { Recommendation } from './recommendation';

export interface RecommendationResolverResult {
  recommendations: Recommendation[];
  events: string[];
}

const CODE_RANK: Record<string, number> = {
  APPLY_FAST_CHLORINE_CORRECTION: 100,
  APPLY_SHOCK_TREATMENT: 110,
  ADJUST_CHLORINATOR_OUTPUT: 20,
  INCREASE_CHLORINATOR_RUNTIME: 10,
};

export function resolveRecommendations(recommendations: Recommendation[]): RecommendationResolverResult {
  const events: string[] = [];
  const byCode = new Map<string, Recommendation>();

  for (const recommendation of recommendations) {
    const existing = byCode.get(recommendation.code);
    if (!existing || recommendation.priority < existing.priority) {
      if (existing) events.push(`DEDUPLICATED_${recommendation.code}`);
      byCode.set(recommendation.code, recommendation);
    }
  }

  let resolved = [...byCode.values()];
  const hasFastCorrection = resolved.some((item) => item.code === 'APPLY_FAST_CHLORINE_CORRECTION' || item.code === 'APPLY_SHOCK_TREATMENT');
  if (hasFastCorrection) {
    resolved = resolved.map((item) => {
      if (item.code === 'INCREASE_CHLORINATOR_RUNTIME' || item.code === 'ADJUST_CHLORINATOR_OUTPUT') {
        events.push(`SUPERSEDED_${item.code}_BY_FAST_CHLORINE`);
        return { ...item, state: 'superseded' as const, conflictResolutionCodes: [...item.conflictResolutionCodes, 'SUPERSEDED_BY_FAST_CHLORINE'] };
      }
      return item;
    });
  }

  resolved = resolved.sort((a, b) =>
    a.priority - b.priority ||
    (CODE_RANK[b.code] ?? 0) - (CODE_RANK[a.code] ?? 0) ||
    a.code.localeCompare(b.code),
  );

  return { recommendations: resolved, events };
}

