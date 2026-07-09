export interface Measurement {
  id: string;
  date: string; // YYYY-MM-DD
  ph: number;
  freeChlorine: number;
  alkalinity: number;
  cyanuricAcid: number;
  salt?: number;
  temperature?: number;
  notes?: string;
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

  if (m.freeChlorine !== undefined) {
    if (m.freeChlorine < 0 || m.freeChlorine > 20) {
      errors.freeChlorine = 'Free chlorine must be between 0 and 20 ppm.';
    }
  } else {
    errors.freeChlorine = 'Free chlorine is required.';
  }

  if (m.alkalinity !== undefined) {
    if (m.alkalinity < 0 || m.alkalinity > 500) {
      errors.alkalinity = 'Alkalinity must be between 0 and 500 ppm.';
    }
  } else {
    errors.alkalinity = 'Alkalinity is required.';
  }

  if (m.cyanuricAcid !== undefined) {
    if (m.cyanuricAcid < 0 || m.cyanuricAcid > 300) {
      errors.cyanuricAcid = 'Cyanuric acid must be between 0 and 300 ppm.';
    }
  } else {
    errors.cyanuricAcid = 'Cyanuric acid is required.';
  }

  if (m.salt !== undefined && (m.salt < 0 || m.salt > 10000)) {
    errors.salt = 'Salt must be between 0 and 10,000 ppm.';
  }

  if (m.temperature !== undefined && (m.temperature < -10 || m.temperature > 60)) {
    errors.temperature = 'Temperature must be between -10 and 60 °C.';
  }

  if (!m.date) {
    errors.date = 'Date is required.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
