import { clampConfidence } from '../shared/confidence';
import type { DiagnosisEvidence } from './diagnosisEvidence';

export function calculateDiagnosisConfidence(input: {
  evidence: DiagnosisEvidence[];
  contradictoryEvidence?: DiagnosisEvidence[];
  missingInputCount?: number;
  alternativeExplanationCount?: number;
}): number {
  const positive = input.evidence.reduce((sum, evidence) => sum + evidence.weight, 0);
  const contradictory = (input.contradictoryEvidence ?? []).reduce((sum, evidence) => sum + evidence.weight, 0);
  const missingPenalty = (input.missingInputCount ?? 0) * 0.05;
  const alternativePenalty = (input.alternativeExplanationCount ?? 0) * 0.07;
  return clampConfidence(0.35 + positive - contradictory - missingPenalty - alternativePenalty);
}

