import { describe, it, expect } from 'vitest';
import { validateMeasurement, generateId } from '../src/domain/measurement';

const BASE = {
  measuredAt: '2026-07-09T10:35:00.000Z',
  ph: 7.4,
  ec: 6640,
  tds: 3230,
  salt: 3380,
  orp: 672,
  fac: 0.8,
  temperature: 31.0,
};

describe('validateMeasurement', () => {
  it('returns valid for a complete correct measurement', () => {
    const result = validateMeasurement(BASE);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors).length).toBe(0);
  });

  it('returns errors for missing all fields', () => {
    const result = validateMeasurement({});
    expect(result.valid).toBe(false);
    expect(result.errors.ph).toBeDefined();
    expect(result.errors.ec).toBeDefined();
    expect(result.errors.tds).toBeDefined();
    expect(result.errors.salt).toBeDefined();
    expect(result.errors.orp).toBeDefined();
    expect(result.errors.fac).toBeDefined();
    expect(result.errors.temperature).toBeDefined();
    expect(result.errors.measuredAt).toBeDefined();
  });

  it('rejects pH out of range', () => {
    const result = validateMeasurement({ ...BASE, ph: 15 });
    expect(result.valid).toBe(false);
    expect(result.errors.ph).toContain('0 and 14');
  });

  it('rejects EC of zero', () => {
    const result = validateMeasurement({ ...BASE, ec: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.ec).toContain('positive');
  });

  it('rejects TDS of zero', () => {
    const result = validateMeasurement({ ...BASE, tds: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.tds).toContain('positive');
  });

  it('rejects salt of zero', () => {
    const result = validateMeasurement({ ...BASE, salt: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.salt).toContain('positive');
  });

  it('rejects ORP of zero', () => {
    const result = validateMeasurement({ ...BASE, orp: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.orp).toContain('positive');
  });

  it('rejects negative FAC', () => {
    const result = validateMeasurement({ ...BASE, fac: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.fac).toContain('zero or a positive');
  });

  it('accepts zero FAC', () => {
    const result = validateMeasurement({ ...BASE, fac: 0 });
    expect(result.valid).toBe(true);
  });

  it('rejects temperature out of range', () => {
    const result = validateMeasurement({ ...BASE, temperature: 100 });
    expect(result.valid).toBe(false);
    expect(result.errors.temperature).toContain('-10 and 60');
  });

  it('rejects measurement without measuredAt', () => {
    const result = validateMeasurement({ ...BASE, measuredAt: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.measuredAt).toBeDefined();
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

describe('sorting measurements by measuredAt', () => {
  it('sorts by newest first using measuredAt', () => {
    const m1 = { id: '1', ...BASE, measuredAt: '2026-07-09T08:00:00.000Z' };
    const m2 = { id: '2', ...BASE, measuredAt: '2026-07-09T10:00:00.000Z' };
    const m3 = { id: '3', ...BASE, measuredAt: '2026-07-08T16:00:00.000Z' };
    const sorted = [m1, m2, m3].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('3');
  });

  it('allows two measurements on the same date but different times', () => {
    const morning = { id: 'morning', ...BASE, measuredAt: '2026-07-09T08:00:00.000Z' };
    const evening = { id: 'evening', ...BASE, measuredAt: '2026-07-09T20:00:00.000Z' };
    const list = [morning, evening];
    expect(list).toHaveLength(2);
    expect(list[0].measuredAt).toBe('2026-07-09T08:00:00.000Z');
    expect(list[1].measuredAt).toBe('2026-07-09T20:00:00.000Z');
  });
});
