import type { Measurement } from './measurement';
import type { PoolSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import type { MaintenanceAction } from './actions';

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

// ── Export / Import ────────────────────────────────────────────────

export const EXPORT_SCHEMA_VERSION = 4;

export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  poolConfig: PoolSettings;
  measurements: Measurement[];
  actions: MaintenanceAction[];
}

export interface ImportResult {
  measurements: Measurement[];
  actions: MaintenanceAction[];
  poolConfig: PoolSettings | null;
  count: number;
}

/**
 * Build the full export payload including pool configuration,
 * measurement history, and schema metadata.
 *
 * @param now Optional date to use as the export timestamp (for testing).
 */
export function exportData(now?: Date): ExportData {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: (now ?? new Date()).toISOString(),
    poolConfig: loadSettings(),
    measurements: loadMeasurements(),
    actions: loadActions(),
  };
}

/**
 * Parse and validate an import JSON string.
 *
 * Supports:
 * - v3: `{ schemaVersion: 3, poolConfig, measurements }` — current format
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
      return { measurements: [], actions: [], poolConfig: null, count: 0 };
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
    return { measurements, actions: [], poolConfig: null, count: measurements.length };
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

    let poolConfig: PoolSettings | null = null;
    if (obj.poolConfig && typeof obj.poolConfig === 'object') {
      poolConfig = { ...DEFAULT_SETTINGS, ...(obj.poolConfig as Record<string, unknown>) } as PoolSettings;
    }

    return { measurements, actions, poolConfig, count: measurements.length };
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
