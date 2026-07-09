import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  saveSettings,
  loadMeasurements,
  saveMeasurements,
  addMeasurement,
  deleteMeasurement,
  exportData,
  parseImportData,
  mergeMeasurements,
  EXPORT_SCHEMA_VERSION,
} from '../src/domain/storage';
import type { PoolSettings } from '../src/domain/settings';
import type { Measurement } from '../src/domain/measurement';

// Minimal localStorage mock for testing
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
});

describe('settings persistence', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadSettings();
    expect(s.volume).toBe(0);
    expect(s.poolType).toBe('chlorine');
  });

  it('round-trips settings', () => {
    const settings: PoolSettings = {
      volume: 15000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
    };
    saveSettings(settings);
    const loaded = loadSettings();
    expect(loaded.volume).toBe(15000);
    expect(loaded.poolType).toBe('saltwater');
  });

  it('fills missing fields with defaults', () => {
    store.set('pool-maintenance:settings', JSON.stringify({ volume: 5000 }));
    const s = loadSettings();
    expect(s.volume).toBe(5000);
    expect(s.poolType).toBe('chlorine');
  });
});

describe('measurements persistence', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadMeasurements()).toEqual([]);
  });

  it('round-trips measurements', () => {
    const m: Measurement = {
      id: '1',
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    saveMeasurements([m]);
    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].ph).toBe(7.4);
  });

  it('adds a measurement', () => {
    const m: Measurement = {
      id: 'a',
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.0,
      freeChlorine: 1,
      alkalinity: 80,
      cyanuricAcid: 30,
    };
    const list = addMeasurement(m);
    expect(list).toHaveLength(1);
    expect(loadMeasurements()).toHaveLength(1);
  });

  it('deletes a measurement by id', () => {
    const m1: Measurement = {
      id: '1',
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    const m2: Measurement = { ...m1, id: '2' };
    saveMeasurements([m1, m2]);
    const result = deleteMeasurement('1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('handles corrupted storage gracefully', () => {
    store.set('pool-maintenance:measurements', 'not-json');
    expect(loadMeasurements()).toEqual([]);
  });

  it('migrates old date-only records to measuredAt using local noon', () => {
    // Simulate an old record that only has `date` (no `measuredAt`)
    const oldRecord = {
      id: 'old1',
      date: '2026-07-04',
      ph: 7.4,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([oldRecord]));

    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].measuredAt).toBeDefined();

    // Should have been converted to local noon (UTC time depends on timezone offset)
    // The date part should be 2026-07-04 and time should be around 12:00 local
    const d = new Date(loaded[0].measuredAt);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // July is month 6 (0-indexed)
    expect(d.getUTCDate()).toBe(4);
  });

  it('does not modify records that already have measuredAt', () => {
    const record = {
      id: 'new1',
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([record]));

    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].measuredAt).toBe('2026-07-09T10:35:00.000Z');
  });
});

// ── Export / Import ────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-07-09T10:35:00.000Z');
const SAMPLE_POOL_CONFIG: PoolSettings = {
  volume: 50000,
  volumeUnit: 'liters',
  poolType: 'chlorine',
  unitSystem: 'metric',
};
const SAMPLE_MEASUREMENT: Measurement = {
  id: 'm1',
  date: '2026-07-09',
  measuredAt: '2026-07-09T10:35:00.000Z',
  ph: 7.4,
  freeChlorine: 2.0,
  alkalinity: 100,
  cyanuricAcid: 40,
};

describe('exportData', () => {
  beforeEach(() => {
    store.clear();
  });

  it('includes schemaVersion in the export', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const data = exportData(FIXED_NOW);
    expect(data.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
  });

  it('includes exportedAt timestamp', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const data = exportData(FIXED_NOW);
    expect(data.exportedAt).toBe('2026-07-09T10:35:00.000Z');
  });

  it('includes poolConfig with all fields', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const data = exportData(FIXED_NOW);
    expect(data.poolConfig).toEqual(SAMPLE_POOL_CONFIG);
  });

  it('includes measurements', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const data = exportData(FIXED_NOW);
    expect(data.measurements).toHaveLength(1);
    expect(data.measurements[0].id).toBe('m1');
    expect(data.measurements[0].ph).toBe(7.4);
  });

  it('returns empty measurements array when none saved', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    const data = exportData(FIXED_NOW);
    expect(data.measurements).toEqual([]);
  });
});

describe('parseImportData', () => {
  beforeEach(() => {
    store.clear();
  });

  it('restores pool configuration from schema v2 format', () => {
    const json = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
    });
    const result = parseImportData(json);
    expect(result.poolConfig).toEqual(SAMPLE_POOL_CONFIG);
    expect(result.count).toBe(1);
  });

  it('imports legacy measurement-only array format', () => {
    const json = JSON.stringify([SAMPLE_MEASUREMENT]);
    const result = parseImportData(json);
    expect(result.poolConfig).toBeNull();
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].id).toBe('m1');
  });

  it('returns empty result for empty legacy array', () => {
    const result = parseImportData('[]');
    expect(result.measurements).toEqual([]);
    expect(result.poolConfig).toBeNull();
    expect(result.count).toBe(0);
  });

  it('throws a user-friendly error for invalid JSON', () => {
    expect(() => parseImportData('not-json')).toThrow(
      'The file does not contain valid JSON',
    );
  });

  it('throws a user-friendly error for null', () => {
    expect(() => parseImportData('null')).toThrow(
      'Unrecognized JSON format',
    );
  });

  it('throws a user-friendly error for a single measurement object', () => {
    const json = JSON.stringify(SAMPLE_MEASUREMENT);
    expect(() => parseImportData(json)).toThrow(
      'single measurement, not an export file',
    );
  });

  it('throws when legacy array items lack an id', () => {
    const json = JSON.stringify([{ ph: 7.4 }]);
    expect(() => parseImportData(json)).toThrow(
      'each entry must have an id',
    );
  });

  it('migrates old date-only measurements to measuredAt on import', () => {
    const json = JSON.stringify([
      {
        id: 'old1',
        date: '2026-07-04',
        ph: 7.4,
        freeChlorine: 2,
        alkalinity: 100,
        cyanuricAcid: 40,
      },
    ]);
    const result = parseImportData(json);
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].measuredAt).toBeDefined();
    const d = new Date(result.measurements[0].measuredAt);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // July
    expect(d.getUTCDate()).toBe(4);
  });

  it('migrates old date-only measurements inside v2 format', () => {
    const json = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [
        {
          id: 'old1',
          date: '2026-07-04',
          ph: 7.2,
          freeChlorine: 1.5,
          alkalinity: 90,
          cyanuricAcid: 35,
        },
      ],
    });
    const result = parseImportData(json);
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].measuredAt).toBeDefined();
  });

  it('preserves poolConfig from the import when present', () => {
    const config: PoolSettings = {
      volume: 25000,
      volumeUnit: 'cubicMeters',
      poolType: 'saltwater',
      unitSystem: 'imperial',
    };
    const json = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-07-09T12:00:00.000Z',
      poolConfig: config,
      measurements: [],
    });
    const result = parseImportData(json);
    expect(result.poolConfig).toBeDefined();
    expect(result.poolConfig!.volume).toBe(25000);
    expect(result.poolConfig!.poolType).toBe('saltwater');
  });
});

describe('mergeMeasurements', () => {
  it('appends new measurements to existing list', () => {
    const existing: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '1' },
      { ...SAMPLE_MEASUREMENT, id: '2' },
    ];
    const incoming: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '3' },
    ];
    const merged = mergeMeasurements(existing, incoming);
    expect(merged).toHaveLength(3);
  });

  it('skips duplicate measurements with the same id', () => {
    const existing: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '1' },
      { ...SAMPLE_MEASUREMENT, id: '2' },
    ];
    const incoming: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '2' }, // duplicate
      { ...SAMPLE_MEASUREMENT, id: '3' }, // new
    ];
    const merged = mergeMeasurements(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged.filter((m) => m.id === '2')).toHaveLength(1);
  });

  it('returns existing list unchanged when all incoming are duplicates', () => {
    const existing: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '1' },
    ];
    const incoming: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: '1' },
    ];
    const merged = mergeMeasurements(existing, incoming);
    expect(merged).toHaveLength(1);
  });

  it('keeps existing order and appends new items at the end', () => {
    const existing: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: 'a', ph: 7.0 },
    ];
    const incoming: Measurement[] = [
      { ...SAMPLE_MEASUREMENT, id: 'b', ph: 7.2 },
    ];
    const merged = mergeMeasurements(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('a');
    expect(merged[1].id).toBe('b');
  });
});
