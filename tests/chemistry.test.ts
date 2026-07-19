import { describe, it, expect } from 'vitest';
import {
  classifyLevel,
  getTargetRange,
} from '../src/domain/chemistry';
import { CATALOG, getProductById, getProductsByCategory } from '../src/domain/chemicalCatalog';

// ── Chemical Catalog Tests ────────────────────────────────────────

describe('chemical catalog', () => {
  it('keeps the recommendation products while exposing a broad open catalog', () => {
    const ids = CATALOG.map((p) => p.id).sort();
    expect(CATALOG.length).toBeGreaterThan(100);
    expect(ids).toEqual(expect.arrayContaining([
      'chlorine-granules',
      'chlorine-stabilizer',
      'ph-increaser-liquid',
      'ph-reducer-liquid',
      'pool-salt',
      'total-alkalinity-reducer',
    ]));
  });

  it('covers the initial functional categories from the normalized pool product catalog', () => {
    const categories = Array.from(new Set(CATALOG.flatMap((p) => [p.primaryCategory, ...p.secondaryCategories])));
    expect(categories).toEqual(expect.arrayContaining([
      'chlorine-disinfection',
      'non-chlorine-disinfection',
      'ph-regulation',
      'alkalinity',
      'calcium-hardness',
      'cyanuric-acid',
      'salt-system',
      'algaecide',
      'clarifier',
      'flocculant',
      'metals-stains',
      'nutrients',
      'chemical-cover',
      'winterizing',
      'surface-cleaning',
      'filter-cleaning',
      'equipment-cleaning',
      'neutralizer',
      'multifunction',
      'spa',
      'measurement-consumable',
    ]));
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
    expect(product.stabilizedChlorine).toBe(true);
    expect(product.mayAffect?.some((effect) => effect.parameter === 'cya')).toBe(true);
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

  it('does not model all chlorine products as chemically equivalent', () => {
    const sodium = getProductById('sodium-hypochlorite')!;
    const calcium = getProductById('calcium-hypochlorite')!;
    const dichlor = getProductById('dichlor')!;
    expect(sodium.physicalForm).toBe('liquid');
    expect(calcium.mayAffect?.some((effect) => effect.parameter === 'calcium-hardness')).toBe(true);
    expect(dichlor.stabilizedChlorine).toBe(true);
    expect(dichlor.mayAffect?.some((effect) => effect.parameter === 'cya')).toBe(true);
  });

  it('supports multifunction products with multiple functions without inferring components', () => {
    const product = getProductById('multiaction-tablet')!;
    expect(product.functions).toEqual(expect.arrayContaining([
      'sanitation',
      'algae-prevention',
      'clarification',
      'stabilization',
    ]));
    expect(product.mainComponent).toBe('Componentes múltiples no especificados');
    expect(product.evaluationEligibility).toBe('conditionally-evaluable');
  });

  it('separates surface, filter, equipment, water and measurement consumable targets', () => {
    expect(getProductById('waterline-cleaner')!.applicationTarget).toBe('waterline');
    expect(getProductById('sand-filter-cleaner')!.applicationTarget).toBe('filter');
    expect(getProductById('pipe-cleaner')!.applicationTarget).toBe('plumbing');
    expect(getProductById('test-reagent')!.applicationTarget).toBe('other');
    expect(getProductById('chemical-pool-cover')!.evaluationEligibility).toBe('not-evaluable');
  });

  it('keeps commercial units as units rather than invented conversions', () => {
    const tablets = getProductById('chlorine-tablets')!;
    const liquid = getProductById('liquid-pool-cover')!;
    expect(tablets.allowedUnits).toEqual(expect.arrayContaining(['tablet', 'tablets', 'pastilla']));
    expect(liquid.allowedUnits).toEqual(expect.arrayContaining(['ml', 'cl', 'l', 'tapon', 'dosis']));
    expect(liquid.manufacturerDosage?.unitEquivalences).toBeUndefined();
  });

  it('can search by primary or secondary category', () => {
    expect(getProductsByCategory('salt-system').map((p) => p.id)).toEqual(expect.arrayContaining([
      'pool-salt',
      'cell-cleaner',
    ]));
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
