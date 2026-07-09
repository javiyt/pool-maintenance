import { describe, it, expect } from 'vitest';
import { validateMeasurement, generateId } from '../src/domain/measurement';

describe('validateMeasurement', () => {
  it('returns valid for a complete correct measurement', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
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
    expect(result.errors.date).toBeDefined();
  });

  it('rejects pH out of range', () => {
    const result = validateMeasurement({
      date: '2026-07-09',
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
