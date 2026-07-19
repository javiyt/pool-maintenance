import type { MeasurementField } from '../shared/measurementField';
import type { DiagnosisCode } from './diagnosisCode';
import type { AlternativeExplanation, DiagnosisEvidence, MissingInput } from './diagnosisEvidence';

export type DiagnosisStatus = 'detected' | 'suspected' | 'inconclusive' | 'resolved';
export type DiagnosisSeverity = 'informational' | 'low' | 'medium' | 'high' | 'critical';

export interface Diagnosis {
  id: string;
  code: DiagnosisCode;
  detectedAt: string;
  measurementId: string;
  status: DiagnosisStatus;
  severity: DiagnosisSeverity;
  confidence: number;
  relatedFields: MeasurementField[];
  evidence: DiagnosisEvidence[];
  contradictoryEvidence: DiagnosisEvidence[];
  alternativeExplanations: AlternativeExplanation[];
  sourceMeasurementIds: string[];
  sourceActionIds: string[];
  sourceOutcomeIds: string[];
  sourceContextIds: string[];
  missingInputs: MissingInput[];
  firstObservedAt?: string;
  lastObservedAt: string;
  occurrenceCount: number;
  persistence?: {
    durationHours: number;
    consecutiveMeasurements: number;
    failedRelevantActions: number;
  };
  ruleIds: string[];
  version: string;
}

