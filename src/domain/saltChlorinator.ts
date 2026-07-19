// ── Salt chlorinator configuration ────────────────────────────────

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
  chlorinatorId: string;
  intervalStartAt: string;
  intervalEndAt: string;
  source: 'user-reported' | 'device' | 'automation' | 'estimated' | 'unknown';
  normalOperation?: {
    runtimeHours?: number;
    configuredRuntimeHours?: number;
    outputPercent?: number;
    outputLevelId?: string;
    expectedCompleted?: boolean;
    actuallyCompleted?: boolean;
  };
  boostOperation?: {
    activated: boolean;
    runtimeHours?: number;
    configuredRuntimeHours?: number;
    outputMultiplier?: number;
    chlorineOutputGramsPerHour?: number;
    productionKnown: boolean;
  };
  filtrationRuntimeHours?: number;
  flowConfirmed?: boolean;
  alarms?: ChlorinatorAlarm[];
  interruptions?: ChlorinatorInterruption[];
  notes?: string;
}

export type ChlorinatorCapabilityAction =
  | 'increase-runtime'
  | 'decrease-runtime'
  | 'change-daily-program'
  | 'increase-output-percent'
  | 'decrease-output-percent'
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

export const CHLORINATOR_PRESETS: Record<Exclude<ChlorinatorPresetId, 'custom' | 'unknown'>, SaltChlorinator> = {
  'intex-qs500-26668': INTEX_QS500_26668_PRESET,
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

  const hoursNeeded = currentProduction > 0
    ? chlorineNeededGrams / currentProduction
    : Infinity;

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

export function createChlorinatorConfigFromPreset(presetId: ChlorinatorPresetId): SaltChlorinatorConfig {
  if (presetId === 'intex-qs500-26668') {
    const equipment = clonePreset(CHLORINATOR_PRESETS[presetId]);
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
    };
  }

  return {
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

export function getChlorinatorCapabilities(config: SaltChlorinatorConfig): {
  canAdjustRuntime: boolean;
  canAdjustPercentage: boolean;
  canSelectDiscreteLevel: boolean;
  isAutomatic: boolean;
  hasKnownNormalProduction: boolean;
  supportsBoost: boolean;
} {
  const outputControl = getChlorinatorOutputControl(config);
  const runtimeControl = getChlorinatorRuntimeControl(config);
  return {
    canAdjustRuntime: runtimeControl.supported,
    canAdjustPercentage: outputControl.kind === 'continuous-percentage',
    canSelectDiscreteLevel: outputControl.kind === 'discrete-levels',
    isAutomatic: outputControl.kind === 'automatic' || outputControl.kind === 'externally-controlled',
    hasKnownNormalProduction: getCurrentProductionGramsPerHour(config) > 0,
    supportsBoost: getChlorinatorModeDefinitions(config).some((mode) => mode.code === 'boost' && mode.supported),
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
    actions.add('change-daily-program');
  }

  if (outputControl.kind === 'continuous-percentage') {
    actions.add('increase-output-percent');
    actions.add('decrease-output-percent');
  } else if (outputControl.kind === 'discrete-levels') {
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

function finiteOrZero(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}
