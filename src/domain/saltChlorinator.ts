// ── Salt chlorinator configuration ────────────────────────────────

export interface SaltChlorinatorConfig {
  enabled: boolean;
  productionGramsPerHour: number;
  currentOutputPercent: number;
  filtrationHoursPerDay: number;
  maxRecommendedOutputPercent: number;
  maxRecommendedHoursPerDay: number;
  minProgrammableHourIncrement?: number;
}

export interface ChlorinatorAdjustment {
  suggestedOutputPercent?: number;
  suggestedAdditionalHours?: number;
  hoursNeeded: number;
  canAdjustOutput: boolean;
  canExtendHours: boolean;
  roundingPolicy: {
    minProgrammableHourIncrement: number;
    mode: 'ceil-to-increment';
  };
}

/**
 * Calculate the chlorinator adjustment needed to raise FAC by deltaPpm.
 *
 * Returns the adjustment recommendations and the raw hours needed.
 */
export function calculateChlorinatorAdjustment(
  deltaPpm: number,
  poolVolumeLiters: number,
  config: SaltChlorinatorConfig,
): ChlorinatorAdjustment {
  // 1 ppm = 1 mg/L
  // chlorineNeededGrams = deltaPpm * poolVolumeLiters / 1000
  const chlorineNeededGrams = (deltaPpm * poolVolumeLiters) / 1000;

  // effectiveProductionGramsPerHour = productionGramsPerHour * outputPercent / 100
  const effectiveAtCurrent = config.productionGramsPerHour * (config.currentOutputPercent / 100);
  const hoursNeeded = effectiveAtCurrent > 0
    ? chlorineNeededGrams / effectiveAtCurrent
    : Infinity;

  // Try increasing output first
  const maxOutput = config.maxRecommendedOutputPercent;
  const effectiveAtMax = config.productionGramsPerHour * (maxOutput / 100);
  const hoursAtMaxOutput = effectiveAtMax > 0
    ? chlorineNeededGrams / effectiveAtMax
    : Infinity;

  // Try extending hours
  const maxHours = config.maxRecommendedHoursPerDay;
  const remainingHours = maxHours - config.filtrationHoursPerDay;

  const canAdjustOutput = config.currentOutputPercent < maxOutput;
  const canExtendHours = remainingHours > 0;

  let suggestedOutputPercent: number | undefined;
  let suggestedAdditionalHours: number | undefined;
  const minProgrammableHourIncrement = normalizeHourIncrement(config.minProgrammableHourIncrement);

  // Strategy: prefer output adjustment, then hours, then both
  if (hoursAtMaxOutput <= config.filtrationHoursPerDay && canAdjustOutput) {
    // We can achieve the correction by increasing output within existing hours
    // Calculate needed output: outputNeeded = (desiredGramsPerHour / maxProduction) * 100
    const desiredGramsPerHour = chlorineNeededGrams / config.filtrationHoursPerDay;
    const neededOutput = Math.ceil(
      (desiredGramsPerHour / config.productionGramsPerHour) * 100,
    );
    suggestedOutputPercent = Math.min(neededOutput, maxOutput);
  } else if (hoursNeeded <= maxHours && canExtendHours) {
    // We can achieve by extending hours at current output
    suggestedAdditionalHours = roundHoursUpToIncrement(
      hoursNeeded - config.filtrationHoursPerDay,
      minProgrammableHourIncrement,
    );
    if (suggestedAdditionalHours < 0) suggestedAdditionalHours = 0;
    suggestedAdditionalHours = Math.min(suggestedAdditionalHours, remainingHours);
  } else if (canAdjustOutput && canExtendHours) {
    // Need both
    const neededOutput = Math.ceil(
      (chlorineNeededGrams / config.filtrationHoursPerDay / config.productionGramsPerHour) * 100,
    );
    suggestedOutputPercent = Math.min(neededOutput, maxOutput);

    // Calculate remaining need after output increase
    const effectiveWithIncrease = config.productionGramsPerHour * ((suggestedOutputPercent ?? config.currentOutputPercent) / 100);
    const hoursRemainingAfterOutput = effectiveWithIncrease > 0
      ? chlorineNeededGrams / effectiveWithIncrease - config.filtrationHoursPerDay
      : 0;
    if (hoursRemainingAfterOutput > 0) {
      suggestedAdditionalHours = Math.min(
        roundHoursUpToIncrement(hoursRemainingAfterOutput, minProgrammableHourIncrement),
        remainingHours,
      );
    }
  }

  // Ensure we don't suggest values beyond limits
  if (suggestedOutputPercent !== undefined) {
    suggestedOutputPercent = Math.min(suggestedOutputPercent, maxOutput);
  }
  if (suggestedAdditionalHours !== undefined) {
    const maxAdditional = maxHours - config.filtrationHoursPerDay;
    suggestedAdditionalHours = Math.min(suggestedAdditionalHours, maxAdditional);
  }

  return {
    suggestedOutputPercent,
    suggestedAdditionalHours,
    hoursNeeded,
    canAdjustOutput,
    canExtendHours,
    roundingPolicy: {
      minProgrammableHourIncrement,
      mode: 'ceil-to-increment',
    },
  };
}

function normalizeHourIncrement(value: number | undefined): number {
  if (value === undefined || value <= 0 || !Number.isFinite(value)) return 1;
  return value;
}

function roundHoursUpToIncrement(hours: number, increment: number): number {
  if (!Number.isFinite(hours)) return hours;
  if (hours <= 0) return 0;
  const rounded = Math.ceil(hours / increment) * increment;
  return Math.round(rounded * 100) / 100;
}
