import type { Recommendation } from './recommendation';
import type { RecommendationRuleContext } from './recommendationRuleContext';

export interface RecommendationRule {
  id: string;
  version: string;
  priority: number;
  requiredDiagnosisCodes: string[];
  excludedDiagnosisCodes: string[];
  matches(context: RecommendationRuleContext): boolean;
  generate(context: RecommendationRuleContext): Recommendation[];
}

