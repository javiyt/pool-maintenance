import type { PoolSettings } from './settings';
import { volumeInLiters } from './settings';
import type { Measurement } from './measurement';

// ── Target ranges ──────────────────────────────────────────────────

export interface TargetRange {
  min: number;
  max: number;
  ideal: number;
  unit: string;
}

export const TARGET_RANGES: Record<string, TargetRange> = {
  ph: { min: 7.2, max: 7.6, ideal: 7.4, unit: '' },
  fac: { min: 1.0, max: 3.0, ideal: 2.0, unit: 'ppm' },
  salt: { min: 2700, max: 3400, ideal: 3200, unit: 'ppm' },
  orp: { min: 650, max: 800, ideal: 700, unit: 'mV' },
};

export function getTargetRange(
  field: string,
  poolType: string,
): TargetRange {
  if (field === 'fac' && poolType === 'saltwater') {
    return { min: 3.0, max: 5.0, ideal: 4.0, unit: 'ppm' };
  }
  return TARGET_RANGES[field] ?? TARGET_RANGES.ph;
}

// ── Danger thresholds ─────────────────────────────────────────────

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

// ── Recommendations ───────────────────────────────────────────────

export interface ChemicalRecommendation {
  chemical: string;
  amount: string; // human-readable, e.g. "120 g" or "1.5 kg"
  amountGrams: number;
  reason: string;
  targetRange: string;
  danger?: DangerLevel;
}

export interface RecommendationsResult {
  canCalculate: boolean;
  missingReason: string;
  items: ChemicalRecommendation[];
  warnings: string[];
}

/**
 * Generate chemical recommendations based on a measurement and pool settings.
 *
 * All formulas are **approximate**. Always follow the dosage instructions
 * on the product label. These calculations assume standard residential
 * pool conditions and may not be accurate for commercial or specialized pools.
 */
export function calculateRecommendations(
  measurement: Measurement,
  settings: PoolSettings,
): RecommendationsResult {
  const missing: string[] = [];
  if (measurement.ph === undefined || measurement.ph === null) missing.push('pH');
  if (measurement.fac === undefined || measurement.fac === null) missing.push('FAC (free available chlorine)');

  if (missing.length > 0) {
    return {
      canCalculate: false,
      missingReason: `Missing required measurements: ${missing.join(', ')}.`,
      items: [],
      warnings: [],
    };
  }

  if (settings.volume <= 0) {
    return {
      canCalculate: false,
      missingReason: 'Pool volume is not set. Go to Settings and enter your pool volume.',
      items: [],
      warnings: [],
    };
  }

  const volLiters = volumeInLiters(settings);
  const items: ChemicalRecommendation[] = [];
  const warnings: string[] = [];

  // ── pH adjustment ──────────────────────────────────────────────

  const phRange = TARGET_RANGES.ph;
  if (measurement.ph < phRange.min) {
    // Raise pH with sodium carbonate (soda ash)
    // ~12 g per 1,000 L raises pH by ~0.1
    const diff = phRange.ideal - measurement.ph;
    const grams = Math.round(diff * 10 * 12 * (volLiters / 1000));
    const danger = classifyLevel(measurement.ph, phRange);
    if (danger.label === 'danger') warnings.push(`pH is critically low (${measurement.ph}).`);
    items.push({
      chemical: 'Sodium carbonate (soda ash)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Raise pH from ${measurement.ph.toFixed(1)} to target ${phRange.ideal.toFixed(1)}.`,
      targetRange: `${phRange.min}–${phRange.max}`,
      danger,
    });
  } else if (measurement.ph > phRange.max) {
    // Lower pH with sodium bisulfate (dry acid)
    // ~15 g per 1,000 L lowers pH by ~0.1
    const diff = measurement.ph - phRange.ideal;
    const grams = Math.round(diff * 10 * 15 * (volLiters / 1000));
    const danger = classifyLevel(measurement.ph, phRange);
    if (danger.label === 'danger') warnings.push(`pH is critically high (${measurement.ph}).`);
    items.push({
      chemical: 'Sodium bisulfate (dry acid)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Lower pH from ${measurement.ph.toFixed(1)} to target ${phRange.ideal.toFixed(1)}.`,
      targetRange: `${phRange.min}–${phRange.max}`,
      danger,
    });
  }

  // ── FAC (free available chlorine) adjustment ───────────────────

  const clRange = getTargetRange('fac', settings.poolType);
  if (measurement.fac < clRange.min) {
    // Calcium hypochlorite (65% available chlorine) — ~2.5 g per 1,000 L raises FAC by ~1 ppm
    const diff = clRange.ideal - measurement.fac;
    const grams = Math.round(diff * 2.5 * (volLiters / 1000));
    const danger = classifyLevel(measurement.fac, clRange);
    if (danger.label === 'danger') warnings.push(`FAC is critically low (${measurement.fac} ppm). Pool may be unsafe.`);
    items.push({
      chemical: 'Calcium hypochlorite (granular chlorine)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Raise FAC from ${measurement.fac.toFixed(1)} ppm to target ${clRange.ideal.toFixed(1)} ppm.`,
      targetRange: `${clRange.min}–${clRange.max} ppm`,
      danger,
    });
  } else if (measurement.fac > clRange.max) {
    const danger = classifyLevel(measurement.fac, clRange);
    if (danger.label === 'warning') warnings.push('FAC is above target. Let it dissipate naturally or partially drain and refill if very high.');
    if (danger.label === 'danger') warnings.push(`FAC is critically high (${measurement.fac} ppm). Avoid swimming until levels drop below ${clRange.max} ppm.`);
    items.push({
      chemical: '—',
      amount: 'None needed',
      amountGrams: 0,
      reason: `FAC (${measurement.fac.toFixed(1)} ppm) is above the target range. No chemical needed — let it dissipate.`,
      targetRange: `${clRange.min}–${clRange.max} ppm`,
      danger,
    });
  }

  // ── ORP indicator ──────────────────────────────────────────────

  if (measurement.orp !== undefined && measurement.orp !== null) {
    const orpRange = TARGET_RANGES.orp;
    const orpDanger = classifyLevel(measurement.orp, orpRange);
    if (orpDanger.label === 'warning') {
      warnings.push(`ORP (${measurement.orp} mV) is ${measurement.orp < orpRange.min ? 'below' : 'above'} the typical range of ${orpRange.min}–${orpRange.max} mV. May indicate reduced sanitation effectiveness.`);
    } else if (orpDanger.label === 'danger') {
      warnings.push(`ORP (${measurement.orp} mV) is critically ${measurement.orp < orpRange.min ? 'low' : 'high'} (target ${orpRange.min}–${orpRange.max} mV). Water sanitation may be compromised.`);
    }
  }

  // ── Salt adjustment (saltwater pools only) ─────────────────────

  if (settings.poolType === 'saltwater' && measurement.salt !== undefined && measurement.salt !== null) {
    const saltRange = TARGET_RANGES.salt;
    if (measurement.salt < saltRange.min) {
      const diff = saltRange.ideal - measurement.salt;
      // ~1 kg salt per 1,000 L raises salinity by ~100 ppm (approximate)
      const kg = Math.round(((diff / 100) * (volLiters / 1000)) * 100) / 100;
      const danger = classifyLevel(measurement.salt, saltRange);
      items.push({
        chemical: 'Pool salt (sodium chloride)',
        amount: `${kg.toFixed(1)} kg`,
        amountGrams: Math.round(kg * 1000),
        reason: `Raise salinity from ${measurement.salt} ppm to target ${saltRange.ideal} ppm.`,
        targetRange: `${saltRange.min}–${saltRange.max} ppm`,
        danger,
      });
    } else if (measurement.salt > saltRange.max) {
      const danger = classifyLevel(measurement.salt, saltRange);
      items.push({
        chemical: '—',
        amount: 'Partial drain & refill',
        amountGrams: 0,
        reason: `Salinity (${measurement.salt} ppm) is above the target range. Partial drain and refill with fresh water is recommended.`,
        targetRange: `${saltRange.min}–${saltRange.max} ppm`,
        danger,
      });
    }
  }

  return {
    canCalculate: true,
    missingReason: '',
    items,
    warnings,
  };
}

function formatAmount(grams: number): string {
  if (grams <= 0) return 'None';
  if (grams >= 1000) {
    const kg = (grams / 1000).toFixed(1);
    return `${kg} kg`;
  }
  return `${grams} g`;
}
