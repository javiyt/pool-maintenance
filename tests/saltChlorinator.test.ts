import { describe, it, expect } from 'vitest';
import {
  INTEX_QS500_26668_PRESET,
  calculateChlorinatorAdjustment,
  createChlorinatorConfigFromPreset,
  getChlorinatorActionCapabilities,
} from '../src/domain/saltChlorinator';
import type { SaltChlorinatorConfig } from '../src/domain/saltChlorinator';

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

  it('derives possible actions from chlorinator capabilities', () => {
    const actions = getChlorinatorActionCapabilities(createChlorinatorConfigFromPreset('intex-qs500-26668'));
    expect(actions).toContain('increase-runtime');
    expect(actions).toContain('activate-boost');
    expect(actions).not.toContain('increase-output-percent');
  });
});
