/**
 * Deterministic integration tests for the complete historical
 * maintenance assistant lifecycle.
 *
 * Exercises the full loop:
 *   pool configuration → measurement → recommendation → action
 *   → follow-up → outcome → learning → personalized recommendation
 *
 * All timestamps are fixed. No real clock, no random IDs.
 * localStorage is mocked at the boundary.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Measurement } from '../src/domain/measurement';
import type { MaintenanceAction } from '../src/domain/actions';
import type { FollowUp } from '../src/domain/followUp';
import type { PoolSettings } from '../src/domain/settings';
import { DEFAULT_HISTORICAL_LEARNING } from '../src/domain/settings';
import { runPersonalizedAssistant } from '../src/domain/maintenanceAssistant';
import { evaluateActionOutcomes } from '../src/domain/actionOutcomeEvaluator';
import { computeLearning, deriveInsights } from '../src/domain/historicalLearning';
import { createFollowUp, updateFollowUpStatuses, markFollowUpEvaluated, getEligibleFollowUps } from '../src/domain/followUp';
import {
  exportData, parseImportData, normalizeActionExclusionFlags,
  mergeMeasurements, mergeActions, mergeFollowUps,
  EXPORT_SCHEMA_VERSION,
} from '../src/domain/storage';

// ── Fixed timeline ───────────────────────────────────────────────

const BASE = '2026-07-01T12:00:00.000Z';

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}
function addHours(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + n);
  return d.toISOString();
}

// ── Pool config that forces chlorinator hours (output capped at 100%) ──

function lifecycleSettings(overrides?: Partial<PoolSettings>): PoolSettings {
  return {
    volume: 200000,
    volumeUnit: 'liters',
    poolType: 'saltwater',
    unitSystem: 'metric',
    saltChlorinator: {
      enabled: true,
      productionGramsPerHour: 20,
      currentOutputPercent: 100,
      filtrationHoursPerDay: 6,
      maxRecommendedOutputPercent: 100,
      maxRecommendedHoursPerDay: 12,
    },
    historicalLearning: { ...DEFAULT_HISTORICAL_LEARNING },
    ...overrides,
  };
}

function makeMeas(
  id: string, at: string,
  overrides?: Partial<Measurement>,
): Measurement {
  return {
    id, measuredAt: at,
    ph: 7.4, ec: 3000, tds: 1500, salt: 3200, orp: 650,
    fac: 0.5, temperature: 25,
    ...overrides,
  };
}

function makeChlAction(
  id: string, at: string, measId: string,
  overrides?: Partial<MaintenanceAction>,
): MaintenanceAction {
  return {
    id, performedAt: at, kind: 'chlorinator', description: 'Adjust chlorinator',
    relatedMeasurementId: measId,
    chlorinator: { previousOutputPercent: 60, newOutputPercent: 80, additionalHours: 2 },
    ...overrides,
  };
}

// ── localStorage mock ─────────────────────────────────────────────

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Build N chlorinator cycles returning measurements, actions, follow-ups. */
function buildCycles(
  n: number,
): { measurements: Measurement[]; actions: MaintenanceAction[]; followUps: FollowUp[] } {
  const measurements: Measurement[] = [];
  const actions: MaintenanceAction[] = [];
  const followUps: FollowUp[] = [];

  for (let i = 0; i < n; i++) {
    const beforeAt = addDays(BASE, i);
    const actionAt = addHours(beforeAt, 1);
    const afterAt = addDays(beforeAt, 1);
    const bId = `m-b-${i}`;
    const aId = `m-a-${i}`;
    const actId = `act-${i}`;

    measurements.push(makeMeas(bId, beforeAt));
    // After meas: FAC 0.8 = 0.5 + 0.3 (consistent under-performance)
    measurements.push(makeMeas(aId, afterAt, {
      id: aId, measuredAt: afterAt, fac: 0.8,
    }));
    actions.push(makeChlAction(actId, actionAt, bId));
    const fu = createFollowUp(actions[actions.length - 1]);
    if (fu) followUps.push(fu);
  }
  return { measurements, actions, followUps };
}

// ═══════════════════════════════════════════════════════════════════
//  Scenario 1 — Full saltwater chlorinator learning lifecycle
// ═══════════════════════════════════════════════════════════════════

describe('Scenario 1 — saltwater chlorinator learning lifecycle', () => {
  it('step 1–3: initial measurement recommends chlorinator adjustment', () => {
    const result = runPersonalizedAssistant(
      [makeMeas('m-init', BASE)],
      [],
      lifecycleSettings(),
    );
    const eqRec = result.recommendations.find((r) => r.kind === 'equipment');
    expect(eqRec).toBeDefined();
    expect(eqRec!.equipmentName).toBe('Clorador salino');
    expect(eqRec!.personalization).toBeUndefined();
  });

  it('step 4–15: builds 5 under-performing cycles and verifies learning + personalization', () => {
    const cfg = lifecycleSettings();
    const { measurements, actions, followUps } = buildCycles(5);
    expect(actions).toHaveLength(5);
    expect(measurements).toHaveLength(10);

    // ── Evaluate outcomes ────────────────────────────────────────
    const outcomes = evaluateActionOutcomes(measurements, actions);
    expect(outcomes).toHaveLength(5);
    for (const o of outcomes) {
      expect(o.effectiveness).toBe('effective');
      expect(o.changes.fac).toBe(0.3);
    }

    // ── Follow-up lifecycle ──────────────────────────────────────
    const reviewTime = new Date(addHours(BASE, 30));
    const updated = updateFollowUpStatuses(followUps, reviewTime);
    const eligible = getEligibleFollowUps(updated);
    expect(eligible).toHaveLength(5);

    let evaluated = [...followUps];
    for (const o of outcomes) {
      evaluated = markFollowUpEvaluated(evaluated, o.actionId, o);
    }
    expect(evaluated.filter((f) => f.status === 'completed')).toHaveLength(5);

    // ── Compute learning ─────────────────────────────────────────
    const adjustments = computeLearning(measurements, actions, cfg);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();
    expect(chlAdj!.sampleSize).toBe(5);
    expect(['medium', 'high']).toContain(chlAdj!.confidence);
    expect(chlAdj!.observedMedianEffect).toBe(0.3);

    // Theoretical: ppm = 20*0.7*2/(200000/1000) = 28/200 = 0.14
    expect(chlAdj!.theoreticalEffect).toBeCloseTo(0.14, 2);

    // Correction factor = 0.3/0.14 ≈ 2.14 → clamped to [0.5, 1.5]
    expect(chlAdj!.correctionFactor).toBeDefined();
    expect(chlAdj!.correctionFactor!).toBeGreaterThanOrEqual(0.5);
    expect(chlAdj!.correctionFactor!).toBeLessThanOrEqual(1.5);

    // ── Derive insights ──────────────────────────────────────────
    const insights = deriveInsights(adjustments);
    expect(insights.some((i) => i.actionType === 'chlorinator')).toBe(true);

    // ── Personalized recommendation ──────────────────────────────
    const newMeas = makeMeas('m-new', addDays(BASE, 10));
    const allMeas = [...measurements, newMeas];
    const result = runPersonalizedAssistant(allMeas, actions, cfg);

    const eqRec = result.recommendations.find((r) => r.kind === 'equipment');
    expect(eqRec).toBeDefined();
    expect(eqRec!.personalization).toBeDefined();

    // With cf clamped to 1.5 (observed > theoretical → overperformance),
    // personalizedValue < theoreticalValue (needs fewer hours).
    // But we also check safety cap: must not exceed max hours
    expect(eqRec!.personalization!.applied).toBe(true);
    expect(eqRec!.personalization!.sampleSize).toBe(5);
    expect(eqRec!.personalization!.confidence).toBe(chlAdj!.confidence);
    // Safety cap enforced
    expect(eqRec!.personalization!.personalizedValue).toBeLessThanOrEqual(
      cfg.saltChlorinator!.maxRecommendedHoursPerDay,
    );
    // Explanation includes sample size; confidence stored in the object
    expect(eqRec!.personalization!.explanation).toContain(String(chlAdj!.sampleSize));
    expect(eqRec!.personalization!.confidence).toBe(chlAdj!.confidence);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Scenario 2 — Excluded anomaly does not affect learning
// ═══════════════════════════════════════════════════════════════════

describe('Scenario 2 — excluded anomaly', () => {
  it('anomaly excluded from learning does not shift median or personalization', () => {
    const cfg = lifecycleSettings();
    const { measurements, actions } = buildCycles(5);

    // Add 1 anomalous action: extreme FAC jump (0.5 → 5.5, delta +5.0)
    measurements.push(makeMeas('m-anom-b', addDays(BASE, 7)));
    measurements.push(makeMeas('m-anom-a', addDays(BASE, 8), {
      id: 'm-anom-a', measuredAt: addDays(BASE, 8), fac: 5.5,
    }));
    actions.push(makeChlAction('act-anom', addDays(BASE, 7), 'm-anom-b', {
      id: 'act-anom',
      exclusionFlags: { excludedFromLearning: true, atypical: true },
    }));

    // Verify anomalous action visible in history
    const anomAction = actions.find((a) => a.id === 'act-anom');
    expect(anomAction).toBeDefined();
    expect(anomAction!.exclusionFlags?.excludedFromLearning).toBe(true);

    // Compute learning — anomaly excluded
    const adjustments = computeLearning(measurements, actions, cfg);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();
    expect(chlAdj!.sampleSize).toBe(5);
    expect(chlAdj!.observedMedianEffect).toBe(0.3);

    // Personalized recommendation unaffected
    const newMeas = makeMeas('m-s2-new', addDays(BASE, 10));
    const allMeas = [...measurements, newMeas];
    const result = runPersonalizedAssistant(allMeas, actions, cfg);
    const eqRec = result.recommendations.find((r) => r.kind === 'equipment');
    expect(eqRec).toBeDefined();
    expect(eqRec!.personalization).toBeDefined();
    expect(eqRec!.personalization!.sampleSize).toBe(5);
    expect(eqRec!.personalization!.personalizedValue).toBeLessThanOrEqual(
      cfg.saltChlorinator!.maxRecommendedHoursPerDay,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Scenario 3 — Learning disabled
// ═══════════════════════════════════════════════════════════════════

describe('Scenario 3 — learning disabled', () => {
  it('personalization not applied when learning is disabled', () => {
    const { measurements, actions } = buildCycles(5);

    // Verify data would produce learning if enabled
    const enabledAdj = computeLearning(measurements, actions, lifecycleSettings());
    expect(enabledAdj.some((a) => a.actionType === 'chlorinator')).toBe(true);

    // Run with learning disabled
    const disabledCfg = lifecycleSettings({
      historicalLearning: { ...DEFAULT_HISTORICAL_LEARNING, enabled: false },
    });
    const newMeas = makeMeas('m-s3-new', addDays(BASE, 10));
    const allMeas = [...measurements, newMeas];
    const result = runPersonalizedAssistant(allMeas, actions, disabledCfg);
    const eqRec = result.recommendations.find((r) => r.kind === 'equipment');
    expect(eqRec).toBeDefined();
    expect(eqRec!.suggestedAdditionalHours).toBeDefined();
    expect(eqRec!.personalization).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Scenario 4 — Import/export preserves learning state
// ═══════════════════════════════════════════════════════════════════

describe('Scenario 4 — import/export lifecycle', () => {
  it('preserves eligible data and exclusion flags through export and import', () => {
    const cfg = lifecycleSettings();
    const { measurements, actions, followUps } = buildCycles(5);

    // Add excluded anomalous action + excluded follow-up
    measurements.push(makeMeas('m-anom-b', addDays(BASE, 7)));
    measurements.push(makeMeas('m-anom-a', addDays(BASE, 8), {
      id: 'm-anom-a', measuredAt: addDays(BASE, 8), fac: 5.5,
    }));
    actions.push(makeChlAction('act-anom', addDays(BASE, 7), 'm-anom-b', { id: 'act-anom' }));
    const anomFu = createFollowUp(actions[actions.length - 1]);
    if (anomFu) {
      followUps.push({ ...anomFu, excludedFromLearning: true });
    }

    // Simulate UI save
    store.set('pool-maintenance:settings', JSON.stringify(cfg));
    store.set('pool-maintenance:measurements', JSON.stringify(measurements));
    store.set('pool-maintenance:actions', JSON.stringify(actions));
    store.set('pool-maintenance:followUps', JSON.stringify(followUps));

    // Export
    const exported = exportData();
    expect(exported.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(exported.measurements).toHaveLength(12);
    expect(exported.actions).toHaveLength(6);
    expect(exported.followUps).toHaveLength(6);

    // Import into empty state
    store.clear();
    const parsed = parseImportData(JSON.stringify(exported));
    const importedMeas = mergeMeasurements([], parsed.measurements);
    const importedActions = mergeActions([], parsed.actions);
    const importedFus = mergeFollowUps([], parsed.followUps);
    const normalized = normalizeActionExclusionFlags(importedActions, importedFus);
    expect(normalized).toHaveLength(6);

    // Anomalous action gets exclusion after normalize
    const anom = normalized.find((a) => a.id === 'act-anom');
    expect(anom).toBeDefined();
    expect(anom!.exclusionFlags?.excludedFromLearning).toBe(true);

    // Normal actions not excluded
    const normal = normalized.find((a) => a.id === 'act-0');
    expect(normal).toBeDefined();
    expect(normal!.exclusionFlags?.excludedFromLearning).toBeFalsy();

    // Recalculate learning after import
    const adjustments = computeLearning(importedMeas, normalized, cfg);
    const chlAdj = adjustments.find((a) => a.actionType === 'chlorinator');
    expect(chlAdj).toBeDefined();
    expect(chlAdj!.sampleSize).toBe(5);
    expect(chlAdj!.observedMedianEffect).toBe(0.3);
    expect(chlAdj!.correctionFactor).toBeDefined();
    expect(chlAdj!.correctionFactor!).toBeGreaterThanOrEqual(0.5);
    expect(chlAdj!.correctionFactor!).toBeLessThanOrEqual(1.5);

    // Personalized recommendation after import
    const newMeas = makeMeas('m-s4-new', addDays(BASE, 10));
    const allMeas = [...importedMeas, newMeas];
    const result = runPersonalizedAssistant(allMeas, normalized, cfg);
    const eqRec = result.recommendations.find((r) => r.kind === 'equipment');
    expect(eqRec).toBeDefined();
    expect(eqRec!.personalization).toBeDefined();
    expect(eqRec!.personalization!.sampleSize).toBe(5);
  });
});
