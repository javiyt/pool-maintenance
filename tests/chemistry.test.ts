import { describe, it, expect } from 'vitest';
import {
  classifyLevel,
  getTargetRange,
} from '../src/domain/chemistry';
import { CATALOG, getProductById } from '../src/domain/chemicalCatalog';

// ── Chemical Catalog Tests ────────────────────────────────────────

describe('chemical catalog', () => {
  it('has all six generic products', () => {
    expect(CATALOG).toHaveLength(6);
    const ids = CATALOG.map((p) => p.id).sort();
    expect(ids).toEqual([
      'chlorine-granules',
      'chlorine-stabilizer',
      'ph-increaser-liquid',
      'ph-reducer-liquid',
      'pool-salt',
      'total-alkalinity-reducer',
    ]);
  });

  it('contains no commercial brand names', () => {
    const brandNames = ['tamar', 'piscimar', 'piscilimp', 'ecl tamar'];
    const allText = JSON.stringify(CATALOG).toLowerCase();
    for (const brand of brandNames) {
      expect(allText).not.toContain(brand);
    }
  });

  it('pH reducer has expected generic name and dosage rule', () => {
    const product = getProductById('ph-reducer-liquid')!;
    expect(product.genericName).toBe('Reductor de pH líquido');
    expect(product.mainComponent).toBe('Ácido reductor de pH');
    expect(product.dosageRule).toBeDefined();
    expect(product.dosageRule!.amount).toBe(750);
    expect(product.dosageRule!.amountUnit).toBe('ml');
    expect(product.dosageRule!.perVolumeM3).toBe(50);
    expect(product.dosageRule!.changesValueBy).toBe(0.1);
  });

  it('pH increaser has expected generic name and dosage rule', () => {
    const product = getProductById('ph-increaser-liquid')!;
    expect(product.genericName).toBe('Incrementador de pH líquido');
    expect(product.mainComponent).toBe('Base alcalina incrementadora de pH');
    expect(product.dosageRule).toBeDefined();
    expect(product.dosageRule!.amount).toBe(1000);
    expect(product.dosageRule!.amountUnit).toBe('ml');
  });

  it('chlorine granules define available chlorine concentration instead of fixed shock dose', () => {
    const product = getProductById('chlorine-granules')!;
    expect(product.genericName).toBe('Cloro granulado');
    expect(product.mainComponent).toBe('Cloro de disolución rápida');
    expect(product.dosageRule).toBeDefined();
    expect(product.availableChlorinePercent).toBe(55);
    expect(product.dosageRule!.changesValueBy).toBe(1);
  });

  it('stabilizer has limitation requiring cyanuric acid', () => {
    const product = getProductById('chlorine-stabilizer')!;
    expect(product.limitations.length).toBeGreaterThan(0);
    expect(product.limitations.some((l) => l.toLowerCase().includes('ácido cianúrico'))).toBe(true);
    expect(product.limitations.some((l) => l.toLowerCase().includes('medición manual'))).toBe(true);
  });

  it('alkalinity reducer has limitation requiring total alkalinity', () => {
    const product = getProductById('total-alkalinity-reducer')!;
    expect(product.limitations.length).toBeGreaterThan(0);
    expect(product.limitations.some((l) => l.toLowerCase().includes('alcalinidad'))).toBe(true);
    expect(product.limitations.some((l) => l.toLowerCase().includes('medición manual'))).toBe(true);
  });

  it('pool salt applies only to saltwater pools', () => {
    const product = getProductById('pool-salt')!;
    expect(product.appliesTo).toEqual(['saltwater']);
  });
});

// ── Target Range Tests ────────────────────────────────────────────

describe('getTargetRange', () => {
  it('returns chlorine FAC range for chlorine pools', () => {
    const r = getTargetRange('fac', 'chlorine');
    expect(r.min).toBe(1.0);
    expect(r.max).toBe(3.0);
  });

  it('returns saltwater FAC range for saltwater pools', () => {
    const r = getTargetRange('fac', 'saltwater');
    expect(r.min).toBe(0.8);
    expect(r.max).toBe(2.5);
  });

  it('returns default range for unknown field', () => {
    const r = getTargetRange('unknown', 'chlorine');
    expect(r.min).toBe(7.2);
  });
});

// ── Danger Level Tests ────────────────────────────────────────────

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
