import type { MeasurementField } from '../shared/measurementField';

export type DiagnosisEvidenceType =
  | 'measurement'
  | 'trend'
  | 'persistence'
  | 'action-outcome'
  | 'context'
  | 'configuration'
  | 'derived';

export interface DiagnosisEvidence {
  type: DiagnosisEvidenceType;
  code: string;
  field?: MeasurementField;
  observedValue?: number | string | boolean;
  expectedRange?: {
    min?: number;
    max?: number;
    unit?: string;
  };
  measurementId?: string;
  actionId?: string;
  outcomeId?: string;
  contextId?: string;
  weight: number;
}

export interface AlternativeExplanation {
  code: string;
  evidence?: DiagnosisEvidence[];
  weight: number;
}

export interface MissingInput {
  code: string;
  field?: string;
  requiredFor: string;
}

