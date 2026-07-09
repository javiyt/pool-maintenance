import type { Measurement } from './measurement';
import type { PoolSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';

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
 * Migrate old date-only records to the measuredAt field.
 *
 * Before v2.1, measurements only had a `date` (YYYY-MM-DD) field.
 * This converts those to an ISO 8601 measuredAt using local noon
 * as the default time.
 */
function migrateMeasurement(m: Record<string, unknown>): Measurement {
  if (m.measuredAt) return m as unknown as Measurement;
  // Old record — convert date to measuredAt using local noon
  const localNoon = new Date(`${String(m.date)}T12:00:00`);
  return { ...(m as unknown as Measurement), measuredAt: localNoon.toISOString() };
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

// ── Export / Import ────────────────────────────────────────────────

export const EXPORT_SCHEMA_VERSION = 2;

export interface ExportData {
  schemaVersion: number;
  exportedAt: string;
  poolConfig: PoolSettings;
  measurements: Measurement[];
}

export interface ImportResult {
  measurements: Measurement[];
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
  };
}

/**
 * Parse and validate an import JSON string.
 *
 * Supports two formats:
 * - v2+: `{ schemaVersion, poolConfig, measurements }`
 * - Legacy: a plain `Measurement[]` array
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
      return { measurements: [], poolConfig: null, count: 0 };
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
    return { measurements, poolConfig: null, count: measurements.length };
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

    let poolConfig: PoolSettings | null = null;
    if (obj.poolConfig && typeof obj.poolConfig === 'object') {
      poolConfig = { ...DEFAULT_SETTINGS, ...(obj.poolConfig as Record<string, unknown>) } as PoolSettings;
    }

    return { measurements, poolConfig, count: measurements.length };
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
