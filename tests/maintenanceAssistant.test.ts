import { describe, it, expect } from 'vitest';
import { runAssistant } from '../src/domain/maintenanceAssistant';
import type { MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import { analyzeTrends } from '../src/domain/trendAnalysis';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings, SaltChlorinatorConfig } from '../src/domain/settings';
import { createChlorinatorConfigFromPreset } from '../src/domain/saltChlorinator';

// ── Helpers ───────────────────────────────────────────────────────

function makeMeasurement(
  overrides: Partial<Measurement> = {},
  id?: string,
): Measurement {
  return {
    id: id ?? 'test-1',
    measuredAt: '2026-07-09T10:35:00.000Z',
    ph: 7.4,
    ec: 6640,
    tds: 3230,
    salt: 3380,
    orp: 672,
    fac: 2.0,
    temperature: 25.0,
    ...overrides,
  };
}

function makeSettings(
  overrides: Partial<PoolSettings> = {},
): PoolSettings {
  return {
    volume: 50000,
    volumeUnit: 'liters',
    poolType: 'chlorine',
    unitSystem: 'metric',
    ...overrides,
  };
}

function makeChlorinatorConfig(
  overrides: Partial<SaltChlorinatorConfig> = {},
): SaltChlorinatorConfig {
  return {
    enabled: true,
    productionGramsPerHour: 20,
    currentOutputPercent: 60,
    filtrationHoursPerDay: 6,
    maxRecommendedOutputPercent: 100,
    maxRecommendedHoursPerDay: 12,
    ...overrides,
  };
}

function findRecByTitle(
  items: MaintenanceRecommendation[],
  title: string,
): MaintenanceRecommendation | undefined {
  return items.find((i) => i.title.toLowerCase().includes(title.toLowerCase()));
}

function findRecByKind(
  items: MaintenanceRecommendation[],
  kind: string,
): MaintenanceRecommendation[] {
  return items.filter((i) => i.kind === kind);
}

// ── Assistant Status Tests ────────────────────────────────────────

describe('assistant status', () => {
  it('balanced values produce status balanced', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    expect(result.status).toBe('balanced');
  });

  it('bad pH produces needs-correction', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0 })],
      makeSettings(),
    );
    expect(result.status).toBe('needs-correction');
  });

  it('very low ORP + low FAC produces unsafe or needs-correction', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.3, orp: 500 })],
      makeSettings(),
    );
    expect(['unsafe', 'needs-correction']).toContain(result.status);
  });

  it('missing measurement produces insufficient-data', () => {
    const result = runAssistant([], makeSettings());
    expect(result.status).toBe('insufficient-data');
  });
});

// ── Trend Analysis Tests ──────────────────────────────────────────

describe('trend analysis', () => {
  it('detects stable pH', () => {
    const measurements = [
      makeMeasurement({ ph: 7.4, measuredAt: '2026-07-07T10:00:00.000Z' }, 'a'),
      makeMeasurement({ ph: 7.4, measuredAt: '2026-07-08T10:00:00.000Z' }, 'b'),
      makeMeasurement({ ph: 7.4, measuredAt: '2026-07-09T10:00:00.000Z' }, 'c'),
    ];
    const trends = analyzeTrends(measurements);
    const phTrend = trends.find((t) => t.field === 'ph');
    expect(phTrend).toBeDefined();
    expect(phTrend!.direction).toBe('stable');
  });

  it('detects rising pH', () => {
    const measurements = [
      makeMeasurement({ ph: 7.2, measuredAt: '2026-07-07T10:00:00.000Z' }, 'a'),
      makeMeasurement({ ph: 7.3, measuredAt: '2026-07-08T10:00:00.000Z' }, 'b'),
      makeMeasurement({ ph: 7.5, measuredAt: '2026-07-09T10:00:00.000Z' }, 'c'),
    ];
    const trends = analyzeTrends(measurements);
    const phTrend = trends.find((t) => t.field === 'ph');
    expect(phTrend).toBeDefined();
    expect(phTrend!.direction).toBe('rising');
  });

  it('detects falling FAC', () => {
    const measurements = [
      makeMeasurement({ fac: 2.0, measuredAt: '2026-07-07T10:00:00.000Z' }, 'a'),
      makeMeasurement({ fac: 1.5, measuredAt: '2026-07-08T10:00:00.000Z' }, 'b'),
      makeMeasurement({ fac: 1.0, measuredAt: '2026-07-09T10:00:00.000Z' }, 'c'),
    ];
    const trends = analyzeTrends(measurements);
    const facTrend = trends.find((t) => t.field === 'fac');
    expect(facTrend).toBeDefined();
    expect(facTrend!.direction).toBe('falling');
  });

  it('detects falling ORP', () => {
    const measurements = [
      makeMeasurement({ orp: 700, measuredAt: '2026-07-07T10:00:00.000Z' }, 'a'),
      makeMeasurement({ orp: 660, measuredAt: '2026-07-08T10:00:00.000Z' }, 'b'),
      makeMeasurement({ orp: 630, measuredAt: '2026-07-09T10:00:00.000Z' }, 'c'),
    ];
    const trends = analyzeTrends(measurements);
    const orpTrend = trends.find((t) => t.field === 'orp');
    expect(orpTrend).toBeDefined();
    expect(orpTrend!.direction).toBe('falling');
  });

  it('ignores tiny changes below threshold', () => {
    const measurements = [
      makeMeasurement({ ph: 7.41, measuredAt: '2026-07-08T10:00:00.000Z' }, 'a'),
      makeMeasurement({ ph: 7.42, measuredAt: '2026-07-09T10:00:00.000Z' }, 'b'),
    ];
    const trends = analyzeTrends(measurements);
    const phTrend = trends.find((t) => t.field === 'ph');
    expect(phTrend).toBeDefined();
    // Change of 0.01 is below threshold of 0.2
    expect(phTrend!.direction).toBe('stable');
  });
});

// ── Saltwater Pool Tests ──────────────────────────────────────────

describe('saltwater pool', () => {

  it('low FAC + good pH + good salt + chlorinator config recommends chlorinator adjustment', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      saltChlorinator: makeChlorinatorConfig(),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 1.0, salt: 3000 })],
      settings,
    );
    const equipRecs = findRecByKind(result.recommendations, 'equipment');
    expect(equipRecs.length).toBeGreaterThan(0);
    const adjRec = equipRecs.find((r) => r.equipmentName === 'Clorador salino');
    expect(adjRec).toBeDefined();
  });

  it('low FAC + low ORP increases severity', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      saltChlorinator: makeChlorinatorConfig(),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5, orp: 550, salt: 3000 })],
      settings,
    );
    // Should have high or danger severity somewhere
    const highSev = result.recommendations.filter(
      (r) => r.severity === 'high' || r.severity === 'danger',
    );
    expect(highSev.length).toBeGreaterThan(0);
  });

  it('low salt recommends sal para piscina before chlorinator increase', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      volume: 50000,
      saltChlorinator: makeChlorinatorConfig(),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 1.0, salt: 1500 })],
      settings,
    );
    const saltRec = findRecByTitle(result.recommendations, 'sal para piscina');
    expect(saltRec).toBeDefined();
    expect(saltRec!.genericProductName).toBe('Sal para piscina');

    // The salt rec should have priority 3 (before chlorinator adjustments)
    expect(saltRec!.priority).toBeLessThan(10);
  });

  it('high salt recommends dilution/partial replacement note', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      saltChlorinator: makeChlorinatorConfig(),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 2.0, salt: 4500 })],
      settings,
    );
    const dilRec = findRecByTitle(result.recommendations, 'dilución');
    expect(dilRec).toBeDefined();
    expect(dilRec!.kind).toBe('warning');
  });

  it('bad pH recommends pH correction before chlorinator adjustment', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      saltChlorinator: makeChlorinatorConfig(),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 1.0, salt: 3000 })],
      settings,
    );
    // Should have pH reducer
    const phRec = findRecByTitle(result.recommendations, 'bajar el pH');
    expect(phRec).toBeDefined();
  });

  it('chlorinator recommendation includes hours/output and calculation notes', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      volume: 50000,
      saltChlorinator: makeChlorinatorConfig({
        productionGramsPerHour: 20,
        currentOutputPercent: 60,
        filtrationHoursPerDay: 6,
      }),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 1.0, salt: 3000 })],
      settings,
    );
    const equipRecs = findRecByKind(result.recommendations, 'equipment');
    const adjRec = equipRecs.find((r) => r.equipmentName === 'Clorador salino');
    expect(adjRec).toBeDefined();
    expect(adjRec!.calculationNotes.length).toBeGreaterThan(0);
    // Should mention output or hours
    const notesText = adjRec!.calculationNotes.join(' ');
    expect(notesText.length).toBeGreaterThan(10);
  });

  it('if chlorinator cannot correct within limits, recommends checking equipment', () => {
    // Very low FAC, chlorinator at low production → correction is too large
    const settings = makeSettings({
      poolType: 'saltwater',
      volume: 100000,
      saltChlorinator: makeChlorinatorConfig({
        productionGramsPerHour: 10,
        currentOutputPercent: 20,
        filtrationHoursPerDay: 4,
        maxRecommendedOutputPercent: 100,
        maxRecommendedHoursPerDay: 12,
      }),
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.0, salt: 3000 })],
      settings,
    );
    const equipRec = findRecByTitle(result.recommendations, 'verificar equipo');
    expect(equipRec).toBeDefined();
    expect(equipRec!.kind).toBe('warning');
  });
});

// ── Chlorine Pool Tests ───────────────────────────────────────────

describe('chlorine pool', () => {
  it('low FAC + good pH recommends cloro granulado', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings(),
    );
    const clRec = findRecByTitle(result.recommendations, 'cloro granulado');
    expect(clRec).toBeDefined();
    expect(clRec!.kind).toBe('chemical');
    expect(clRec!.genericProductName).toBe('Cloro granulado');
  });

  it('bad pH recommends pH correction before chlorine', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine' }),
    );
    const phRec = findRecByTitle(result.recommendations, 'bajar el pH');
    expect(phRec).toBeDefined();
  });

  it('chlorine pool never recommends chlorinator adjustment', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine', saltChlorinator: makeChlorinatorConfig() }),
    );
    const equipRecs = findRecByKind(result.recommendations, 'equipment');
    const chlorinatorRecs = equipRecs.filter((r) => r.equipmentName === 'Clorador salino');
    expect(chlorinatorRecs).toHaveLength(0);
  });
});

// ── Manual Test Suggestions ───────────────────────────────────────

describe('manual test suggestions', () => {
  it('stabilizer recommendation is informational only without cyanuric acid measurement', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings(),
    );
    const stabRec = findRecByTitle(result.recommendations, 'ácido cianúrico');
    expect(stabRec).toBeDefined();
    expect(stabRec!.severity).toBe('info');
    expect(stabRec!.kind).toBe('manual-test');
  });

  it('alkalinity reducer recommendation is informational only without alkalinity measurement', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    const alkRec = findRecByTitle(result.recommendations, 'alcalinidad total');
    expect(alkRec).toBeDefined();
    expect(alkRec!.severity).toBe('info');
    expect(alkRec!.kind).toBe('manual-test');
  });
});

// ── Next Check Tests ──────────────────────────────────────────────

describe('next check suggestion', () => {
  it('balanced values suggest 24-48h', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    expect(result.nextCheckSuggestion.hoursFromNow).toBe(48);
    expect(result.nextCheckSuggestion.reason).toContain('equilibrio');
  });

  it('chemical correction suggests retesting sooner', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0 })],
      makeSettings(),
    );
    expect(result.nextCheckSuggestion.hoursFromNow).toBeLessThan(24);
    expect(result.nextCheckSuggestion.reason).toContain('corrección');
  });

  it('low FAC suggests retesting after filtration/chlorinator cycle', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings(),
    );
    expect(result.nextCheckSuggestion.hoursFromNow).toBeLessThan(24);
  });
});

// ── Brand-Free Tests ──────────────────────────────────────────────

describe('brand-free output', () => {
  it('no recommendations contain commercial brand names', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings(),
    );
    const allText = JSON.stringify(result).toLowerCase();
    const brandNames = ['tamar', 'piscimar', 'piscilimp', 'ecl tamar'];
    for (const brand of brandNames) {
      expect(allText).not.toContain(brand);
    }
  });

  it('recommendations use generic names and main components', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.9 })],
      makeSettings(),
    );
    const phRec = findRecByTitle(result.recommendations, 'bajar el pH');
    expect(phRec).toBeDefined();
    expect(phRec!.genericProductName).toBe('Reductor de pH líquido');
    expect(phRec!.mainComponent).toBe('Ácido reductor de pH');
    expect(phRec!.genericProductName).not.toContain('Tamar');
  });
});

// ── Additional Edge Cases ─────────────────────────────────────────

describe('additional edge cases', () => {
  it('high FAC recommends no chlorine addition', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 5.0 })],
      makeSettings(),
    );
    const noClRec = findRecByTitle(result.recommendations, 'FAC alto');
    expect(noClRec).toBeDefined();
    expect(noClRec!.kind).toBe('no-action');
  });

  it('temperature above 30 adds warning', () => {
    const result = runAssistant(
      [makeMeasurement({ temperature: 33 })],
      makeSettings(),
    );
    const tempRec = findRecByTitle(result.recommendations, 'temperatura');
    expect(tempRec).toBeDefined();
  });

  it('does not recommend pH up and pH down together', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4 })],
      makeSettings(),
    );
    const phUp = findRecByTitle(result.recommendations, 'subir el pH');
    const phDown = findRecByTitle(result.recommendations, 'bajar el pH');
    expect(!phUp || !phDown).toBe(true);
  });

  it('result includes trends', () => {
    const measurements = [
      makeMeasurement({ ph: 7.2, measuredAt: '2026-07-07T10:00:00.000Z' }, 'a'),
      makeMeasurement({ ph: 7.4, measuredAt: '2026-07-09T10:00:00.000Z' }, 'b'),
    ];
    const result = runAssistant(measurements, makeSettings());
    expect(result.trends.length).toBeGreaterThan(0);
    const phTrend = result.trends.find((t) => t.field === 'ph');
    expect(phTrend).toBeDefined();
  });

  it('summary is a non-empty string', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ── Migrated from chemistry.test.ts: pH recommendations ──────────

describe('pH recommendations (migrated)', () => {
  it('high pH recommends Reductor de pH líquido', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.9 })],
      makeSettings(),
    );
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();
    expect(phRec!.estimatedAmount).toBeGreaterThan(0);
  });

  it('low pH recommends Incrementador de pH líquido', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.0 })],
      makeSettings(),
    );
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-increaser-liquid',
    );
    expect(phRec).toBeDefined();
    expect(phRec!.estimatedAmount).toBeGreaterThan(0);
  });

  it('large pH correction is capped and includes a retest note', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.5 })],
      makeSettings(),
    );
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();

    const cappedNote = phRec!.calculationNotes.find((n) =>
      n.toLowerCase().includes('corrección limitada'),
    );
    expect(cappedNote).toBeDefined();

    const retestNote = phRec!.calculationNotes.find((n) =>
      n.toLowerCase().includes('volver a medir'),
    );
    expect(retestNote).toBeDefined();
  });
});

// ── Migrated from chemistry.test.ts: chlorine pool ───────────────

describe('chlorine pool (migrated)', () => {
  it('low FAC with acceptable pH recommends Cloro granulado', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings(),
    );
    const clRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'chlorine-granules',
    );
    expect(clRec).toBeDefined();
    expect(clRec!.estimatedAmount).toBeGreaterThan(0);
  });

  it('low FAC with bad pH recommends correcting pH first', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine' }),
    );

    // Should have a pH reduction item
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();

    // Should have a "correct pH first" advisory item
    const correctFirstItem = result.recommendations.find(
      (r) => r.kind === 'monitor' && r.relatedFields.includes('ph') && r.relatedFields.includes('fac'),
    );
    expect(correctFirstItem).toBeDefined();
    expect(correctFirstItem!.title.toLowerCase()).toContain('corregir');
    expect(correctFirstItem!.title.toLowerCase()).toContain('ph');
  });

  it('high FAC recommends no chlorine addition', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 5.0 })],
      makeSettings(),
    );
    const noClRec = findRecByTitle(result.recommendations, 'FAC alto');
    expect(noClRec).toBeDefined();
    expect(noClRec!.estimatedAmount).toBeUndefined();
    expect(noClRec!.kind).toBe('no-action');
  });
});

// ── Migrated from chemistry.test.ts: saltwater pool ──────────────

describe('saltwater pool (migrated)', () => {
  it('salt level in range creates no salt correction', () => {
    const result = runAssistant(
      [makeMeasurement({ salt: 3000 })],
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'pool-salt',
    );
    expect(saltRec).toBeUndefined();
  });

  it('does not recommend salt when salt is missing', () => {
    const result = runAssistant(
      [makeMeasurement({ salt: undefined as unknown as number })],
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'pool-salt',
    );
    expect(saltRec).toBeUndefined();
  });
});

// ── Migrated from chemistry.test.ts: missing/invalid volume ──────

describe('missing or invalid pool volume (migrated)', () => {
  it('recommendations still appear qualitatively when volume is 0', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.9 })],
      makeSettings({ volume: 0 }),
    );
    expect(result.recommendations.length).toBeGreaterThan(0);
    // Should still have status other than insufficient-data
    expect(result.status).not.toBe('insufficient-data');
  });

  it('no estimated amounts are returned when volume is 0', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.9 })],
      makeSettings({ volume: 0 }),
    );
    const itemsWithAmount = result.recommendations.filter(
      (r) => r.estimatedAmount !== undefined,
    );
    expect(itemsWithAmount).toHaveLength(0);
  });

  it('explains that volume is required when volume is 0', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.9 })],
      makeSettings({ volume: 0 }),
    );
    const hasVolumeNote = result.recommendations.some((r) =>
      r.calculationNotes.some((n) => n.toLowerCase().includes('volumen')),
    );
    expect(hasVolumeNote).toBe(true);
  });
});

// ── Migrated from chemistry.test.ts: recommendation ordering ─────

describe('recommendation ordering (migrated)', () => {
  it('pH correction appears before chlorine dosing when pH is out of range', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine' }),
    );
    const phIndex = result.recommendations.findIndex(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    // The "correct pH first" monitor item should appear after the pH reducer
    const correctFirstIndex = result.recommendations.findIndex(
      (r) => r.kind === 'monitor' && r.relatedFields.includes('ph') && r.relatedFields.includes('fac'),
    );
    expect(phIndex).toBeGreaterThanOrEqual(0);
    expect(correctFirstIndex).toBeGreaterThan(phIndex);
  });
});

// ── Migrated from chemistry.test.ts: general / edge cases ────────

describe('general edge cases (migrated)', () => {
  it('balanced chlorine pool returns only info recommendations', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    const actionableItems = result.recommendations.filter(
      (r) => r.severity !== 'info',
    );
    expect(actionableItems).toHaveLength(0);
  });

  it('does not recommend pH increaser and pH reducer together', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4 })],
      makeSettings(),
    );
    const phUp = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-increaser-liquid',
    );
    const phDown = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(!phUp || !phDown).toBe(true);
  });

  it('adds ORP warning when ORP is below 650', () => {
    const result = runAssistant(
      [makeMeasurement({ orp: 600 })],
      makeSettings(),
    );
    const orpRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('orp') && r.severity === 'medium',
    );
    expect(orpRec).toBeDefined();
  });

  it('adds ORP danger warning when ORP is below 600', () => {
    const result = runAssistant(
      [makeMeasurement({ orp: 500 })],
      makeSettings(),
    );
    const orpRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('orp') && r.severity === 'high',
    );
    expect(orpRec).toBeDefined();
  });

  it('generates ORP text from one diagnosis code and classification', () => {
    const result = runAssistant(
      [makeMeasurement({ orp: 524 })],
      makeSettings(),
    );

    const orpRec = result.recommendations.find(
      (r) => r.relatedFields.includes('orp') && r.diagnosisCode === 'ORP_VERY_LOW',
    );

    expect(orpRec).toBeDefined();
    expect(orpRec!.severity).toBe('high');
    expect(orpRec!.titleKey).toBe('rec.orp.veryLow.title');
    expect(orpRec!.reasonKey).toBe('rec.orp.veryLow.reason');
    expect(orpRec!.reasonKey).not.toBe('rec.orp.below650.reason');
  });

  it('exports FAC range policy with general and configured ranges for saltwater recommendations', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 1.0, salt: 3000 })],
      makeSettings({
        poolType: 'saltwater',
        saltChlorinator: makeChlorinatorConfig(),
      }),
    );

    const facRec = result.recommendations.find((r) => r.relatedFields.includes('fac') && r.rangePolicy);

    expect(facRec).toBeDefined();
    expect(facRec!.rangePolicy!.general).toMatchObject({ min: 1.0, max: 3.0, kind: 'general' });
    expect(facRec!.rangePolicy!.configured).toMatchObject({ min: 0.8, max: 2.5, kind: 'configured' });
    expect(facRec!.rangePolicy!.selected).toBe('configured');
  });

  it('temperature above 30 adds temperature note', () => {
    const result = runAssistant(
      [makeMeasurement({ temperature: 33 })],
      makeSettings(),
    );
    const tempRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('temperatura'),
    );
    expect(tempRec).toBeDefined();
  });
});

// ── Regression: key behavioral invariants ────────────────────────
// These invariants encode the same safe-guards that the removed
// calculateRecommendations() enforced. If any of these fail, it
// means the unified assistant has diverged from the original design.

describe('regression: behavioral invariants', () => {
  // pH-first ordering: pH correction must always be recommended
  // before chlorine dosing when both are out of range.
  it('pH correction has higher priority than chlorine addition', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine' }),
    );
    const phRecs = result.recommendations.filter(
      (r) => r.relatedFields.includes('ph') && r.kind === 'chemical',
    );
    const facRecs = result.recommendations.filter(
      (r) => r.relatedFields.includes('fac') && r.kind === 'chemical',
    );
    if (phRecs.length > 0 && facRecs.length > 0) {
      const phPriority = Math.min(...phRecs.map((r) => r.priority));
      const facPriority = Math.min(...facRecs.map((r) => r.priority));
      expect(phPriority).toBeLessThan(facPriority);
    }
  });

  // Saltwater chlorinator preference: for mild low FAC, recommend checking
  // the chlorinator rather than adding chemicals.
  it('saltwater pool prefers chlorinator check over chemical shock when FAC is mildly low', () => {
    const settings = makeSettings({
      poolType: 'saltwater',
      saltChlorinator: {
        enabled: true,
        productionGramsPerHour: 20,
        currentOutputPercent: 60,
        filtrationHoursPerDay: 6,
        maxRecommendedOutputPercent: 100,
        maxRecommendedHoursPerDay: 12,
      },
    });
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 1.0, salt: 3000 })],
      settings,
    );
    const equipmentRecs = result.recommendations.filter(
      (r) => r.kind === 'equipment',
    );
    expect(equipmentRecs.length).toBeGreaterThan(0);
  });

  // Chlorine pool behavior: never recommend chlorinator equipment.
  it('chlorine pool never recommends chlorinator equipment', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings({ poolType: 'chlorine', saltChlorinator: { enabled: true, productionGramsPerHour: 20, currentOutputPercent: 60, filtrationHoursPerDay: 6, maxRecommendedOutputPercent: 100, maxRecommendedHoursPerDay: 12 } }),
    );
    const equipmentRecs = result.recommendations.filter(
      (r) => r.equipmentName === 'Clorador salino',
    );
    expect(equipmentRecs).toHaveLength(0);
  });

  // High salt behavior: dilution recommendation, not chemical.
  it('high salt recommends dilution not chemicals', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 2.0, salt: 4500 })],
      makeSettings({ poolType: 'saltwater' }),
    );
    const dilRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('dilución'),
    );
    expect(dilRec).toBeDefined();
    expect(dilRec!.kind).toBe('warning');
    expect(dilRec!.chemicalProductId).toBeUndefined();
  });

  // FAC/ORP severity: low ORP combined with low FAC increases severity.
  it('low FAC + low ORP increases severity', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.3, orp: 550 })],
      makeSettings(),
    );
    const highSev = result.recommendations.filter(
      (r) => r.severity === 'high' || r.severity === 'danger',
    );
    expect(highSev.length).toBeGreaterThan(0);
  });

  // Chemical dosage caps: pH correction is capped at 0.2 per cycle.
  it('pH correction is capped at 0.2 units per cycle', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.5 })],
      makeSettings(),
    );
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();
    const cappedNote = phRec!.calculationNotes.some((n) =>
      n.toLowerCase().includes('corrección limitada'),
    );
    expect(cappedNote).toBe(true);
  });

  // Brand-free: no commercial brand names in output.
  it('all output is brand-free', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.5 })],
      makeSettings(),
    );
    const allText = JSON.stringify(result).toLowerCase();
    for (const brand of ['tamar', 'piscimar', 'piscilimp', 'ecl tamar']) {
      expect(allText).not.toContain(brand);
    }
  });

  // Unsupported alkalinity/stabilizer: informational only, no dosage.
  it('stabilizer recommendation is informational without cyanuric acid measurement', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.5 })],
      makeSettings(),
    );
    const stabRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('ácido cianúrico'),
    );
    expect(stabRec).toBeDefined();
    expect(stabRec!.severity).toBe('info');
    expect(stabRec!.estimatedAmount).toBeUndefined();
  });

  it('alkalinity recommendation is informational without alkalinity measurement', () => {
    const result = runAssistant(
      [makeMeasurement()],
      makeSettings(),
    );
    const alkRec = result.recommendations.find(
      (r) => r.title.toLowerCase().includes('alcalinidad total'),
    );
    expect(alkRec).toBeDefined();
    expect(alkRec!.severity).toBe('info');
    expect(alkRec!.estimatedAmount).toBeUndefined();
  });
});

// ── Missing pH/FAC in latest measurement ──────────────────────────

describe('missing pH/FAC in latest measurement', () => {
  it('returns insufficient-data when latest has no pH', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: undefined as any })],
      makeSettings(),
    );
    expect(result.status).toBe('insufficient-data');
    expect(result.recommendations).toEqual([]);
  });

  it('returns insufficient-data when latest has no FAC', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: undefined as any })],
      makeSettings(),
    );
    expect(result.status).toBe('insufficient-data');
    expect(result.recommendations).toEqual([]);
  });

  it('returns insufficient-data when latest pH is null', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: null as any })],
      makeSettings(),
    );
    expect(result.status).toBe('insufficient-data');
  });

  it('returns insufficient-data when latest FAC is null', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: null as any })],
      makeSettings(),
    );
    expect(result.status).toBe('insufficient-data');
  });
});

// ── FAC critically low (danger) ───────────────────────────────────

describe('FAC critically low', () => {
  it('produces high-severity recommendation for very low FAC with ORP', () => {
    // Saltwater pool: facRange.min = 0.8. FAC=0.5 is below range but >0.4 threshold for "very low"
    // With ORP=580 (<600), isLowOrp=true → triggers chemical chlorine granules with high severity
    const result = runAssistant(
      [makeMeasurement({ fac: 0.5, orp: 580 })],
      makeSettings({ poolType: 'saltwater' }),
    );
    const highRecs = result.recommendations.filter(
      (r) => r.severity === 'high' || r.severity === 'danger',
    );
    expect(highRecs.length).toBeGreaterThan(0);
    // Check for chlorine granules recommendation triggered by low FAC + low ORP
    const chlRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'chlorine-granules',
    );
    expect(chlRec).toBeDefined();
  });
});

// ── Salt above max range ──────────────────────────────────────────

describe('salt above max range', () => {
  it('recommends dilution when salt exceeds range for saltwater pool', () => {
    const result = runAssistant(
      [makeMeasurement({ salt: 4500 })],
      makeSettings({ poolType: 'saltwater' }),
    );
    const saltWarnings = result.recommendations.filter(
      (r) => r.relatedFields.includes('salt') && r.kind === 'warning',
    );
    expect(saltWarnings.length).toBeGreaterThan(0);
    const dilutionRec = saltWarnings.find(
      (r) => r.title.toLowerCase().includes('dilución'),
    );
    expect(dilutionRec).toBeDefined();
    expect(dilutionRec!.priority).toBe(15);
  });
});

// ── Proactive chlorinator adjustment ──────────────────────────────

describe('proactive chlorinator adjustment', () => {
  it('suggests equipment adjustment when FAC is in range but below ideal', () => {
    // Note: SALTWATER_FAC_RANGE.ideal = 1.5, and need deltaPpm > 0.2, so FAC must be < 1.3
    const result = runAssistant(
      [{ id: 'pro-test', measuredAt: '2026-07-09T10:35:00.000Z', ph: 7.4, fac: 1.2, ec: 3000, tds: 1500, salt: 3000, orp: 680, temperature: 25 }],
      makeSettings({
        poolType: 'saltwater',
        volume: 50000,
        saltChlorinator: {
          enabled: true,
          productionGramsPerHour: 20,
          currentOutputPercent: 60,
          filtrationHoursPerDay: 6,
          maxRecommendedOutputPercent: 100,
          maxRecommendedHoursPerDay: 12,
        },
      }),
    );
    const kinds = result.recommendations.map(r => r.kind).join(',');
    expect(kinds).toContain('equipment');
    const optRec = result.recommendations.find(
      (r) => r.kind === 'equipment',
    );
    expect(optRec).toBeDefined();
    expect(optRec!.severity).toBe('low');
    expect(optRec!.priority).toBe(12);
    expect(optRec!.title).toContain('Optimizar');
  });

  it('does not suggest proactive adjustment when pH is not acceptable', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 1.5, ph: 8.2 })],
      makeSettings({
        poolType: 'saltwater',
        volume: 50000,
        saltChlorinator: {
          enabled: true,
          productionGramsPerHour: 20,
          currentOutputPercent: 60,
          filtrationHoursPerDay: 6,
          maxRecommendedOutputPercent: 100,
          maxRecommendedHoursPerDay: 12,
        },
      }),
    );
    // pH 8.2 is out of range → no proactive adjustment
    const optRec = result.recommendations.find(
      (r) => r.title.includes('Optimizar clorador'),
    );
    expect(optRec).toBeUndefined();
  });
});

describe('chlorinator capability-aware recommendation integration', () => {
  it('INTEX QS500 fixed-output recommendation uses runtime, rounds 48 minutes to 60, and does not invent boost output', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 5000,
        poolType: 'saltwater',
        saltChlorinator: {
          ...createChlorinatorConfigFromPreset('intex-qs500-26668'),
          filtrationHoursPerDay: 1,
        },
      }),
    );

    const rec = result.recommendations.find((item) => item.kind === 'equipment' && item.equipmentName === 'Clorador salino');
    expect(rec).toBeDefined();
    expect(rec?.suggestedOutputPercent).toBeUndefined();
    expect(rec?.suggestedAdditionalHours).toBe(1);
    expect(rec?.calculationNotes.join(' ')).toContain('Cálculo teórico: 48 minutos');
    expect(rec?.calculationNotes.join(' ')).toContain('Ajuste operativo: 60 minutos');
    expect(rec?.calculationNotes.join(' ')).not.toMatch(/boost.*g/i);
  });

  it('INTEX QS500 runtime recommendation respects the 12 hour daily maximum', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 5000,
        poolType: 'saltwater',
        saltChlorinator: {
          ...createChlorinatorConfigFromPreset('intex-qs500-26668'),
          filtrationHoursPerDay: 11.5,
        },
      }),
    );

    const rec = result.recommendations.find((item) => item.kind === 'equipment' && item.equipmentName === 'Clorador salino');
    expect(rec?.suggestedAdditionalHours).toBe(0.5);
    expect(rec?.suggestedOutputPercent).toBeUndefined();
  });

  it('persistent low FAC still escalates to chlorinator diagnostics and fast chemical correction', () => {
    const measurements = [
      makeMeasurement({ fac: 0.4, orp: 560, measuredAt: '2026-07-01T10:00:00.000Z' }, 'm1'),
      makeMeasurement({ fac: 0.4, orp: 555, measuredAt: '2026-07-03T10:00:00.000Z' }, 'm2'),
      makeMeasurement({ fac: 0.3, orp: 540, measuredAt: '2026-07-05T10:00:00.000Z' }, 'm3'),
    ];
    const result = runAssistant(
      measurements,
      makeSettings({
        volume: 5000,
        poolType: 'saltwater',
        saltChlorinator: createChlorinatorConfigFromPreset('intex-qs500-26668'),
      }),
      [
        {
          id: 'c1',
          performedAt: '2026-07-02T10:00:00.000Z',
          kind: 'chlorinator',
          description: 'Extra runtime',
          chlorinator: { additionalHours: 1 },
        },
        {
          id: 'c2',
          performedAt: '2026-07-04T10:00:00.000Z',
          kind: 'chlorinator',
          description: 'Extra runtime',
          chlorinator: { additionalHours: 1 },
        },
      ],
    );

    expect(result.recommendations.some((rec) =>
      rec.kind === 'equipment' &&
      rec.equipmentName === 'Clorador salino' &&
      rec.title.includes('clorador') &&
      rec.escalationLevel !== undefined,
    )).toBe(true);
    expect(result.recommendations.some((rec) => rec.chemicalProductId === 'chlorine-granules')).toBe(true);
  });

  it('percentage chlorinator recommendations keep percentage adjustment behavior', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 50000,
        poolType: 'saltwater',
        saltChlorinator: makeChlorinatorConfig({
          productionGramsPerHour: 20,
          currentOutputPercent: 40,
          filtrationHoursPerDay: 8,
          maxRecommendedOutputPercent: 100,
        }),
      }),
    );

    const rec = result.recommendations.find((item) => item.kind === 'equipment' && item.equipmentName === 'Clorador salino');
    expect(rec?.suggestedOutputPercent).toBeDefined();
  });

  it('discrete-level chlorinator produces a level change without invented percentages', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 50000,
        poolType: 'saltwater',
        saltChlorinator: makeChlorinatorConfig({
          outputControl: {
            kind: 'discrete-levels',
            levels: [{ id: 'low', labelKey: 'Bajo' }, { id: 'high', labelKey: 'Alto' }],
          },
          currentOutputLevelId: 'low',
        }),
      }),
    );

    const rec = result.recommendations.find((item) => item.recommendedChlorinatorAction === 'set-output-level');
    expect(rec).toBeDefined();
    expect(rec?.suggestedOutputLevelId).toBe('high');
    expect(rec?.suggestedOutputPercent).toBeUndefined();
  });

  it('automatic chlorinator recommends setpoint or sensor actions without manual hours or percentage', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 50000,
        poolType: 'saltwater',
        saltChlorinator: makeChlorinatorConfig({
          outputControl: { kind: 'automatic', controlBasis: 'orp' },
        }),
      }),
    );

    const rec = result.recommendations.find((item) => item.recommendedChlorinatorAction === 'review-setpoint');
    expect(rec).toBeDefined();
    expect(rec?.suggestedOutputPercent).toBeUndefined();
    expect(rec?.suggestedAdditionalHours).toBeUndefined();
  });

  it('unknown chlorinator does not generate false operational dose and asks for capabilities', () => {
    const result = runAssistant(
      [makeMeasurement({ fac: 0.7, orp: 680 })],
      makeSettings({
        volume: 50000,
        poolType: 'saltwater',
        saltChlorinator: createChlorinatorConfigFromPreset('unknown'),
      }),
    );

    const rec = result.recommendations.find((item) => item.recommendedChlorinatorAction === 'identify-capabilities');
    expect(rec).toBeDefined();
    expect(rec?.suggestedOutputPercent).toBeUndefined();
    expect(rec?.suggestedAdditionalHours).toBeUndefined();
    expect(rec?.calculationNotes.join(' ')).not.toContain('Infinity');
  });

  it('legacy outputPercent 100 on fixed equipment is preserved as non-regulable nominal output', () => {
    const config = createChlorinatorConfigFromPreset('intex-qs500-26668');
    const measurement = makeMeasurement({
      fac: 0.7,
      context: {
        chlorinatorOutputPercent: 100,
        chlorinatorHoursSincePreviousMeasurement: 1,
      },
    });

    const result = runAssistant(
      [measurement],
      makeSettings({
        volume: 5000,
        poolType: 'saltwater',
        saltChlorinator: config,
      }),
    );

    const rec = result.recommendations.find((item) => item.kind === 'equipment' && item.equipmentName === 'Clorador salino');
    expect(rec?.suggestedOutputPercent).toBeUndefined();
    expect(config.chlorinator?.dataProvenance.source).toBe('manufacturer-preset');
  });
});

// ── Staged recommendations tests ────────────────────────────────────

describe('staged recommendations', () => {
  it('high pH + low FAC/ORP shows pH correction and blocked sanitation action (saltwater)', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.4, orp: 560 })],
      makeSettings({
        poolType: 'saltwater',
        volume: 50000,
        saltChlorinator: {
          enabled: true,
          productionGramsPerHour: 20,
          currentOutputPercent: 60,
          filtrationHoursPerDay: 6,
          maxRecommendedOutputPercent: 100,
          maxRecommendedHoursPerDay: 12,
        },
      }),
    );

    // Should have pH correction (actionable, stage 1)
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();
    expect(phRec!.state).toBe('actionable');
    expect(phRec!.stage).toBe(1);

    // Should have blocked sanitation warning
    const blockedRec = result.recommendations.find(
      (r) => r.state === 'blocked',
    );
    expect(blockedRec).toBeDefined();
    expect(blockedRec!.stage).toBe(2);
    expect(blockedRec!.dependencies).toBeDefined();
    expect(blockedRec!.dependencies!.length).toBeGreaterThanOrEqual(1);
  });

  it('high pH + low FAC shows pH correction and blocked rec (chlorine pool)', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.3, orp: 550 })],
      makeSettings({ poolType: 'chlorine' }),
    );

    // pH correction should be actionable stage 1
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();
    expect(phRec!.state).toBe('actionable');
    expect(phRec!.stage).toBe(1);

    // Blocked sanitation warning (FAC critically low)
    const blockedRec = result.recommendations.find(
      (r) => r.state === 'blocked',
    );
    expect(blockedRec).toBeDefined();
    expect(blockedRec!.stage).toBe(2);
  });

  it('FAC slightly low with pH out of range shows blocked rec without aggressive dose', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.8, orp: 620 })],
      makeSettings({ poolType: 'chlorine' }),
    );

    // pH should be first priority
    const phRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'ph-reducer-liquid',
    );
    expect(phRec).toBeDefined();
    expect(phRec!.priority).toBeLessThan(5);

    // Should have blocked stage 2 rec
    const blockedRec = result.recommendations.find(
      (r) => r.state === 'blocked',
    );
    expect(blockedRec).toBeDefined();

    // No aggressive chlorine shock dose while pH is out of range
    const chlorineRec = result.recommendations.find(
      (r) => r.chemicalProductId === 'chlorine-granules',
    );
    // If there is a chlorine rec, it should be blocked
    if (chlorineRec) {
      expect(chlorineRec.state).toBe('blocked');
    }
  });

  it('pH within range still produces chlorinator adjustment without blocking', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 7.4, fac: 0.4, orp: 560 })],
      makeSettings({
        poolType: 'saltwater',
        volume: 50000,
        saltChlorinator: {
          enabled: true,
          productionGramsPerHour: 20,
          currentOutputPercent: 60,
          filtrationHoursPerDay: 6,
          maxRecommendedOutputPercent: 100,
          maxRecommendedHoursPerDay: 12,
        },
      }),
    );

    // No blocked recs since pH is in range
    const blockedRec = result.recommendations.find(
      (r) => r.state === 'blocked',
    );
    expect(blockedRec).toBeUndefined();

    // Should have actionable chlorinator adjustment
    const chlorRec = result.recommendations.find(
      (r) => r.kind === 'equipment',
    );
    expect(chlorRec).toBeDefined();
  });

  it('sanitation recommendation has dependencies when blocked', () => {
    const result = runAssistant(
      [makeMeasurement({ ph: 8.0, fac: 0.4, orp: 560 })],
      makeSettings({
        poolType: 'saltwater',
        volume: 50000,
        saltChlorinator: {
          enabled: true,
          productionGramsPerHour: 20,
          currentOutputPercent: 60,
          filtrationHoursPerDay: 6,
          maxRecommendedOutputPercent: 100,
          maxRecommendedHoursPerDay: 12,
        },
      }),
    );

    const blockedRecs = result.recommendations.filter((r) => r.state === 'blocked');
    expect(blockedRecs.length).toBeGreaterThanOrEqual(1);

    // Each blocked rec should have a dependency explaining why
    for (const rec of blockedRecs) {
      expect(rec.dependencies).toBeDefined();
      expect(rec.dependencies!.length).toBeGreaterThanOrEqual(1);
      const firstDep = rec.dependencies![0];
      expect(firstDep.condition).toBeDefined();
      expect(firstDep.explanationKey).toBeDefined();
    }
  });
});
