import type { MaintenanceAction } from '../actions';
import type { Measurement } from '../measurement';
import type { TranslationKey, TranslationParams } from '../../i18n/types';

export interface ConfidenceResult {
  confidence: number;
  reasons: ConfidenceReason[];
  externalVariableCount: number;
}

export interface ConfidenceReason {
  code: TranslationKey;
  params?: TranslationParams;
  reductionPct: number;
}

function clamp(value: number): number {
  return Math.max(0.1, Math.min(0.9, value));
}

function reduction(code: TranslationKey, amount: number, params?: TranslationParams): ConfidenceReason {
  return { code, params, reductionPct: Math.round(amount * 100) };
}

export function calculateOutcomeConfidence(input: {
  action: MaintenanceAction;
  before: Measurement;
  after: Measurement;
  elapsedHours: number;
  preferredMaxHours: number;
  interveningActions: number;
  explicitlyLinkedMeasurement: boolean;
}): ConfidenceResult {
  const reductions: ConfidenceReason[] = [];

  if (!input.explicitlyLinkedMeasurement) {
    reductions.push(reduction('outcome.confidenceReason.noExplicitMeasurement', 0.2));
  }

  if (input.interveningActions > 0) {
    reductions.push(reduction('outcome.confidenceReason.interveningActions', Math.min(input.interveningActions * 0.3, 0.6), { count: input.interveningActions }));
  }

  if (input.elapsedHours > input.preferredMaxHours) {
    reductions.push(reduction('outcome.confidenceReason.outsidePreferredWindow', 0.2));
  }

  const ctx = input.after.context;
  if (ctx) {
    if ((ctx.waterAddedLiters ?? 0) > 0) reductions.push(reduction('outcome.confidenceReason.waterAdded', 0.2));
    if (ctx.rainSincePreviousMeasurement) reductions.push(reduction('outcome.confidenceReason.rain', 0.15));
    if (ctx.poolCovered === false) reductions.push(reduction('outcome.confidenceReason.poolUncovered', 0.05));
    if (ctx.batherLoad === 'medium') reductions.push(reduction('outcome.confidenceReason.mediumBatherLoad', 0.1));
    if (ctx.batherLoad === 'high') reductions.push(reduction('outcome.confidenceReason.highBatherLoad', 0.2));
    if (ctx.sunlight === 'high') reductions.push(reduction('outcome.confidenceReason.highSunlight', 0.15));
    if (ctx.backwashPerformed) reductions.push(reduction('outcome.confidenceReason.backwash', 0.15));
    if ((ctx.chlorinatorHoursSincePreviousMeasurement ?? 0) > 0 && input.action.kind !== 'chlorinator') {
      reductions.push(reduction('outcome.confidenceReason.chlorinatorRan', 0.1));
    }
    if ((ctx.filtrationHoursSincePreviousMeasurement ?? 0) > 0 && input.action.kind !== 'filtration') {
      reductions.push(reduction('outcome.confidenceReason.filtrationRan', 0.05));
    }
  }

  if (input.after.temperature !== undefined && input.before.temperature !== undefined) {
    const deltaTemp = Math.abs(input.after.temperature - input.before.temperature);
    if (deltaTemp >= 3) reductions.push(reduction('outcome.confidenceReason.temperatureChanged', 0.1, { delta: Math.round(deltaTemp * 10) / 10 }));
  }

  const totalReduction = reductions.reduce((sum, item) => sum + item.reductionPct / 100, 0);
  const confidence = Math.round(clamp(0.85 - totalReduction) * 100) / 100;

  return {
    confidence,
    reasons: reductions,
    externalVariableCount: reductions.length,
  };
}
