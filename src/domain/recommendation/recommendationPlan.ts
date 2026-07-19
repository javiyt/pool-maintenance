export interface RecommendationStage {
  order: number;
  code: string;
  recommendationIds: string[];
  status: 'active' | 'blocked' | 'completed' | 'cancelled';
}

export interface RecommendationPlan {
  id: string;
  code: string;
  sourceDiagnosisIds: string[];
  stages: RecommendationStage[];
  status: 'active' | 'completed' | 'cancelled';
}

