import type { Measurement } from './measurement';

// ── Types ─────────────────────────────────────────────────────────

export interface MeasurementTrend {
  field: keyof Measurement;
  direction: 'rising' | 'falling' | 'stable' | 'unknown';
  latestValue: number;
  previousValue?: number;
  delta?: number;
  severity: 'info' | 'low' | 'medium' | 'high' | 'danger';
  message: string;
}

// ── Thresholds for meaningful changes ─────────────────────────────

const TREND_THRESHOLDS: Partial<Record<keyof Measurement, number>> = {
  ph: 0.2,
  ec: 100,
  tds: 50,
  fac: 0.3,
  orp: 30,
  salt: 200,
  temperature: 2,
};

const NUMERIC_FIELDS: Array<keyof Measurement> = [
  'ph',
  'ec',
  'tds',
  'salt',
  'orp',
  'fac',
  'temperature',
];

// ── Trend analysis ────────────────────────────────────────────────

/**
 * Analyze measurement history and detect trends in key water parameters.
 *
 * Uses conservative thresholds to avoid overreacting to tiny changes.
 * Analyzes the last 3-5 measurements when available, but at minimum
 * compares latest vs previous.
 */
export function analyzeTrends(
  measurements: Measurement[],
): MeasurementTrend[] {
  if (measurements.length === 0) return [];

  const sorted = [...measurements].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  );

  const latest = sorted[sorted.length - 1];
  const trends: MeasurementTrend[] = [];

  for (const field of NUMERIC_FIELDS) {
    const values = sorted
      .map((m) => m[field])
      .filter((v): v is number => v !== undefined && v !== null);

    if (values.length === 0) {
      trends.push({
        field,
        direction: 'unknown',
        latestValue: latest[field] as number,
        severity: 'info',
        message: fieldLabel(field) + ': no hay datos suficientes.',
      });
      continue;
    }

    const latestVal = values[values.length - 1];
    const threshold = TREND_THRESHOLDS[field] ?? 0;

    if (values.length < 2) {
      trends.push({
        field,
        direction: 'unknown',
        latestValue: latestVal,
        severity: 'info',
        message: fieldLabel(field) + ': se necesita una medición más para detectar tendencias.',
      });
      continue;
    }

    const prevVal = values[values.length - 2];
    const delta = latestVal - prevVal;

    // Use last 3-5 values for multi-point trend
    const window = values.slice(-5);
    let direction: 'rising' | 'falling' | 'stable' | 'unknown';

    if (Math.abs(delta) < threshold) {
      direction = 'stable';
    } else {
      // Check multi-point consistency
      const deltas: number[] = [];
      for (let i = 1; i < window.length; i++) {
        deltas.push(window[i] - window[i - 1]);
      }

      const risingCount = deltas.filter((d) => d > threshold * 0.5).length;
      const fallingCount = deltas.filter((d) => d < -threshold * 0.5).length;

      if (risingCount > fallingCount && risingCount >= Math.ceil(deltas.length / 2)) {
        direction = 'rising';
      } else if (fallingCount > risingCount && fallingCount >= Math.ceil(deltas.length / 2)) {
        direction = 'falling';
      } else {
        // Latest delta is meaningful but multi-point is not consistent
        direction = delta > 0 ? 'rising' : 'falling';
      }
    }

    const severity = trendSeverity(field, direction, latestVal);
    const message = buildTrendMessage(field, direction, latestVal, delta, threshold);

    trends.push({
      field,
      direction,
      latestValue: latestVal,
      previousValue: prevVal,
      delta: Math.abs(delta) >= threshold ? delta : 0,
      severity,
      message,
    });
  }

  return trends;
}

// ── Helpers ───────────────────────────────────────────────────────

function fieldLabel(field: keyof Measurement): string {
  const labels: Partial<Record<keyof Measurement, string>> = {
    ph: 'pH',
    ec: 'EC',
    tds: 'TDS',
    salt: 'Sal',
    orp: 'ORP',
    fac: 'FAC',
    temperature: 'Temperatura',
  };
  return labels[field] ?? field;
}

function trendSeverity(
  field: keyof Measurement,
  direction: string,
  value: number,
): 'info' | 'low' | 'medium' | 'high' | 'danger' {
  // FAC falling is concerning
  if (field === 'fac' && direction === 'falling') {
    if (value < 0.5) return 'high';
    if (value < 1.0) return 'medium';
    return 'low';
  }

  // ORP falling is concerning
  if (field === 'orp' && direction === 'falling') {
    if (value < 600) return 'high';
    if (value < 650) return 'medium';
    return 'low';
  }

  // pH drifting
  if (field === 'ph' && (direction === 'rising' || direction === 'falling')) {
    if (value < 7.0 || value > 7.8) return 'medium';
    return 'low';
  }

  // Salt falling
  if (field === 'salt' && direction === 'falling') {
    if (value < 2700) return 'medium';
    return 'low';
  }

  // Temperature high
  if (field === 'temperature' && direction === 'rising' && value > 30) {
    return 'medium';
  }

  return 'info';
}

function buildTrendMessage(
  field: keyof Measurement,
  direction: string,
  value: number,
  delta: number,
  threshold: number,
): string {
  const label = fieldLabel(field);

  switch (direction) {
    case 'rising':
      return `${label} está subiendo (${value.toFixed(1)}). ${delta >= threshold ? `Variación de ${delta > 0 ? '+' : ''}${delta.toFixed(threshold >= 1 ? 0 : 1)}.` : ''}`;
    case 'falling':
      return `${label} está bajando (${value.toFixed(1)}). ${delta <= -threshold ? `Variación de ${delta.toFixed(threshold >= 1 ? 0 : 1)}.` : ''}`;
    case 'stable':
      return `${label} se mantiene estable (${value.toFixed(1)}).`;
    default:
      return `${label}: sin datos suficientes.`;
  }
}
