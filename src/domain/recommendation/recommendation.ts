import type { MeasurementField } from '../shared/measurementField';
import type { RecommendationCode } from './recommendationCode';
import type { RecommendationPlan } from './recommendationPlan';

export type RecommendationCategory =
  | 'safety'
  | 'chemical'
  | 'equipment'
  | 'manual-test'
  | 'monitoring'
  | 'maintenance'
  | 'informational';

export type StructuredRecommendationSeverity = 'informational' | 'low' | 'medium' | 'high' | 'critical';
export type StructuredRecommendationState = 'active' | 'blocked' | 'superseded' | 'completed' | 'cancelled';

export interface RecommendedAction {
  type: string;
  productId?: string;
  equipmentId?: string;
  amount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg' | 'hours' | 'percent';
  parameters?: Record<string, number | string | boolean>;
}

export interface RecommendationCalculation {
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  notesCodes: string[];
  engineVersion: string;
}

export interface RecommendationDependency {
  code: string;
  sourceDiagnosisId?: string;
  blocksUntilResolved: boolean;
}

export interface RecommendationContraindication {
  code: string;
  sourceDiagnosisId?: string;
}

export interface FollowUpPlan {
  preferredAfterHours: number;
  deadlineAfterHours?: number;
  measurementFields: MeasurementField[];
}

export interface Recommendation {
  id: string;
  code: RecommendationCode;
  generatedAt: string;
  sourceDiagnosisIds: string[];
  generatedByRuleIds: string[];
  category: RecommendationCategory;
  severity: StructuredRecommendationSeverity;
  priority: number;
  state: StructuredRecommendationState;
  relatedFields: MeasurementField[];
  action?: RecommendedAction;
  calculation?: RecommendationCalculation;
  dependencies: RecommendationDependency[];
  contraindications: RecommendationContraindication[];
  followUp?: FollowUpPlan;
  safetyCodes: string[];
  explanationCodes: string[];
  decisionTrace?: {
    determinantParameters: MeasurementField[];
    contextualParameters: MeasurementField[];
    requestedParameters: string[];
    ignoredParameters: string[];
    derivedValues: string[];
    redundantValues: string[];
  };
  version: string;
  conflictResolutionCodes: string[];
}

export interface RecommendationEngineResult {
  recommendations: Recommendation[];
  plans: RecommendationPlan[];
  generatedAt: string;
  version: string;
  resolverEvents: string[];
}
