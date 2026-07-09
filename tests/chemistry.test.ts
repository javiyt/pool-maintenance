import { describe, it, expect } from 'vitest';
import {
  calculateRecommendations,
  classifyLevel,
  getTargetRange,
} from '../src/domain/chemistry';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';

function makeMeasurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 'test-1',
    measuredAt: '2026-07-09T10:35:00.000Z',
    ph: 7.4,
    ec: 6640,
    tds: 3230,
    salt: 3380,
    orp: 672,
    fac: 2.0,
    temperature: 31.0,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<PoolSettings> = {}): PoolSettings {
  return {
    volume: 10000,
    volumeUnit: 'liters',
    poolType: 'chlorine',
    unitSystem: 'metric',
    ...overrides,
  };
}

describe('getTargetRange', () => {
  it('returns chlorine range for chlorine pools', () => {
    const r = getTargetRange('fac', 'chlorine');
    expect(r.min).toBe(1);
    expect(r.max).toBe(3);
  });

  it('returns saltwater range for saltwater pools', () => {
    const r = getTargetRange('fac', 'saltwater');
    expect(r.min).toBe(3);
    expect(r.max).toBe(5);
  });

  it('returns default range for unknown field', () => {
    const r = getTargetRange('unknown', 'chlorine');
    expect(r.min).toBe(7.2);
  });
});

describe('classifyLevel', () => {
  it('returns ok for values within range', () => {
    expect(classifyLevel(7.4, getTargetRange('ph', 'chlorine')).label).toBe('ok');
  });

  it('returns warning for values slightly outside range', () => {
    expect(classifyLevel(7.9, getTargetRange('ph', 'chlorine')).label).toBe('warning');
  });

  it('returns danger for far-off values', () => {
    expect(classifyLevel(1, getTargetRange('ph', 'chlorine')).label).toBe('danger');
  });

  it('returns danger for negative values', () => {
    expect(classifyLevel(-5, getTargetRange('ph', 'chlorine')).label).toBe('danger');
  });
});

describe('calculateRecommendations', () => {
  it('returns canCalculate=false when pH is missing', () => {
    const m = makeMeasurement({ ph: undefined as unknown as number });
    const result = calculateRecommendations(m, makeSettings());
    expect(result.canCalculate).toBe(false);
    expect(result.missingReason).toContain('pH');
  });

  it('returns canCalculate=false when FAC is missing', () => {
    const m = makeMeasurement({ fac: undefined as unknown as number });
    const result = calculateRecommendations(m, makeSettings());
    expect(result.canCalculate).toBe(false);
    expect(result.missingReason).toContain('FAC');
  });

  it('returns canCalculate=false when volume is 0', () => {
    const result = calculateRecommendations(makeMeasurement(), makeSettings({ volume: 0 }));
    expect(result.canCalculate).toBe(false);
    expect(result.missingReason).toContain('volume');
  });

  it('recommends sodium bisulfate when pH is high', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings(),
    );
    expect(result.items.length).toBeGreaterThan(0);
    const phItem = result.items.find((i) => i.chemical.includes('bisulfate'));
    expect(phItem).toBeDefined();
    expect(phItem!.amountGrams).toBeGreaterThan(0);
  });

  it('recommends sodium carbonate when pH is low', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.0 }),
      makeSettings(),
    );
    const phItem = result.items.find((i) => i.chemical.includes('carbonate'));
    expect(phItem).toBeDefined();
    expect(phItem!.amountGrams).toBeGreaterThan(0);
  });

  it('recommends chlorine when FAC is low', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 0.5 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.includes('hypochlorite'));
    expect(clItem).toBeDefined();
    expect(clItem!.amountGrams).toBeGreaterThan(0);
  });

  it('flags danger-level when FAC is 0', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 0 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.includes('hypochlorite'));
    expect(clItem).toBeDefined();
    expect(clItem!.danger?.label).toBe('warning');
  });

  it('shows no-adjustment-needed for FAC above target', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 5 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.startsWith('—'));
    expect(clItem).toBeDefined();
    expect(clItem!.amount).toBe('None needed');
  });

  it('recommends salt for saltwater pools with low salt', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: 1500 }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const item = result.items.find((i) => i.chemical.includes('salt'));
    expect(item).toBeDefined();
    expect(item!.amount).toContain('kg');
  });

  it('does not recommend salt for saltwater pools when salt is missing', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: undefined as unknown as number }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const item = result.items.find((i) => i.chemical.includes('salt'));
    expect(item).toBeUndefined();
  });

  it('returns empty items when all values are in range', () => {
    const result = calculateRecommendations(makeMeasurement(), makeSettings());
    expect(result.items.length).toBe(0);
  });

  it('adds ORP warning when ORP is below target', () => {
    const result = calculateRecommendations(
      makeMeasurement({ orp: 400 }),
      makeSettings(),
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('ORP'))).toBe(true);
  });
});
