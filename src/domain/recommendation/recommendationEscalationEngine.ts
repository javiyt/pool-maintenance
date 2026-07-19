import type { MaintenanceAction } from '../actions';
import type { ActionOutcome } from '../actionOutcomeEvaluator';
import type { Measurement } from '../measurement';
import type { TargetRange } from '../chemistry';

export type EscalationLevel = 'NORMAL' | 'PERSISTENT' | 'CRITICAL' | 'DIAGNOSTIC';

export interface EscalationAnalysis {
  level: EscalationLevel;
  lowFacMeasurementCount: number;
  recentAttemptCount: number;
  ineffectiveAttemptCount: number;
  inconclusiveAttemptCount: number;
  daysPersisting: number;
  confidence: number;
  reasons: string[];
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function isChlorineRecoveryAttempt(action: MaintenanceAction): boolean {
  return action.kind === 'chlorinator' ||
    action.kind === 'filtration' ||
    (action.kind === 'chemical' && action.chemical?.productType === 'chlorine-granules');
}

export function analyzeRecommendationEscalation(input: {
  measurements: Measurement[];
  actions: MaintenanceAction[];
  outcomes: ActionOutcome[];
  facRange: TargetRange;
  now?: string;
}): EscalationAnalysis {
  const sorted = [...input.measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const recent = sorted.slice(-10);
  const lowFacMeasurements = recent.filter((m) => m.fac < input.facRange.min);
  const latestLow = lowFacMeasurements[lowFacMeasurements.length - 1];
  const firstLow = lowFacMeasurements[0];
  const daysPersisting = firstLow && latestLow
    ? Math.round((hoursBetween(firstLow.measuredAt, latestLow.measuredAt) / 24) * 10) / 10
    : 0;

  const lowWindowStart = firstLow?.measuredAt ?? sorted[0]?.measuredAt;
  const attempts = input.actions.filter(
    (a) => isChlorineRecoveryAttempt(a) && (!lowWindowStart || a.performedAt >= lowWindowStart),
  );
  const attemptIds = new Set(attempts.map((a) => a.id));
  const attemptOutcomes = input.outcomes.filter((o) => attemptIds.has(o.actionId));
  const ineffective = attemptOutcomes.filter((o) => o.effectiveness === 'ineffective' || o.effectiveness === 'unexpected');
  const inconclusive = attemptOutcomes.filter((o) => o.effectiveness === 'inconclusive');

  let level: EscalationLevel = 'NORMAL';
  if (lowFacMeasurements.length >= 3 || daysPersisting >= 3) level = 'PERSISTENT';
  if (lowFacMeasurements.length >= 5 && attempts.length >= 2 && ineffective.length >= 1) level = 'CRITICAL';
  if (lowFacMeasurements.length >= 5 && attempts.length >= 3 && ineffective.length >= 2) level = 'DIAGNOSTIC';

  const reasons: string[] = [];
  if (lowFacMeasurements.length > 0) {
    reasons.push(`${lowFacMeasurements.length} de las últimas ${recent.length} mediciones tienen FAC por debajo del rango.`);
  }
  if (attempts.length > 0) {
    reasons.push(`${attempts.length} intento(s) reciente(s) de recuperación de cloro registrados.`);
  }
  if (ineffective.length > 0) {
    reasons.push(`${ineffective.length} intento(s) evaluados como inefectivos o inesperados.`);
  }
  if (inconclusive.length > 0) {
    reasons.push(`${inconclusive.length} intento(s) no son atribuibles con confianza suficiente.`);
  }
  if (level !== 'NORMAL') {
    reasons.push(`Nivel de escalado: ${level}.`);
  }

  const confidence = attemptOutcomes.length > 0
    ? Math.round((attemptOutcomes.reduce((sum, outcome) => sum + outcome.confidence, 0) / attemptOutcomes.length) * 100) / 100
    : 0.4;

  return {
    level,
    lowFacMeasurementCount: lowFacMeasurements.length,
    recentAttemptCount: attempts.length,
    ineffectiveAttemptCount: ineffective.length,
    inconclusiveAttemptCount: inconclusive.length,
    daysPersisting,
    confidence,
    reasons,
  };
}

