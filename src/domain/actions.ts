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

export type ProductFunction =
  | 'sanitation'
  | 'oxidation'
  | 'ph-control'
  | 'alkalinity-control'
  | 'hardness-control'
  | 'stabilization'
  | 'salt-increase'
  | 'algae-prevention'
  | 'algae-treatment'
  | 'clarification'
  | 'flocculation'
  | 'metal-control'
  | 'stain-control'
  | 'phosphate-control'
  | 'nitrate-control'
  | 'evaporation-reduction'
  | 'winterizing'
  | 'surface-cleaning'
  | 'filter-cleaning'
  | 'equipment-cleaning'
  | 'neutralization'
  | 'measurement-consumable'
  | 'maintenance'
  | 'other'
  | 'unknown'
  | (string & {});

export type ProductPhysicalForm =
  | 'liquid'
  | 'granules'
  | 'powder'
  | 'tablets'
  | 'blocks'
  | 'cartridge'
  | 'gel'
  | 'aerosol'
  | 'solid'
  | 'other'
  | 'unknown';

export type ApplicationTarget =
  | 'pool-water'
  | 'pool-surface'
  | 'waterline'
  | 'skimmer'
  | 'filter'
  | 'equipment'
  | 'plumbing'
  | 'physical-cover'
  | 'surrounding-area'
  | 'other';

export type ProductUnit =
  | 'ml'
  | 'cl'
  | 'l'
  | 'mg'
  | 'g'
  | 'kg'
  | 'tablet'
  | 'tablets'
  | 'pastilla'
  | 'block'
  | 'cartucho'
  | 'bolsa'
  | 'sobre'
  | 'tapon'
  | 'dosis'
  | 'unidad'
  | 'percent'
  | 'hours'
  | 'minutes'
  | 'ppm'
  | 'other'
  | (string & {});

export interface ActiveIngredientSnapshot {
  code?: string;
  name: string;
  concentrationPercent?: number;
  availableSubstancePercent?: number;
  role?: string;
  userProvided?: boolean;
}

export interface ChemicalParameterEffect {
  parameter: 'ph' | 'fac' | 'cya' | 'calcium-hardness' | 'alkalinity' | 'salt' | 'orp' | 'clarity' | 'temperature' | string;
  certainty?: 'known' | 'potential' | 'manufacturer-claimed' | 'unknown';
  notes?: string;
}

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
  | 'chlorine-disinfection'
  | 'non-chlorine-disinfection'
  | 'ph-regulation'
  | 'alkalinity'
  | 'calcium-hardness'
  | 'cyanuric-acid'
  | 'salt-system'
  | 'metals-stains'
  | 'nutrients'
  | 'winterizing'
  | 'surface-cleaning'
  | 'filter-cleaning'
  | 'equipment-cleaning'
  | 'neutralizer'
  | 'multifunction'
  | 'spa'
  | 'measurement-consumable'
  | 'custom-product'
  | 'unknown'
  | 'other'
  | (string & {});

export type ChemicalProductSource =
  | 'system-catalog'
  | 'user-catalog'
  | 'one-off'
  | 'imported'
  | 'unknown';

export interface ChemicalProductSnapshot {
  productId?: string;
  capturedAt?: string;
  name: string;
  brand?: string;
  manufacturer?: string;
  sku?: string;
  barcode?: string;
  category: ChemicalProductCategory;
  secondaryCategories?: ChemicalProductCategory[];
  functions?: ProductFunction[];
  activeIngredients?: ActiveIngredientSnapshot[];
  physicalForm?: ProductPhysicalForm;
  applicationTarget?: ApplicationTarget;
  stabilizedChlorine?: boolean;
  availableChlorinePercent?: number;
  concentrationPercent?: number;
  densityKgPerLiter?: number;
  raises?: ChemicalParameterEffect[];
  lowers?: ChemicalParameterEffect[];
  mayAffect?: ChemicalParameterEffect[];
  compatiblePoolTypes?: string[];
  incompatibleSystems?: string[];
  defaultUnit?: ProductUnit;
  allowedUnits?: ProductUnit[];
  safetyInstructions?: string[];
  applicationInstructions?: string[];
  evaluationProfileId?: string;
  evaluationEligibility?: EvaluationEligibility | 'unknown';
  dosageInstructions?: string;
  notes?: string;
  catalogVersion?: string;
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
  unit?: ProductUnit;
  concentrationPercent?: number;
  product?: ChemicalProductReference;
  applicationTarget?: ApplicationTarget;
  applicationMethod?:
    | 'direct-to-pool'
    | 'pre-diluted'
    | 'skimmer'
    | 'doser'
    | 'dosing-pump'
    | 'chlorinator'
    | 'filter'
    | 'surface'
    | 'plumbing'
    | 'other'
    | (string & {});
  filtrationActiveDuringApplication?: boolean;
  postApplicationFiltrationMinutes?: number;
  poolCoveredDuringApplication?: boolean;
  bathingRestrictionMinutes?: number;
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
    const productEligibility = action.chemical?.product?.snapshot.evaluationEligibility;
    if (productEligibility === 'unknown') return 'unknown-product';
    if (productEligibility) return productEligibility;
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
