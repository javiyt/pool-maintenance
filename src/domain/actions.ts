export type MaintenanceActionKind =
  | 'chemical'
  | 'chlorinator'
  | 'filtration'
  | 'water-replacement'
  | 'cleaning'
  | 'manual-test'
  | 'other';

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
  chemical?: MaintenanceActionChemical;
  chlorinator?: MaintenanceActionChlorinator;
  filtration?: MaintenanceActionFiltration;
  waterReplacement?: MaintenanceActionWaterReplacement;
}

let _actionCounter = 0;

export function generateActionId(): string {
  _actionCounter += 1;
  return `act-${Date.now()}-${_actionCounter}-${Math.random().toString(36).slice(2, 6)}`;
}
