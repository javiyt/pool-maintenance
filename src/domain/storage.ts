import type { Measurement } from './measurement';
import type { PoolSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { MaintenanceAction } from './actions';
import type { FollowUp } from './followUp';
import type { DiagnosticExperiment } from './latentStateEstimator';
import {
  APPLICATION_VERSION,
  CHEMICAL_CATALOG_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from './recommendation/versions';

const KEY_PREFIX = 'pool-maintenance:';

function key(name: string): string {
  return `${KEY_PREFIX}${name}`;
}

// ── PoolSettings ───────────────────────────────────────────────────

export function loadSettings(): PoolSettings {
  try {
    const raw = localStorage.getItem(key('settings'));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PoolSettings): void {
  localStorage.setItem(key('settings'), JSON.stringify(settings));
}

// ── Measurements ───────────────────────────────────────────────────

/**
 * Migrate an old record to the current PoolMeasurement shape.
 *
 * v1→v2: Records had `date` (YYYY-MM-DD) without `measuredAt`.
 *         Converts date to ISO 8601 measuredAt using local noon.
 *
 * v2→v3: Records may contain fields like freeChlorine, alkalinity,
 *         cyanuricAcid, or a `date` field. Maps freeChlorine → fac
 *         and ensures measuredAt exists.
 */
function migrateMeasurement(raw: Record<string, unknown>): Measurement {
  const r = { ...raw } as Record<string, unknown>;

  // Ensure measuredAt exists (migrate from date-only)
  if (!r.measuredAt && r.date) {
    const localNoon = new Date(`${String(r.date)}T12:00:00`);
    r.measuredAt = localNoon.toISOString();
  }

  // Map old freeChlorine to fac if fac is not already set
  if (r.freeChlorine !== undefined && r.fac === undefined) {
    r.fac = r.freeChlorine;
  }

  // Remove legacy fields that are no longer in the model
  delete r.date;
  delete r.freeChlorine;
  delete r.alkalinity;
  delete r.cyanuricAcid;

  return r as unknown as Measurement;
}

export function loadMeasurements(): Measurement[] {
  try {
    const raw = localStorage.getItem(key('measurements'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateMeasurement);
  } catch {
    return [];
  }
}

export function saveMeasurements(measurements: Measurement[]): void {
  localStorage.setItem(key('measurements'), JSON.stringify(measurements));
}

export function addMeasurement(m: Measurement): Measurement[] {
  const list = loadMeasurements();
  list.push(m);
  saveMeasurements(list);
  return list;
}

export function deleteMeasurement(id: string): Measurement[] {
  const list = loadMeasurements().filter((m) => m.id !== id);
  saveMeasurements(list);
  return list;
}

// ── Maintenance Actions ────────────────────────────────────────────

export function loadActions(): MaintenanceAction[] {
  try {
    const raw = localStorage.getItem(key('actions'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MaintenanceAction[];
  } catch {
    return [];
  }
}

export function saveActions(actions: MaintenanceAction[]): void {
  localStorage.setItem(key('actions'), JSON.stringify(actions));
}

export function addAction(a: MaintenanceAction): MaintenanceAction[] {
  const list = loadActions();
  list.push(a);
  saveActions(list);
  return list;
}

export function deleteAction(id: string): MaintenanceAction[] {
  const list = loadActions().filter((a) => a.id !== id);
  saveActions(list);
  return list;
}

// ── Follow-Up Records ──────────────────────────────────────────────

export function loadFollowUps(): FollowUp[] {
  try {
    const raw = localStorage.getItem(key('followUps'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FollowUp[];
  } catch {
    return [];
  }
}

export function saveFollowUps(followUps: FollowUp[]): void {
  localStorage.setItem(key('followUps'), JSON.stringify(followUps));
}

export function addFollowUp(fu: FollowUp): FollowUp[] {
  const list = loadFollowUps();
  list.push(fu);
  saveFollowUps(list);
  return list;
}

export function updateFollowUp(id: string, updates: Partial<FollowUp>): FollowUp[] {
  const list = loadFollowUps();
  const idx = list.findIndex((fu) => fu.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveFollowUps(list);
  }
  return list;
}

/**
 * Merge imported follow-ups into an existing list, avoiding duplicates by id.
 */
export function mergeFollowUps(
  existing: FollowUp[],
  incoming: FollowUp[],
): FollowUp[] {
  const existingIds = new Set(existing.map((fu) => fu.id));
  const deduped = incoming.filter((fu) => !existingIds.has(fu.id));
  return [...existing, ...deduped];
}

// ── Export / Import ────────────────────────────────────────────────

// ── Diagnostic experiments ─────────────────────────────────────────

export function loadExperiments(): DiagnosticExperiment[] {
  try {
    const raw = localStorage.getItem(key('experiments'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DiagnosticExperiment[];
  } catch {
    return [];
  }
}

export function saveExperiments(experiments: DiagnosticExperiment[]): void {
  localStorage.setItem(key('experiments'), JSON.stringify(experiments));
}

export function addExperiment(exp: DiagnosticExperiment): DiagnosticExperiment[] {
  const list = loadExperiments();
  list.push(exp);
  saveExperiments(list);
  return list;
}

export function updateExperiment(id: string, updates: Partial<DiagnosticExperiment>): DiagnosticExperiment[] {
  const list = loadExperiments();
  const idx = list.findIndex((e) => e.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveExperiments(list);
  }
  return list;
}

export function mergeExperiments(
  existing: DiagnosticExperiment[],
  incoming: DiagnosticExperiment[],
): DiagnosticExperiment[] {
  const existingIds = new Set(existing.map((e) => e.id));
  const deduped = incoming.filter((e) => !existingIds.has(e.id));
  return [...existing, ...deduped];
}

export const EXPORT_SCHEMA_VERSION = 8;

export interface ExportData {
  schemaVersion: number;
  applicationVersion: string;
  recommendationEngineVersion: string;
  outcomeEvaluatorVersion: string;
  chemicalCatalogVersion: string;
  exportedAt: string;
  poolConfig: PoolSettings;
  measurements: Measurement[];
  actions: MaintenanceAction[];
  followUps: FollowUp[];
  experiments?: DiagnosticExperiment[];
}

export interface ImportResult {
  measurements: Measurement[];
  actions: MaintenanceAction[];
  followUps: FollowUp[];
  experiments: DiagnosticExperiment[];
  poolConfig: PoolSettings | null;
  count: number;
}

/**
 * Build the full export payload including pool configuration,
 * measurement history, schema metadata, and diagnostic experiments.
 *
 * @param now Optional date to use as the export timestamp (for testing).
 */
export function exportData(now?: Date): ExportData {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    applicationVersion: APPLICATION_VERSION,
    recommendationEngineVersion: RECOMMENDATION_ENGINE_VERSION,
    outcomeEvaluatorVersion: OUTCOME_EVALUATOR_VERSION,
    chemicalCatalogVersion: CHEMICAL_CATALOG_VERSION,
    exportedAt: (now ?? new Date()).toISOString(),
    poolConfig: loadSettings(),
    measurements: loadMeasurements(),
    actions: loadActions(),
    followUps: loadFollowUps(),
    experiments: loadExperiments(),
  };
}

/**
 * Parse and validate an import JSON string.
 *
 * Supports:
 * - v8: `{ schemaVersion: 8, applicationVersion, recommendationEngineVersion, outcomeEvaluatorVersion, chemicalCatalogVersion, poolConfig, measurements, actions, followUps, experiments }`
 * - v7: `{ schemaVersion: 7, poolConfig, measurements, actions, followUps, experiments }` — adds diagnostic experiments
 * - v6: `{ schemaVersion: 6, poolConfig, measurements, actions, followUps }` — adds follow-ups
 * - v5: `{ schemaVersion: 5, poolConfig, measurements, actions }` — adds historicalLearning config to poolConfig
 * - v4: `{ schemaVersion: 4, poolConfig, measurements, actions }` — current format before v5
 * - v3: `{ schemaVersion: 3, poolConfig, measurements }` — no actions array
 * - v2: `{ schemaVersion: 2, poolConfig, measurements }` — old measurement shape
 * - v1 (legacy): a plain `Measurement[]` array
 *
 * All formats are migrated through `migrateMeasurement` for backward compat.
 *
 * @throws If the JSON is invalid or the shape is unrecognized.
 */
export function parseImportData(jsonString: string): ImportResult {
  let data: unknown;

  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error(
      'The file does not contain valid JSON. Please check the file and try again.',
    );
  }

  // ── Legacy format: plain array of measurements ────────────────
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { measurements: [], actions: [], followUps: [], experiments: [], poolConfig: null, count: 0 };
    }

    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(
          'Invalid JSON format: expected an array of measurement objects.',
        );
      }
      if (!item.id || (!item.measuredAt && !item.date)) {
        throw new Error(
          'Invalid measurement: each entry must have an id and a date or measuredAt field.',
        );
      }
    }

    const measurements = data.map(migrateMeasurement);
    return { measurements, actions: [], followUps: [], experiments: [], poolConfig: null, count: measurements.length };
  }

  // ── Versioned format: { schemaVersion, measurements, poolConfig? } ──
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Heuristic: if it looks like a single measurement object, reject with a helpful message
    if (typeof obj.id === 'string' && obj.measuredAt) {
      throw new Error(
        'This file contains a single measurement, not an export file. ' +
          'Use "Export JSON" from the app to create a valid export.',
      );
    }

    const rawMeasurements = Array.isArray(obj.measurements) ? obj.measurements : [];

    for (const item of rawMeasurements) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(
          'Invalid JSON format: measurements must be an array of objects.',
        );
      }
    }

    const measurements = rawMeasurements.map(migrateMeasurement);

    // Parse actions (v4+); v3 and older exports won't have this field
    let actions: MaintenanceAction[] = [];
    if (Array.isArray(obj.actions)) {
      for (const item of obj.actions) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: actions must be an array of objects.',
          );
        }
      }
      actions = obj.actions as MaintenanceAction[];
    }

    // Parse follow-ups (v6+); v5 and older exports won't have this field
    let followUps: FollowUp[] = [];
    if (Array.isArray(obj.followUps)) {
      for (const item of obj.followUps) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: followUps must be an array of objects.',
          );
        }
      }
      followUps = obj.followUps as FollowUp[];
    }

    // Parse experiments (v7+); v6 and older exports won't have this field
    let experiments: DiagnosticExperiment[] = [];
    if (Array.isArray(obj.experiments)) {
      for (const item of obj.experiments) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: experiments must be an array of objects.',
          );
        }
      }
      experiments = obj.experiments as DiagnosticExperiment[];
    }

    let poolConfig: PoolSettings | null = null;
    if (obj.poolConfig && typeof obj.poolConfig === 'object') {
      poolConfig = { ...DEFAULT_SETTINGS, ...(obj.poolConfig as Record<string, unknown>) } as PoolSettings;
    }

    return { measurements, actions, followUps, experiments, poolConfig, count: measurements.length };
  }

  throw new Error(
    'Unrecognized JSON format. Expected a measurement array or a versioned export object.',
  );
}

/**
 * Merge imported measurements into an existing list, avoiding
 * duplicates by measurement id.
 */
export function mergeMeasurements(
  existing: Measurement[],
  incoming: Measurement[],
): Measurement[] {
  const existingIds = new Set(existing.map((m) => m.id));
  const deduped = incoming.filter((m) => !existingIds.has(m.id));
  return [...existing, ...deduped];
}

/**
 * Merge imported actions into an existing list, avoiding duplicates by id.
 */
export function mergeActions(
  existing: MaintenanceAction[],
  incoming: MaintenanceAction[],
): MaintenanceAction[] {
  const existingIds = new Set(existing.map((a) => a.id));
  const deduped = incoming.filter((a) => !existingIds.has(a.id));
  return [...existing, ...deduped];
}

/**
 * Normalize action exclusion flags from follow-up records.
 *
 * For any follow-up with `excludedFromLearning: true`, propagates
 * this flag to the linked action's `exclusionFlags.excludedFromLearning`.
 *
 * This ensures that imported exclusion state takes effect immediately
 * without requiring UI interaction. The learning system checks the
 * action flag, so the two sources must agree.
 *
 * Rules:
 * - Preserves existing action exclusion flags (atypical, incorrectlyRecorded)
 * - Never changes `true` back to `false` (monotonic union)
 * - If either linked record excludes, exclusion wins
 * - Missing linked action is silently skipped
 * - Multiple follow-ups for one action: any `true` → exclusion
 * - Idempotent: second call does not change already-normalized data
 */
export function normalizeActionExclusionFlags(
  actions: MaintenanceAction[],
  followUps: FollowUp[],
): MaintenanceAction[] {
  // Build set of action IDs that ANY follow-up marks as excluded
  const excludedActionIds = new Set<string>();
  for (const fu of followUps) {
    if (fu.excludedFromLearning && fu.actionId) {
      excludedActionIds.add(fu.actionId);
    }
  }

  if (excludedActionIds.size === 0) return actions;

  let changed = false;
  const result = actions.map((action) => {
    if (!excludedActionIds.has(action.id)) return action;
    if (action.exclusionFlags?.excludedFromLearning) return action; // already excluded
    changed = true;
    return {
      ...action,
      exclusionFlags: {
        atypical: action.exclusionFlags?.atypical ?? false,
        incorrectlyRecorded: action.exclusionFlags?.incorrectlyRecorded ?? false,
        excludedFromLearning: true,
      },
    };
  });

  return changed ? result : actions;
}
