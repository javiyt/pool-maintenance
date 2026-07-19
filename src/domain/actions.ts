export type MaintenanceActionKind =
  | 'chemical'
  | 'chlorinator'
  | 'filtration'
  | 'water-replacement'
  | 'cleaning'
  | 'manual-test'
  | 'other';

import type { ActionExclusionFlags, ActionNote } from './followUp';
import type { RecommendationSnapshot } from './recommendation/recommendationSnapshot';
export type { ActionExclusionFlags, ActionNote, UnusualEventType } from './followUp';
export { UNUSUAL_EVENT_LABELS } from './followUp';

export type ChemicalProductType =
  | 'ph-reducer'
  | 'ph-increaser'
  | 'chlorine-granules'
  | 'chlorine-stabilizer'
  | 'alkalinity-reducer'
  | 'pool-salt';

export interface MaintenanceActionChemical {
  productType: ChemicalProductType;
  mainComponent: string;
  amount: number;
  unit: 'ml' | 'l' | 'g' | 'kg';
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

export interface MaintenanceAction {
  id: string;
  performedAt: string; // ISO 8601
  kind: MaintenanceActionKind;
  description: string;
  notes?: string;
  relatedMeasurementId?: string;
  relatedRecommendationId?: string;
  recommendationSnapshot?: RecommendationSnapshot;
  chemical?: MaintenanceActionChemical;
  chlorinator?: MaintenanceActionChlorinator;
  filtration?: MaintenanceActionFiltration;
  waterReplacement?: MaintenanceActionWaterReplacement;
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
