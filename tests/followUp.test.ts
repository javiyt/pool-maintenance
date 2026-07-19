import { describe, it, expect } from 'vitest';
import type { FollowUp, FollowUpStatus } from '../src/domain/followUp';
import {
  createFollowUp,
  updateFollowUpStatuses,
  getEligibleFollowUps,
  markFollowUpEvaluated,
  setFollowUpExclusionFlags,
  addUnusualEventNote,
  getPendingRetests,
  getRecentlyEvaluated,
  getEffectiveActions,
  getIneffectiveOrUnexpectedActions,
  generateFollowUpId,
} from '../src/domain/followUp';
import type { MaintenanceAction } from '../src/domain/actions';
import type { ActionOutcome, OutcomeEffectiveness } from '../src/domain/actionOutcomeEvaluator';

// ── Factory helpers ───────────────────────────────────────────────

function makeAction(overrides: Partial<MaintenanceAction> = {}): MaintenanceAction {
  return {
    id: 'act-test-1',
    performedAt: '2026-07-09T10:00:00.000Z',
    kind: 'chemical',
    description: 'Added pH reducer',
    ...overrides,
  };
}

function makeFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  const now = new Date('2026-07-09T10:00:00.000Z');
  const dueAt = new Date(now.getTime() + 6 * 3_600_000); // +6h
  return {
    id: 'fu-test-1',
    actionId: 'act-test-1',
    recommendationId: 'rec-test-1',
    sourceMeasurementId: 'meas-test-1',
    suggestedRetestDelay: 6,
    status: 'awaiting-retest',
    createdAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
    excludedFromLearning: false,
    atypical: false,
    incorrectlyRecorded: false,
    unusualEventNotes: [],
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<ActionOutcome> = {}): ActionOutcome {
  const beforeMeasurement = {
    id: 'meas-before',
    measuredAt: '2026-07-09T10:00:00.000Z',
    ph: 7.5,
    ec: 6640,
    tds: 3230,
    salt: 3380,
    orp: 672,
    fac: 1.0,
    temperature: 25.0,
  };
  const afterMeasurement = {
    ...beforeMeasurement,
    id: 'meas-after',
    measuredAt: '2026-07-09T18:00:00.000Z',
    ph: 7.4,
    fac: 1.8,
  };
  const base: ActionOutcome = {
    actionId: 'act-test-1',
    beforeMeasurementId: 'meas-before',
    afterMeasurementId: 'meas-after',
    elapsedHours: 8,
    timing: 'preferred',
    changes: { fac: 0.8, ph: -0.1 },
    effectiveness: 'effective',
    actionSuitability: 'appropriate',
    confidence: 0.8,
    confidenceReasons: ['Expected increase in FAC'],
    explanationCodes: [],
    observations: [
      {
        afterMeasurementId: 'meas-after',
        elapsedHours: 8,
        timing: 'preferred',
        changes: { fac: 0.8, ph: -0.1 },
      },
    ],
    assessmentSnapshot: {
      schemaVersion: 1,
      actionId: 'act-test-1',
      previousMeasurement: beforeMeasurement,
      observedMeasurements: [afterMeasurement],
      selectedEvaluationMeasurement: afterMeasurement,
      expectedEffects: [
        { field: 'fac', direction: 'increase', significanceThreshold: 0.2 },
      ],
      observedChanges: [
        { field: 'fac', delta: 0.8, significant: true },
        { field: 'ph', delta: -0.1, significant: true },
      ],
      intermediateContext: [],
      intermediateActions: [],
      result: {
        effectiveness: 'effective',
        actionSuitability: 'appropriate',
      },
      confidenceBreakdown: {
        score: 0.8,
        reasons: ['Expected increase in FAC'],
      },
      explanationCodes: [],
      evaluatorVersion: '2.0.0',
    },
    evaluatedAt: '2026-07-09T18:00:00.000Z',
    evaluatorVersion: '2.0.0',
  };

  return { ...base, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('generateFollowUpId', () => {
  it('generates a unique id with fu- prefix', () => {
    const id = generateFollowUpId();
    expect(id).toMatch(/^fu-/);
  });

  it('generates different ids on successive calls', () => {
    const a = generateFollowUpId();
    const b = generateFollowUpId();
    expect(a).not.toBe(b);
  });
});

describe('createFollowUp', () => {
  it('creates a follow-up with awaiting-retest status', () => {
    const action = makeAction();
    const fu = createFollowUp(action, 'rec-1', 'meas-1', 6);
    expect(fu).not.toBeNull();
    expect(fu!.actionId).toBe('act-test-1');
    expect(fu!.recommendationId).toBe('rec-1');
    expect(fu!.sourceMeasurementId).toBe('meas-1');
    expect(fu!.suggestedRetestDelay).toBe(6);
    expect(fu!.status).toBe('awaiting-retest');
    expect(fu!.excludedFromLearning).toBe(false);
    expect(fu!.unusualEventNotes).toEqual([]);
  });

  it('uses default retest delay based on action kind', () => {
    const action = makeAction({ kind: 'chlorinator' });
    const fu = createFollowUp(action);
    expect(fu).not.toBeNull();
    expect(fu!.suggestedRetestDelay).toBe(24);
  });

  it('returns null for non-evaluable action kinds (manual-test)', () => {
    const action = makeAction({ kind: 'manual-test' });
    const fu = createFollowUp(action);
    expect(fu).toBeNull();
  });

  it('returns null for other action kinds', () => {
    const action = makeAction({ kind: 'other' });
    const fu = createFollowUp(action);
    expect(fu).toBeNull();
  });

  it('uses retest delay from recommendation when provided', () => {
    const action = makeAction();
    const fu = createFollowUp(action, 'rec-1', 'meas-1', 12);
    expect(fu).not.toBeNull();
    expect(fu!.suggestedRetestDelay).toBe(12);
  });

  it('calculates dueAt based on retest delay', () => {
    const action = makeAction({ performedAt: '2026-07-09T10:00:00.000Z' });
    const fu = createFollowUp(action, undefined, undefined, 6);
    expect(fu).not.toBeNull();
    // createdAt should be close to now, dueAt should be after createdAt
    const dueTime = new Date(fu!.dueAt!).getTime();
    expect(dueTime).toBeGreaterThan(new Date(fu!.createdAt).getTime());
  });

  it('sets recommendationId and sourceMeasurementId as undefined when not provided', () => {
    const action = makeAction();
    const fu = createFollowUp(action);
    expect(fu).not.toBeNull();
    expect(fu!.recommendationId).toBeUndefined();
    expect(fu!.sourceMeasurementId).toBeUndefined();
  });
});

describe('updateFollowUpStatuses', () => {
  it('leaves awaiting-retest as-is when not yet due', () => {
    const fu = makeFollowUp({ status: 'awaiting-retest', dueAt: '2026-07-09T16:00:00.000Z' });
    const now = new Date('2026-07-09T12:00:00.000Z');
    const result = updateFollowUpStatuses([fu], now);
    expect(result[0].status).toBe('awaiting-retest');
  });

  it('moves awaiting-retest to retest-due when due time has passed', () => {
    const fu = makeFollowUp({
      status: 'awaiting-retest',
      createdAt: '2026-07-09T10:00:00.000Z',
      dueAt: '2026-07-09T16:00:00.000Z',
      suggestedRetestDelay: 6,
    });
    const now = new Date('2026-07-09T17:00:00.000Z');
    const result = updateFollowUpStatuses([fu], now);
    expect(result[0].status).toBe('retest-due');
  });

  it('moves awaiting-retest to expired when 3x delay has passed', () => {
    const fu = makeFollowUp({
      status: 'awaiting-retest',
      createdAt: '2026-07-09T10:00:00.000Z',
      suggestedRetestDelay: 6,
    });
    // 3x delay = 18 hours
    const now = new Date('2026-07-10T05:00:00.000Z'); // 19h later
    const result = updateFollowUpStatuses([fu], now);
    expect(result[0].status).toBe('expired');
  });

  it('does not change completed or expired statuses', () => {
    const completedFu = makeFollowUp({ status: 'completed', createdAt: '2026-07-09T10:00:00.000Z', suggestedRetestDelay: 6 });
    const expiredFu = makeFollowUp({ id: 'fu-2', status: 'expired', createdAt: '2026-07-09T10:00:00.000Z', suggestedRetestDelay: 6 });
    const now = new Date('2026-07-10T05:00:00.000Z');
    const result = updateFollowUpStatuses([completedFu, expiredFu], now);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('expired');
  });
});

describe('getEligibleFollowUps', () => {
  it('returns follow-ups with awaiting-retest, retest-due, or expired status', () => {
    const fu1 = makeFollowUp({ status: 'awaiting-retest' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'retest-due' });
    const fu3 = makeFollowUp({ id: 'fu-3', status: 'completed' });
    const fu4 = makeFollowUp({ id: 'fu-4', status: 'expired' });
    const eligible = getEligibleFollowUps([fu1, fu2, fu3, fu4]);
    expect(eligible).toHaveLength(3);
    expect(eligible.map((f) => f.id)).toEqual(['fu-test-1', 'fu-2', 'fu-4']);
  });

  it('excludes follow-ups with excludedFromLearning flag', () => {
    const fu1 = makeFollowUp({ status: 'retest-due' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'retest-due', excludedFromLearning: true });
    const eligible = getEligibleFollowUps([fu1, fu2]);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('fu-test-1');
  });

  it('returns empty array when no eligible follow-ups', () => {
    const result = getEligibleFollowUps([]);
    expect(result).toEqual([]);
  });
});

describe('markFollowUpEvaluated', () => {
  it('marks a follow-up as completed with outcome data', () => {
    const fu = makeFollowUp({ status: 'retest-due' });
    const outcome = makeOutcome();
    const result = markFollowUpEvaluated([fu], 'act-test-1', outcome);
    expect(result[0].status).toBe('completed');
    expect(result[0].evaluationMeasurementId).toBe('meas-after');
    expect(result[0].effectiveness).toBe('effective');
    expect(result[0].outcome).toEqual(outcome);
    expect(result[0].evaluatedAt).toBeDefined();
  });

  it('does not modify follow-ups with different actionId', () => {
    const fu = makeFollowUp({ status: 'retest-due' });
    const outcome = makeOutcome();
    const result = markFollowUpEvaluated([fu], 'different-action', outcome);
    expect(result[0].status).toBe('retest-due');
    expect(result[0].outcome).toBeUndefined();
  });

  it('does not modify already completed follow-ups', () => {
    const fu = makeFollowUp({ status: 'completed', evaluatedAt: '2026-07-09T18:00:00.000Z' });
    const outcome = makeOutcome();
    const result = markFollowUpEvaluated([fu], 'act-test-1', outcome);
    expect(result[0].status).toBe('completed');
    // Should not be overwritten
  });

  it('marks expired follow-ups as completed-late when a valid outcome appears', () => {
    const fu = makeFollowUp({ status: 'expired' });
    const outcome = makeOutcome();
    const result = markFollowUpEvaluated([fu], 'act-test-1', outcome);
    expect(result[0].status).toBe('completed-late');
  });
});

describe('setFollowUpExclusionFlags', () => {
  it('sets atypical flag', () => {
    const fu = makeFollowUp();
    const result = setFollowUpExclusionFlags(fu, { atypical: true });
    expect(result.atypical).toBe(true);
    expect(result.incorrectlyRecorded).toBe(false);
    expect(result.excludedFromLearning).toBe(false);
  });

  it('sets incorrectlyRecorded flag', () => {
    const fu = makeFollowUp();
    const result = setFollowUpExclusionFlags(fu, { incorrectlyRecorded: true });
    expect(result.incorrectlyRecorded).toBe(true);
  });

  it('sets excludedFromLearning flag', () => {
    const fu = makeFollowUp();
    const result = setFollowUpExclusionFlags(fu, { excludedFromLearning: true });
    expect(result.excludedFromLearning).toBe(true);
  });

  it('preserves existing flags when not overridden', () => {
    const fu = makeFollowUp({ atypical: true, excludedFromLearning: true });
    const result = setFollowUpExclusionFlags(fu, { incorrectlyRecorded: true });
    expect(result.atypical).toBe(true);
    expect(result.excludedFromLearning).toBe(true);
    expect(result.incorrectlyRecorded).toBe(true);
  });
});

describe('addUnusualEventNote', () => {
  it('adds a note to unusualEventNotes array', () => {
    const fu = makeFollowUp();
    const result = addUnusualEventNote(fu, 'rain', 'Heavy storm');
    expect(result.unusualEventNotes).toHaveLength(1);
    expect(result.unusualEventNotes[0].eventType).toBe('rain');
    expect(result.unusualEventNotes[0].note).toBe('Heavy storm');
    expect(result.unusualEventNotes[0].addedAt).toBeDefined();
  });

  it('appends to existing notes', () => {
    const existingNote = { eventType: 'rain' as const, note: 'Light rain', addedAt: '2026-07-09T10:00:00.000Z' };
    const fu = makeFollowUp({ unusualEventNotes: [existingNote] });
    const result = addUnusualEventNote(fu, 'many-bathers', 'Pool party');
    expect(result.unusualEventNotes).toHaveLength(2);
    expect(result.unusualEventNotes[0].eventType).toBe('rain');
    expect(result.unusualEventNotes[1].eventType).toBe('many-bathers');
  });

  it('works without an optional note string', () => {
    const fu = makeFollowUp();
    const result = addUnusualEventNote(fu, 'cleaning');
    expect(result.unusualEventNotes).toHaveLength(1);
    expect(result.unusualEventNotes[0].eventType).toBe('cleaning');
    expect(result.unusualEventNotes[0].note).toBeUndefined();
  });
});

describe('getPendingRetests', () => {
  it('returns follow-ups with awaiting-retest or retest-due status sorted by dueAt', () => {
    const fu1 = makeFollowUp({ id: 'fu-1', status: 'awaiting-retest', dueAt: '2026-07-10T10:00:00.000Z' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'retest-due', dueAt: '2026-07-09T10:00:00.000Z' }); // earlier
    const fu3 = makeFollowUp({ id: 'fu-3', status: 'completed' });
    const result = getPendingRetests([fu1, fu2, fu3]);
    expect(result).toHaveLength(2);
    // Should be sorted by dueAt ascending
    expect(result[0].id).toBe('fu-2');
    expect(result[1].id).toBe('fu-1');
  });

  it('returns empty array when none pending', () => {
    const fu = makeFollowUp({ status: 'completed' });
    expect(getPendingRetests([fu])).toEqual([]);
  });
});

describe('getRecentlyEvaluated', () => {
  it('returns completed follow-ups sorted by evaluatedAt descending', () => {
    const fu1 = makeFollowUp({ id: 'fu-1', status: 'completed', evaluatedAt: '2026-07-10T10:00:00.000Z' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'completed', evaluatedAt: '2026-07-11T10:00:00.000Z' }); // later
    const result = getRecentlyEvaluated([fu1, fu2]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('fu-2'); // most recent first
  });

  it('limits results to specified count', () => {
    const fu1 = makeFollowUp({ id: 'fu-1', status: 'completed', evaluatedAt: '2026-07-10T10:00:00.000Z' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'completed', evaluatedAt: '2026-07-11T10:00:00.000Z' });
    const result = getRecentlyEvaluated([fu1, fu2], 1);
    expect(result).toHaveLength(1);
  });

  it('skips non-completed follow-ups', () => {
    const fu = makeFollowUp({ status: 'awaiting-retest' });
    expect(getRecentlyEvaluated([fu])).toEqual([]);
  });
});

describe('getEffectiveActions', () => {
  it('returns completed follow-ups with effective outcome', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'effective' });
    const result = getEffectiveActions([fu]);
    expect(result).toHaveLength(1);
  });

  it('excludes follow-ups with excludedFromLearning flag', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'effective', excludedFromLearning: true });
    const result = getEffectiveActions([fu]);
    expect(result).toHaveLength(0);
  });

  it('excludes non-effective outcomes', () => {
    const fu1 = makeFollowUp({ id: 'fu-1', status: 'completed', effectiveness: 'ineffective' });
    const fu2 = makeFollowUp({ id: 'fu-2', status: 'completed', effectiveness: 'unexpected' });
    const fu3 = makeFollowUp({ id: 'fu-3', status: 'completed', effectiveness: 'partially-effective' });
    expect(getEffectiveActions([fu1, fu2, fu3])).toHaveLength(0);
  });
});

describe('getIneffectiveOrUnexpectedActions', () => {
  it('returns completed ineffective actions', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'ineffective' });
    const result = getIneffectiveOrUnexpectedActions([fu]);
    expect(result).toHaveLength(1);
  });

  it('returns completed unexpected actions', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'unexpected' });
    const result = getIneffectiveOrUnexpectedActions([fu]);
    expect(result).toHaveLength(1);
  });

  it('excludes excludedFromLearning actions', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'ineffective', excludedFromLearning: true });
    expect(getIneffectiveOrUnexpectedActions([fu])).toHaveLength(0);
  });

  it('excludes effective actions', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'effective' });
    expect(getIneffectiveOrUnexpectedActions([fu])).toHaveLength(0);
  });
});

describe('integration: full follow-up lifecycle', () => {
  it('creates, tracks status changes, evaluates, and produces dashboard results', () => {
    // 1. Create follow-up with explicit created/due times
    const fu = makeFollowUp({
      id: 'fu-lifecycle-1',
      actionId: 'act-lifecycle-1',
      recommendationId: 'rec-lifecycle-1',
      sourceMeasurementId: 'meas-before',
      suggestedRetestDelay: 6,
      status: 'awaiting-retest',
      createdAt: '2026-07-09T10:00:00.000Z',
      dueAt: '2026-07-09T16:00:00.000Z',
    });
    expect(fu.status).toBe('awaiting-retest');

    // 2. After 7 hours, status should be retest-due
    const later = new Date('2026-07-09T17:00:00.000Z');
    const [updatedFu] = updateFollowUpStatuses([fu], later);
    expect(updatedFu.status).toBe('retest-due');

    // 3. Mark as evaluated with an outcome
    const outcome = makeOutcome({
      actionId: 'act-lifecycle-1',
      effectiveness: 'effective',
      changes: { ph: -0.3 },
    });
    const [evaluatedFu] = markFollowUpEvaluated([updatedFu], 'act-lifecycle-1', outcome);
    expect(evaluatedFu.status).toBe('completed');
    expect(evaluatedFu.effectiveness).toBe('effective');

    // 4. Dashboard queries
    expect(getPendingRetests([evaluatedFu])).toHaveLength(0);
    expect(getEffectiveActions([evaluatedFu])).toHaveLength(1);
    expect(getRecentlyEvaluated([evaluatedFu])).toHaveLength(1);
    expect(getIneffectiveOrUnexpectedActions([evaluatedFu])).toHaveLength(0);
  });

  it('excluded action is not used for learning', () => {
    const action = makeAction({ id: 'act-excluded-1' });
    const fu = createFollowUp(action)!;

    // Exclude from learning
    const excluded = setFollowUpExclusionFlags(fu, { excludedFromLearning: true });
    expect(excluded.excludedFromLearning).toBe(true);

    // Should not be eligible for evaluation
    const eligible = getEligibleFollowUps([excluded]);
    expect(eligible).toHaveLength(0);

    // Should not appear in effective/ineffective dashboards
    const completed = { ...excluded, status: 'completed' as FollowUpStatus, effectiveness: 'effective' as OutcomeEffectiveness };
    expect(getEffectiveActions([completed])).toHaveLength(0);
    // But should still be visible in recently evaluated if it somehow got evaluated
    // (it wouldn't be evaluated since it's excluded, but we test the visibility logic)
  });

  it('atypical action remains visible in history', () => {
    const fu = makeFollowUp({ status: 'completed', effectiveness: 'effective' });
    const flagged = setFollowUpExclusionFlags(fu, { atypical: true });
    expect(flagged.atypical).toBe(true);

    // Atypical but not excluded from learning → still counted in effective
    const completed = { ...flagged, status: 'completed' as FollowUpStatus, effectiveness: 'effective' as OutcomeEffectiveness };
    expect(getEffectiveActions([completed])).toHaveLength(1);
  });
});
