import type { Measurement } from './measurement';
import type { MaintenanceAction } from './actions';
import type { PoolSettings } from './settings';
import type { TranslationKey, TranslationParams } from '../i18n/types';

// ── Types ─────────────────────────────────────────────────────────

export type EstimatedAlkalinityState =
  | 'likely-low'
  | 'probably-normal'
  | 'likely-high'
  | 'unknown';

export type EstimatedCyanuricAcidState =
  | 'likely-insufficient'
  | 'probably-adequate'
  | 'possibly-excessive'
  | 'inconclusive';

export type ParameterName = 'total-alkalinity' | 'cyanuric-acid';

export type EstimatorConfidence = 'none' | 'low' | 'medium' | 'high';

export interface LatentEstimateEvidence {
  code: string;
  messageKey: TranslationKey;
  params?: TranslationParams;
  weight: number;
}

export interface LocalizedMessage {
  messageKey: TranslationKey;
  params?: TranslationParams;
}

export interface LatentParameterEstimate<TState extends string = string> {
  parameter: ParameterName;
  state: TState;
  confidence: EstimatorConfidence;
  evidenceCount: number;
  evidence: LatentEstimateEvidence[];
  alternativeExplanations: LocalizedMessage[];
  lastUpdatedAt?: string;
}

export interface EstimateProvenance {
  sourceMeasurementIds: string[];
  sourceActionIds: string[];
  sourceExperimentIds: string[];
  generatedAt: string;
  algorithmVersion: string;
}

// ── Diagnostic experiment types ───────────────────────────────────

export type DiagnosticExperimentKind =
  | 'ph-buffer-response'
  | 'chlorine-retention';

export type DiagnosticExperimentStatus =
  | 'proposed'
  | 'active'
  | 'awaiting-measurement'
  | 'completed'
  | 'cancelled'
  | 'invalid';

export interface DiagnosticExperimentStep {
  order: number;
  instructionKey: TranslationKey;
  instructionParams?: TranslationParams;
  requiredMeasurement?: boolean;
  completedAt?: string;
}

export interface DiagnosticExperiment {
  id: string;
  kind: DiagnosticExperimentKind;
  status: DiagnosticExperimentStatus;
  createdAt: string;
  proposedAt?: string;
  activatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  steps: DiagnosticExperimentStep[];
  notes?: string;
  relatedMeasurementIds: string[];
  resultSummaryKey?: TranslationKey;
  resultSummaryParams?: TranslationParams;
}

// ── Experiment ID generator ───────────────────────────────────────

let _expCounter = 0;
export function generateExperimentId(): string {
  _expCounter += 1;
  return `exp-${Date.now()}-${_expCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Experiment factory ────────────────────────────────────────────

export function createDiagnosticExperiment(
  kind: DiagnosticExperimentKind,
): DiagnosticExperiment {
  const id = generateExperimentId();
  const now = new Date().toISOString();

  const base: DiagnosticExperiment = {
    id,
    kind,
    status: 'proposed',
    createdAt: now,
    proposedAt: now,
    steps: [],
    relatedMeasurementIds: [],
  };

  switch (kind) {
    case 'ph-buffer-response':
      return {
        ...base,
        steps: [
          {
            order: 1,
            instructionKey: 'experiment.phBuffer.step1',
            requiredMeasurement: false,
          },
          {
            order: 2,
            instructionKey: 'experiment.phBuffer.step2',
            requiredMeasurement: true,
          },
          {
            order: 3,
            instructionKey: 'experiment.phBuffer.step3',
            requiredMeasurement: true,
          },
          {
            order: 4,
            instructionKey: 'experiment.phBuffer.step4',
            requiredMeasurement: false,
          },
        ],
      };
    case 'chlorine-retention':
      return {
        ...base,
        steps: [
          {
            order: 1,
            instructionKey: 'experiment.chlorineRetention.step1',
            requiredMeasurement: true,
          },
          {
            order: 2,
            instructionKey: 'experiment.chlorineRetention.step2',
            requiredMeasurement: false,
          },
          {
            order: 3,
            instructionKey: 'experiment.chlorineRetention.step3',
            requiredMeasurement: true,
          },
          {
            order: 4,
            instructionKey: 'experiment.chlorineRetention.step4',
            requiredMeasurement: true,
          },
        ],
      };
  }
}

// ── Experiment state machine ──────────────────────────────────────

export function activateExperiment(
  exp: DiagnosticExperiment,
): DiagnosticExperiment {
  if (exp.status !== 'proposed') return exp;
  return {
    ...exp,
    status: 'active',
    activatedAt: new Date().toISOString(),
  };
}

export function advanceExperimentStep(
  exp: DiagnosticExperiment,
  stepOrder: number,
  measurementId?: string,
): DiagnosticExperiment {
  if (exp.status !== 'active' && exp.status !== 'awaiting-measurement') return exp;

  const step = exp.steps.find((s) => s.order === stepOrder);
  if (!step) return exp;
  if (step.completedAt) return exp; // already completed

  const updatedSteps = exp.steps.map((s) =>
    s.order === stepOrder
      ? { ...s, completedAt: new Date().toISOString() }
      : s,
  );

  const nextStep = exp.steps.find((s) => s.order === stepOrder + 1);
  const newStatus: DiagnosticExperimentStatus =
    nextStep?.requiredMeasurement
      ? 'awaiting-measurement'
      : nextStep
        ? 'active'
        : 'completed';

  const relatedIds = measurementId
    ? [...new Set([...exp.relatedMeasurementIds, measurementId])]
    : exp.relatedMeasurementIds;

  return {
    ...exp,
    steps: updatedSteps,
    status: newStatus,
    completedAt: newStatus === 'completed' ? new Date().toISOString() : exp.completedAt,
    relatedMeasurementIds: relatedIds,
  };
}

export function cancelExperiment(
  exp: DiagnosticExperiment,
): DiagnosticExperiment {
  if (exp.status === 'completed' || exp.status === 'cancelled') return exp;
  return {
    ...exp,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  };
}

export function markExperimentInvalid(
  exp: DiagnosticExperiment,
): DiagnosticExperiment {
  return {
    ...exp,
    status: 'invalid',
    cancelledAt: new Date().toISOString(),
  };
}

// ── Algorithm version ─────────────────────────────────────────────

export const ALGORITHM_VERSION = '1.0.0';

// ── Confidence helpers ───────────────────────────────────────────

/**
 * Confidence rules:
 *   0–1 comparable observations: none
 *   2–3: low
 *   4–7: medium
 *   8+: high
 */
export function observationsToConfidence(count: number): EstimatorConfidence {
  if (count >= 8) return 'high';
  if (count >= 4) return 'medium';
  if (count >= 2) return 'low';
  return 'none';
}

// ── pH action helpers ────────────────────────────────────────────

interface ComparablePhCorrection {
  actionId: string;
  measurementIdBefore: string;
  measurementIdAfter: string;
  beforePh: number;
  afterPh: number;
  expectedDelta: number; // expected pH change from dose/volume theory
  observedDelta: number; // actual pH change observed
  elapsedHours: number;
  hasRebound: boolean; // pH moved back toward original in a subsequent measurement
  hadRain: boolean;
  hadRefill: boolean;
  hadHighBatherLoad: boolean;
  hadChlorinatorOperation: boolean;
  hadOtherChemicals: boolean;
  temperature: number;
  intervalPhRange?: number; // max-min pH in the interval to detect instability
}

/**
 * Collect comparable pH corrections from action and measurement history.
 *
 * Looks for chemical actions of type ph-reducer or ph-increaser with
 * a before measurement and an after measurement within a valid window
 * (4–48 hours).
 */
export function collectComparablePhCorrections(
  measurements: Measurement[],
  actions: MaintenanceAction[],
): ComparablePhCorrection[] {
  const sortedM = [...measurements].sort(
    (a, b) => a.measuredAt.localeCompare(b.measuredAt),
  );

  const corrections: ComparablePhCorrection[] = [];

  for (const action of actions) {
    if (action.kind !== 'chemical') continue;
    const chem = action.chemical;
    if (!chem) continue;
    if (chem.productType !== 'ph-reducer' && chem.productType !== 'ph-increaser') continue;

    const actionTime = new Date(action.performedAt).getTime();

    // Find before measurement: closest measurement within 2 hours before action
    const before = sortedM
      .filter((m) => {
        const t = new Date(m.measuredAt).getTime();
        return t <= actionTime && (actionTime - t) <= 2 * 3_600_000;
      })
      .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];
    if (!before || before.ph === undefined || before.ph === null) continue;

    // Find after measurement: closest measurement 4-48 hours after action
    const after = sortedM
      .filter((m) => {
        const t = new Date(m.measuredAt).getTime();
        return t > actionTime && (t - actionTime) >= 4 * 3_600_000 && (t - actionTime) <= 48 * 3_600_000;
      })
      .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime())[0];
    if (!after || after.ph === undefined || after.ph === null) continue;

    const elapsedHours = (new Date(after.measuredAt).getTime() - actionTime) / 3_600_000;
    if (elapsedHours < 4 || elapsedHours > 48) continue;

    const expectedDelta =
      chem.productType === 'ph-reducer'
        ? -(before.ph - after.ph) // positive = pH went down as expected
        : after.ph - before.ph;

    const observedDelta = after.ph - before.ph;
    const expectedDirection =
      chem.productType === 'ph-reducer' ? observedDelta < 0 : observedDelta > 0;
    if (!expectedDirection) continue; // wrong direction, skip

    // Check for rebound: look at a measurement ~24h after the after measurement
    const reboundTime = new Date(after.measuredAt).getTime() + 24 * 3_600_000;
    const reboundEnd = reboundTime + 12 * 3_600_000;
    const reboundM = sortedM.find((m) => {
      const t = new Date(m.measuredAt).getTime();
      return t >= reboundTime && t <= reboundEnd && m.ph !== undefined;
    });
    const hasRebound =
      reboundM !== undefined && reboundM.ph !== undefined &&
      chem.productType === 'ph-reducer'
        ? reboundM.ph! > after.ph // pH went back up = rebound
        : chem.productType === 'ph-increaser' && reboundM !== undefined && reboundM.ph !== undefined
          ? reboundM.ph < after.ph // pH went back down = rebound
          : false;

    // Check for confounding factors (from action notes or context)
    const hadRain = action.unusualEventNotes?.some((n) => n.eventType === 'rain') ?? false;
    const hadRefill = action.unusualEventNotes?.some((n) => n.eventType === 'refill') ?? false;
    const hadHighBatherLoad =
      action.unusualEventNotes?.some((n) => n.eventType === 'many-bathers') ?? false;
    const hadChlorinatorOperation =
      action.unusualEventNotes?.some((n) => n.eventType === 'equipment-issue') ?? false;

    // Check if there were other chemical actions in the same interval
    const otherActions = actions.filter((a) => {
      if (a.id === action.id) return false;
      const t = new Date(a.performedAt).getTime();
      return t > actionTime && t < new Date(after.measuredAt).getTime();
    });
    const hadOtherChemicals = otherActions.length > 0;

    // Check context on after measurement
    const chlorineOp = after.context?.chlorinatorOutputPercent !== undefined;

    corrections.push({
      actionId: action.id,
      measurementIdBefore: before.id,
      measurementIdAfter: after.id,
      beforePh: before.ph,
      afterPh: after.ph,
      expectedDelta: Math.abs(expectedDelta),
      observedDelta: Math.abs(observedDelta),
      elapsedHours,
      hasRebound,
      hadRain,
      hadRefill,
      hadHighBatherLoad,
      hadChlorinatorOperation: hadChlorinatorOperation || chlorineOp,
      hadOtherChemicals,
      temperature: after.temperature,
    });
  }

  return corrections;
}

// ── Alkalinity estimation ─────────────────────────────────────────

/**
 * Estimate total alkalinity state from observed pH correction history.
 *
 * Interpretation:
 * - Smaller-than-expected pH change + repeated upward rebound → likely-high
 * - Larger-than-expected pH change + unstable pH → likely-low
 * - Consistent expected response → probably-normal
 * - Insufficient/conflicting → unknown
 */
export function estimateAlkalinityState(
  measurements: Measurement[],
  actions: MaintenanceAction[],
  _settings: PoolSettings,
): LatentParameterEstimate<EstimatedAlkalinityState> {
  const corrections = collectComparablePhCorrections(measurements, actions);

  const evidence: LatentEstimateEvidence[] = [];
  const alternatives: LocalizedMessage[] = [];
  let confidence: EstimatorConfidence = 'none';

  if (corrections.length === 0) {
    confidence = 'none';
    evidence.push({
      code: 'no-data',
      messageKey: 'estimate.alkalinity.noData',
      weight: 1,
    });
    return {
      parameter: 'total-alkalinity',
      state: 'unknown',
      confidence,
      evidenceCount: 0,
      evidence,
      alternativeExplanations: [
        { messageKey: 'estimate.alt.general' },
        { messageKey: 'estimate.alt.insufficient' },
      ],
    };
  }

  // Determine effective count (discounting confounded observations)
  let effectiveCount = 0;
  let smallResponseCount = 0;
  let largeResponseCount = 0;
  let normalResponseCount = 0;
  let reboundCount = 0;
  let unstableCount = 0;
  let confoundedCount = 0;

  for (const c of corrections) {
    const isConfounded = c.hadRain || c.hadRefill || c.hadHighBatherLoad || c.hadOtherChemicals;
    if (isConfounded) {
      confoundedCount++;
      continue;
    }

    effectiveCount++;

    // Ratio of observed/expected: < 0.5 = small, > 1.5 = large
    const ratio = c.observedDelta / Math.max(c.expectedDelta, 0.01);
    if (ratio < 0.5) {
      smallResponseCount++;
    } else if (ratio > 1.5) {
      largeResponseCount++;
    } else {
      normalResponseCount++;
    }

    if (c.hasRebound) reboundCount++;
    if (c.elapsedHours < 8 && ratio > 1.3) unstableCount++;
  }

  // Reduce effectiveCount for confounded observations
  const adjustedCount = effectiveCount;

  confidence = observationsToConfidence(adjustedCount);

  // Determine state
  let state: EstimatedAlkalinityState = 'unknown';

  if (adjustedCount <= 1) {
    state = 'unknown';
    confidence = 'none';
  } else if (smallResponseCount >= largeResponseCount && smallResponseCount >= normalResponseCount && reboundCount >= Math.ceil(adjustedCount * 0.5)) {
    // Small response + frequent rebound → likely high alkalinity (buffer)
    state = 'likely-high';
    evidence.push({
      code: 'small-ph-response',
      messageKey: 'estimate.alkalinity.evidence.smallResponse',
      params: { count: String(smallResponseCount), total: String(adjustedCount) },
      weight: 3,
    });
    evidence.push({
      code: 'frequent-rebound',
      messageKey: 'estimate.alkalinity.evidence.rebound',
      params: { count: String(reboundCount), total: String(adjustedCount) },
      weight: 2,
    });
  } else if (largeResponseCount >= smallResponseCount && largeResponseCount >= normalResponseCount && unstableCount >= Math.ceil(adjustedCount * 0.33)) {
    // Large response + instability → likely low alkalinity
    state = 'likely-low';
    evidence.push({
      code: 'large-ph-response',
      messageKey: 'estimate.alkalinity.evidence.largeResponse',
      params: { count: String(largeResponseCount), total: String(adjustedCount) },
      weight: 3,
    });
    evidence.push({
      code: 'unstable-ph',
      messageKey: 'estimate.alkalinity.evidence.unstable',
      params: { count: String(unstableCount), total: String(adjustedCount) },
      weight: 2,
    });
  } else if (normalResponseCount >= smallResponseCount && normalResponseCount >= largeResponseCount) {
    state = 'probably-normal';
    evidence.push({
      code: 'normal-ph-response',
      messageKey: 'estimate.alkalinity.evidence.normalResponse',
      params: { count: String(normalResponseCount), total: String(adjustedCount) },
      weight: 3,
    });
    if (reboundCount < Math.ceil(adjustedCount * 0.3)) {
      evidence.push({
        code: 'minimal-rebound',
        messageKey: 'estimate.alkalinity.evidence.minimalRebound',
        params: { count: String(reboundCount), total: String(adjustedCount) },
        weight: 1,
      });
    }
  } else {
    state = 'unknown';
    evidence.push({
      code: 'conflicting-evidence',
      messageKey: 'estimate.alkalinity.evidence.conflicting',
      weight: 1,
    });
    // Downgrade confidence for conflicting evidence
    if (confidence === 'high') confidence = 'medium';
    else if (confidence === 'medium') confidence = 'low';
    else if (confidence === 'low') confidence = 'none';
  }

  // Downgrade confidence if many confounded observations
  if (confoundedCount > effectiveCount && confidence !== 'none') {
    if (confidence === 'high') confidence = 'medium';
    else confidence = 'low';
    evidence.push({
      code: 'confounded',
      messageKey: 'estimate.alkalinity.evidence.confounded',
      params: { count: String(confoundedCount) },
      weight: 1,
    });
  }

  // Add alternative explanations
  alternatives.push(
    { messageKey: 'estimate.alt.aeration' },
    { messageKey: 'estimate.alt.chlorinator' },
    { messageKey: 'estimate.alt.waterAddition' },
    { messageKey: 'estimate.alt.rainfall' },
    { messageKey: 'estimate.alt.measurementNoise' },
    { messageKey: 'estimate.alt.unknownChemistry' },
  );

  return {
    parameter: 'total-alkalinity',
    state,
    confidence,
    evidenceCount: effectiveCount,
    evidence,
    alternativeExplanations: alternatives,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ── Cyanuric acid estimation ──────────────────────────────────────

interface ComparableFacInterval {
  startMeasurementId: string;
  endMeasurementId: string;
  startFac: number;
  endFac: number;
  netFacChange: number;
  elapsedHours: number;
  isDaytime: boolean;
  sunlight?: 'none' | 'low' | 'medium' | 'high';
  poolCovered?: boolean;
  chlorinatorOutputPercent?: number;
  chlorinatorHours?: number;
  temperature: number;
  batherLoad?: 'none' | 'low' | 'medium' | 'high';
  hadRain: boolean;
  hadRefill: boolean;
}

/**
 * Collect comparable FAC intervals from measurement history.
 * Splits by daytime (6:00–20:00) and overnight (20:00–6:00).
 */
export function collectComparableFacIntervals(
  measurements: Measurement[],
  actions: MaintenanceAction[],
): ComparableFacInterval[] {
  const sorted = [...measurements].sort(
    (a, b) => a.measuredAt.localeCompare(b.measuredAt),
  );

  const intervals: ComparableFacInterval[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];

    if (start.fac === undefined || start.fac === null) continue;
    if (end.fac === undefined || end.fac === null) continue;

    const startH = new Date(start.measuredAt).getHours();
    const endH = new Date(end.measuredAt).getHours();
    const elapsedHours =
      (new Date(end.measuredAt).getTime() - new Date(start.measuredAt).getTime()) / 3_600_000;

    // Only consider intervals 4–16 hours for daytime, 6–14 hours for overnight
    if (elapsedHours < 4 || elapsedHours > 16) continue;

    // Classify as daytime if start is between 6:00 and 16:00 and within ~12 hours
    const isDaytime = startH >= 6 && startH <= 16 && elapsedHours <= 14;

    // Overnight: start between 18:00 and 22:00, end between 4:00 and 10:00
    const isOvernight = startH >= 18 && startH <= 22 && endH >= 4 && endH <= 10 && elapsedHours <= 14;

    if (!isDaytime && !isOvernight) continue;

    // Check if any chlorine-related action occurred during the interval
    const intervalStartMs = new Date(start.measuredAt).getTime();
    const intervalEndMs = new Date(end.measuredAt).getTime();
    const hasChlorineAction = actions.some((a) => {
      if (a.kind !== 'chemical' && a.kind !== 'chlorinator') return false;
      const t = new Date(a.performedAt).getTime();
      return t > intervalStartMs && t < intervalEndMs;
    });
    if (hasChlorineAction) continue; // skip intervals with intervening chlorine actions

    // Check for confounding events
    const confoundingActions = actions.filter((a) => {
      const t = new Date(a.performedAt).getTime();
      if (t <= intervalStartMs || t >= intervalEndMs) return false;
      if (a.kind === 'water-replacement') return true;
      if (a.unusualEventNotes?.some((n) => n.eventType === 'rain' || n.eventType === 'many-bathers' || n.eventType === 'refill')) return true;
      return false;
    });
    const hadRain = confoundingActions.some((a) =>
      a.unusualEventNotes?.some((n) => n.eventType === 'rain'),
    );
    const hadRefill = confoundingActions.some((a) =>
      a.unusualEventNotes?.some((n) => n.eventType === 'refill'),
    );

    intervals.push({
      startMeasurementId: start.id,
      endMeasurementId: end.id,
      startFac: start.fac,
      endFac: end.fac,
      netFacChange: end.fac - start.fac,
      elapsedHours,
      isDaytime,
      sunlight: end.context?.sunlight,
      poolCovered: end.context?.poolCovered,
      chlorinatorOutputPercent: end.context?.chlorinatorOutputPercent,
      chlorinatorHours: end.context?.chlorinatorHoursSincePreviousMeasurement,
      temperature: end.temperature,
      batherLoad: end.context?.batherLoad,
      hadRain,
      hadRefill,
    });
  }

  return intervals;
}

/**
 * Estimate cyanuric acid state from historical chlorine retention.
 *
 * - Repeated daytime FAC loss >> comparable overnight loss → likely-insufficient
 * - Stable daytime FAC under expected production → probably-adequate
 * - FAC present but weak sanitation → possibly-excessive (low confidence)
 * - Large overnight loss → inconclusive (organic demand likely)
 * - Missing context → inconclusive
 */
export function estimateCyanuricAcidState(
  measurements: Measurement[],
  actions: MaintenanceAction[],
  _settings: PoolSettings,
): LatentParameterEstimate<EstimatedCyanuricAcidState> {
  const intervals = collectComparableFacIntervals(measurements, actions);

  const daytimeIntervals = intervals.filter((i) => i.isDaytime);
  const overnightIntervals = intervals.filter((i) => !i.isDaytime);

  const evidence: LatentEstimateEvidence[] = [];
  const alternatives: LocalizedMessage[] = [];
  let state: EstimatedCyanuricAcidState = 'inconclusive';
  let confidence: EstimatorConfidence = 'none';

  if (intervals.length === 0) {
    evidence.push({
      code: 'no-intervals',
      messageKey: 'estimate.cya.noData',
      weight: 1,
    });
    return {
      parameter: 'cyanuric-acid',
      state: 'inconclusive',
      confidence,
      evidenceCount: 0,
      evidence,
      alternativeExplanations: [
        { messageKey: 'estimate.alt.general' },
        { messageKey: 'estimate.alt.insufficient' },
      ],
    };
  }

  // Count intervals with sufficient context
  const withContext = intervals.filter(
    (i) => i.sunlight !== undefined || i.poolCovered !== undefined,
  );
  const adequateDaytime = daytimeIntervals.filter(
    (i) => i.sunlight !== undefined || i.poolCovered !== undefined,
  );

  // Not enough context → inconclusive
  if (withContext.length === 0 || adequateDaytime.length < 2) {
    evidence.push({
      code: 'insufficient-context',
      messageKey: 'estimate.cya.insufficientContext',
      params: { day: String(adequateDaytime.length), total: String(daytimeIntervals.length) },
      weight: 1,
    });
    return {
      parameter: 'cyanuric-acid',
      state: 'inconclusive',
      confidence: 'none',
      evidenceCount: withContext.length,
      evidence,
      alternativeExplanations: [
        { messageKey: 'estimate.alt.general' },
        { messageKey: 'estimate.alt.missingContext' },
      ],
    };
  }

  // Calculate daytime FAC loss rate (ppm/hour) for intervals with clear context
  const daytimeLossRates = adequateDaytime
    .filter((i) => i.netFacChange < 0) // only loss intervals
    .map((i) => ({
      rate: Math.abs(i.netFacChange) / i.elapsedHours,
      hasSunlight: i.sunlight === 'high' || i.sunlight === 'medium',
      poolCovered: i.poolCovered ?? false,
      elaps: i.elapsedHours,
    }));

  // Calculate overnight loss rates
  const overnightLossRates = overnightIntervals
    .filter((i) => i.netFacChange < 0)
    .map((i) => Math.abs(i.netFacChange) / i.elapsedHours);

  // Check for stable daytime FAC (production roughly matches loss or small gain)
  const stableDaytimeCount = adequateDaytime.filter(
    (i) => i.netFacChange >= -0.3 && i.netFacChange <= 0.5,
  ).length;

  // Count intervals with large overnight loss
  const largeOvernightLoss = overnightLossRates.filter((r) => r > 0.15).length;

  if (largeOvernightLoss >= 2) {
    // Large overnight loss suggests organic demand — inconclusive for CYA
    state = 'inconclusive';
    confidence = observationsToConfidence(Math.max(overnightIntervals.length, 1));
    evidence.push({
      code: 'large-overnight-loss',
      messageKey: 'estimate.cya.evidence.largeOvernight',
      params: { count: String(largeOvernightLoss) },
      weight: 3,
    });
    evidence.push({
      code: 'organic-demand-possible',
      messageKey: 'estimate.cya.evidence.organicDemand',
      weight: 2,
    });
    alternatives.push(
      { messageKey: 'estimate.alt.organicDemand' },
      { messageKey: 'estimate.alt.insufficientChlorine' },
    );
  } else if (daytimeLossRates.length >= 2 && overnightLossRates.length >= 1) {
    const avgDaytimeLoss = daytimeLossRates.reduce((s, r) => s + r.rate, 0) / daytimeLossRates.length;
    const avgOvernightLoss = overnightLossRates.reduce((s, r) => s + r, 0) / Math.max(overnightLossRates.length, 1);
    const ratio = avgDaytimeLoss / Math.max(avgOvernightLoss, 0.001);

    const totalObs = daytimeLossRates.length + overnightLossRates.length;
    confidence = observationsToConfidence(totalObs);

    if (ratio > 2.5 && daytimeLossRates.some((d) => d.hasSunlight || d.poolCovered)) {
      // Daytime loss much greater than overnight → likely insufficient CYA
      state = 'likely-insufficient';
      evidence.push({
        code: 'high-daytime-loss-ratio',
        messageKey: 'estimate.cya.evidence.highDaytimeLoss',
        params: { ratio: String(Math.round(ratio * 10) / 10), day: String(daytimeLossRates.length), night: String(overnightLossRates.length) },
        weight: 3,
      });
      if (daytimeLossRates.some((d) => d.hasSunlight)) {
        evidence.push({
          code: 'sunlight-exposure',
          messageKey: 'estimate.cya.evidence.sunlightExposure',
          weight: 1,
        });
      }
    } else if (stableDaytimeCount >= 2 && ratio < 2) {
      // Stable daytime FAC → probably adequate
      state = 'probably-adequate';
      evidence.push({
        code: 'stable-daytime-fac',
        messageKey: 'estimate.cya.evidence.stableFac',
        params: { count: String(stableDaytimeCount) },
        weight: 3,
      });
    } else {
      state = 'inconclusive';
      evidence.push({
        code: 'mixed-signals',
        messageKey: 'estimate.cya.evidence.mixedSignals',
        weight: 1,
      });
    }
  } else if (stableDaytimeCount >= 2) {
    state = 'probably-adequate';
    confidence = 'low';
    evidence.push({
      code: 'stable-daytime-fac',
      messageKey: 'estimate.cya.evidence.stableFac',
      params: { count: String(stableDaytimeCount) },
      weight: 2,
    });
  } else {
    state = 'inconclusive';
    confidence = 'none';
    evidence.push({
      code: 'insufficient-intervals',
      messageKey: 'estimate.cya.insufficientIntervals',
      weight: 1,
    });
  }

  // Add standard alternatives
  alternatives.push(
    { messageKey: 'estimate.alt.general' },
    { messageKey: 'estimate.alt.chlorinator' },
    { messageKey: 'estimate.alt.batherLoad' },
    { messageKey: 'estimate.alt.measurementNoise' },
  );

  return {
    parameter: 'cyanuric-acid',
    state,
    confidence,
    evidenceCount: intervals.length,
    evidence,
    alternativeExplanations: alternatives,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ── Provenance builder ───────────────────────────────────────────

export function buildProvenance(
  measurementIds: string[],
  actionIds: string[],
  experimentIds: string[],
): EstimateProvenance {
  return {
    sourceMeasurementIds: measurementIds,
    sourceActionIds: actionIds,
    sourceExperimentIds: experimentIds,
    generatedAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
  };
}
