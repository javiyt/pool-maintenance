import type { Diagnosis } from './diagnosis';

export function resolveDiagnoses(diagnoses: Diagnosis[]): Diagnosis[] {
  const byCode = new Map<string, Diagnosis>();
  for (const diagnosis of diagnoses) {
    const existing = byCode.get(diagnosis.code);
    if (!existing || diagnosis.confidence > existing.confidence) {
      byCode.set(diagnosis.code, diagnosis);
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code) || b.confidence - a.confidence,
  );
}

