import type { Measurement } from './measurement';
import type { MaintenanceAction } from './actions';
import { calculateOutcomeConfidence } from './recommendation/confidenceCalculator';
import { OUTCOME_EVALUATOR_VERSION } from './recommendation/versions';

// ── Types ─────────────────────────────────────────────────────────

export type OutcomeEffectiveness =
  | 'effective'
  | 'partially-effective'
  | 'ineffective'
  | 'unexpected'
  | 'inconclusive'
  | 'unknown';

export type ActionSuitability = 'appropriate' | 'unnecessary' | 'preventive' | 'maintained' | 'unknown';

export interface FieldChanges {
  ph?: number;
  ec?: number;
  tds?: number;
  salt?: number;
  orp?: number;
  fac?: number;
  temperature?: number;
}

export interface ActionOutcome {
  actionId: string;
  beforeMeasurementId: string;
  afterMeasurementId: string;
  elapsedHours: number;
  timing: EvaluationTiming;
  changes: FieldChanges;
  effectiveness: OutcomeEffectiveness;
  actionSuitability: ActionSuitability;
  confidence: number;
  confidenceReasons: string[];
  explanationCodes: string[];
  observations: ActionOutcomeObservation[];
  assessmentSnapshot: AssessmentSnapshot;
  recalculatedAssessment?: AssessmentSnapshot;
  evaluatedAt: string;
  evaluatorVersion: string;
}

export type EvaluationTiming = 'early-observation' | 'preferred' | 'maximum' | 'late';

export interface ActionOutcomeObservation {
  afterMeasurementId: string;
  elapsedHours: number;
  timing: EvaluationTiming;
  changes: FieldChanges;
}

export interface StructuredExpectedEffect {
  field: keyof FieldChanges;
  direction: 'increase' | 'decrease' | 'any' | 'unknown';
  significanceThreshold: number;
}

export interface StructuredObservedChange {
  field: keyof FieldChanges;
  delta: number;
  significant: boolean;
}

export interface AssessmentSnapshot {
  schemaVersion: 1;
  actionId: string;
  previousMeasurement: Measurement;
  observedMeasurements: Measurement[];
  selectedEvaluationMeasurement: Measurement;
  expectedEffects: StructuredExpectedEffect[];
  observedChanges: StructuredObservedChange[];
  intermediateContext: Array<Measurement['context']>;
  intermediateActions: MaintenanceAction[];
  result: {
    effectiveness: OutcomeEffectiveness;
    actionSuitability: ActionSuitability;
  };
  confidenceBreakdown: {
    score: number;
    reasons: string[];
  };
  explanationCodes: string[];
  evaluatorVersion: string;
  originalSnapshot?: AssessmentSnapshot;
  recalculatedAssessment?: AssessmentSnapshot;
}

// ── Evaluation windows (hours after action) ───────────────────────

interface Window {
  earlyMinHours: number;
  earlyMaxHours: number;
  preferredMinHours: number;
  preferredMaxHours: number;
  maxHours: number;
  lateMaxHours: number;
}

const EVALUATION_WINDOWS: Record<string, Window> = {
  'chemical:ph-reducer': { earlyMinHours: 2, earlyMaxHours: 4, preferredMinHours: 4, preferredMaxHours: 12, maxHours: 48, lateMaxHours: 168 },
  'chemical:ph-increaser': { earlyMinHours: 2, earlyMaxHours: 4, preferredMinHours: 4, preferredMaxHours: 12, maxHours: 48, lateMaxHours: 168 },
  'chemical:chlorine-granules': { earlyMinHours: 1, earlyMaxHours: 4, preferredMinHours: 4, preferredMaxHours: 8, maxHours: 24, lateMaxHours: 72 },
  'chemical:pool-salt': { earlyMinHours: 4, earlyMaxHours: 12, preferredMinHours: 12, preferredMaxHours: 48, maxHours: 96, lateMaxHours: 240 },
  chemical: { earlyMinHours: 2, earlyMaxHours: 4, preferredMinHours: 4, preferredMaxHours: 24, maxHours: 48, lateMaxHours: 168 },
  chlorinator: { earlyMinHours: 2, earlyMaxHours: 8, preferredMinHours: 8, preferredMaxHours: 36, maxHours: 72, lateMaxHours: 168 },
  filtration: { earlyMinHours: 6, earlyMaxHours: 12, preferredMinHours: 12, preferredMaxHours: 36, maxHours: 72, lateMaxHours: 168 },
  'water-replacement': { earlyMinHours: 4, earlyMaxHours: 12, preferredMinHours: 12, preferredMaxHours: 36, maxHours: 72, lateMaxHours: 168 },
  cleaning: { earlyMinHours: 1, earlyMaxHours: 6, preferredMinHours: 6, preferredMaxHours: 24, maxHours: 48, lateMaxHours: 120 },
};

function getWindow(action: MaintenanceAction): Window | null {
  if (action.kind === 'chemical' && action.chemical) {
    return EVALUATION_WINDOWS[`chemical:${action.chemical.productType}`] ?? EVALUATION_WINDOWS.chemical;
  }
  return EVALUATION_WINDOWS[action.kind] ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────

function hoursBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(b - a) / 3_600_000;
}

/** Return the relevant field-change keys for an action kind. */
function expectedFields(action: MaintenanceAction): Array<keyof FieldChanges> {
  if (action.kind === 'chemical' && action.chemical) {
    switch (action.chemical.productType) {
      case 'ph-reducer':
      case 'ph-increaser':
        return ['ph'];
      case 'chlorine-granules':
        return ['fac', 'orp'];
      case 'pool-salt':
        return ['salt'];
      case 'chlorine-stabilizer':
        return [];
      case 'alkalinity-reducer':
        return [];
    }
  }
  if (action.kind === 'chlorinator') {
    return ['fac'];
  }
  if (action.kind === 'water-replacement') {
    return ['salt', 'tds', 'ec'];
  }
  if (action.kind === 'filtration') {
    return ['fac'];
  }
  return [];
}

/** Expected sign of change: 1 = increase, -1 = decrease, 0 = any, null = unknown */
function expectedDirection(
  action: MaintenanceAction,
  field: keyof FieldChanges,
): 1 | -1 | 0 | null {
  if (action.kind === 'chemical' && action.chemical) {
    if (field === 'ph') {
      if (action.chemical.productType === 'ph-reducer') return -1;
      if (action.chemical.productType === 'ph-increaser') return 1;
    }
    if (field === 'fac' && action.chemical.productType === 'chlorine-granules') return 1;
    if (field === 'orp' && action.chemical.productType === 'chlorine-granules') return 1;
    if (field === 'salt' && action.chemical.productType === 'pool-salt') return 1;
  }
  if (action.kind === 'chlorinator') {
    if (field === 'fac') return 1;
  }
  if (action.kind === 'water-replacement') {
    // Any direction possible — we note the change but don't assign direction
    return 0;
  }
  if (action.kind === 'filtration') {
    if (field === 'fac') return 1;
  }
  return null;
}

// ── Main evaluator ────────────────────────────────────────────────

/**
 * Evaluate observed outcomes for all actions against the measurement history.
 *
 * For each action the evaluator:
 * 1. Finds the closest valid measurement before the action.
 * 2. Finds the closest valid measurement after the action.
 * 3. Checks the after measurement falls within the evaluation window.
 * 4. Detects other actions between before and after.
 * 5. Computes field deltas and judges effectiveness.
 *
 * Derived outcomes are NOT persisted — they are recalculated from raw history.
 */
export function evaluateActionOutcomes(
  measurements: Measurement[],
  actions: MaintenanceAction[],
): ActionOutcome[] {
  if (measurements.length === 0 || actions.length === 0) return [];

  const now = new Date().toISOString();
  const sortedMeas = [...measurements].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );
  const sortedActions = [...actions].sort((a, b) =>
    a.performedAt.localeCompare(b.performedAt),
  );

  const outcomes: ActionOutcome[] = [];

  for (const action of actions) {
    const window = getWindow(action);
    if (!window) continue; // non-evaluable action kind

    const outcome = evaluateSingleAction(action, sortedMeas, sortedActions, window, now);
    if (outcome) outcomes.push(outcome);
  }

  return outcomes;
}

function evaluateSingleAction(
  action: MaintenanceAction,
  sortedMeas: Measurement[],
  sortedActions: MaintenanceAction[],
  window: Window,
  now: string,
): ActionOutcome | null {
  const before = findBeforeMeasurement(action, sortedMeas);
  if (!before) return null;

  const observations = findAfterMeasurements(action, sortedMeas, window)
    .map((measurement) => {
      const elapsedHours = hoursBetween(action.performedAt, measurement.measuredAt);
      return {
        afterMeasurementId: measurement.id,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        timing: classifyTiming(elapsedHours, window),
        changes: computeChanges(before, measurement),
      };
    });
  const selected = selectBestObservation(observations, window);
  if (!selected) return null;
  const after = sortedMeas.find((m) => m.id === selected.afterMeasurementId);
  if (!after) return null;

  const elapsedHours = selected.elapsedHours;

  // Compute field deltas
  const changes = computeChanges(before, after);

  // Detect intervening actions
  const intervening = countInterveningActions(action, sortedActions, before.measuredAt, after.measuredAt);

  // Evaluate effectiveness
  const { effectiveness, actionSuitability, confidence, reasons, explanationCodes } = evaluateEffectiveness(
    action,
    changes,
    elapsedHours,
    intervening,
    before,
    after,
    window,
  );
  const observedMeasurements = observations
    .map((obs) => sortedMeas.find((m) => m.id === obs.afterMeasurementId))
    .filter((m): m is Measurement => Boolean(m));
  const intermediateActions = sortedActions.filter((other) =>
    other.id !== action.id &&
    other.performedAt > before.measuredAt &&
    other.performedAt < after.measuredAt,
  );
  const assessmentSnapshot: AssessmentSnapshot = {
    schemaVersion: 1,
    actionId: action.id,
    previousMeasurement: before,
    observedMeasurements,
    selectedEvaluationMeasurement: after,
    expectedEffects: buildExpectedEffects(action),
    observedChanges: buildObservedChanges(changes),
    intermediateContext: observedMeasurements.map((m) => m.context).filter(Boolean),
    intermediateActions,
    result: { effectiveness, actionSuitability },
    confidenceBreakdown: {
      score: Math.round(confidence * 100) / 100,
      reasons,
    },
    explanationCodes,
    evaluatorVersion: OUTCOME_EVALUATOR_VERSION,
  };

  return {
    actionId: action.id,
    beforeMeasurementId: before.id,
    afterMeasurementId: after.id,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    timing: selected.timing,
    changes,
    effectiveness,
    actionSuitability,
    confidence: Math.round(confidence * 100) / 100,
    confidenceReasons: reasons,
    explanationCodes,
    observations,
    assessmentSnapshot,
    evaluatedAt: now,
    evaluatorVersion: OUTCOME_EVALUATOR_VERSION,
  };
}

// ── Measurement finding ───────────────────────────────────────────

function findBeforeMeasurement(
  action: MaintenanceAction,
  sortedMeas: Measurement[],
): Measurement | null {
  // Prefer explicitly linked measurement if it's before the action
  if (action.relatedMeasurementId) {
    const linked = sortedMeas.find((m) => m.id === action.relatedMeasurementId);
    if (linked && linked.measuredAt <= action.performedAt) return linked;
  }

  // Fall back to closest measurement before the action (within 7 days)
  const actionTime = new Date(action.performedAt).getTime();
  const sevenDaysMs = 7 * 24 * 3_600_000;
  let best: Measurement | null = null;
  let bestDelta = Infinity;

  for (const m of sortedMeas) {
    const mTime = new Date(m.measuredAt).getTime();
    const delta = actionTime - mTime;
    if (delta >= 0 && delta < sevenDaysMs && delta < bestDelta) {
      best = m;
      bestDelta = delta;
    }
  }

  return best;
}

function findAfterMeasurements(
  action: MaintenanceAction,
  sortedMeas: Measurement[],
  window: Window,
): Measurement[] {
  const actionTime = new Date(action.performedAt).getTime();
  const minMs = window.earlyMinHours * 3_600_000;
  const lateMaxMs = window.lateMaxHours * 3_600_000;

  return sortedMeas.filter((m) => {
    const delta = new Date(m.measuredAt).getTime() - actionTime;
    return delta >= minMs && delta <= lateMaxMs;
  });
}

function classifyTiming(elapsedHours: number, window: Window): EvaluationTiming {
  if (elapsedHours >= window.preferredMinHours && elapsedHours <= window.preferredMaxHours) {
    return 'preferred';
  }
  if (elapsedHours >= window.earlyMinHours && elapsedHours < window.preferredMinHours) {
    return 'early-observation';
  }
  if (elapsedHours > window.preferredMaxHours && elapsedHours <= window.maxHours) {
    return 'maximum';
  }
  return 'late';
}

function selectBestObservation(
  observations: ActionOutcomeObservation[],
  _window: Window,
): ActionOutcomeObservation | null {
  const preferred = observations.filter((o) => o.timing === 'preferred');
  if (preferred.length > 0) {
    return preferred.sort((a, b) => a.elapsedHours - b.elapsedHours)[0];
  }

  const maximum = observations.filter((o) => o.timing === 'maximum');
  if (maximum.length > 0) {
    return maximum.sort((a, b) => a.elapsedHours - b.elapsedHours)[0];
  }

  const early = observations.filter((o) => o.timing === 'early-observation');
  if (early.length > 0) {
    return early.sort((a, b) => b.elapsedHours - a.elapsedHours)[0];
  }

  const late = observations.filter((o) => o.timing === 'late');
  if (late.length > 0) {
    return late.sort((a, b) => a.elapsedHours - b.elapsedHours)[0];
  }

  return null;
}

// ── Delta computation ─────────────────────────────────────────────

function computeChanges(before: Measurement, after: Measurement): FieldChanges {
  const changes: FieldChanges = {};
  const fields: Array<keyof FieldChanges> = ['ph', 'ec', 'tds', 'salt', 'orp', 'fac', 'temperature'];
  for (const f of fields) {
    const beforeValue = before[f];
    const afterValue = after[f];
    if (beforeValue === undefined || afterValue === undefined || beforeValue === null || afterValue === null) continue;
    const diff = afterValue - beforeValue;
    if (f === 'ph') {
      changes[f] = Math.round(diff * 100) / 100;
    } else if (f === 'fac' || f === 'temperature') {
      changes[f] = Math.round(diff * 10) / 10;
    } else {
      changes[f] = Math.round(diff);
    }
  }
  return changes;
}

// ── Intervening action detection ──────────────────────────────────

function countInterveningActions(
  action: MaintenanceAction,
  sortedActions: MaintenanceAction[],
  beforeMeasAt: string,
  afterMeasAt: string,
): number {
  let count = 0;
  for (const other of sortedActions) {
    if (other.id === action.id) continue;
    if (other.performedAt > beforeMeasAt && other.performedAt < afterMeasAt) {
      count++;
    }
  }
  return count;
}

// ── Effectiveness evaluation ──────────────────────────────────────

function evaluateEffectiveness(
  action: MaintenanceAction,
  changes: FieldChanges,
  elapsedHours: number,
  interveningActions: number,
  before: Measurement,
  after: Measurement,
  window: Window,
): {
  effectiveness: OutcomeEffectiveness;
  actionSuitability: ActionSuitability;
  confidence: number;
  reasons: string[];
  explanationCodes: string[];
} {
  const reasons: string[] = [];
  const explanationCodes: string[] = [];
  const relevantFields = expectedFields(action);

  // No measurable fields → unknown
  if (relevantFields.length === 0) {
    return {
      effectiveness: 'unknown',
      actionSuitability: 'unknown',
      confidence: 0.1,
      reasons: ['No measurable field for this action type.'],
      explanationCodes: ['NO_MEASURABLE_FIELD'],
    };
  }

  // Compute how many fields moved in the expected direction
  let matched = 0;
  let opposed = 0;
  let noChange = 0;
  const deltas: Array<{ field: string; expected: string; actual: number }> = [];

  for (const field of relevantFields) {
    const delta = changes[field];
    if (delta === undefined) continue;

    const dir = expectedDirection(action, field);
    if (dir === null) continue;

    const absDelta = Math.abs(delta);
    const significant = isSignificantDelta(field, absDelta);

    if (dir === 0) {
      // Any direction is acceptable — note the change
      deltas.push({ field, expected: 'any', actual: delta });
      if (significant) matched++;
      continue;
    }

    if (dir === 1 && delta > 0 && significant) {
      matched++;
      deltas.push({ field, expected: 'increase', actual: delta });
    } else if (dir === -1 && delta < 0 && significant) {
      matched++;
      deltas.push({ field, expected: 'decrease', actual: delta });
    } else if (dir === 1 && delta < 0 && significant) {
      opposed++;
      deltas.push({ field, expected: 'increase', actual: delta });
    } else if (dir === -1 && delta > 0 && significant) {
      opposed++;
      deltas.push({ field, expected: 'decrease', actual: delta });
    } else {
      noChange++;
      deltas.push({ field, expected: dir === 1 ? 'increase' : 'decrease', actual: delta });
    }
  }

  if (deltas.length === 0) {
    return {
      effectiveness: 'unknown',
      actionSuitability: 'unknown',
      confidence: 0.1,
      reasons: ['No evaluable field deltas.'],
      explanationCodes: ['NO_EVALUABLE_DELTAS'],
    };
  }

  // Also check if before/after values were already in range (for partially-effective)
  // Build reasons from deltas
  for (const d of deltas) {
    reasons.push(`${d.field}: expected ${d.expected}, actual ${formatDelta(d.actual)}`);
  }

  const confidenceResult = calculateOutcomeConfidence({
    action,
    before,
    after,
    elapsedHours,
    preferredMaxHours: window.preferredMaxHours,
    interveningActions,
    explicitlyLinkedMeasurement: action.relatedMeasurementId !== undefined,
  });
  let confidence = confidenceResult.confidence;
  reasons.push(...confidenceResult.reasons);

  if (confidenceResult.externalVariableCount >= 4 || confidence < 0.3) {
    return {
      effectiveness: 'inconclusive',
      actionSuitability: 'unknown',
      confidence,
      reasons: [...reasons, 'Demasiadas variables externas para atribuir el resultado a una sola acción.'],
      explanationCodes: [...explanationCodes, 'TOO_MANY_EXTERNAL_VARIABLES'],
    };
  }

  // If all relevant fields show no significant change
  if (matched === 0 && opposed === 0 && noChange > 0) {
    if (allFieldsAlreadyInRange(action, before, after)) {
      return {
        effectiveness: 'inconclusive',
        actionSuitability: classifyInRangeSuitability(action),
        confidence: Math.max(confidence - 0.1, 0.2),
        reasons: [...reasons, 'Los campos ya estaban en rango; no se puede atribuir mantenimiento de estado a esta acción.'],
        explanationCodes: [...explanationCodes, 'FIELDS_ALREADY_IN_RANGE'],
      };
    }
    const tiny = deltas.every((d) => Math.abs(d.actual) < significanceThreshold(d.field));
    if (tiny) {
      return {
        effectiveness: 'inconclusive',
        actionSuitability: 'unknown',
        confidence: Math.max(confidence - 0.1, 0.2),
        reasons: [...reasons, 'El cambio está dentro del error de medida.'],
        explanationCodes: [...explanationCodes, 'CHANGE_WITHIN_MEASUREMENT_ERROR'],
      };
    }
  }

  let actionSuitability: ActionSuitability = 'appropriate';
  if (allFieldsAlreadyInRange(action, before, after)) {
    actionSuitability = classifyInRangeSuitability(action);
    explanationCodes.push('FIELDS_ALREADY_IN_RANGE');
  }

  // Judge effectiveness
  let effectiveness: OutcomeEffectiveness;
  if (opposed > 0 && matched === 0) {
    effectiveness = 'unexpected';
    confidence = Math.max(confidence - 0.2, 0.1);
  } else if (matched > 0 && opposed === 0 && noChange === 0) {
    effectiveness = 'effective';
  } else if (matched > 0 && opposed === 0 && noChange > 0) {
    effectiveness = actionSuitability === 'appropriate' ? 'partially-effective' : 'effective';
  } else if (matched > 0 && opposed > 0) {
    effectiveness = 'partially-effective';
    confidence = Math.max(confidence - 0.1, 0.1);
  } else if (matched === 0 && opposed > 0) {
    effectiveness = 'unexpected';
  } else {
    effectiveness = 'ineffective';
  }

  confidence = Math.max(0.1, Math.min(confidence, 0.9));

  return {
    effectiveness,
    actionSuitability,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    explanationCodes,
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function isSignificantDelta(field: string, absDelta: number): boolean {
  const threshold = significanceThreshold(field);
  return absDelta >= threshold;
}

function significanceThreshold(field: string): number {
  switch (field) {
    case 'ph': return 0.1;
    case 'fac': return 0.2;
    case 'orp': return 10;
    case 'salt': return 50;
    case 'tds': return 50;
    case 'ec': return 50;
    case 'temperature': return 0.5;
    default: return 0;
  }
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function allFieldsAlreadyInRange(
  action: MaintenanceAction,
  before: Measurement,
  after: Measurement,
): boolean {
  // Quick heuristic: check if the key fields were already in a reasonable range
  // before the action and stayed there after
  if (action.kind === 'chemical' && action.chemical) {
    if (action.chemical.productType === 'ph-reducer' || action.chemical.productType === 'ph-increaser') {
      return before.ph >= 7.0 && before.ph <= 7.8 && after.ph >= 7.0 && after.ph <= 7.8;
    }
    if (action.chemical.productType === 'chlorine-granules') {
      return before.fac >= 0.5 && before.fac <= 3.5 && after.fac >= 0.5 && after.fac <= 3.5;
    }
    if (action.chemical.productType === 'pool-salt') {
      return before.salt >= 2500 && before.salt <= 3500 && after.salt >= 2500 && after.salt <= 3500;
    }
  }
  return false;
}

function classifyInRangeSuitability(action: MaintenanceAction): ActionSuitability {
  if (action.kind === 'chemical') return 'unnecessary';
  if (action.kind === 'chlorinator' || action.kind === 'filtration') return 'maintained';
  return 'preventive';
}

function buildExpectedEffects(action: MaintenanceAction): StructuredExpectedEffect[] {
  return expectedFields(action).map((field) => {
    const dir = expectedDirection(action, field);
    return {
      field,
      direction: dir === 1 ? 'increase' : dir === -1 ? 'decrease' : dir === 0 ? 'any' : 'unknown',
      significanceThreshold: significanceThreshold(field),
    };
  });
}

function buildObservedChanges(changes: FieldChanges): StructuredObservedChange[] {
  return (Object.entries(changes) as Array<[keyof FieldChanges, number]>).map(([field, delta]) => ({
    field,
    delta,
    significant: isSignificantDelta(field, Math.abs(delta)),
  }));
}
