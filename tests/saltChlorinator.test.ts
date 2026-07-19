import { describe, it, expect } from 'vitest';
import {
  INTEX_QS500_26668_PRESET,
  INTEX_QS500_26668_CHLORINATOR,
  calculateRuntimeCalculation,
  calculateChlorinatorAdjustment,
  createChlorinatorConfigFromPreset,
  getChlorinatorActionCapabilities,
  getChlorinatorCapabilities,
  getCurrentProductionGramsPerHour,
  describeChlorinatorProduction,
  migrateSaltChlorinatorConfig,
} from '../src/domain/saltChlorinator';
import type { SaltChlorinatorConfig } from '../src/domain/saltChlorinator';
import { ChlorinatorRecommendationContextAdapter } from '../src/domain/recommendation/chlorinatorContextAdapter';

function makeConfig(overrides: Partial<SaltChlorinatorConfig> = {}): SaltChlorinatorConfig {
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

describe('calculateChlorinatorAdjustment', () => {
  it('returns Infinity hoursNeeded when production is zero', () => {
    const config = makeConfig({ productionGramsPerHour: 0 });
    const result = calculateChlorinatorAdjustment(1.0, 50000, config);
    expect(result.hoursNeeded).toBe(Infinity);
    expect(result.canAdjustOutput).toBe(true);
    expect(result.canExtendHours).toBe(true);
  });

  it('returns Infinity when current output is 0%', () => {
    const config = makeConfig({ currentOutputPercent: 0 });
    const result = calculateChlorinatorAdjustment(1.0, 50000, config);
    // effectiveAtCurrent = 20 * 0/100 = 0 g/h → Infinity
    expect(result.hoursNeeded).toBe(Infinity);
  });

  it('returns empty suggestions when already at max output and cannot extend hours', () => {
    const config = makeConfig({
      currentOutputPercent: 100,
      maxRecommendedOutputPercent: 100,
      filtrationHoursPerDay: 12,
      maxRecommendedHoursPerDay: 12,
    });
    // At max output (100%) and max hours (12/12), no adjustments possible
    const result = calculateChlorinatorAdjustment(0.5, 50000, config);
    expect(result.suggestedOutputPercent).toBeUndefined();
    expect(result.suggestedAdditionalHours).toBeUndefined();
    expect(result.canAdjustOutput).toBe(false);
    expect(result.canExtendHours).toBe(false);
  });

  it('clamps suggestedAdditionalHours to 0 when hoursNeeded < filtrationHoursPerDay', () => {
    // Force the hours branch: canAdjustOutput=false (already at max output), hoursNeeded < maxHours
    const noOutputConfig = makeConfig({
      productionGramsPerHour: 100,
      currentOutputPercent: 100, // already at max
      maxRecommendedOutputPercent: 100, // can't increase further
      filtrationHoursPerDay: 6,
    });
    // hoursAtMaxOutput = 5/(100*1.0) = 0.05h <= 6h, but canAdjustOutput=false
    // Falls to else-if: hoursNeeded=0.05h <= 12h && canExtendHours=true
    const result = calculateChlorinatorAdjustment(0.1, 50000, noOutputConfig);
    // hoursNeeded=0.05h, filtrationHoursPerDay=6h, so hoursNeeded - filtrationHoursPerDay = -5.95h
    // SuggestedAdditionalHours = Math.ceil(-5.95) = -5, clamped to 0
    expect(result.suggestedAdditionalHours).toBe(0);
  });

  it('uses both output adjustment and additional hours when needed', () => {
    const config = makeConfig({
      productionGramsPerHour: 10, // low production
      currentOutputPercent: 50,
      filtrationHoursPerDay: 4,
      maxRecommendedOutputPercent: 80,
      maxRecommendedHoursPerDay: 12,
    });
    // deltaPpm=2.0, vol=50000L → chlorineNeededG = 100g
    // effectiveAtCurrent = 10 * 0.5 = 5 g/h
    // hoursNeeded = 100/5 = 20h > maxHours=12
    // hoursAtMaxOutput: 10 * 0.8 = 8 g/h → hoursAtMax = 100/8 = 12.5h > filtrationHoursPerDay=4h
    // So first branch fails
    // canAdjustOutput=true, canExtendHours=true, both branches needed
    const result = calculateChlorinatorAdjustment(2.0, 50000, config);
    expect(result.suggestedOutputPercent).toBeDefined();
    expect(result.suggestedAdditionalHours).toBeDefined();
    expect(result.suggestedOutputPercent).toBeLessThanOrEqual(80);
    expect(result.suggestedAdditionalHours).toBeGreaterThan(0);
    expect(result.suggestedAdditionalHours).toBeLessThanOrEqual(8); // remaining hours
  });

  it('prefers output adjustment over extending hours when sufficient', () => {
    const config = makeConfig({
      productionGramsPerHour: 20,
      currentOutputPercent: 40,
      filtrationHoursPerDay: 8,
      maxRecommendedOutputPercent: 100,
    });
    // deltaPpm=0.5, vol=50000L → chlorineNeededG = 25g
    // effectiveAtCurrent = 20*0.4=8g/h → hoursNeeded=25/8=3.125h
    // hoursAtMaxOutput: 20*1.0=20g/h → hoursAtMax=25/20=1.25h <= 8h ✓ and canAdjustOutput=true
    const result = calculateChlorinatorAdjustment(0.5, 50000, config);
    expect(result.suggestedOutputPercent).toBeDefined();
    // desiredGramsPerHour = 25/8 = 3.125, neededOutput = ceil((3.125/20)*100) = ceil(15.625) = 16
    expect(result.suggestedOutputPercent).toBe(16);
    expect(result.suggestedAdditionalHours).toBeUndefined();
  });

  it('uses only additional hours when output cannot be adjusted', () => {
    const config = makeConfig({
      productionGramsPerHour: 20,
      currentOutputPercent: 100, // already at max
      maxRecommendedOutputPercent: 100, // cannot increase
      filtrationHoursPerDay: 6,
      maxRecommendedHoursPerDay: 12,
    });
    // deltaPpm=1.0, vol=50000L → chlorineNeededG=50g
    // effectiveAtCurrent = 20*1.0=20g/h → hoursNeeded=50/20=2.5h
    // hoursAtMaxOutput=2.5h > 6h? No — 2.5h <= 6h but canAdjustOutput=false
    // So: first branch fails (canAdjustOutput=false)
    // else-if: hoursNeeded=2.5h <= 12h && canExtendHours=true (remaining=6h)
    const result = calculateChlorinatorAdjustment(1.0, 50000, config);
    expect(result.suggestedOutputPercent).toBeUndefined();
    expect(result.suggestedAdditionalHours).toBeDefined();
    // hoursNeeded - filtrationHoursPerDay = 2.5 - 6 = -3.5 → clamped to 0
    expect(result.suggestedAdditionalHours).toBe(0);
  });

  it('caps suggested output to maxRecommendedOutputPercent', () => {
    const config = makeConfig({
      productionGramsPerHour: 5, // very low production
      currentOutputPercent: 10,
      filtrationHoursPerDay: 8,
      maxRecommendedOutputPercent: 80,
    });
    // deltaPpm=1.0, vol=50000L → chlorineNeededG=50g
    // hoursAtMaxOutput: 5*0.8=4g/h → 50/4=12.5h > 8h → first branch fails
    // canAdjustOutput=true, canExtendHours=true
    const result = calculateChlorinatorAdjustment(1.0, 50000, config);
    // Both strategies branch
    expect(result.suggestedOutputPercent).toBeDefined();
    // Should never exceed max
    expect(result.suggestedOutputPercent!).toBeLessThanOrEqual(80);
  });

  it('caps suggestedAdditionalHours to remaining hours in day', () => {
    const config = makeConfig({
      productionGramsPerHour: 5,
      currentOutputPercent: 50,
      filtrationHoursPerDay: 10,
      maxRecommendedHoursPerDay: 12,
    });
    // deltaPpm=3.0, vol=50000L → chlorineNeededG=150g
    // effectiveAtCurrent = 5*0.5=2.5g/h → hoursNeeded=60h
    // hoursAtMaxOutput: 5*1.0=5g/h → 150/5=30h > 10h → first branch fails
    // hoursNeeded=60h > maxHours=12h → else-if fails
    // Both: canAdjustOutput=true, canExtendHours=true
    const result = calculateChlorinatorAdjustment(3.0, 50000, config);
    expect(result.suggestedAdditionalHours).toBeDefined();
    // remaining hours = 12 - 10 = 2h
    expect(result.suggestedAdditionalHours!).toBeLessThanOrEqual(2);
  });

  it('rounds additional hours up to the configured programmable increment without truncating decimals', () => {
    const config = makeConfig({
      productionGramsPerHour: 10,
      currentOutputPercent: 100,
      maxRecommendedOutputPercent: 100,
      filtrationHoursPerDay: 6,
      maxRecommendedHoursPerDay: 12,
      minProgrammableHourIncrement: 0.1,
    });

    const result = calculateChlorinatorAdjustment(1.36, 50000, config);

    expect(result.hoursNeeded).toBeCloseTo(6.8);
    expect(result.suggestedAdditionalHours).toBe(0.8);
    expect(result.roundingPolicy.minProgrammableHourIncrement).toBe(0.1);
  });

  it('does not suggest percentage changes for runtime-only chlorinators', () => {
    const config = createChlorinatorConfigFromPreset('intex-qs500-26668');
    const result = calculateChlorinatorAdjustment(0.5, 50000, {
      ...config,
      filtrationHoursPerDay: 1,
      maxRecommendedHoursPerDay: 12,
    });

    expect(result.canAdjustOutput).toBe(false);
    expect(result.suggestedOutputPercent).toBeUndefined();
    expect(result.suggestedAdditionalHours).toBeGreaterThan(0);
  });

  it('keeps the INTEX QS500 boost output unknown in the preset snapshot', () => {
    const boost = INTEX_QS500_26668_PRESET.supportedModes.find((mode) => mode.code === 'boost');
    expect(INTEX_QS500_26668_PRESET.outputControl.kind).toBe('runtime-only');
    expect(boost?.outputModel).toBe('unknown');
    expect(boost?.outputMultiplier).toBeUndefined();
    expect(boost?.chlorineOutputGramsPerHour).toBeUndefined();
  });

  it('defines the canonical INTEX QS500 preset in minutes without percentage control', () => {
    const normal = INTEX_QS500_26668_CHLORINATOR.operatingModes.find((mode) => mode.code === 'normal');
    const boost = INTEX_QS500_26668_CHLORINATOR.operatingModes.find((mode) => mode.code === 'boost');

    expect(INTEX_QS500_26668_CHLORINATOR.controlType).toBe('fixed-output-runtime');
    expect(INTEX_QS500_26668_CHLORINATOR.nominalOutput).toEqual({
      value: 5,
      unit: 'g-per-hour',
      source: 'manufacturer',
    });
    expect(INTEX_QS500_26668_CHLORINATOR.outputControl).toBeUndefined();
    expect(INTEX_QS500_26668_CHLORINATOR.runtimeControl).toMatchObject({
      runtimeAdjustable: true,
      minimumRuntimeMinutes: 60,
      maximumRuntimeMinutes: 720,
      runtimeIncrementMinutes: 60,
      scheduleType: 'internal-daily-cycle',
      repeatsEvery24Hours: true,
    });
    expect(normal?.absoluteOutputGramsPerHour).toBe(5);
    expect(boost?.outputModel).toBe('unknown');
    expect(boost?.outputMultiplier).toBeUndefined();
  });

  it('rounds 0.8h theoretical runtime to 1h for the INTEX supported increment', () => {
    const config = createChlorinatorConfigFromPreset('intex-qs500-26668');
    const runtime = calculateRuntimeCalculation(48, {
      ...config,
      filtrationHoursPerDay: 1,
    });

    expect(runtime.theoreticalAdditionalMinutes).toBe(48);
    expect(runtime.supportedIncrementMinutes).toBe(60);
    expect(runtime.operationalAdditionalMinutes).toBe(60);
    expect(runtime.roundingPolicy).toBe('ceil-to-supported-increment');
    expect(runtime.limitedByDailyMaximum).toBe(false);
  });

  it('migrates legacy percentage settings to a canonical chlorinator snapshot', () => {
    const migrated = migrateSaltChlorinatorConfig(makeConfig(), '2026-07-19T10:00:00.000Z');

    expect(migrated.chlorinator?.schemaVersion).toBe('2.0.0');
    expect(migrated.chlorinator?.controlType).toBe('continuous-percentage');
    expect(migrated.chlorinator?.dataProvenance.legacyProvenance).toBe('legacy-percentage-control');
    expect(migrated.chlorinator?.outputControl).toMatchObject({
      minimumPercent: 0,
      maximumPercent: 100,
      defaultPercent: 60,
    });
  });

  it('creates an unknown chlorinator preset without quantitative production assumptions', () => {
    const config = createChlorinatorConfigFromPreset('unknown');

    expect(config.outputControl?.kind).toBe('unknown');
    expect(config.chlorinator?.controlType).toBe('unknown');
    expect(getCurrentProductionGramsPerHour(config)).toBe(0);
    expect(describeChlorinatorProduction(config)).toContain('desconocida');
  });

  it('calculates discrete-level production from absolute output or nominal percent', () => {
    const absolute = makeConfig({
      outputControl: {
        kind: 'discrete-levels',
        levels: [
          { id: 'low', labelKey: 'low', nominalOutputPercent: 25 },
          { id: 'high', labelKey: 'high', chlorineOutputGramsPerHour: 12 },
        ],
      },
      currentOutputLevelId: 'high',
    });
    const percent = { ...absolute, currentOutputLevelId: 'low' };
    const missing = { ...absolute, currentOutputLevelId: 'missing' };

    expect(getCurrentProductionGramsPerHour(absolute)).toBe(12);
    expect(getCurrentProductionGramsPerHour(percent)).toBe(5);
    expect(getCurrentProductionGramsPerHour(missing)).toBe(0);
    expect(describeChlorinatorProduction(percent)).toContain('nivel low');
  });

  it('derives automatic and external-controller capabilities without runtime assumptions beyond configuration', () => {
    const automatic = makeConfig({
      outputControl: { kind: 'automatic', controlBasis: 'orp' },
      runtimeControl: {
        supported: true,
        maximumHours: 12,
        incrementMinutes: 60,
        schedulingType: 'automatic',
      },
    });
    const externalTimer = makeConfig({
      outputControl: { kind: 'externally-controlled', controllerType: 'external-timer' },
      runtimeControl: {
        supported: true,
        maximumHours: 12,
        incrementMinutes: 60,
        schedulingType: 'external-timer',
      },
    });

    expect(getChlorinatorCapabilities(automatic).isAutomatic).toBe(true);
    expect(getChlorinatorActionCapabilities(automatic)).toContain('calibrate-sensor');
    expect(describeChlorinatorProduction(automatic)).toContain('orp');
    expect(migrateSaltChlorinatorConfig(externalTimer).chlorinator?.controlType).toBe('external-timer');
  });

  it('derives percentage and discrete-level action capabilities', () => {
    const percentageActions = getChlorinatorActionCapabilities(makeConfig());
    const discreteActions = getChlorinatorActionCapabilities(makeConfig({
      outputControl: {
        kind: 'discrete-levels',
        levels: [{ id: 'low', labelKey: 'low' }],
      },
    }));

    expect(percentageActions).toContain('increase-output-percent');
    expect(percentageActions).toContain('decrease-output-percent');
    expect(percentageActions).toContain('set-output-percent');
    expect(discreteActions).toContain('increase-output-level');
    expect(discreteActions).toContain('decrease-output-level');
    expect(discreteActions).toContain('set-output-level');
  });

  it('describes fixed and externally controlled production paths', () => {
    expect(describeChlorinatorProduction(makeConfig({
      outputControl: { kind: 'fixed' },
    }))).toContain('Produccion fija');
    expect(describeChlorinatorProduction(makeConfig({
      outputControl: { kind: 'externally-controlled', controllerType: 'home-automation' },
    }))).toContain('home-automation');
  });

  it('maps automatic free-chlorine, automatic custom, and unknown legacy controls during migration', () => {
    expect(migrateSaltChlorinatorConfig(makeConfig({
      outputControl: { kind: 'automatic', controlBasis: 'free-chlorine' },
    })).chlorinator?.controlType).toBe('automatic-free-chlorine');
    expect(migrateSaltChlorinatorConfig(makeConfig({
      outputControl: { kind: 'automatic', controlBasis: 'flow' },
    })).chlorinator?.controlType).toBe('custom');

    const unknownLegacy = {
      ...makeConfig(),
      currentOutputPercent: undefined,
      maxRecommendedOutputPercent: undefined,
    } as unknown as SaltChlorinatorConfig;
    expect(migrateSaltChlorinatorConfig(unknownLegacy).chlorinator?.controlType).toBe('unknown');
  });

  it('returns fixed legacy nominal production from legacy fixed controls', () => {
    expect(getCurrentProductionGramsPerHour(makeConfig({
      productionGramsPerHour: 7,
      outputControl: { kind: 'fixed' },
    }))).toBe(7);
  });

  it('adapts fixed and percentage chlorinators for legacy rules without inventing regulable percent', () => {
    const adapter = new ChlorinatorRecommendationContextAdapter();
    const fixed = adapter.from(createChlorinatorConfigFromPreset('intex-qs500-26668'));
    const percentage = adapter.from(makeConfig(), {
      chlorinatorId: 'pct',
      intervalStartAt: '2026-07-19T10:00:00.000Z',
      intervalEndAt: '2026-07-19T11:00:00.000Z',
      source: 'user-reported',
      normalOperation: {
        actualRuntimeMinutes: 90,
        averageOutputPercent: 70,
        completionStatus: 'completed',
      },
      boostOperation: {
        status: 'used',
        activated: true,
        productionKnown: false,
        outputKnowledge: 'unknown',
      },
      flowStatus: 'confirmed',
      alarms: [],
      interruptions: [],
    });

    expect(fixed.outputPercent).toBe(100);
    expect(fixed.outputPercentRegulable).toBe(false);
    expect(fixed.outputPercentProvenance).toBe('legacy-assumed-nominal-output');
    expect(fixed.boostMultiplier).toBeUndefined();
    expect(percentage.outputPercent).toBe(70);
    expect(percentage.outputPercentRegulable).toBe(true);
    expect(percentage.runtimeHours).toBe(1.5);
  });

  it('migrates fixed, pump-linked, manual, and discrete configurations to v2 fields', () => {
    const fixed = migrateSaltChlorinatorConfig(makeConfig({
      outputControl: { kind: 'fixed' },
      equipment: {
        id: 'custom-fixed',
        manufacturer: 'Example',
        model: 'Fixed',
        productReference: 'A1',
        serialNumber: 'SN1',
        nominalChlorineOutputGramsPerHour: 8,
        outputControl: { kind: 'fixed' },
        runtimeControl: {
          supported: true,
          minimumHours: 1,
          maximumHours: 8,
          incrementMinutes: 30,
          schedulingType: 'filter-pump-linked',
        },
        supportedModes: [
          {
            code: 'unknown',
            supported: true,
            durationControl: 'fixed',
            fixedDurationHours: 2,
            outputModel: 'known-absolute-output',
            chlorineOutputGramsPerHour: 8,
          },
        ],
        requiresWaterFlow: true,
        linkedFiltrationRequired: true,
        compatibleSaltRangePpm: {
          min: 2800,
          max: 3600,
          preferredMin: 3000,
          preferredMax: 3400,
        },
        minimumFlowRate: { value: 4000, unit: 'l-per-hour' },
        maximumFlowRate: { value: 8000, unit: 'l-per-hour' },
        dataSource: 'user-entered',
      },
      runtimeControl: {
        supported: true,
        minimumHours: 1,
        maximumHours: 8,
        incrementMinutes: 30,
        schedulingType: 'filter-pump-linked',
      },
      supportedModes: [
        {
          code: 'unknown',
          supported: true,
          durationControl: 'fixed',
          fixedDurationHours: 2,
          outputModel: 'known-absolute-output',
          chlorineOutputGramsPerHour: 8,
        },
      ],
    }));
    const manual = migrateSaltChlorinatorConfig(makeConfig({
      outputControl: { kind: 'runtime-only' },
      runtimeControl: {
        supported: true,
        maximumHours: 6,
        incrementMinutes: 60,
        schedulingType: 'manual',
      },
    }));
    const discrete = migrateSaltChlorinatorConfig(makeConfig({
      outputControl: {
        kind: 'discrete-levels',
        levels: [{ id: '1', labelKey: 'Nivel 1', nominalOutputPercent: 50 }],
      },
    }));

    expect(fixed.chlorinator?.controlType).toBe('fixed-output-runtime');
    expect(fixed.chlorinator?.runtimeControl.scheduleType).toBe('linked-to-filtration');
    expect(fixed.chlorinator?.operatingModes[0].code).toBe('custom');
    expect(fixed.chlorinator?.operatingModes[0].fixedDurationMinutes).toBe(120);
    expect(fixed.chlorinator?.flowRequirements?.minimumFlowRate?.value).toBe(4000);
    expect(fixed.chlorinator?.saltRequirements?.preferredMaximumPpm).toBe(3400);
    expect(manual.chlorinator?.runtimeControl.scheduleType).toBe('manual-start');
    expect(discrete.chlorinator?.controlType).toBe('discrete-levels');
    expect(discrete.chlorinator?.outputControl).toEqual({
      levels: [{ id: '1', label: 'Nivel 1', nominalPercent: 50, nominalOutputGramsPerHour: undefined }],
    });
  });

  it('reports exact, zero, and daily-limited runtime calculations deterministically', () => {
    const config = createChlorinatorConfigFromPreset('intex-qs500-26668');

    expect(calculateRuntimeCalculation(60, config)).toMatchObject({
      theoreticalAdditionalMinutes: 60,
      operationalAdditionalMinutes: 60,
      roundingPolicy: 'exact',
      limitedByDailyMaximum: false,
    });
    expect(calculateRuntimeCalculation(-10, config)).toMatchObject({
      theoreticalAdditionalMinutes: 0,
      operationalAdditionalMinutes: 0,
      roundingPolicy: 'exact',
    });
    expect(calculateRuntimeCalculation(180, { ...config, filtrationHoursPerDay: 11.5 })).toMatchObject({
      operationalAdditionalMinutes: 30,
      limitedByDailyMaximum: true,
    });
  });

  it('derives possible actions from chlorinator capabilities', () => {
    const actions = getChlorinatorActionCapabilities(createChlorinatorConfigFromPreset('intex-qs500-26668'));
    expect(actions).toContain('increase-runtime');
    expect(actions).toContain('set-runtime');
    expect(actions).toContain('repeat-cycle');
    expect(actions).toContain('activate-boost');
    expect(actions).not.toContain('increase-output-percent');
  });
});
