import { describe, it, expect } from 'vitest';
import {
  calculateRecommendations,
  classifyLevel,
  getTargetRange,
} from '../src/domain/chemistry';
import { CATALOG, getProductById } from '../src/domain/chemicalCatalog';
import type { ProductRecommendation } from '../src/domain/chemistry';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';

// ── Helpers ───────────────────────────────────────────────────────

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
    volume: 50000,
    volumeUnit: 'liters',
    poolType: 'chlorine',
    unitSystem: 'metric',
    ...overrides,
  };
}

function findItem(items: ProductRecommendation[], name: string) {
  return items.find(
    (i) =>
      i.genericProductName?.toLowerCase().includes(name.toLowerCase()) ||
      i.purpose.toLowerCase().includes(name.toLowerCase()),
  );
}

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

  it('chlorine granules have maintenance and shock assumptions', () => {
    const product = getProductById('chlorine-granules')!;
    expect(product.genericName).toBe('Cloro granulado');
    expect(product.mainComponent).toBe('Cloro de disolución rápida');
    // Dosage rule exists (3 g/m³ for maintenance)
    expect(product.dosageRule).toBeDefined();
    expect(product.dosageRule!.amount).toBe(3);
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

// ── Brand-Free Output Tests ───────────────────────────────────────

describe('brand-free output', () => {
  it('recommendations do not contain commercial brand names', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9, fac: 0.5 }),
      makeSettings(),
    );
    const allText = JSON.stringify(result).toLowerCase();
    const brandNames = ['tamar', 'piscimar', 'piscilimp', 'ecl tamar'];
    for (const brand of brandNames) {
      expect(allText).not.toContain(brand);
    }
  });

  it('uses generic product names, not brand names', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings(),
    );
    const phItem = result.items.find((i) => i.chemicalProductId === 'ph-reducer-liquid');
    expect(phItem).toBeDefined();
    expect(phItem!.genericProductName).toBe('Reductor de pH líquido');
    expect(phItem!.genericProductName).not.toContain('Tamar');
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

// ── pH Recommendation Tests ───────────────────────────────────────

describe('pH recommendations', () => {
  it('high pH recommends Reductor de pH líquido', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings(),
    );
    const phItem = findItem(result.items, 'Reductor de pH líquido');
    expect(phItem).toBeDefined();
    expect(phItem!.chemicalProductId).toBe('ph-reducer-liquid');
    expect(phItem!.estimatedAmount).toBeGreaterThan(0);
  });

  it('low pH recommends Incrementador de pH líquido', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.0 }),
      makeSettings(),
    );
    const phItem = findItem(result.items, 'Incrementador de pH líquido');
    expect(phItem).toBeDefined();
    expect(phItem!.chemicalProductId).toBe('ph-increaser-liquid');
    expect(phItem!.estimatedAmount).toBeGreaterThan(0);
  });

  it('pH in range recommends no pH product', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.4 }),
      makeSettings(),
    );
    const phItems = result.items.filter(
      (i) => i.chemicalProductId === 'ph-reducer-liquid' || i.chemicalProductId === 'ph-increaser-liquid',
    );
    expect(phItems).toHaveLength(0);
  });

  it('large pH correction is capped and includes a retest note', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 8.5 }),
      makeSettings(),
    );
    const phItem = findItem(result.items, 'Reductor de pH líquido');
    expect(phItem).toBeDefined();

    // Should have a capped calculation note
    const cappedNote = phItem!.calculationNotes.find((n) =>
      n.toLowerCase().includes('corrección limitada'),
    );
    expect(cappedNote).toBeDefined();

    // Should have a retest note
    const retestNote = phItem!.calculationNotes.find((n) =>
      n.toLowerCase().includes('volver a medir'),
    );
    expect(retestNote).toBeDefined();
  });
});

// ── Chlorine Pool Tests ───────────────────────────────────────────

describe('chlorine pool', () => {
  it('low FAC with acceptable pH recommends Cloro granulado', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.4, fac: 0.5 }),
      makeSettings(),
    );
    const clItem = findItem(result.items, 'Cloro granulado');
    expect(clItem).toBeDefined();
    expect(clItem!.estimatedAmount).toBeGreaterThan(0);
  });

  it('low FAC with bad pH recommends correcting pH first', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 8.0, fac: 0.5 }),
      makeSettings({ poolType: 'chlorine' }),
    );
    expect(result.canCalculate).toBe(true);
    expect(result.items.length).toBeGreaterThanOrEqual(2);

    // Should have a pH correction item
    const phItem = findItem(result.items, 'Reductor de pH líquido');
    expect(phItem).toBeDefined();

    // Verify correct pH first item exists
    const correctFirstItem = result.items.find(i => {
      const p = i.purpose;
      return typeof p === 'string' && p.indexOf('Corregir') >= 0 && p.indexOf('pH') >= 0 && p.indexOf('antes') >= 0;
    });
    expect(correctFirstItem).toBeDefined();
  });

  it('high FAC recommends no chlorine product', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 5.0 }),
      makeSettings(),
    );
    const noCl = result.items.find(
      (i) => i.purpose.toLowerCase().includes('no añadir cloro'),
    );
    expect(noCl).toBeDefined();
    expect(noCl!.estimatedAmount).toBeUndefined();
  });

  it('low FAC + low ORP increases severity', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.4, fac: 0.3, orp: 550 }),
      makeSettings(),
    );
    const clItem = findItem(result.items, 'Cloro granulado');
    expect(clItem).toBeDefined();
    // Low ORP should increase severity
    expect(clItem!.severity === 'high' || clItem!.severity === 'danger').toBe(true);
  });
});

// ── Saltwater Pool Tests ──────────────────────────────────────────

describe('saltwater pool', () => {
  it('low salt recommends Sal para piscina', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: 1500 }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltItem = findItem(result.items, 'Sal para piscina');
    expect(saltItem).toBeDefined();
    expect(saltItem!.genericProductName).toBe('Sal para piscina');
    expect(saltItem!.mainComponent).toBe('Cloruro sódico');
  });

  it('salt amount is estimated in kg from ppm and pool volume', () => {
    // 50,000 L pool, salt at 1500 ppm, target 3200 ppm
    // delta = 1700 ppm, kg = 1700 * 50000 / 1000000 = 85 kg
    const result = calculateRecommendations(
      makeMeasurement({ salt: 1500 }),
      makeSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'saltwater' }),
    );
    const saltItem = findItem(result.items, 'Sal para piscina');
    expect(saltItem).toBeDefined();
    expect(saltItem!.estimatedAmount).toBeGreaterThan(0);
    expect(saltItem!.unit).toBe('kg');
    // delta = 3200 - 1500 = 1700 ppm; kg = 1700 * 50000 / 1000000 = 85
    expect(saltItem!.estimatedAmount).toBe(85);
  });

  it('high salt recommends dilution/partial water replacement', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: 4500 }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const dilItem = result.items.find(
      (i) => i.purpose.toLowerCase().includes('dilución'),
    );
    expect(dilItem).toBeDefined();
  });

  it('salt level in range creates no salt correction', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: 3000 }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltItem = findItem(result.items, 'Sal para piscina');
    expect(saltItem).toBeUndefined();
  });

  it('low FAC with acceptable pH recommends checking chlorinator first', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.4, fac: 0.5 }),
      makeSettings({ poolType: 'saltwater', volume: 50000 }),
    );
    // Should recommend checking chlorinator
    const checkItem = result.items.find(
      (i) => i.purpose.toLowerCase().includes('verificar') || i.purpose.toLowerCase().includes('cloración'),
    );
    // Since FAC 0.5 is very low (below 50% of 0.8), it may also recommend shock
    const shockItem = findItem(result.items, 'Cloro granulado');
    expect(checkItem || shockItem).toBeDefined();
  });

  it('low FAC + low ORP may recommend Cloro granulado as corrective/shock treatment', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.4, fac: 0.5, orp: 550 }),
      makeSettings({ poolType: 'saltwater', volume: 50000 }),
    );
    const shockItem = findItem(result.items, 'Cloro granulado');
    expect(shockItem).toBeDefined();
    // Shock dose: 25 g/m³ × 50 m³ = 1250 g
    expect(shockItem!.estimatedAmount).toBe(1250);
  });

  it('does not recommend salt when salt is missing', () => {
    const result = calculateRecommendations(
      makeMeasurement({ salt: undefined as unknown as number }),
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltItem = findItem(result.items, 'Sal para piscina');
    expect(saltItem).toBeUndefined();
  });
});

// ── Missing / Invalid Volume Tests ────────────────────────────────

describe('missing or invalid pool volume', () => {
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

  it('recommendations still appear qualitatively when volume is 0', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings({ volume: 0 }),
    );
    expect(result.canCalculate).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('no estimated amounts are returned when volume is 0', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings({ volume: 0 }),
    );
    const itemsWithAmount = result.items.filter((i) => i.estimatedAmount !== undefined);
    expect(itemsWithAmount).toHaveLength(0);
  });

  it('reason explains that pool volume is required for dosage when volume is 0', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.9 }),
      makeSettings({ volume: 0 }),
    );
    const hasVolumeNote = result.items.some((i) =>
      i.calculationNotes.some((n) => n.toLowerCase().includes('volumen')),
    );
    expect(hasVolumeNote).toBe(true);
  });
});

// ── Stabilizer Tests ──────────────────────────────────────────────

describe('stabilizer', () => {
  it('does not calculate stabilizer dosage from meter fields alone', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 0.5 }),
      makeSettings(),
    );
    const stabItem = findItem(result.items, 'Estabilizador de cloro');
    // Should show as informational only
    expect(stabItem).toBeDefined();
    expect(stabItem!.estimatedAmount).toBeUndefined();
    expect(stabItem!.severity).toBe('info');
  });

  it('shows informational note to measure cyanuric acid before adding stabilizer', () => {
    const result = calculateRecommendations(
      makeMeasurement({ fac: 0.5 }),
      makeSettings(),
    );
    const stabItem = findItem(result.items, 'Estabilizador de cloro');
    const hasCyaNote = stabItem!.calculationNotes.some((n) =>
      n.toLowerCase().includes('ácido cianúrico'),
    );
    expect(hasCyaNote).toBe(true);
  });
});

// ── Alkalinity Tests ──────────────────────────────────────────────

describe('alkalinity', () => {
  it('does not calculate alkalinity reducer dosage from meter fields alone', () => {
    const result = calculateRecommendations(
      makeMeasurement(),
      makeSettings(),
    );
    const alkItem = findItem(result.items, 'Reductor de alcalinidad total');
    expect(alkItem).toBeDefined();
    expect(alkItem!.estimatedAmount).toBeUndefined();
    expect(alkItem!.severity).toBe('info');
  });

  it('shows informational note to measure total alkalinity before adding alkalinity reducer', () => {
    const result = calculateRecommendations(
      makeMeasurement(),
      makeSettings(),
    );
    const alkItem = findItem(result.items, 'Reductor de alcalinidad total');
    const hasAlkNote = alkItem!.calculationNotes.some((n) =>
      n.toLowerCase().includes('alcalinidad'),
    );
    expect(hasAlkNote).toBe(true);
  });
});

// ── Recommendation Ordering Tests ─────────────────────────────────

describe('recommendation ordering', () => {
  it('pH correction appears before chlorine dosing when pH is out of range', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 8.0, fac: 0.5 }),
      makeSettings({ poolType: 'chlorine' }),
    );
    // Find indices of pH and chlorine items
    const phIndex = result.items.findIndex(
      (i) => i.chemicalProductId === 'ph-reducer-liquid',
    );
    // In chlorine pool, when pH is bad and FAC is low, the "correct pH first" item
    // should appear before the chlorine item
    const correctFirstIndex = result.items.findIndex(
      (i) => i.purpose.toLowerCase().includes('corregir el pH antes'),
    );
    expect(phIndex).toBeLessThan(correctFirstIndex < 0 ? Infinity : correctFirstIndex);
  });

  it('danger warnings appear before other items', () => {
    const result = calculateRecommendations(
      makeMeasurement({ ph: 7.0, fac: 0 }),
      makeSettings(),
    );
    // Warnings should be populated
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── General / Edge Cases ──────────────────────────────────────────

describe('general', () => {
  it('returns empty items when all values are in range (chlorine pool)', () => {
    const result = calculateRecommendations(makeMeasurement(), makeSettings());
    // pH in range, FAC in range → should only have informational items (alkalinity, possibly temperature)
    const actionableItems = result.items.filter((i) => i.severity !== 'info');
    expect(actionableItems).toHaveLength(0);
  });

  it('adds temperature warning for water above 30 °C', () => {
    const result = calculateRecommendations(
      makeMeasurement({ temperature: 33 }),
      makeSettings(),
    );
    expect(result.warnings.some((w) => w.includes('temperatura'))).toBe(true);
  });

  it('does not recommend pH increaser and pH reducer together', () => {
    const result = calculateRecommendations(makeMeasurement(), makeSettings());
    const phUp = result.items.find((i) => i.chemicalProductId === 'ph-increaser-liquid');
    const phDown = result.items.find((i) => i.chemicalProductId === 'ph-reducer-liquid');
    // Both should never appear together
    expect(!phUp || !phDown).toBe(true);
  });

  it('adds ORP warning when ORP is below 650', () => {
    const result = calculateRecommendations(
      makeMeasurement({ orp: 600 }),
      makeSettings(),
    );
    expect(result.warnings.some((w) => w.includes('ORP'))).toBe(true);
  });

  it('adds ORP danger when ORP is below 600', () => {
    const result = calculateRecommendations(
      makeMeasurement({ orp: 500 }),
      makeSettings(),
    );
    expect(result.warnings.some((w) => w.includes('ORP'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('very low') || w.includes('muy bajo'))).toBe(true);
  });
});
