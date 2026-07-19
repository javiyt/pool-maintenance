export type PoolType = 'chlorine' | 'saltwater';
export type VolumeUnit = 'liters' | 'cubicMeters';
export type UnitSystem = 'metric' | 'imperial';
export type AppLanguage = 'en' | 'es';

export type {
  ChlorinatorOutputControl,
  ChlorinatorOperatingMode,
  ChlorinatorModeDefinition,
  ChlorinatorPresetId,
  SaltChlorinator,
  SaltChlorinatorConfig,
} from './saltChlorinator';

import type { SaltChlorinatorConfig } from './saltChlorinator';

export interface HistoricalLearningConfig {
  enabled: boolean;
  minimumSamples: number;
  applyLowConfidence: boolean;
  maxCorrectionFactor: number;
  minCorrectionFactor: number;
}

export interface PoolSettings {
  volume: number;
  volumeUnit: VolumeUnit;
  poolType: PoolType;
  unitSystem: UnitSystem;
  language?: AppLanguage;
  saltChlorinator?: SaltChlorinatorConfig;
  historicalLearning?: HistoricalLearningConfig;
}

export const DEFAULT_SETTINGS: PoolSettings = {
  volume: 0,
  volumeUnit: 'liters',
  poolType: 'chlorine',
  unitSystem: 'metric',
};

export const DEFAULT_HISTORICAL_LEARNING: HistoricalLearningConfig = {
  enabled: true,
  minimumSamples: 5,
  applyLowConfidence: false,
  minCorrectionFactor: 0.5,
  maxCorrectionFactor: 1.5,
};

export const DEFAULT_SALT_CHLORINATOR: SaltChlorinatorConfig = {
  enabled: false,
  productionGramsPerHour: 20,
  currentOutputPercent: 60,
  filtrationHoursPerDay: 6,
  maxRecommendedOutputPercent: 100,
  maxRecommendedHoursPerDay: 12,
  minProgrammableHourIncrement: 1,
  presetId: 'custom',
  outputControl: {
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

export function volumeInLiters(settings: PoolSettings): number {
  if (settings.volumeUnit === 'cubicMeters') {
    return settings.volume * 1000;
  }
  return settings.volume;
}
