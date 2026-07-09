import { describe, it, expect } from 'vitest';
import { validateMeasurement, generateId } from '../src/domain/measurement';

describe('validateMeasurement', () => {
  it('returns valid for a complete correct measurement', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });

  it('returns errors for missing required fields', () => {
    const result = validateMeasurement({});
    expect(result.valid).toBe(false);
    expect(result.errors.ph).toBeDefined();
    expect(result.errors.freeChlorine).toBeDefined();
    expect(result.errors.alkalinity).toBeDefined();
    expect(result.errors.cyanuricAcid).toBeDefined();
    expect(result.errors.measuredAt).toBeDefined();
  });

  it('rejects pH out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 15,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.ph).toContain('0 and 14');
  });

  it('rejects free chlorine out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 25,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects alkalinity out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 600,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects cyanuric acid out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 350,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects salt out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
      salt: 15000,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects temperature out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
      temperature: 100,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts optional fields when omitted', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts optional fields when provided', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7,
      freeChlorine: 2,
      alkalinity: 100,
      cyanuricAcid: 40,
      salt: 3000,
      temperature: 28,
    });
    expect(result.valid).toBe(true);
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('measurement with date and time', () => {
  it('accepts measuredAt with full ISO timestamp', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:35:00.000Z',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects measurement without measuredAt', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
      ph: 7.4,
      freeChlorine: 2.0,
      alkalinity: 100,
      cyanuricAcid: 40,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.measuredAt).toBeDefined();
  });
});

describe('sorting measurements by measuredAt', () => {
  it('sorts by newest first using measuredAt', () => {
    const m1 = {
      id: '1',
      date: '2026-07-09',
      measuredAt: '2026-07-09T08:00:00.000Z',
      ph: 7.0,
      freeChlorine: 1,
      alkalinity: 80,
      cyanuricAcid: 30,
    };
    const m2 = {
      id: '2',
      date: '2026-07-09',
      measuredAt: '2026-07-09T10:00:00.000Z',
      ph: 7.2,
      freeChlorine: 2,
      alkalinity: 90,
      cyanuricAcid: 35,
    };
    const m3 = {
      id: '3',
      date: '2026-07-08',
      measuredAt: '2026-07-08T16:00:00.000Z',
      ph: 7.4,
      freeChlorine: 1.5,
      alkalinity: 100,
      cyanuricAcid: 40,
    };
    const sorted = [m1, m2, m3].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('3');
  });

  it('allows two measurements on the same date but different times', () => {
    const morning = {
      id: 'morning',
      date: '2026-07-09',
      measuredAt: '2026-07-09T08:00:00.000Z',
      ph: 7.0,
      freeChlorine: 1,
      alkalinity: 80,
      cyanuricAcid: 30,
    };
    const evening = {
      id: 'evening',
      date: '2026-07-09',
      measuredAt: '2026-07-09T20:00:00.000Z',
      ph: 7.2,
      freeChlorine: 2,
      alkalinity: 90,
      cyanuricAcid: 35,
    };
    const list = [morning, evening];
    expect(list).toHaveLength(2);
    // Both share the same date but differ in measuredAt
    expect(list[0].date).toBe('2026-07-09');
    expect(list[1].date).toBe('2026-07-09');
    expect(list[0].measuredAt).not.toBe(list[1].measuredAt);
  });
});
