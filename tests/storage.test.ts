import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSettings,
  saveSettings,
  loadMeasurements,
  saveMeasurements,
  addMeasurement,
  deleteMeasurement,
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
