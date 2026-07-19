// ── Salt chlorinator configuration ────────────────────────────────

export const CHLORINATOR_SCHEMA_VERSION = '2.0.0';
export const CHLORINATOR_CATALOG_VERSION = '1.0.0';
export const CHLORINATOR_CALCULATION_VERSION = '1.0.0';

export type ChlorinatorControlType =
  | 'fixed-output-runtime'
  | 'continuous-percentage'
  | 'discrete-levels'
  | 'automatic-orp'
  | 'automatic-free-chlorine'
  | 'external-controller'
  | 'external-timer'
  | 'unknown'
  | 'custom';

export interface PercentageOutputControl {
  minimumPercent: number;
  maximumPercent: number;
  incrementPercent?: number;
  defaultPercent?: number;
}

export interface DiscreteOutputControl {
  levels: Array<{
    id: string;
    label: string;
    nominalPercent?: number;
    nominalOutputGramsPerHour?: number;
  }>;
}

export interface ChlorinatorRuntimeControl {
  runtimeAdjustable: boolean;
  minimumRuntimeMinutes?: number;
  maximumRuntimeMinutes?: number;
  runtimeIncrementMinutes?: number;
  scheduleType:
    | 'internal-daily-cycle'
    | 'internal-weekly-schedule'
    | 'external-timer'
    | 'linked-to-filtration'
    | 'manual-start'
    | 'continuous'
    | 'automatic'
    | 'unknown';
  repeatsEvery24Hours?: boolean;
}

export interface FlowRequirements {
  requiresFlow?: boolean;
  minimumFlowRate?: {
    value: number;
    unit: 'l-per-hour' | 'm3-per-hour';
  };
  maximumFlowRate?: {
    value: number;
    unit: 'l-per-hour' | 'm3-per-hour';
  };
  linkedFiltrationRequired?: boolean;
  hasFlowSensor?: boolean;
  stopsWithoutFlow?: boolean;
  pumpStartDelaySeconds?: number;
}

export interface SaltRequirements {
  minimumPpm?: number;
  maximumPpm?: number;
  preferredMinimumPpm?: number;
  preferredMaximumPpm?: number;
  lowSaltAlarm?: boolean;
  highSaltAlarm?: boolean;
}

export interface SelfCleaningConfiguration {
  polarityReversal?: boolean;
  selectableCycleMinutes?: number[];
  configuredCycleMinutes?: number;
  automaticFrequencyMinutes?: number;
  unknown?: boolean;
}

export interface ChlorinatorAutomationConfiguration {
  controlBasis?: 'orp' | 'free-chlorine' | 'flow' | 'manufacturer-algorithm' | 'unknown';
  setpoint?: {
    value: number;
    unit: 'mv' | 'ppm';
  };
  hysteresis?: number;
  sensor?: string;
  manualModeAvailable?: boolean;
  safetyLimits?: {
    minimum?: number;
    maximum?: number;
  };
  externalDevice?: string;
  homeAutomationIntegration?: string;
  dataSource?: 'manufacturer' | 'user-entered' | 'estimated' | 'unknown';
}

export type ChlorinatorModeCode =
  | 'normal'
  | 'boost'
  | 'superchlorination'
  | 'low-output'
  | 'winter'
  | 'cover'
  | 'automatic'
  | 'manual'
  | 'off'
  | 'custom';

export interface ChlorinatorMode {
  code: ChlorinatorModeCode;
  enabled: boolean;
  customLabel?: string;
  durationControl:
    | 'fixed'
    | 'configurable'
    | 'until-cancelled'
    | 'manufacturer-controlled'
    | 'unknown';
  fixedDurationMinutes?: number;
  minimumDurationMinutes?: number;
  maximumDurationMinutes?: number;
  durationIncrementMinutes?: number;
  outputModel:
    | 'same-as-normal'
    | 'known-multiplier'
    | 'known-absolute-output'
    | 'manufacturer-controlled'
    | 'unknown';
  outputMultiplier?: number;
  absoluteOutputGramsPerHour?: number;
  source: 'manufacturer' | 'user-entered' | 'estimated' | 'unknown';
  notes?: string[];
}

export interface SaltChlorinatorV2 {
  id: string;
  manufacturer?: string;
  model?: string;
  productReference?: string;
  serialNumber?: string;
  controlType: ChlorinatorControlType;
  nominalOutput?: {
    value: number;
    unit: 'g-per-hour';
    source: 'manufacturer' | 'manual' | 'user-entered' | 'estimated' | 'unknown';
  };
  outputControl?: PercentageOutputControl | DiscreteOutputControl;
  runtimeControl: ChlorinatorRuntimeControl;
  operatingModes: ChlorinatorMode[];
  flowRequirements?: FlowRequirements;
  saltRequirements?: SaltRequirements;
  selfCleaning?: SelfCleaningConfiguration;
  automation?: ChlorinatorAutomationConfiguration;
  notes?: string;
  dataProvenance: {
    source: 'manufacturer-preset' | 'manufacturer-manual' | 'user-entered' | 'imported' | 'unknown';
    sourceReference?: string;
    legacyProvenance?: 'legacy-percentage-control' | 'legacy-assumed-nominal-output';
  };
  createdAt: string;
  updatedAt: string;
  schemaVersion: string;
}

export type ChlorinatorOutputControl =
  | {
      kind: 'fixed';
    }
  | {
      kind: 'continuous-percentage';
      minimumPercent: number;
      maximumPercent: number;
      incrementPercent?: number;
    }
  | {
      kind: 'discrete-levels';
      levels: Array<{
        id: string;
        labelKey: string;
        nominalOutputPercent?: number;
        chlorineOutputGramsPerHour?: number;
      }>;
    }
  | {
      kind: 'runtime-only';
    }
  | {
      kind: 'externally-controlled';
      controllerType:
        | 'orp-controller'
        | 'chlorine-controller'
        | 'home-automation'
        | 'external-timer'
        | 'other';
    }
  | {
      kind: 'automatic';
      controlBasis:
        | 'orp'
        | 'free-chlorine'
        | 'flow'
        | 'manufacturer-algorithm'
        | 'unknown';
    }
  | {
      kind: 'unknown';
    };

export type ChlorinatorOperatingMode =
  | 'normal'
  | 'boost'
  | 'superchlorination'
  | 'low-output'
  | 'winter'
  | 'cover'
  | 'automatic'
  | 'manual'
  | 'off'
  | 'unknown'
  | 'custom';

export interface ChlorinatorModeDefinition {
  code: ChlorinatorOperatingMode;
  supported: boolean;
  durationControl:
    | 'fixed'
    | 'configurable'
    | 'until-cancelled'
    | 'manufacturer-controlled'
    | 'unknown';
  fixedDurationHours?: number;
  minimumDurationHours?: number;
  maximumDurationHours?: number;
  durationIncrementMinutes?: number;
  outputModel:
    | 'same-as-normal'
    | 'known-multiplier'
    | 'known-absolute-output'
    | 'manufacturer-controlled'
    | 'unknown';
  outputMultiplier?: number;
  chlorineOutputGramsPerHour?: number;
  notes?: string[];
}

export interface SaltChlorinator {
  id: string;
  manufacturer?: string;
  model?: string;
  productReference?: string;
  serialNumber?: string;
  nominalChlorineOutputGramsPerHour?: number;
  minimumChlorineOutputGramsPerHour?: number;
  maximumChlorineOutputGramsPerHour?: number;
  outputControl: ChlorinatorOutputControl;
  runtimeControl: {
    supported: boolean;
    minimumHours?: number;
    maximumHours?: number;
    incrementMinutes?: number;
    schedulingType:
      | 'internal-daily-cycle'
      | 'internal-weekly-schedule'
      | 'external-timer'
      | 'filter-pump-linked'
      | 'continuous'
      | 'manual'
      | 'automatic'
      | 'unknown';
  };
  supportedModes: ChlorinatorModeDefinition[];
  requiresWaterFlow: boolean;
  linkedFiltrationRequired: boolean;
  compatibleSaltRangePpm?: {
    min: number;
    max: number;
    preferredMin?: number;
    preferredMax?: number;
  };
  minimumFlowRate?: {
    value: number;
    unit: 'l-per-hour' | 'm3-per-hour';
  };
  maximumFlowRate?: {
    value: number;
    unit: 'l-per-hour' | 'm3-per-hour';
  };
  selfCleaning?: {
    supported: boolean;
    selectableCyclesHours?: number[];
    configuredCycleHours?: number;
  };
  secondaryTreatment?: {
    ozoneOutputMgPerHour?: number;
    uv?: boolean;
    electroCatalyticOxidation?: boolean;
    other?: string[];
  };
  dataSource: 'manufacturer' | 'manual' | 'user-entered' | 'imported' | 'unknown';
  sourceNotes?: string;
}

export type ChlorinatorPresetId = 'custom' | 'unknown' | 'intex-qs500-26668';

export interface ChlorinatorAlarm {
  code?: string;
  message?: string;
  severity?: 'info' | 'warning' | 'error' | 'unknown';
}

export interface ChlorinatorInterruption {
  startedAt?: string;
  endedAt?: string;
  reason?: 'no-flow' | 'low-salt' | 'high-salt' | 'power-loss' | 'manual-stop' | 'alarm' | 'unknown';
  notes?: string;
}

export interface ChlorinatorIntervalOperation {
  id?: string;
  chlorinatorId: string;
  intervalStartAt: string;
  intervalEndAt: string;
  source: 'user-reported' | 'device' | 'automation' | 'estimated' | 'legacy' | 'unknown';
  normalOperation?: {
    configuredRuntimeMinutes?: number;
    actualRuntimeMinutes?: number;
    configuredOutputPercent?: number;
    averageOutputPercent?: number;
    configuredLevelId?: string;
    averageLevelId?: string;
    completionStatus?: 'completed' | 'interrupted' | 'not-started' | 'unknown';
    runtimeHours?: number;
    configuredRuntimeHours?: number;
    outputPercent?: number;
    outputLevelId?: string;
    expectedCompleted?: boolean;
    actuallyCompleted?: boolean;
  };
  boostOperation?: {
    status?: 'not-used' | 'used' | 'unknown';
    configuredRuntimeMinutes?: number;
    actualRuntimeMinutes?: number;
    outputKnowledge?: 'manufacturer-known' | 'user-configured' | 'historically-estimated' | 'unknown';
    outputGramsPerHour?: number;
    activated: boolean;
    runtimeHours?: number;
    configuredRuntimeHours?: number;
    outputMultiplier?: number;
    chlorineOutputGramsPerHour?: number;
    productionKnown: boolean;
  };
  filtrationRuntimeMinutes?: number;
  flowStatus?: 'confirmed' | 'not-confirmed' | 'insufficient' | 'unknown';
  filtrationRuntimeHours?: number;
  flowConfirmed?: boolean;
  alarms: ChlorinatorAlarm[];
  interruptions: ChlorinatorInterruption[];
  notes?: string;
}

export type ChlorinatorCapabilityAction =
  | 'increase-runtime'
  | 'decrease-runtime'
  | 'set-runtime'
  | 'repeat-cycle'
  | 'change-daily-program'
  | 'increase-output-percent'
  | 'decrease-output-percent'
  | 'set-output-percent'
  | 'increase-output-level'
  | 'decrease-output-level'
  | 'set-output-level'
  | 'activate-boost'
  | 'deactivate-boost'
  | 'change-automatic-setpoint'
  | 'change-automatic-limits'
  | 'activate-manual-control'
  | 'inspect-cell'
  | 'clean-cell'
  | 'check-flow'
  | 'check-salt'
  | 'check-errors'
  | 'inspect-sensor'
  | 'calibrate-sensor'
  | 'review-automation'
  | 'no-change';

export interface SaltChlorinatorConfig {
  enabled: boolean;
  productionGramsPerHour: number;
  currentOutputPercent: number;
  filtrationHoursPerDay: number;
  maxRecommendedOutputPercent: number;
  maxRecommendedHoursPerDay: number;
  minProgrammableHourIncrement?: number;
  presetId?: ChlorinatorPresetId;
  equipment?: SaltChlorinator;
  outputControl?: ChlorinatorOutputControl;
  runtimeControl?: SaltChlorinator['runtimeControl'];
  supportedModes?: ChlorinatorModeDefinition[];
  currentOutputLevelId?: string;
  usualOperatingMode?: ChlorinatorOperatingMode;
  automaticSetpoint?: {
    basis: 'orp' | 'free-chlorine';
    value: number;
    unit: 'mv' | 'ppm';
  };
  chlorinator?: SaltChlorinatorV2;
  chlorinatorSchemaVersion?: string;
  chlorinatorCatalogVersion?: string;
  chlorinatorCalculationVersion?: string;
}

export interface ChlorinatorAdjustment {
  suggestedOutputPercent?: number;
  suggestedAdditionalHours?: number;
  runtimeCalculation?: RuntimeCalculation;
  hoursNeeded: number;
  canAdjustOutput: boolean;
  canExtendHours: boolean;
  roundingPolicy: {
    minProgrammableHourIncrement: number;
    mode: 'ceil-to-increment';
  };
}

export interface RuntimeCalculation {
  theoreticalAdditionalMinutes: number;
  operationalAdditionalMinutes: number;
  roundingPolicy:
    | 'exact'
    | 'ceil-to-supported-increment'
    | 'nearest-supported-increment'
    | 'manual';
  supportedIncrementMinutes?: number;
  limitedByDailyMaximum: boolean;
  maximumRuntimeMinutes?: number;
}

export interface ChlorinatorCapabilities {
  controlType: ChlorinatorControlType;
  supportsRuntimeAdjustment: boolean;
  supportsPercentageAdjustment: boolean;
  supportsDiscreteLevels: boolean;
  supportsBoost: boolean;
  supportsAutomaticControl: boolean;
  nominalOutputGramsPerHour?: number;
  minimumRuntimeMinutes?: number;
  maximumRuntimeMinutes?: number;
  runtimeIncrementMinutes?: number;
  minimumOutputPercent?: number;
  maximumOutputPercent?: number;
  outputIncrementPercent?: number;
  availableLevels?: Array<{
    id: string;
    nominalOutputPercent?: number;
    nominalOutputGramsPerHour?: number;
  }>;
  boostOutputKnowledge: 'known' | 'manufacturer-controlled' | 'historically-estimated' | 'unknown';
  requiresFlow: boolean;
  linkedToFiltration: boolean;
  canAdjustRuntime: boolean;
  canAdjustPercentage: boolean;
  canSelectDiscreteLevel: boolean;
  isAutomatic: boolean;
  hasKnownNormalProduction: boolean;
}

export const INTEX_QS500_26668_PRESET: SaltChlorinator = {
  id: 'intex-qs500-26668',
  manufacturer: 'INTEX',
  model: 'QS500 / 26668',
  productReference: '26668',
  nominalChlorineOutputGramsPerHour: 5,
  outputControl: {
    kind: 'runtime-only',
  },
  runtimeControl: {
    supported: true,
    minimumHours: 1,
    maximumHours: 12,
    incrementMinutes: 60,
    schedulingType: 'internal-daily-cycle',
  },
  supportedModes: [
    {
      code: 'normal',
      supported: true,
      durationControl: 'configurable',
      minimumDurationHours: 1,
      maximumDurationHours: 12,
      durationIncrementMinutes: 60,
      outputModel: 'known-absolute-output',
      chlorineOutputGramsPerHour: 5,
    },
    {
      code: 'boost',
      supported: true,
      durationControl: 'manufacturer-controlled',
      outputModel: 'unknown',
      notes: [
        'Boost output increase is not configured or documented in this app.',
      ],
    },
  ],
  requiresWaterFlow: true,
  linkedFiltrationRequired: true,
  dataSource: 'manufacturer',
};

export const INTEX_QS500_26668_CHLORINATOR: SaltChlorinatorV2 = {
  id: 'intex-qs500-26668',
  manufacturer: 'INTEX',
  model: 'QS500',
  productReference: '26668',
  controlType: 'fixed-output-runtime',
  nominalOutput: {
    value: 5,
    unit: 'g-per-hour',
    source: 'manufacturer',
  },
  runtimeControl: {
    runtimeAdjustable: true,
    minimumRuntimeMinutes: 60,
    maximumRuntimeMinutes: 720,
    runtimeIncrementMinutes: 60,
    scheduleType: 'internal-daily-cycle',
    repeatsEvery24Hours: true,
  },
  operatingModes: [
    {
      code: 'normal',
      enabled: true,
      durationControl: 'configurable',
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 720,
      durationIncrementMinutes: 60,
      outputModel: 'known-absolute-output',
      absoluteOutputGramsPerHour: 5,
      source: 'manufacturer',
    },
    {
      code: 'boost',
      enabled: true,
      durationControl: 'manufacturer-controlled',
      outputModel: 'unknown',
      source: 'manufacturer',
    },
  ],
  flowRequirements: {
    requiresFlow: true,
    linkedFiltrationRequired: true,
  },
  dataProvenance: {
    source: 'manufacturer-preset',
    sourceReference: 'INTEX QS500 / 26668 preset',
  },
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  schemaVersion: CHLORINATOR_SCHEMA_VERSION,
};

export const CHLORINATOR_PRESETS: Record<Exclude<ChlorinatorPresetId, 'custom' | 'unknown'>, SaltChlorinator> = {
  'intex-qs500-26668': INTEX_QS500_26668_PRESET,
};

export const CHLORINATOR_V2_PRESETS: Record<Exclude<ChlorinatorPresetId, 'custom' | 'unknown'>, SaltChlorinatorV2> = {
  'intex-qs500-26668': INTEX_QS500_26668_CHLORINATOR,
};

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
  const capabilities = getChlorinatorCapabilities(config);
  const currentProduction = getCurrentProductionGramsPerHour(config);
  const outputControl = getChlorinatorOutputControl(config);

  const hoursNeeded = currentProduction > 0
    ? chlorineNeededGrams / currentProduction
    : Infinity;
  const runtimeCalculation = calculateRuntimeCalculation(hoursNeeded * 60, config);

  // Try increasing output first
  const maxOutput = getMaximumOutputPercent(config);
  const effectiveAtMax = getMaxRecommendedProductionGramsPerHour(config);
  const hoursAtMaxOutput = effectiveAtMax > 0
    ? chlorineNeededGrams / effectiveAtMax
    : Infinity;

  // Try extending hours
  const maxHours = config.maxRecommendedHoursPerDay;
  const remainingHours = maxHours - config.filtrationHoursPerDay;

  const canAdjustOutput = capabilities.canAdjustPercentage && config.currentOutputPercent < maxOutput;
  const canExtendHours = capabilities.canAdjustRuntime && remainingHours > 0;

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
  } else if ((outputControl.kind === 'runtime-only' || outputControl.kind === 'fixed') && canExtendHours) {
    suggestedAdditionalHours = runtimeCalculation.operationalAdditionalMinutes / 60;
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
    runtimeCalculation,
    hoursNeeded,
    canAdjustOutput,
    canExtendHours,
    roundingPolicy: {
      minProgrammableHourIncrement,
      mode: 'ceil-to-increment',
    },
  };
}

export function createChlorinatorConfigFromPreset(presetId: ChlorinatorPresetId): SaltChlorinatorConfig {
  if (presetId === 'intex-qs500-26668') {
    const equipment = clonePreset(CHLORINATOR_PRESETS[presetId]);
    const chlorinator = cloneV2Preset(CHLORINATOR_V2_PRESETS[presetId]);
    return {
      enabled: true,
      productionGramsPerHour: equipment.nominalChlorineOutputGramsPerHour ?? 0,
      currentOutputPercent: 100,
      filtrationHoursPerDay: equipment.runtimeControl.minimumHours ?? 1,
      maxRecommendedOutputPercent: 100,
      maxRecommendedHoursPerDay: equipment.runtimeControl.maximumHours ?? 24,
      minProgrammableHourIncrement: (equipment.runtimeControl.incrementMinutes ?? 60) / 60,
      presetId,
      equipment,
      outputControl: equipment.outputControl,
      runtimeControl: equipment.runtimeControl,
      supportedModes: equipment.supportedModes,
      usualOperatingMode: 'normal',
      chlorinator,
      chlorinatorSchemaVersion: CHLORINATOR_SCHEMA_VERSION,
      chlorinatorCatalogVersion: CHLORINATOR_CATALOG_VERSION,
      chlorinatorCalculationVersion: CHLORINATOR_CALCULATION_VERSION,
    };
  }

  const now = new Date(0).toISOString();
  const controlType: ChlorinatorControlType = presetId === 'unknown' ? 'unknown' : 'continuous-percentage';
  const config: SaltChlorinatorConfig = {
    enabled: true,
    productionGramsPerHour: 20,
    currentOutputPercent: 60,
    filtrationHoursPerDay: 6,
    maxRecommendedOutputPercent: 100,
    maxRecommendedHoursPerDay: 12,
    minProgrammableHourIncrement: 1,
    presetId,
    outputControl: presetId === 'unknown' ? { kind: 'unknown' } : {
      kind: 'continuous-percentage',
      minimumPercent: 0,
      maximumPercent: 100,
      incrementPercent: 1,
    },
    runtimeControl: {
      supported: true,
      maximumHours: 12,
      incrementMinutes: 60,
      schedulingType: 'unknown',
    },
    supportedModes: [
      {
        code: 'normal',
        supported: true,
        durationControl: 'configurable',
        outputModel: 'same-as-normal',
      },
    ],
    chlorinatorSchemaVersion: CHLORINATOR_SCHEMA_VERSION,
    chlorinatorCatalogVersion: CHLORINATOR_CATALOG_VERSION,
    chlorinatorCalculationVersion: CHLORINATOR_CALCULATION_VERSION,
  };
  config.chlorinator = buildChlorinatorV2FromConfig(config, {
    id: presetId,
    controlType,
    createdAt: now,
    updatedAt: now,
    dataProvenanceSource: presetId === 'unknown' ? 'unknown' : 'user-entered',
  });
  return config;
}

export function migrateSaltChlorinatorConfig(
  config: SaltChlorinatorConfig,
  migratedAt = new Date(0).toISOString(),
): SaltChlorinatorConfig {
  if (config.chlorinator?.schemaVersion === CHLORINATOR_SCHEMA_VERSION) {
    return {
      ...config,
      chlorinatorSchemaVersion: config.chlorinatorSchemaVersion ?? CHLORINATOR_SCHEMA_VERSION,
      chlorinatorCatalogVersion: config.chlorinatorCatalogVersion ?? CHLORINATOR_CATALOG_VERSION,
      chlorinatorCalculationVersion: config.chlorinatorCalculationVersion ?? CHLORINATOR_CALCULATION_VERSION,
    };
  }

  if (config.presetId === 'intex-qs500-26668') {
    const preset = createChlorinatorConfigFromPreset('intex-qs500-26668');
    return {
      ...config,
      productionGramsPerHour: config.productionGramsPerHour || preset.productionGramsPerHour,
      currentOutputPercent: config.currentOutputPercent ?? preset.currentOutputPercent,
      maxRecommendedOutputPercent: config.maxRecommendedOutputPercent ?? preset.maxRecommendedOutputPercent,
      maxRecommendedHoursPerDay: config.maxRecommendedHoursPerDay || preset.maxRecommendedHoursPerDay,
      minProgrammableHourIncrement: config.minProgrammableHourIncrement ?? preset.minProgrammableHourIncrement,
      equipment: config.equipment ?? preset.equipment,
      outputControl: config.outputControl ?? preset.outputControl,
      runtimeControl: config.runtimeControl ?? preset.runtimeControl,
      supportedModes: config.supportedModes ?? preset.supportedModes,
      chlorinator: {
        ...preset.chlorinator!,
        createdAt: migratedAt,
        updatedAt: migratedAt,
        dataProvenance: {
          ...preset.chlorinator!.dataProvenance,
          legacyProvenance: 'legacy-assumed-nominal-output',
        },
      },
      chlorinatorSchemaVersion: CHLORINATOR_SCHEMA_VERSION,
      chlorinatorCatalogVersion: CHLORINATOR_CATALOG_VERSION,
      chlorinatorCalculationVersion: CHLORINATOR_CALCULATION_VERSION,
    };
  }

  const outputControl = getChlorinatorOutputControl(config);
  const controlType = controlTypeFromOutputControl(outputControl);
  return {
    ...config,
    chlorinator: buildChlorinatorV2FromConfig(config, {
      id: config.equipment?.id ?? config.presetId ?? 'legacy-salt-chlorinator',
      controlType,
      createdAt: migratedAt,
      updatedAt: migratedAt,
      dataProvenanceSource: 'imported',
      legacyProvenance: controlType === 'continuous-percentage'
        ? 'legacy-percentage-control'
        : 'legacy-assumed-nominal-output',
    }),
    chlorinatorSchemaVersion: CHLORINATOR_SCHEMA_VERSION,
    chlorinatorCatalogVersion: CHLORINATOR_CATALOG_VERSION,
    chlorinatorCalculationVersion: CHLORINATOR_CALCULATION_VERSION,
  };
}

export function getChlorinatorOutputControl(config: SaltChlorinatorConfig): ChlorinatorOutputControl {
  return config.outputControl
    ?? config.equipment?.outputControl
    ?? inferLegacyOutputControl(config);
}

export function getChlorinatorRuntimeControl(config: SaltChlorinatorConfig): SaltChlorinator['runtimeControl'] {
  return config.runtimeControl
    ?? config.equipment?.runtimeControl
    ?? {
      supported: true,
      maximumHours: config.maxRecommendedHoursPerDay,
      incrementMinutes: (config.minProgrammableHourIncrement ?? 1) * 60,
      schedulingType: 'unknown',
    };
}

export function getChlorinatorModeDefinitions(config: SaltChlorinatorConfig): ChlorinatorModeDefinition[] {
  return config.supportedModes
    ?? config.equipment?.supportedModes
    ?? [
      {
        code: 'normal',
        supported: true,
        durationControl: 'configurable',
        outputModel: 'same-as-normal',
      },
    ];
}

export function getChlorinatorCapabilities(config: SaltChlorinatorConfig): ChlorinatorCapabilities {
  const outputControl = getChlorinatorOutputControl(config);
  const runtimeControl = getChlorinatorRuntimeControl(config);
  const operatingModes = config.chlorinator?.operatingModes;
  const supportedModes = getChlorinatorModeDefinitions(config);
  const boostMode = operatingModes?.find((mode) => mode.code === 'boost' && mode.enabled);
  const legacyBoostMode = supportedModes.find((mode) => mode.code === 'boost' && mode.supported);
  const controlType = config.chlorinator?.controlType ?? controlTypeFromOutputControl(outputControl);
  const nominalOutputGramsPerHour = getConfiguredNominalOutputGramsPerHour(config);
  const supportsBoost = Boolean(boostMode ?? legacyBoostMode);
  const boostOutputKnowledge = boostKnowledgeFromModes(boostMode, legacyBoostMode);
  const minimumRuntimeMinutes = config.chlorinator?.runtimeControl.minimumRuntimeMinutes ??
    (runtimeControl.minimumHours !== undefined ? runtimeControl.minimumHours * 60 : undefined);
  const maximumRuntimeMinutes = config.chlorinator?.runtimeControl.maximumRuntimeMinutes ??
    (runtimeControl.maximumHours !== undefined ? runtimeControl.maximumHours * 60 : config.maxRecommendedHoursPerDay * 60);
  const runtimeIncrementMinutes = config.chlorinator?.runtimeControl.runtimeIncrementMinutes ??
    runtimeControl.incrementMinutes ??
    ((config.minProgrammableHourIncrement ?? 1) * 60);
  const percentageControl = getPercentageControl(config, outputControl);
  const discreteControl = getDiscreteControl(config, outputControl);
  const requiresFlow = config.chlorinator?.flowRequirements?.requiresFlow ??
    config.equipment?.requiresWaterFlow ??
    false;
  const linkedToFiltration = config.chlorinator?.flowRequirements?.linkedFiltrationRequired ??
    config.equipment?.linkedFiltrationRequired ??
    false;
  const supportsRuntimeAdjustment = controlType !== 'unknown' &&
    (config.chlorinator?.runtimeControl.runtimeAdjustable ?? runtimeControl.supported);
  const supportsPercentageAdjustment = controlType === 'continuous-percentage' && percentageControl !== undefined;
  const supportsDiscreteLevels = controlType === 'discrete-levels' && discreteControl !== undefined;
  const supportsAutomaticControl = controlType === 'automatic-orp' ||
    controlType === 'automatic-free-chlorine' ||
    controlType === 'external-controller';

  return {
    controlType,
    supportsRuntimeAdjustment,
    supportsPercentageAdjustment,
    supportsDiscreteLevels,
    supportsBoost,
    supportsAutomaticControl,
    nominalOutputGramsPerHour,
    minimumRuntimeMinutes,
    maximumRuntimeMinutes,
    runtimeIncrementMinutes,
    minimumOutputPercent: percentageControl?.minimumPercent,
    maximumOutputPercent: percentageControl?.maximumPercent,
    outputIncrementPercent: percentageControl?.incrementPercent,
    availableLevels: discreteControl?.levels.map((level) => {
      if ('labelKey' in level) {
        return {
          id: level.id,
          nominalOutputPercent: level.nominalOutputPercent,
          nominalOutputGramsPerHour: level.chlorineOutputGramsPerHour,
        };
      }
      return {
        id: level.id,
        nominalOutputPercent: level.nominalPercent,
        nominalOutputGramsPerHour: level.nominalOutputGramsPerHour,
      };
    }),
    boostOutputKnowledge,
    requiresFlow,
    linkedToFiltration,
    canAdjustRuntime: supportsRuntimeAdjustment,
    canAdjustPercentage: supportsPercentageAdjustment,
    canSelectDiscreteLevel: supportsDiscreteLevels,
    isAutomatic: supportsAutomaticControl,
    hasKnownNormalProduction: getCurrentProductionGramsPerHour(config) > 0,
  };
}

export function getChlorinatorActionCapabilities(config: SaltChlorinatorConfig): ChlorinatorCapabilityAction[] {
  const outputControl = getChlorinatorOutputControl(config);
  const actions = new Set<ChlorinatorCapabilityAction>([
    'inspect-cell',
    'clean-cell',
    'check-flow',
    'check-salt',
    'check-errors',
    'no-change',
  ]);

  if (getChlorinatorRuntimeControl(config).supported) {
    actions.add('increase-runtime');
    actions.add('decrease-runtime');
    actions.add('set-runtime');
    actions.add('repeat-cycle');
    actions.add('change-daily-program');
  }

  if (outputControl.kind === 'continuous-percentage') {
    actions.add('increase-output-percent');
    actions.add('decrease-output-percent');
    actions.add('set-output-percent');
  } else if (outputControl.kind === 'discrete-levels') {
    actions.add('increase-output-level');
    actions.add('decrease-output-level');
    actions.add('set-output-level');
  } else if (outputControl.kind === 'automatic' || outputControl.kind === 'externally-controlled') {
    actions.add('change-automatic-setpoint');
    actions.add('change-automatic-limits');
    actions.add('activate-manual-control');
    actions.add('inspect-sensor');
    actions.add('calibrate-sensor');
    actions.add('review-automation');
  }

  if (getChlorinatorCapabilities(config).supportsBoost) {
    actions.add('activate-boost');
    actions.add('deactivate-boost');
  }

  return Array.from(actions);
}

export function getCurrentProductionGramsPerHour(config: SaltChlorinatorConfig): number {
  if (config.chlorinator?.nominalOutput && config.chlorinator.controlType === 'fixed-output-runtime') {
    return finiteOrZero(config.chlorinator.nominalOutput.value);
  }
  const outputControl = getChlorinatorOutputControl(config);
  const nominal = config.equipment?.nominalChlorineOutputGramsPerHour ?? config.productionGramsPerHour;

  switch (outputControl.kind) {
    case 'fixed':
    case 'runtime-only':
      return finiteOrZero(nominal);
    case 'continuous-percentage':
      return finiteOrZero(nominal) * (finiteOrZero(config.currentOutputPercent) / 100);
    case 'discrete-levels': {
      const selected = outputControl.levels.find((level) => level.id === config.currentOutputLevelId);
      if (selected?.chlorineOutputGramsPerHour !== undefined) return finiteOrZero(selected.chlorineOutputGramsPerHour);
      if (selected?.nominalOutputPercent !== undefined) {
        return finiteOrZero(nominal) * (selected.nominalOutputPercent / 100);
      }
      return 0;
    }
    default:
      return 0;
  }
}

export function calculateRuntimeCalculation(
  theoreticalAdditionalMinutes: number,
  config: SaltChlorinatorConfig,
): RuntimeCalculation {
  const runtimeControl = config.chlorinator?.runtimeControl;
  const supportedIncrementMinutes = runtimeControl?.runtimeIncrementMinutes
    ?? getChlorinatorRuntimeControl(config).incrementMinutes
    ?? ((config.minProgrammableHourIncrement ?? 1) * 60);
  const maximumRuntimeMinutes = runtimeControl?.maximumRuntimeMinutes
    ?? (config.maxRecommendedHoursPerDay * 60);
  const currentRuntimeMinutes = config.filtrationHoursPerDay * 60;
  const remainingMinutes = Math.max(0, maximumRuntimeMinutes - currentRuntimeMinutes);
  const positiveTheoretical = Math.max(0, theoreticalAdditionalMinutes);
  const roundedMinutes = positiveTheoretical > 0
    ? Math.ceil(positiveTheoretical / supportedIncrementMinutes) * supportedIncrementMinutes
    : 0;
  const operationalAdditionalMinutes = Math.min(roundedMinutes, remainingMinutes);

  return {
    theoreticalAdditionalMinutes: Math.round(positiveTheoretical * 100) / 100,
    operationalAdditionalMinutes,
    roundingPolicy: positiveTheoretical === operationalAdditionalMinutes
      ? 'exact'
      : 'ceil-to-supported-increment',
    supportedIncrementMinutes,
    limitedByDailyMaximum: roundedMinutes > remainingMinutes,
    maximumRuntimeMinutes,
  };
}

export function getMaxRecommendedProductionGramsPerHour(config: SaltChlorinatorConfig): number {
  const outputControl = getChlorinatorOutputControl(config);
  const nominal = config.equipment?.nominalChlorineOutputGramsPerHour ?? config.productionGramsPerHour;

  if (outputControl.kind === 'continuous-percentage') {
    return finiteOrZero(nominal) * (getMaximumOutputPercent(config) / 100);
  }

  return getCurrentProductionGramsPerHour(config);
}

export function getMaximumOutputPercent(config: SaltChlorinatorConfig): number {
  const outputControl = getChlorinatorOutputControl(config);
  if (outputControl.kind !== 'continuous-percentage') return config.currentOutputPercent;
  return Math.min(outputControl.maximumPercent, config.maxRecommendedOutputPercent);
}

export function describeChlorinatorProduction(config: SaltChlorinatorConfig): string {
  const outputControl = getChlorinatorOutputControl(config);
  const production = getCurrentProductionGramsPerHour(config);

  switch (outputControl.kind) {
    case 'fixed':
    case 'runtime-only':
      return production > 0
        ? `Produccion fija del clorador: ${production} g/h; se controla por horas.`
        : 'Produccion fija del clorador: dato no configurado.';
    case 'continuous-percentage':
      return `Produccion del clorador: ${config.productionGramsPerHour} g/h al ${config.currentOutputPercent}%.`;
    case 'discrete-levels':
      return config.currentOutputLevelId
        ? `Produccion del clorador: nivel ${config.currentOutputLevelId}.`
        : 'Produccion del clorador por niveles; nivel habitual no configurado.';
    case 'automatic':
      return `Produccion automatica del clorador basada en ${outputControl.controlBasis}.`;
    case 'externally-controlled':
      return `Produccion controlada externamente por ${outputControl.controllerType}.`;
    default:
      return 'Produccion del clorador desconocida; no se asume porcentaje ni produccion lineal.';
  }
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

function inferLegacyOutputControl(config: SaltChlorinatorConfig): ChlorinatorOutputControl {
  if (config.currentOutputPercent !== undefined && config.maxRecommendedOutputPercent !== undefined) {
    return {
      kind: 'continuous-percentage',
      minimumPercent: 0,
      maximumPercent: config.maxRecommendedOutputPercent,
      incrementPercent: 1,
    };
  }

  return {
    kind: 'unknown',
  };
}

function clonePreset(preset: SaltChlorinator): SaltChlorinator {
  return JSON.parse(JSON.stringify(preset)) as SaltChlorinator;
}

function cloneV2Preset(preset: SaltChlorinatorV2): SaltChlorinatorV2 {
  return JSON.parse(JSON.stringify(preset)) as SaltChlorinatorV2;
}

function finiteOrZero(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function getConfiguredNominalOutputGramsPerHour(config: SaltChlorinatorConfig): number | undefined {
  const value = config.chlorinator?.nominalOutput?.value ??
    config.equipment?.nominalChlorineOutputGramsPerHour ??
    config.productionGramsPerHour;
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function getPercentageControl(
  config: SaltChlorinatorConfig,
  outputControl: ChlorinatorOutputControl,
): PercentageOutputControl | undefined {
  if (config.chlorinator?.controlType === 'continuous-percentage' && config.chlorinator.outputControl) {
    const control = config.chlorinator.outputControl;
    if ('minimumPercent' in control) return control;
  }
  if (outputControl.kind !== 'continuous-percentage') return undefined;
  return {
    minimumPercent: outputControl.minimumPercent,
    maximumPercent: outputControl.maximumPercent,
    incrementPercent: outputControl.incrementPercent,
    defaultPercent: config.currentOutputPercent,
  };
}

function getDiscreteControl(
  config: SaltChlorinatorConfig,
  outputControl: ChlorinatorOutputControl,
): DiscreteOutputControl | ChlorinatorOutputControl & { kind: 'discrete-levels' } | undefined {
  if (config.chlorinator?.controlType === 'discrete-levels' && config.chlorinator.outputControl) {
    const control = config.chlorinator.outputControl;
    if ('levels' in control) return control;
  }
  return outputControl.kind === 'discrete-levels' ? outputControl : undefined;
}

function boostKnowledgeFromModes(
  mode: ChlorinatorMode | undefined,
  legacyMode: ChlorinatorModeDefinition | undefined,
): ChlorinatorCapabilities['boostOutputKnowledge'] {
  const outputModel = mode?.outputModel ?? legacyMode?.outputModel;
  if (outputModel === 'known-absolute-output' || outputModel === 'known-multiplier') return 'known';
  if (outputModel === 'manufacturer-controlled') return 'manufacturer-controlled';
  return 'unknown';
}

function controlTypeFromOutputControl(control: ChlorinatorOutputControl): ChlorinatorControlType {
  switch (control.kind) {
    case 'fixed':
    case 'runtime-only':
      return 'fixed-output-runtime';
    case 'continuous-percentage':
      return 'continuous-percentage';
    case 'discrete-levels':
      return 'discrete-levels';
    case 'externally-controlled':
      return control.controllerType === 'external-timer' ? 'external-timer' : 'external-controller';
    case 'automatic':
      if (control.controlBasis === 'orp') return 'automatic-orp';
      if (control.controlBasis === 'free-chlorine') return 'automatic-free-chlorine';
      return 'custom';
    default:
      return 'unknown';
  }
}

function buildChlorinatorV2FromConfig(
  config: SaltChlorinatorConfig,
  options: {
    id: string;
    controlType: ChlorinatorControlType;
    createdAt: string;
    updatedAt: string;
    dataProvenanceSource: SaltChlorinatorV2['dataProvenance']['source'];
    legacyProvenance?: NonNullable<SaltChlorinatorV2['dataProvenance']['legacyProvenance']>;
  },
): SaltChlorinatorV2 {
  const outputControl = getChlorinatorOutputControl(config);
  const runtimeControl = getChlorinatorRuntimeControl(config);
  const nominalOutput = finiteOrZero(config.productionGramsPerHour) > 0
    ? {
        value: config.productionGramsPerHour,
        unit: 'g-per-hour' as const,
        source: 'user-entered' as const,
      }
    : undefined;

  return {
    id: options.id,
    manufacturer: config.equipment?.manufacturer,
    model: config.equipment?.model,
    productReference: config.equipment?.productReference,
    serialNumber: config.equipment?.serialNumber,
    controlType: options.controlType,
    nominalOutput,
    outputControl: outputControl.kind === 'continuous-percentage'
      ? {
          minimumPercent: outputControl.minimumPercent,
          maximumPercent: outputControl.maximumPercent,
          incrementPercent: outputControl.incrementPercent,
          defaultPercent: config.currentOutputPercent,
        }
      : outputControl.kind === 'discrete-levels'
        ? {
            levels: outputControl.levels.map((level) => ({
              id: level.id,
              label: level.labelKey,
              nominalPercent: level.nominalOutputPercent,
              nominalOutputGramsPerHour: level.chlorineOutputGramsPerHour,
            })),
          }
        : undefined,
    runtimeControl: {
      runtimeAdjustable: runtimeControl.supported,
      minimumRuntimeMinutes: runtimeControl.minimumHours !== undefined ? runtimeControl.minimumHours * 60 : undefined,
      maximumRuntimeMinutes: runtimeControl.maximumHours !== undefined ? runtimeControl.maximumHours * 60 : config.maxRecommendedHoursPerDay * 60,
      runtimeIncrementMinutes: runtimeControl.incrementMinutes ?? ((config.minProgrammableHourIncrement ?? 1) * 60),
      scheduleType: scheduleTypeFromLegacy(runtimeControl.schedulingType),
    },
    operatingModes: getChlorinatorModeDefinitions(config).map((mode) => ({
      code: mode.code === 'unknown' ? 'custom' : mode.code,
      enabled: mode.supported,
      durationControl: mode.durationControl,
      fixedDurationMinutes: mode.fixedDurationHours !== undefined ? mode.fixedDurationHours * 60 : undefined,
      minimumDurationMinutes: mode.minimumDurationHours !== undefined ? mode.minimumDurationHours * 60 : undefined,
      maximumDurationMinutes: mode.maximumDurationHours !== undefined ? mode.maximumDurationHours * 60 : undefined,
      durationIncrementMinutes: mode.durationIncrementMinutes,
      outputModel: mode.outputModel,
      outputMultiplier: mode.outputMultiplier,
      absoluteOutputGramsPerHour: mode.chlorineOutputGramsPerHour,
      source: 'user-entered',
      notes: mode.notes,
    })),
    flowRequirements: {
      requiresFlow: config.equipment?.requiresWaterFlow,
      linkedFiltrationRequired: config.equipment?.linkedFiltrationRequired,
      minimumFlowRate: config.equipment?.minimumFlowRate,
      maximumFlowRate: config.equipment?.maximumFlowRate,
    },
    saltRequirements: config.equipment?.compatibleSaltRangePpm
      ? {
          minimumPpm: config.equipment.compatibleSaltRangePpm.min,
          maximumPpm: config.equipment.compatibleSaltRangePpm.max,
          preferredMinimumPpm: config.equipment.compatibleSaltRangePpm.preferredMin,
          preferredMaximumPpm: config.equipment.compatibleSaltRangePpm.preferredMax,
        }
      : undefined,
    dataProvenance: {
      source: options.dataProvenanceSource,
      legacyProvenance: options.legacyProvenance,
    },
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    schemaVersion: CHLORINATOR_SCHEMA_VERSION,
  };
}

function scheduleTypeFromLegacy(
  schedulingType: SaltChlorinator['runtimeControl']['schedulingType'],
): ChlorinatorRuntimeControl['scheduleType'] {
  switch (schedulingType) {
    case 'filter-pump-linked':
      return 'linked-to-filtration';
    case 'manual':
      return 'manual-start';
    default:
      return schedulingType;
  }
}
