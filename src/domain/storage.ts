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
function migrateMeasurement(m: Measurement): Measurement {
  if (m.measuredAt) return m;
  // Old record — convert date to measuredAt using local noon
  const localNoon = new Date(`${m.date}T12:00:00`);
  return { ...m, measuredAt: localNoon.toISOString() };
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
