// ── Target ranges ─────────────────────────────────────────────────

export interface TargetRange {
  min: number;
  max: number;
  ideal: number;
  unit: string;
}

export type TargetRangeKind = 'general' | 'configured' | 'custom';

export interface TargetRangeSnapshot extends TargetRange {
  field: string;
  kind: TargetRangeKind;
  origin: 'catalog';
  catalogVersion: string;
}

export const TARGET_RANGES: Record<string, TargetRange> = {
  ph: { min: 7.2, max: 7.6, ideal: 7.4, unit: '' },
  fac: { min: 1.0, max: 3.0, ideal: 2.0, unit: 'ppm' },
  salt: { min: 2700, max: 3400, ideal: 3200, unit: 'ppm' },
  orp: { min: 650, max: 800, ideal: 700, unit: 'mV' },
};

/** FAC target range for saltwater pools — typically lower than chlorine pools. */
export const SALTWATER_FAC_RANGE: TargetRange = {
  min: 0.8,
  max: 2.5,
  ideal: 1.5,
  unit: 'ppm',
};

export function getTargetRange(
  field: string,
  poolType: string,
): TargetRange {
  if (field === 'fac' && poolType === 'saltwater') {
    return SALTWATER_FAC_RANGE;
  }
  return TARGET_RANGES[field] ?? TARGET_RANGES.ph;
}

export function getTargetRangeSnapshot(
  field: string,
  poolType: string,
): TargetRangeSnapshot {
  const range = getTargetRange(field, poolType);
  return {
    ...range,
    field,
    kind: field === 'fac' && poolType === 'saltwater' ? 'configured' : 'general',
    origin: 'catalog',
    catalogVersion: '2.0.0',
  };
}

// ── Danger level ─────────────────────────────────────────────────

export interface DangerLevel {
  label: 'danger' | 'warning' | 'ok';
  message: string;
}

export function classifyLevel(
  value: number,
  range: TargetRange,
): DangerLevel {
  const span = range.max - range.min;
  const margin = span * 1.5;

  if (value < 0) {
    return { label: 'danger', message: 'Value is impossible (negative).' };
  }

  if (value < range.min - margin || value > range.max + margin) {
    return {
      label: 'danger',
      message: `Value is critically far from the target range of ${range.min}–${range.max} ${range.unit}. Consider professional advice.`,
    };
  }

  if (value < range.min || value > range.max) {
    const direction = value < range.min ? 'below' : 'above';
    return {
      label: 'warning',
      message: `Value is ${direction} the target range of ${range.min}–${range.max} ${range.unit}.`,
    };
  }

  return { label: 'ok', message: 'Within target range.' };
}
