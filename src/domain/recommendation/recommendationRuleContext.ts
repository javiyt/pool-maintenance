import type { Diagnosis } from '../diagnosis/diagnosis';
import type { DiagnosisCode } from '../diagnosis/diagnosisCode';
import type { PoolSettings } from '../settings';
import type { RecommendationCode } from './recommendationCode';

export interface RecommendationRuleContext {
  settings: PoolSettings;
  diagnoses: Diagnosis[];
  generatedAt: string;
  hasDiagnosis(code: DiagnosisCode): boolean;
  getDiagnosis(code: DiagnosisCode): Diagnosis | undefined;
  sourceIds(codes: DiagnosisCode[]): string[];
  numericEvidence(code: DiagnosisCode, field: string): number | undefined;
  makeId(code: RecommendationCode): string;
}

export function createRecommendationRuleContext(input: {
  settings: PoolSettings;
  diagnoses: Diagnosis[];
  generatedAt: string;
}): RecommendationRuleContext {
  return {
    settings: input.settings,
    diagnoses: input.diagnoses,
    generatedAt: input.generatedAt,
    hasDiagnosis: (code) => input.diagnoses.some((diagnosis) => diagnosis.code === code),
    getDiagnosis: (code) => input.diagnoses.find((diagnosis) => diagnosis.code === code),
    sourceIds: (codes) => input.diagnoses
      .filter((diagnosis) => codes.includes(diagnosis.code))
      .map((diagnosis) => diagnosis.id),
    numericEvidence: (code, field) => {
      const diagnosis = input.diagnoses.find((item) => item.code === code);
      const evidence = diagnosis?.evidence.find((item) => item.field === field && typeof item.observedValue === 'number');
      return typeof evidence?.observedValue === 'number' ? evidence.observedValue : undefined;
    },
    makeId: (code) => `${code.toLowerCase()}-${input.generatedAt}`,
  };
}

