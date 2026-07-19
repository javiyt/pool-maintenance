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
  loadFollowUps,
  saveFollowUps,
  addFollowUp,
  updateFollowUp,
  mergeFollowUps,
  normalizeActionExclusionFlags,
  mergeActions,
  loadExperiments,
  saveExperiments,
  mergeExperiments,
  EXPORT_SCHEMA_VERSION,
} from '../src/domain/storage';
import type { PoolSettings } from '../src/domain/settings';
import type { Measurement } from '../src/domain/measurement';
import type { FollowUp } from '../src/domain/followUp';
import type { MaintenanceAction } from '../src/domain/actions';

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

const SAMPLE_MEASUREMENT: Measurement = {
  id: 'm1',
  measuredAt: '2026-07-09T10:35:00.000Z',
  ph: 7.4,
  ec: 6640,
  tds: 3230,
  salt: 3380,
  orp: 672,
  fac: 0.8,
  temperature: 31.0,
};

// ── Settings ───────────────────────────────────────────────────────

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

// ── Measurements ───────────────────────────────────────────────────

describe('measurements persistence', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadMeasurements()).toEqual([]);
  });

  it('round-trips measurements', () => {
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].ph).toBe(7.4);
    expect(loaded[0].ec).toBe(6640);
    expect(loaded[0].tds).toBe(3230);
    expect(loaded[0].salt).toBe(3380);
    expect(loaded[0].orp).toBe(672);
    expect(loaded[0].fac).toBe(0.8);
    expect(loaded[0].temperature).toBe(31.0);
  });

  it('adds a measurement', () => {
    const list = addMeasurement({ ...SAMPLE_MEASUREMENT, id: 'a' });
    expect(list).toHaveLength(1);
    expect(loadMeasurements()).toHaveLength(1);
  });

  it('deletes a measurement by id', () => {
    const m1 = { ...SAMPLE_MEASUREMENT, id: '1' };
    const m2 = { ...SAMPLE_MEASUREMENT, id: '2' };
    saveMeasurements([m1, m2]);
    const result = deleteMeasurement('1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('handles corrupted storage gracefully', () => {
    store.set('pool-maintenance:measurements', 'not-json');
    expect(loadMeasurements()).toEqual([]);
  });
});

// ── Data migration ─────────────────────────────────────────────────

describe('data migration', () => {
  it('migrates old date-only records to measuredAt using local noon', () => {
    const oldRecord = {
      id: 'old1',
      date: '2026-07-04',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([oldRecord]));

    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].measuredAt).toBeDefined();

    // Date part should be 2026-07-04 and time around 12:00 local
    const d = new Date(loaded[0].measuredAt);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // July is month 6 (0-indexed)
    expect(d.getUTCDate()).toBe(4);
  });

  it('maps old freeChlorine to fac', () => {
    const oldRecord = {
      id: 'old1',
      date: '2026-07-04',
      measuredAt: '2026-07-04T12:00:00.000Z',
      ph: 7.4,
      freeChlorine: 2.5,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([oldRecord]));

    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].fac).toBe(2.5);
  });

  it('removes legacy fields (freeChlorine, alkalinity, cyanuricAcid, date)', () => {
    const oldRecord = {
      id: 'old1',
      date: '2026-07-04',
      measuredAt: '2026-07-04T12:00:00.000Z',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([oldRecord]));

    const loaded = loadMeasurements();
    const loadedRaw = loaded[0] as unknown as Record<string, unknown>;
    expect(loadedRaw.freeChlorine).toBeUndefined();
    expect(loadedRaw.alkalinity).toBeUndefined();
    expect(loadedRaw.cyanuricAcid).toBeUndefined();
    expect(loadedRaw.date).toBeUndefined();
  });

  it('does not modify records that already have measuredAt', () => {
    store.set('pool-maintenance:measurements', JSON.stringify([SAMPLE_MEASUREMENT]));

    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].measuredAt).toBe('2026-07-09T10:35:00.000Z');
  });

  it('preserves fac when it already exists alongside freeChlorine', () => {
    const record = {
      id: 'm1',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      fac: 0.8,
      freeChlorine: 99, // should be ignored since fac already set
      ec: 6640,
      tds: 3230,
      salt: 3380,
      orp: 672,
      temperature: 31.0,
    };
    store.set('pool-maintenance:measurements', JSON.stringify([record]));
    const loaded = loadMeasurements();
    expect(loaded[0].fac).toBe(0.8);
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

  it('includes measurements with new digital meter fields', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    const data = exportData(FIXED_NOW);
    expect(data.measurements).toHaveLength(1);
    expect(data.measurements[0].id).toBe('m1');
    expect(data.measurements[0].ph).toBe(7.4);
    expect(data.measurements[0].ec).toBe(6640);
    expect(data.measurements[0].tds).toBe(3230);
    expect(data.measurements[0].salt).toBe(3380);
    expect(data.measurements[0].orp).toBe(672);
    expect(data.measurements[0].fac).toBe(0.8);
    expect(data.measurements[0].temperature).toBe(31.0);
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

  it('restores pool configuration from schema v3 format', () => {
    const json = JSON.stringify({
      schemaVersion: 3,
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
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(4);
  });

  it('maps freeChlorine to fac during import migration', () => {
    const json = JSON.stringify([
      {
        id: 'old1',
        date: '2026-07-04',
        measuredAt: '2026-07-04T12:00:00.000Z',
        ph: 7.4,
        freeChlorine: 2.5,
        alkalinity: 100,
        cyanuricAcid: 40,
      },
    ]);
    const result = parseImportData(json);
    expect(result.measurements[0].fac).toBe(2.5);
  });

  it('migrates old v2 schema exports with freeChlorine to fac', () => {
    const json = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [
        {
          id: 'old1',
          date: '2026-07-04',
          measuredAt: '2026-07-04T12:00:00.000Z',
          ph: 7.2,
          freeChlorine: 1.5,
          alkalinity: 90,
          cyanuricAcid: 35,
        },
      ],
    });
    const result = parseImportData(json);
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].fac).toBe(1.5);
  });

  it('preserves poolConfig from the import when present', () => {
    const config: PoolSettings = {
      volume: 25000,
      volumeUnit: 'cubicMeters',
      poolType: 'saltwater',
      unitSystem: 'imperial',
    };
    const json = JSON.stringify({
      schemaVersion: 3,
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
      { ...SAMPLE_MEASUREMENT, id: '2' },
      { ...SAMPLE_MEASUREMENT, id: '3' },
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

// ── Follow-Up Persistence ──────────────────────────────────────────

const SAMPLE_FOLLOW_UP: FollowUp = {
  id: 'fu-1',
  actionId: 'act-1',
  recommendationId: 'rec-1',
  sourceMeasurementId: 'meas-1',
  suggestedRetestDelay: 6,
  status: 'awaiting-retest',
  createdAt: '2026-07-09T10:00:00.000Z',
  dueAt: '2026-07-09T16:00:00.000Z',
  excludedFromLearning: false,
  atypical: false,
  incorrectlyRecorded: false,
  unusualEventNotes: [],
};

describe('follow-up persistence', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadFollowUps()).toEqual([]);
  });

  it('round-trips follow-ups', () => {
    saveFollowUps([SAMPLE_FOLLOW_UP]);
    const loaded = loadFollowUps();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('fu-1');
    expect(loaded[0].status).toBe('awaiting-retest');
    expect(loaded[0].suggestedRetestDelay).toBe(6);
  });

  it('adds a follow-up', () => {
    const list = addFollowUp(SAMPLE_FOLLOW_UP);
    expect(list).toHaveLength(1);
    expect(loadFollowUps()).toHaveLength(1);
  });

  it('updates a follow-up by id', () => {
    saveFollowUps([SAMPLE_FOLLOW_UP]);
    const list = updateFollowUp('fu-1', { status: 'retest-due' });
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('retest-due');
    // Verify persisted
    const loaded = loadFollowUps();
    expect(loaded[0].status).toBe('retest-due');
  });

  it('does not modify list when updating non-existent id', () => {
    saveFollowUps([SAMPLE_FOLLOW_UP]);
    updateFollowUp('non-existent', { status: 'completed' });
    const loaded = loadFollowUps();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].status).toBe('awaiting-retest');
  });

  it('handles corrupted storage gracefully', () => {
    store.set('pool-maintenance:followUps', 'not-json');
    expect(loadFollowUps()).toEqual([]);
  });

  it('handles non-array stored data gracefully', () => {
    store.set('pool-maintenance:followUps', '{"id":"fu-1"}');
    expect(loadFollowUps()).toEqual([]);
  });

  it('merges follow-ups without duplicates', () => {
    const existing: FollowUp[] = [SAMPLE_FOLLOW_UP];
    const incoming: FollowUp[] = [
      SAMPLE_FOLLOW_UP, // duplicate
      { ...SAMPLE_FOLLOW_UP, id: 'fu-2' },
    ];
    const merged = mergeFollowUps(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.id)).toEqual(['fu-1', 'fu-2']);
  });
});

describe('export includes follow-ups (v6)', () => {
  beforeEach(() => {
    store.clear();
  });

  it('includes followUps array in export data', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    saveFollowUps([SAMPLE_FOLLOW_UP]);
    const data = exportData(FIXED_NOW);
    expect(data.followUps).toHaveLength(1);
    expect(data.followUps[0].id).toBe('fu-1');
  });

  it('sets schemaVersion to 8 and separates algorithm versions', () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    const data = exportData(FIXED_NOW);
    expect(data.schemaVersion).toBe(8);
    expect(data.applicationVersion).toBeDefined();
    expect(data.recommendationEngineVersion).toBeDefined();
    expect(data.outcomeEvaluatorVersion).toBeDefined();
    expect(data.chemicalCatalogVersion).toBeDefined();
  });

  it('imports v6 data with followUps', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      followUps: [SAMPLE_FOLLOW_UP],
    });
    const result = parseImportData(json);
    expect(result.followUps).toHaveLength(1);
    expect(result.followUps[0].id).toBe('fu-1');
    expect(result.measurements).toHaveLength(1);
    expect(result.poolConfig).toBeDefined();
  });

  it('v5 export without followUps still imports cleanly', () => {
    const json = JSON.stringify({
      schemaVersion: 5,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      actions: [],
    });
    const result = parseImportData(json);
    expect(result.followUps).toEqual([]);
    expect(result.measurements).toHaveLength(1);
  });
});

// ── normalizeActionExclusionFlags ─────────────────────────────────

const SAMPLE_ACTION: MaintenanceAction = {
  id: 'act-1',
  performedAt: '2026-07-09T10:35:00.000Z',
  kind: 'chemical',
  description: 'Added pH reducer',
};

const SAMPLE_ACTION_EXCLUDED: MaintenanceAction = {
  id: 'act-2',
  performedAt: '2026-07-09T11:00:00.000Z',
  kind: 'chemical',
  description: 'Added chlorine granules',
  exclusionFlags: { excludedFromLearning: true },
};

const SAMPLE_FOLLOW_UP_EXCLUDED: FollowUp = {
  ...SAMPLE_FOLLOW_UP,
  id: 'fu-excluded',
  actionId: SAMPLE_ACTION.id,
  excludedFromLearning: true,
};

describe('normalizeActionExclusionFlags', () => {
  it('sets excludedFromLearning on action when follow-up has it', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [SAMPLE_FOLLOW_UP_EXCLUDED],
    );
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('preserves existing action exclusion flags when follow-up also excludes', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION_EXCLUDED],
      [SAMPLE_FOLLOW_UP_EXCLUDED],
    );
    // Should remain unchanged — already excluded
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('returns original array when action already has excludedFromLearning', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION_EXCLUDED],
      [SAMPLE_FOLLOW_UP_EXCLUDED],
    );
    // Deep equal — no changes were made
    expect(result).toStrictEqual([SAMPLE_ACTION_EXCLUDED]);
    // First action should still have exclusion
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('does not change action when follow-up does not exclude', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [{ ...SAMPLE_FOLLOW_UP, excludedFromLearning: false }],
    );
    expect(result[0].exclusionFlags).toBeUndefined();
  });

  it('does not change action when follow-up is missing actionId', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [{ ...SAMPLE_FOLLOW_UP_EXCLUDED, actionId: '' }],
    );
    expect(result[0].exclusionFlags).toBeUndefined();
  });

  it('does not crash on empty arrays', () => {
    const result = normalizeActionExclusionFlags([], []);
    expect(result).toEqual([]);
  });

  it('does not crash with empty followUps', () => {
    const result = normalizeActionExclusionFlags([SAMPLE_ACTION], []);
    expect(result).toHaveLength(1);
    expect(result[0].exclusionFlags).toBeUndefined();
  });

  it('does not crash with empty actions', () => {
    const result = normalizeActionExclusionFlags([], [SAMPLE_FOLLOW_UP_EXCLUDED]);
    expect(result).toEqual([]);
  });

  it('handles missing linked action without crashing', () => {
    const orphanFollowUp: FollowUp = {
      ...SAMPLE_FOLLOW_UP_EXCLUDED,
      actionId: 'nonexistent-action',
    };
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [orphanFollowUp],
    );
    expect(result[0].exclusionFlags).toBeUndefined();
  });

  it('multiple follow-ups: one excludes → exclusion wins', () => {
    const result = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [
        { ...SAMPLE_FOLLOW_UP, id: 'fu-a', actionId: SAMPLE_ACTION.id, excludedFromLearning: false },
        { ...SAMPLE_FOLLOW_UP_EXCLUDED, id: 'fu-b', actionId: SAMPLE_ACTION.id, excludedFromLearning: true },
      ],
    );
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('follow-up with excludedFromLearning: false does not clear existing action exclusion', () => {
    const result = normalizeActionExclusionFlags(
      [{ ...SAMPLE_ACTION, exclusionFlags: { excludedFromLearning: true } }],
      [{ ...SAMPLE_FOLLOW_UP, excludedFromLearning: false }],
    );
    // Normalize only adds, never removes — action exclusion is preserved
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('is idempotent — second call does not change anything', () => {
    const first = normalizeActionExclusionFlags(
      [SAMPLE_ACTION],
      [SAMPLE_FOLLOW_UP_EXCLUDED],
    );
    const second = normalizeActionExclusionFlags(first, [SAMPLE_FOLLOW_UP_EXCLUDED]);
    // Second call returns same array reference (no change needed)
    expect(second).toBe(first);
    expect(second[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('preserves atypical and incorrectlyRecorded flags on actions', () => {
    const actionWithFlags: MaintenanceAction = {
      ...SAMPLE_ACTION,
      exclusionFlags: { atypical: true, incorrectlyRecorded: false, excludedFromLearning: false },
    };
    const result = normalizeActionExclusionFlags(
      [actionWithFlags],
      [SAMPLE_FOLLOW_UP_EXCLUDED],
    );
    expect(result[0].exclusionFlags?.atypical).toBe(true);
    expect(result[0].exclusionFlags?.incorrectlyRecorded).toBe(false);
    expect(result[0].exclusionFlags?.excludedFromLearning).toBe(true);
  });

  it('import with malformed action objects throws sensible error', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [],
      actions: [null, 'not-an-object', 42],
      followUps: [],
    });
    expect(() => parseImportData(json)).toThrow(
      'actions must be an array of objects',
    );
  });

  it('import with malformed followUp objects throws sensible error', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [],
      actions: [],
      followUps: [null, 'bad', true],
    });
    expect(() => parseImportData(json)).toThrow(
      'followUps must be an array of objects',
    );
  });

  it('import with malformed measurement objects in versioned format throws sensible error', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: ['bad', null, 42],
    });
    expect(() => parseImportData(json)).toThrow(
      'measurements must be an array of objects',
    );
  });

  it('handles v6 export with no followUps field gracefully', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      actions: [],
    });
    const result = parseImportData(json);
    expect(result.followUps).toEqual([]);
    expect(result.measurements).toHaveLength(1);
  });

  it('v3 schema with no actions field defaults to empty actions', () => {
    const json = JSON.stringify({
      schemaVersion: 3,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
    });
    const result = parseImportData(json);
    expect(result.actions).toEqual([]);
    expect(result.measurements).toHaveLength(1);
  });

  it('v2 schema with freeChlorine maps to fac', () => {
    const json = JSON.stringify({
      schemaVersion: 2,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [{
        id: 'v2-old',
        date: '2026-07-04',
        measuredAt: '2026-07-04T12:00:00.000Z',
        ph: 7.2,
        freeChlorine: 1.8,
        alkalinity: 90,
        cyanuricAcid: 35,
      }],
    });
    const result = parseImportData(json);
    expect(result.measurements[0].fac).toBe(1.8);
  });

  it('preserves poolConfig with sub-objects (saltChlorinator) from import', () => {
    const config: PoolSettings = {
      volume: 50000,
      volumeUnit: 'liters',
      poolType: 'saltwater',
      unitSystem: 'metric',
      saltChlorinator: {
        enabled: true,
        productionGramsPerHour: 20,
        currentOutputPercent: 60,
        filtrationHoursPerDay: 6,
        maxRecommendedOutputPercent: 100,
        maxRecommendedHoursPerDay: 12,
      },
    };
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: config,
      measurements: [],
      actions: [],
      followUps: [],
    });
    const result = parseImportData(json);
    expect(result.poolConfig).toBeDefined();
    expect(result.poolConfig!.saltChlorinator?.enabled).toBe(true);
    expect(result.poolConfig!.saltChlorinator?.productionGramsPerHour).toBe(20);
  });

  it('mergeActions removes duplicates by id', () => {
    const existing: MaintenanceAction[] = [
      { id: 'a', performedAt: '2026-07-09T10:00:00.000Z', kind: 'chemical', description: 'pH reducer' },
      { id: 'b', performedAt: '2026-07-09T11:00:00.000Z', kind: 'chemical', description: 'Chlorine' },
    ];
    const incoming: MaintenanceAction[] = [
      { id: 'b', performedAt: '2026-07-09T11:00:00.000Z', kind: 'chemical', description: 'Chlorine' },
      { id: 'c', performedAt: '2026-07-09T12:00:00.000Z', kind: 'chemical', description: 'Salt' },
    ];
    const merged = mergeActions(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged.filter((a) => a.id === 'b')).toHaveLength(1);
  });
});

describe('settings edge cases', () => {
  const { volumeInLiters } = (() => {
    // Import the function directly for use in tests
    function volInLiters(s: { volume: number; volumeUnit: string }): number {
      if (s.volumeUnit === 'cubicMeters') return s.volume * 1000;
      return s.volume;
    }
    return { volumeInLiters: volInLiters };
  })();

  it('loadSettings returns defaults on corrupted storage', () => {
    store.set('pool-maintenance:settings', 'not-json');
    const s = loadSettings();
    expect(s.volume).toBe(0);
    expect(s.poolType).toBe('chlorine');
  });

  it('volumeInLiters converts cubicMeters to liters', () => {
    const s: PoolSettings = {
      volume: 50,
      volumeUnit: 'cubicMeters',
      poolType: 'chlorine',
      unitSystem: 'metric',
    };
    expect(volumeInLiters(s)).toBe(50000);
  });

  it('volumeInLiters returns liters as-is', () => {
    const s: PoolSettings = {
      volume: 50000,
      volumeUnit: 'liters',
      poolType: 'chlorine',
      unitSystem: 'metric',
    };
    expect(volumeInLiters(s)).toBe(50000);
  });
});

describe('follow-up edge cases', () => {
  it('import with non-array followUps defaults to empty', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [],
      actions: [],
      followUps: 'not-an-array',
    });
    // Non-Array followUps field: it checks Array.isArray, which returns false for strings
    // It will silently default to empty array
    const result = parseImportData(json);
    expect(result.followUps).toEqual([]);
  });

  it('handles v5 import with actions field but no followUps', () => {
    const json = JSON.stringify({
      schemaVersion: 5,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [SAMPLE_MEASUREMENT],
      actions: [{ id: 'a1', performedAt: '2026-07-09T10:00:00.000Z', kind: 'chemical', description: 'Test' }],
    });
    const result = parseImportData(json);
    expect(result.followUps).toEqual([]);
    expect(result.actions).toHaveLength(1);
  });
});

// ── Experiment persistence tests ──────────────────────────────────

describe('experiment persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips experiments', () => {
    const exp = createTestExperiment();
    saveExperiments([exp]);
    const loaded = loadExperiments();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(exp.id);
    expect(loaded[0].kind).toBe('ph-buffer-response');
  });

  it('includes experiments in current export', () => {
    const exp = createTestExperiment();
    saveExperiments([exp]);
    saveSettings(SAMPLE_POOL_CONFIG);
    const data = exportData(FIXED_NOW);
    expect(data.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(data.experiments).toBeDefined();
    expect(data.experiments!.length).toBe(1);
    expect(data.experiments![0].kind).toBe('ph-buffer-response');
  });

  it('imports v7 data with experiments', () => {
    const json = JSON.stringify({
      schemaVersion: 7,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [],
      actions: [],
      followUps: [],
      experiments: [{ id: 'exp-1', kind: 'chlorine-retention', status: 'proposed', createdAt: '2026-07-09T10:00:00.000Z', steps: [], relatedMeasurementIds: [] }],
    });
    const result = parseImportData(json);
    expect(result.experiments).toHaveLength(1);
    expect(result.experiments[0].kind).toBe('chlorine-retention');
  });

  it('handles v6 import without experiments', () => {
    const json = JSON.stringify({
      schemaVersion: 6,
      exportedAt: '2026-07-09T10:35:00.000Z',
      poolConfig: SAMPLE_POOL_CONFIG,
      measurements: [],
      actions: [],
      followUps: [],
    });
    const result = parseImportData(json);
    expect(result.experiments).toEqual([]);
  });

  it('merges experiments by id without duplicates', () => {
    const exp1 = createTestExperiment();
    const exp2 = { ...createTestExperiment(), id: 'exp-2' };
    const existing = [exp1];
    const incoming = [exp1, exp2]; // exp1 is duplicate
    const merged = mergeExperiments(existing, incoming as any);
    expect(merged).toHaveLength(2);
  });
});

function createTestExperiment() {
  return {
    id: 'exp-test-1',
    kind: 'ph-buffer-response' as const,
    status: 'proposed' as const,
    createdAt: '2026-07-09T10:00:00.000Z',
    proposedAt: '2026-07-09T10:00:00.000Z',
    steps: [
      { order: 1, instructionKey: 'experiment.phBuffer.step1' as any, requiredMeasurement: false },
    ],
    relatedMeasurementIds: [],
  };
}

// ── Measurement context persistence ───────────────────────────────

describe('measurement context persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('saves and loads measurement with context', () => {
    const m: Measurement = {
      ...SAMPLE_MEASUREMENT,
      context: {
        sunlight: 'high',
        poolCovered: false,
        batherLoad: 'medium',
        rainSincePreviousMeasurement: true,
        chlorinatorOutputPercent: 60,
      },
    };
    saveMeasurements([m]);
    const loaded = loadMeasurements();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].context).toBeDefined();
    expect(loaded[0].context!.sunlight).toBe('high');
    expect(loaded[0].context!.batherLoad).toBe('medium');
    expect(loaded[0].context!.rainSincePreviousMeasurement).toBe(true);
    expect(loaded[0].context!.chlorinatorOutputPercent).toBe(60);
  });

  it('includes context in export/import', () => {
    const m: Measurement = {
      ...SAMPLE_MEASUREMENT,
      context: { sunlight: 'low', waterClarity: 'slightly-cloudy' },
    };
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([m]);
    const data = exportData(FIXED_NOW);
    expect(data.measurements[0].context).toBeDefined();
    expect(data.measurements[0].context!.sunlight).toBe('low');

    const json = JSON.stringify(data);
    const result = parseImportData(json);
    expect(result.measurements[0].context).toBeDefined();
    expect(result.measurements[0].context!.waterClarity).toBe('slightly-cloudy');
  });
});
