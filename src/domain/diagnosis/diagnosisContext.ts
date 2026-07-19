import type { ActionOutcome } from '../actionOutcomeEvaluator';
import type { MaintenanceAction } from '../actions';
import type { TargetRange } from '../chemistry';
import type { Measurement } from '../measurement';
import type { PoolSettings } from '../settings';

export interface PersistencePolicy {
  minimumConsecutiveMeasurements: number;
  minimumDurationHours: number;
  maximumGapHours?: number;
  minimumMeasurementSpacingHours?: number;
  requireRelevantActionAttempts?: boolean;
  minimumFailedActionAttempts?: number;
}

export interface InstrumentPrecision {
  ph: number;
  fac: number;
  orp: number;
  salt: number;
}

export interface DiagnosisEngineConfig {
  persistence: PersistencePolicy;
  instrumentPrecision: InstrumentPrecision;
}

export interface DiagnosisContext {
  settings: PoolSettings;
  measurements: Measurement[];
  actions: MaintenanceAction[];
  outcomes: ActionOutcome[];
  ranges: {
    ph: TargetRange;
    fac: TargetRange;
    salt: TargetRange;
    orp: TargetRange;
  };
  config: DiagnosisEngineConfig;
}

export const DEFAULT_DIAGNOSIS_CONFIG: DiagnosisEngineConfig = {
  persistence: {
    minimumConsecutiveMeasurements: 4,
    minimumDurationHours: 48,
    maximumGapHours: 96,
    minimumMeasurementSpacingHours: 4,
    requireRelevantActionAttempts: false,
    minimumFailedActionAttempts: 1,
  },
  instrumentPrecision: {
    ph: 0.1,
    fac: 0.2,
    orp: 10,
    salt: 50,
  },
};

