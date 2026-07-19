export type DataOrigin = 'user' | 'device' | 'inferred' | 'imported' | 'system';

export type MeasurementContextDataField =
  | 'sunlight'
  | 'poolCovered'
  | 'batherLoad'
  | 'rainSincePreviousMeasurement'
  | 'waterAddedLiters'
  | 'backwashPerformed'
  | 'chlorinatorOutputPercent'
  | 'chlorinatorHoursSincePreviousMeasurement'
  | 'filtrationHoursSincePreviousMeasurement'
  | 'visibleAlgae'
  | 'waterClarity';

export interface MeasurementContextFieldOrigin {
  field: MeasurementContextDataField | 'intervalStart' | 'intervalEnd';
  origin: DataOrigin;
}

export interface MeasurementContext {
  sunlight?: 'none' | 'low' | 'medium' | 'high';
  poolCovered?: boolean;
  batherLoad?: 'none' | 'low' | 'medium' | 'high';
  rainSincePreviousMeasurement?: boolean;
  waterAddedLiters?: number;
  backwashPerformed?: boolean;
  chlorinatorOutputPercent?: number;
  chlorinatorHoursSincePreviousMeasurement?: number;
  filtrationHoursSincePreviousMeasurement?: number;
  visibleAlgae?: boolean;
  waterClarity?: 'clear' | 'slightly-cloudy' | 'cloudy';
  intervalStart?: string;
  intervalEnd?: string;
  source?: DataOrigin;
  fieldOrigins?: MeasurementContextFieldOrigin[];
}

export interface Measurement {
  id: string;
  measuredAt: string; // ISO 8601, e.g. "2026-07-09T10:35:00.000Z"
  ph: number; // pH
  ec: number; // electrical conductivity, µS/cm
  tds: number; // total dissolved solids, ppm
  salt: number; // salt level, ppm
  orp: number; // oxidation-reduction potential, mV
  fac: number; // free available chlorine, ppm
  temperature: number; // water temperature, °C
  notes?: string;
  context?: MeasurementContext;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function validateMeasurement(m: Partial<Measurement>): ValidationResult {
  const errors: Record<string, string> = {};

  if (m.ph !== undefined) {
    if (m.ph < 0 || m.ph > 14) errors.ph = 'pH must be between 0 and 14.';
  } else {
    errors.ph = 'pH is required.';
  }

  if (m.ec !== undefined) {
    if (m.ec <= 0) errors.ec = 'EC must be a positive number.';
  } else {
    errors.ec = 'EC is required.';
  }

  if (m.tds !== undefined) {
    if (m.tds <= 0) errors.tds = 'TDS must be a positive number.';
  } else {
    errors.tds = 'TDS is required.';
  }

  if (m.salt !== undefined) {
    if (m.salt <= 0) errors.salt = 'Salt must be a positive number.';
  } else {
    errors.salt = 'Salt is required.';
  }

  if (m.orp !== undefined) {
    if (m.orp <= 0) errors.orp = 'ORP must be a positive number.';
  } else {
    errors.orp = 'ORP is required.';
  }

  if (m.fac !== undefined) {
    if (m.fac < 0) errors.fac = 'FAC must be zero or a positive number.';
  } else {
    errors.fac = 'FAC is required.';
  }

  if (m.temperature !== undefined) {
    if (m.temperature < -10 || m.temperature > 60) {
      errors.temperature = 'Temperature must be between -10 and 60 °C.';
    }
  } else {
    errors.temperature = 'Temperature is required.';
  }

  if (!m.measuredAt) {
    errors.measuredAt = 'Date and time is required.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
