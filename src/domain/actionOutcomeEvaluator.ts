import type { Measurement } from './measurement';
import type { MaintenanceAction } from './actions';

// ── Types ─────────────────────────────────────────────────────────

export type OutcomeEffectiveness =
  | 'effective'
  | 'partially-effective'
  | 'ineffective'
  | 'unexpected'
  | 'unknown';

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
  changes: FieldChanges;
  effectiveness: OutcomeEffectiveness;
  confidence: number;
  confidenceReasons: string[];
  evaluatedAt: string;
}

// ── Evaluation windows (hours after action) ───────────────────────

interface Window {
  minHours: number;
  maxHours: number;
}

const EVALUATION_WINDOWS: Record<string, Window> = {
  chemical: { minHours: 4, maxHours: 48 },
  chlorinator: { minHours: 6, maxHours: 72 },
  filtration: { minHours: 12, maxHours: 72 },
  'water-replacement': { minHours: 6, maxHours: 72 },
  cleaning: { minHours: 2, maxHours: 48 },
  'manual-test': { minHours: 0, maxHours: 0 },
  other: { minHours: 0, maxHours: 0 },
};

function getWindow(kind: string): Window | null {
  const w = EVALUATION_WINDOWS[kind];
  if (!w || (w.minHours === 0 && w.maxHours === 0)) return null;
  return w;
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
    const window = getWindow(action.kind);
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

  const after = findAfterMeasurement(action, sortedMeas, window);
  if (!after) return null;

  const elapsedHours = hoursBetween(action.performedAt, after.measuredAt);

  // Compute field deltas
  const changes = computeChanges(before, after);

  // Detect intervening actions
  const intervening = countInterveningActions(action, sortedActions, before.measuredAt, after.measuredAt);

  // Evaluate effectiveness
  const { effectiveness, confidence, reasons } = evaluateEffectiveness(
    action,
    changes,
    elapsedHours,
    intervening,
    before,
    after,
  );

  return {
    actionId: action.id,
    beforeMeasurementId: before.id,
    afterMeasurementId: after.id,
    elapsedHours: Math.round(elapsedHours * 10) / 10,
    changes,
    effectiveness,
    confidence: Math.round(confidence * 100) / 100,
    confidenceReasons: reasons,
    evaluatedAt: now,
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

function findAfterMeasurement(
  action: MaintenanceAction,
  sortedMeas: Measurement[],
  window: Window,
): Measurement | null {
  // Prefer explicitly linked measurement if it's after the action
  if (action.relatedMeasurementId) {
    const linked = sortedMeas.find((m) => m.id === action.relatedMeasurementId);
    if (linked && linked.measuredAt > action.performedAt) {
      const h = hoursBetween(action.performedAt, linked.measuredAt);
      if (h >= window.minHours && h <= window.maxHours) return linked;
    }
  }

  // Fall back to closest measurement after the action within window
  const actionTime = new Date(action.performedAt).getTime();
  const minMs = window.minHours * 3_600_000;
  const maxMs = window.maxHours * 3_600_000;
  let best: Measurement | null = null;
  let bestDelta = Infinity;

  for (const m of sortedMeas) {
    const mTime = new Date(m.measuredAt).getTime();
    const delta = mTime - actionTime;
    if (delta >= minMs && delta <= maxMs && delta < bestDelta) {
      best = m;
      bestDelta = delta;
    }
  }

  return best;
}

// ── Delta computation ─────────────────────────────────────────────

function computeChanges(before: Measurement, after: Measurement): FieldChanges {
  const changes: FieldChanges = {};
  const fields: Array<keyof FieldChanges> = ['ph', 'ec', 'tds', 'salt', 'orp', 'fac', 'temperature'];
  for (const f of fields) {
    const diff = (after as any)[f] - (before as any)[f];
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
  _elapsedHours: number,
  interveningActions: number,
  before: Measurement,
  after: Measurement,
): { effectiveness: OutcomeEffectiveness; confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  const relevantFields = expectedFields(action);

  // No measurable fields → unknown
  if (relevantFields.length === 0) {
    return { effectiveness: 'unknown', confidence: 0.1, reasons: ['No measurable field for this action type.'] };
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
    return { effectiveness: 'unknown', confidence: 0.1, reasons: ['No evaluable field deltas.'] };
  }

  // Also check if before/after values were already in range (for partially-effective)
  // Build reasons from deltas
  for (const d of deltas) {
    reasons.push(`${d.field}: expected ${d.expected}, actual ${formatDelta(d.actual)}`);
  }

  // Compute confidence
  let confidence = 0.8;

  if (!action.relatedMeasurementId) {
    confidence -= 0.2;
    reasons.push('No explicitly linked measurement — using nearest.');
  }

  if (interveningActions > 0) {
    const reduction = Math.min(interveningActions * 0.3, 0.6);
    confidence -= reduction;
    reasons.push(`${interveningActions} other action(s) between before and after (confidence -${Math.round(reduction * 100)}%).`);
  }

  // If all relevant fields show no significant change
  if (matched === 0 && opposed === 0 && noChange > 0) {
    if (allFieldsAlreadyInRange(action, before, after)) {
      return {
        effectiveness: 'partially-effective',
        confidence: Math.max(confidence, 0.3),
        reasons: [...reasons, 'Fields already in range before action — maintained status.'],
      };
    }
    const tiny = deltas.every((d) => Math.abs(d.actual) < significanceThreshold(d.field));
    if (tiny) {
      return {
        effectiveness: 'partially-effective',
        confidence: Math.max(confidence - 0.1, 0.2),
        reasons: [...reasons, 'Changes too small to be meaningful.'],
      };
    }
  }

  // Judge effectiveness
  let effectiveness: OutcomeEffectiveness;
  if (opposed > 0 && matched === 0) {
    effectiveness = 'unexpected';
    confidence = Math.max(confidence - 0.2, 0.1);
  } else if (matched > 0 && opposed === 0 && noChange === 0) {
    effectiveness = 'effective';
  } else if (matched > 0 && opposed === 0 && noChange > 0) {
    effectiveness = 'partially-effective';
  } else if (matched > 0 && opposed > 0) {
    effectiveness = 'partially-effective';
    confidence = Math.max(confidence - 0.1, 0.1);
  } else if (matched === 0 && opposed > 0) {
    effectiveness = 'unexpected';
  } else {
    effectiveness = 'ineffective';
  }

  confidence = Math.max(0.1, Math.min(confidence, 0.9));

  return { effectiveness, confidence: Math.round(confidence * 100) / 100, reasons };
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
