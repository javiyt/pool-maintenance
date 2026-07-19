export type KnownMaintenanceActionKind =
  | 'chemical'
  | 'chlorinator'
  | 'filtration'
  | 'water-replacement'
  | 'cleaning'
  | 'filter-backwash'
  | 'water-top-up'
  | 'partial-drain'
  | 'physical-cover'
  | 'chemical-cover'
  | 'algaecide'
  | 'clarifier'
  | 'flocculant'
  | 'stabilizer'
  | 'unknown-product'
  | 'equipment-maintenance'
  | 'inspection'
  | 'manual-test'
  | 'other';

export type MaintenanceActionKind = KnownMaintenanceActionKind | (string & {});

import type { ActionExclusionFlags, ActionNote } from './followUp';
import type { RecommendationSnapshot } from './recommendation/recommendationSnapshot';
export type { ActionExclusionFlags, ActionNote, UnusualEventType } from './followUp';

export type MaintenanceActionCategory =
  | 'chemical'
  | 'equipment'
  | 'filtration'
  | 'water'
  | 'cleaning'
  | 'cover'
  | 'measurement'
  | 'inspection'
  | 'custom';

export type MaintenanceActionType =
  | KnownMaintenanceActionKind
  | (string & {})
  | {
      kind: 'custom';
      customCode?: string;
      label: string;
    };

export type ChemicalProductType =
  | 'ph-reducer'
  | 'ph-increaser'
  | 'chlorine-granules'
  | 'chlorine-stabilizer'
  | 'alkalinity-reducer'
  | 'pool-salt';

export type ChemicalProductCategory =
  | 'ph-reducer'
  | 'ph-increaser'
  | 'fast-chlorine'
  | 'shock-chlorine'
  | 'algaecide'
  | 'clarifier'
  | 'flocculant'
  | 'stabilizer'
  | 'chemical-cover'
  | 'salt'
  | 'other';

export type ChemicalProductSource =
  | 'system-catalog'
  | 'user-catalog'
  | 'one-off'
  | 'unknown';

export interface ChemicalProductSnapshot {
  name: string;
  brand?: string;
  category: ChemicalProductCategory;
  activeIngredients?: Array<{
    name: string;
    concentrationPercent?: number;
  }>;
  physicalForm?: 'liquid' | 'granules' | 'tablets' | 'powder' | 'other';
  dosageInstructions?: string;
  notes?: string;
}

export interface ChemicalProductReference {
  source: ChemicalProductSource;
  productId?: string;
  snapshot: ChemicalProductSnapshot;
}

export interface UserChemicalProduct {
  id: string;
  createdAt: string;
  updatedAt: string;
  snapshot: ChemicalProductSnapshot;
}

export interface MaintenanceActionChemical {
  productType?: ChemicalProductType;
  mainComponent?: string;
  amount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg' | 'tablet' | 'tablets' | 'ppm' | 'percent' | string;
  concentrationPercent?: number;
  product?: ChemicalProductReference;
}

export interface MaintenanceActionChlorinator {
  previousOutputPercent?: number;
  newOutputPercent: number;
  additionalHours?: number;
  totalHours?: number;
}

export interface MaintenanceActionFiltration {
  previousHours?: number;
  newHours: number;
}

export interface MaintenanceActionWaterReplacement {
  estimatedLiters?: number;
  estimatedPercent?: number;
}

export interface PerformedActionComparison {
  recommendationId?: string;
  recommended?: {
    amount?: number;
    unit?: string;
    runtimeHours?: number;
    outputPercent?: number;
  };
  performed: {
    amount?: number;
    unit?: string;
    runtimeHours?: number;
    outputPercent?: number;
  };
  deviation?: {
    amountAbsolute?: number;
    amountPercent?: number;
    runtimeAbsoluteHours?: number;
  };
}

export type MaintenanceActionOrigin =
  | 'recommendation'
  | 'manual'
  | 'imported'
  | 'professional'
  | 'automation';

export type EvaluationEligibility =
  | 'evaluable'
  | 'conditionally-evaluable'
  | 'not-evaluable'
  | 'unknown-product';

export type PerformedValuesProvenance =
  | 'user-entered'
  | 'confirmed-from-recommendation'
  | 'assumed-from-legacy-recommendation'
  | 'unknown';

export interface MaintenanceAction {
  id: string;
  schemaVersion?: number;
  performedAt: string; // ISO 8601
  kind: MaintenanceActionKind;
  actionType?: MaintenanceActionType;
  category?: MaintenanceActionCategory | string;
  description: string;
  notes?: string;
  reason?: string;
  performedBy?: string;
  relatedMeasurementId?: string;
  relatedRecommendationId?: string;
  recommendationId?: string;
  recommendationSnapshot?: RecommendationSnapshot;
  origin?: MaintenanceActionOrigin;
  performedValuesProvenance?: PerformedValuesProvenance;
  performedComparison?: PerformedActionComparison;
  chemical?: MaintenanceActionChemical;
  chlorinator?: MaintenanceActionChlorinator;
  filtration?: MaintenanceActionFiltration;
  waterReplacement?: MaintenanceActionWaterReplacement;
  isAtypical?: boolean;
  evaluationEligibility?: EvaluationEligibility;
  expectedEffect?: string;
  evaluationResult?: unknown;
  exclusionFlags?: ActionExclusionFlags;
  unusualEventNotes?: ActionNote[];
  applicationVersion?: string;
  recommendationEngineVersion?: string;
  outcomeEvaluatorVersion?: string;
  chemicalCatalogVersion?: string;
}

let _actionCounter = 0;

export function generateActionId(): string {
  _actionCounter += 1;
  return `act-${Date.now()}-${_actionCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function chemicalProductCategoryFromLegacyType(
  productType: ChemicalProductType | string | undefined,
): ChemicalProductCategory {
  switch (productType) {
    case 'ph-reducer':
      return 'ph-reducer';
    case 'ph-increaser':
      return 'ph-increaser';
    case 'chlorine-granules':
      return 'fast-chlorine';
    case 'chlorine-stabilizer':
      return 'stabilizer';
    case 'pool-salt':
      return 'salt';
    default:
      return 'other';
  }
}

export function getActionRecommendationId(action: MaintenanceAction): string | undefined {
  return action.recommendationId ?? action.relatedRecommendationId;
}

export function getChemicalProductCategory(action: MaintenanceAction): ChemicalProductCategory | undefined {
  if (action.chemical?.product?.source === 'unknown') return undefined;
  return action.chemical?.product?.snapshot.category
    ?? chemicalProductCategoryFromLegacyType(action.chemical?.productType);
}

export function determineEvaluationEligibility(action: MaintenanceAction): EvaluationEligibility {
  if (action.evaluationEligibility) return action.evaluationEligibility;

  if (action.kind === 'chemical') {
    if (action.chemical?.product?.source === 'unknown') return 'unknown-product';
    const category = getChemicalProductCategory(action);
    if (!category) return 'unknown-product';
    if (category === 'ph-reducer' || category === 'ph-increaser' || category === 'fast-chlorine' || category === 'salt') {
      return action.chemical?.product?.source === 'user-catalog' || action.chemical?.product?.source === 'one-off'
        ? 'conditionally-evaluable'
        : 'evaluable';
    }
    return 'not-evaluable';
  }

  if (action.kind === 'chlorinator' || action.kind === 'filtration' || action.kind === 'water-replacement' || action.kind === 'cleaning') {
    return 'evaluable';
  }

  return 'not-evaluable';
}

export function buildPerformedComparison(input: {
  recommendationId?: string;
  recommended?: PerformedActionComparison['recommended'];
  performed: PerformedActionComparison['performed'];
}): PerformedActionComparison {
  const comparison: PerformedActionComparison = {
    recommendationId: input.recommendationId,
    recommended: input.recommended,
    performed: input.performed,
  };

  const recommendedAmount = input.recommended?.amount;
  const performedAmount = input.performed.amount;
  if (recommendedAmount !== undefined && performedAmount !== undefined) {
    const amountAbsolute = performedAmount - recommendedAmount;
    comparison.deviation = {
      ...comparison.deviation,
      amountAbsolute,
      amountPercent: recommendedAmount === 0 ? undefined : (amountAbsolute / recommendedAmount) * 100,
    };
  }

  const recommendedRuntime = input.recommended?.runtimeHours;
  const performedRuntime = input.performed.runtimeHours;
  if (recommendedRuntime !== undefined && performedRuntime !== undefined) {
    comparison.deviation = {
      ...comparison.deviation,
      runtimeAbsoluteHours: performedRuntime - recommendedRuntime,
    };
  }

  return comparison;
}
