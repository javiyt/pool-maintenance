import type { MaintenanceAction } from './actions';
import type { ActionOutcome } from './actionOutcomeEvaluator';

// ── Types ─────────────────────────────────────────────────────────

export type FollowUpStatus = 'awaiting-retest' | 'retest-due' | 'completed' | 'completed-late' | 'expired';

export type UnusualEventType =
  | 'rain'
  | 'many-bathers'
  | 'refill'
  | 'cleaning'
  | 'cover-removed'
  | 'equipment-issue';

export const UNUSUAL_EVENT_LABELS: Record<UnusualEventType, string> = {
  rain: 'Rain',
  'many-bathers': 'Many bathers',
  refill: 'Refill',
  cleaning: 'Cleaning',
  'cover-removed': 'Cover removed',
  'equipment-issue': 'Equipment issue',
};

export interface ActionNote {
  eventType: UnusualEventType;
  note?: string;
  addedAt: string;
}

export interface ActionExclusionFlags {
  atypical?: boolean;
  incorrectlyRecorded?: boolean;
  excludedFromLearning?: boolean;
}

export interface FollowUp {
  id: string;
  actionId: string;
  recommendationId?: string;
  sourceMeasurementId?: string;
  suggestedRetestDelay: number; // hours
  status: FollowUpStatus;
  createdAt: string; // ISO 8601
  dueAt?: string; // ISO 8601
  evaluationMeasurementId?: string;
  evaluatedAt?: string; // ISO 8601
  effectiveness?: ActionOutcome['effectiveness'];
  outcome?: ActionOutcome;
  excludedFromLearning: boolean;
  atypical: boolean;
  incorrectlyRecorded: boolean;
  unusualEventNotes: ActionNote[];
}

// ── Default retest delays by action kind ──────────────────────────

export const DEFAULT_RETEST_DELAYS: Record<string, number> = {
  chemical: 6,
  chlorinator: 24,
  filtration: 24,
  'water-replacement': 12,
  cleaning: 24,
  'manual-test': 0,
  other: 0,
};

// ── ID generation ─────────────────────────────────────────────────

let _followUpCounter = 0;

export function generateFollowUpId(): string {
  _followUpCounter += 1;
  return `fu-${Date.now()}-${_followUpCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Factory ───────────────────────────────────────────────────────

/**
 * Create a new FollowUp from a performed action.
 * If `retestDelay` is provided it is used; otherwise the default delay
 * for the action kind is used. A delay of 0 means no follow-up is needed.
 */
export function createFollowUp(
  action: MaintenanceAction,
  recommendationId?: string,
  sourceMeasurementId?: string,
  retestDelay?: number,
): FollowUp | null {
  const delay = retestDelay ?? DEFAULT_RETEST_DELAYS[action.kind] ?? 0;
  if (delay <= 0) return null; // non-evaluable action kind

  const now = new Date().toISOString();
  const dueAt = new Date(Date.now() + delay * 3_600_000).toISOString();

  return {
    id: generateFollowUpId(),
    actionId: action.id,
    recommendationId,
    sourceMeasurementId,
    suggestedRetestDelay: delay,
    status: 'awaiting-retest',
    createdAt: now,
    dueAt,
    excludedFromLearning: false,
    atypical: false,
    incorrectlyRecorded: false,
    unusualEventNotes: [],
  };
}

// ── State machine ─────────────────────────────────────────────────

/**
 * Update follow-up statuses based on current time.
 * Moves 'awaiting-retest' → 'retest-due' when the due time has passed.
 * Moves 'awaiting-retest' or 'retest-due' → 'expired' if too old
 * (more than 3× the retest delay has passed without evaluation).
 */
export function updateFollowUpStatuses(followUps: FollowUp[], now: Date = new Date()): FollowUp[] {
  return followUps.map((fu) => {
    if (fu.status === 'completed' || fu.status === 'completed-late' || fu.status === 'expired') return fu;

    const elapsed = (now.getTime() - new Date(fu.createdAt).getTime()) / 3_600_000;

    // Expire if more than 3x the suggested delay has passed
    if (elapsed > fu.suggestedRetestDelay * 3) {
      return { ...fu, status: 'expired' as const };
    }

    // Mark as due if the due time has passed
    if (fu.status === 'awaiting-retest' && fu.dueAt && new Date(fu.dueAt) <= now) {
      return { ...fu, status: 'retest-due' as const };
    }

    return fu;
  });
}

// ── Evaluation helpers ────────────────────────────────────────────

/**
 * Find all follow-ups that are eligible for evaluation when a new
 * measurement arrives. They must be in 'awaiting-retest' or 'retest-due'
 * status and have a non-zero delay.
 */
export function getEligibleFollowUps(followUps: FollowUp[]): FollowUp[] {
  return followUps.filter(
    (fu) =>
      (fu.status === 'awaiting-retest' || fu.status === 'retest-due' || fu.status === 'expired') &&
      fu.suggestedRetestDelay > 0 &&
      !fu.excludedFromLearning,
  );
}

/**
 * Mark a set of follow-ups as evaluated with the given outcome.
 */
export function markFollowUpEvaluated(
  followUps: FollowUp[],
  actionId: string,
  outcome: ActionOutcome,
): FollowUp[] {
  return followUps.map((fu) => {
    if (fu.actionId !== actionId || fu.status === 'completed' || fu.status === 'completed-late') {
      return fu;
    }
    const completedLate = fu.status === 'expired' || outcome.timing === 'late';
    return {
      ...fu,
      status: completedLate ? 'completed-late' as const : 'completed' as const,
      evaluationMeasurementId: outcome.afterMeasurementId,
      evaluatedAt: outcome.evaluatedAt,
      effectiveness: outcome.effectiveness,
      outcome,
    };
  });
}

// ── Exclusion flags ───────────────────────────────────────────────

export function setFollowUpExclusionFlags(
  followUp: FollowUp,
  flags: ActionExclusionFlags,
): FollowUp {
  return {
    ...followUp,
    atypical: flags.atypical ?? followUp.atypical,
    incorrectlyRecorded: flags.incorrectlyRecorded ?? followUp.incorrectlyRecorded,
    excludedFromLearning: flags.excludedFromLearning ?? followUp.excludedFromLearning,
  };
}

// ── Unusual event notes ───────────────────────────────────────────

export function addUnusualEventNote(
  followUp: FollowUp,
  eventType: UnusualEventType,
  note?: string,
): FollowUp {
  return {
    ...followUp,
    unusualEventNotes: [
      ...followUp.unusualEventNotes,
      { eventType, note, addedAt: new Date().toISOString() },
    ],
  };
}

// ── Dashboard queries ─────────────────────────────────────────────

export function getPendingRetests(followUps: FollowUp[]): FollowUp[] {
  return followUps
    .filter((fu) => fu.status === 'awaiting-retest' || fu.status === 'retest-due')
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}

export function getRecentlyEvaluated(
  followUps: FollowUp[],
  count: number = 10,
): FollowUp[] {
  return followUps
    .filter((fu) => (fu.status === 'completed' || fu.status === 'completed-late') && fu.evaluatedAt)
    .sort((a, b) => (b.evaluatedAt ?? '').localeCompare(a.evaluatedAt ?? ''))
    .slice(0, count);
}

export function getEffectiveActions(followUps: FollowUp[]): FollowUp[] {
  return followUps.filter(
    (fu) => (fu.status === 'completed' || fu.status === 'completed-late') && fu.effectiveness === 'effective' && !fu.excludedFromLearning,
  );
}

export function getIneffectiveOrUnexpectedActions(followUps: FollowUp[]): FollowUp[] {
  return followUps.filter(
    (fu) =>
      (fu.status === 'completed' || fu.status === 'completed-late') &&
      (fu.effectiveness === 'ineffective' || fu.effectiveness === 'unexpected') &&
      !fu.excludedFromLearning,
  );
}
