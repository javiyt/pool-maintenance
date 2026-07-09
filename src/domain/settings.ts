export type PoolType = 'chlorine' | 'saltwater';
export type VolumeUnit = 'liters' | 'cubicMeters';
export type UnitSystem = 'metric' | 'imperial';

export interface PoolSettings {
  volume: number;
  volumeUnit: VolumeUnit;
  poolType: PoolType;
  unitSystem: UnitSystem;
}

export const DEFAULT_SETTINGS: PoolSettings = {
  volume: 0,
  volumeUnit: 'liters',
  poolType: 'chlorine',
  unitSystem: 'metric',
};

export function volumeInLiters(settings: PoolSettings): number {
  if (settings.volumeUnit === 'cubicMeters') {
    return settings.volume * 1000;
  }
  return settings.volume;
}
