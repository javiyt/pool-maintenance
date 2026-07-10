export type PoolType = 'chlorine' | 'saltwater';
export type VolumeUnit = 'liters' | 'cubicMeters';
export type UnitSystem = 'metric' | 'imperial';

export interface SaltChlorinatorConfig {
  enabled: boolean;
  productionGramsPerHour: number;
  currentOutputPercent: number;
  filtrationHoursPerDay: number;
  maxRecommendedOutputPercent: number;
  maxRecommendedHoursPerDay: number;
}

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
};

export function volumeInLiters(settings: PoolSettings): number {
  if (settings.volumeUnit === 'cubicMeters') {
    return settings.volume * 1000;
  }
  return settings.volume;
}
