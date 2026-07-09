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
    date: '2026-07-09',
    measuredAt: '2026-07-09T10:35:00.000Z',
    ph: 7.4,
    freeChlorine: 2.0,
    alkalinity: 100,
    cyanuricAcid: 40,
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
    const r = getTargetRange('freeChlorine', 'chlorine');
    expect(r.min).toBe(1);
    expect(r.max).toBe(3);
  });

  it('returns saltwater range for saltwater pools', () => {
    const r = getTargetRange('freeChlorine', 'saltwater');
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

  it('recommends chlorine when free chlorine is low', () => {
    const result = calculateRecommendations(
      makeMeasurement({ freeChlorine: 0.5 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.includes('hypochlorite'));
    expect(clItem).toBeDefined();
    expect(clItem!.amountGrams).toBeGreaterThan(0);
  });

  it('flags warning-level danger when free chlorine is 0', () => {
    const result = calculateRecommendations(
      makeMeasurement({ freeChlorine: 0 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.includes('hypochlorite'));
    expect(clItem).toBeDefined();
    expect(clItem!.danger?.label).toBe('warning');
  });

  it('shows no-adjustment-needed for chlorine above target', () => {
    const result = calculateRecommendations(
      makeMeasurement({ freeChlorine: 5 }),
      makeSettings(),
    );
    const clItem = result.items.find((i) => i.chemical.startsWith('—'));
    expect(clItem).toBeDefined();
    expect(clItem!.amount).toBe('None needed');
  });

  it('recommends sodium bicarbonate for low alkalinity', () => {
    const result = calculateRecommendations(
      makeMeasurement({ alkalinity: 50 }),
      makeSettings(),
    );
    const item = result.items.find((i) => i.chemical.includes('bicarbonate'));
    expect(item).toBeDefined();
    expect(item!.amountGrams).toBeGreaterThan(0);
  });

  it('recommends cyanuric acid for low CYA', () => {
    const result = calculateRecommendations(
      makeMeasurement({ cyanuricAcid: 10 }),
      makeSettings(),
    );
    const item = result.items.find((i) => i.chemical.includes('Cyanuric'));
    expect(item).toBeDefined();
    expect(item!.amountGrams).toBeGreaterThan(0);
  });

  it('recommends partial drain for high CYA', () => {
    const result = calculateRecommendations(
      makeMeasurement({ cyanuricAcid: 150 }),
      makeSettings(),
    );
    const item = result.items.find((i) => i.amount === 'Partial drain & refill');
    expect(item).toBeDefined();
    expect(item!.reason).toContain('Cyanuric');
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
      makeMeasurement({ salt: undefined }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const item = result.items.find((i) => i.chemical.includes('salt'));
    expect(item).toBeUndefined();
  });

  it('returns empty items when all values are in range', () => {
    const result = calculateRecommendations(makeMeasurement(), makeSettings());
    // pH 7.4, FC 2.0, Alk 100, CYA 40 are all ideal — no items needed
    expect(result.items.length).toBe(0);
  });
});
