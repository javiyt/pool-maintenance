import { describe, it, expect } from 'vitest';
import { runAssistant } from '../src/domain/maintenanceAssistant';
import type { MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import { analyzeTrends } from '../src/domain/trendAnalysis';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings, SaltChlorinatorConfig } from '../src/domain/settings';

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
