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
  freeChlorine: { min: 1.0, max: 3.0, ideal: 2.0, unit: 'ppm' },
  alkalinity: { min: 80, max: 120, ideal: 100, unit: 'ppm' },
  cyanuricAcid: { min: 30, max: 50, ideal: 40, unit: 'ppm' },
  salt: { min: 2700, max: 3400, ideal: 3200, unit: 'ppm' },
};

export function getTargetRange(
  field: string,
  poolType: string,
): TargetRange {
  if (field === 'freeChlorine' && poolType === 'saltwater') {
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
  if (measurement.freeChlorine === undefined || measurement.freeChlorine === null) missing.push('free chlorine');
  if (measurement.alkalinity === undefined || measurement.alkalinity === null) missing.push('alkalinity');
  if (measurement.cyanuricAcid === undefined || measurement.cyanuricAcid === null) missing.push('cyanuric acid');

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

  // ── Chlorine adjustment ────────────────────────────────────────

  const clRange = getTargetRange('freeChlorine', settings.poolType);
  if (measurement.freeChlorine < clRange.min) {
    // Calcium hypochlorite (65% available chlorine) — ~2.5 g per 1,000 L raises FC by ~1 ppm
    const diff = clRange.ideal - measurement.freeChlorine;
    const grams = Math.round(diff * 2.5 * (volLiters / 1000));
    const danger = classifyLevel(measurement.freeChlorine, clRange);
    if (danger.label === 'danger') warnings.push(`Free chlorine is critically low (${measurement.freeChlorine} ppm). Pool may be unsafe.`);
    items.push({
      chemical: 'Calcium hypochlorite (granular chlorine)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Raise free chlorine from ${measurement.freeChlorine.toFixed(1)} ppm to target ${clRange.ideal.toFixed(1)} ppm.`,
      targetRange: `${clRange.min}–${clRange.max} ppm`,
      danger,
    });
  } else if (measurement.freeChlorine > clRange.max) {
    const danger = classifyLevel(measurement.freeChlorine, clRange);
    if (danger.label === 'warning') warnings.push('Free chlorine is above target. Let it dissipate naturally or partially drain and refill if very high.');
    if (danger.label === 'danger') warnings.push(`Free chlorine is critically high (${measurement.freeChlorine} ppm). Avoid swimming until levels drop below ${clRange.max} ppm.`);
    items.push({
      chemical: '—',
      amount: 'None needed',
      amountGrams: 0,
      reason: `Free chlorine (${measurement.freeChlorine.toFixed(1)} ppm) is above the target range. No chemical needed — let it dissipate.`,
      targetRange: `${clRange.min}–${clRange.max} ppm`,
      danger,
    });
  }

  // ── Alkalinity adjustment ──────────────────────────────────────

  const alkRange = TARGET_RANGES.alkalinity;
  if (measurement.alkalinity < alkRange.min) {
    // Sodium bicarbonate — ~18 g per 1,000 L raises alkalinity by ~10 ppm
    const diff = alkRange.ideal - measurement.alkalinity;
    const grams = Math.round((diff / 10) * 18 * (volLiters / 1000));
    const danger = classifyLevel(measurement.alkalinity, alkRange);
    if (danger.label === 'danger') warnings.push(`Alkalinity is critically low (${measurement.alkalinity} ppm). pH may be unstable.`);
    items.push({
      chemical: 'Sodium bicarbonate (baking soda)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Raise alkalinity from ${measurement.alkalinity} ppm to target ${alkRange.ideal} ppm.`,
      targetRange: `${alkRange.min}–${alkRange.max} ppm`,
      danger,
    });
  } else if (measurement.alkalinity > alkRange.max) {
    // Lower with sodium bisulfate (same as pH reducer)
    const diff = measurement.alkalinity - alkRange.ideal;
    const grams = Math.round((diff / 10) * 18 * (volLiters / 1000));
    const danger = classifyLevel(measurement.alkalinity, alkRange);
    if (danger.label === 'warning') warnings.push('High alkalinity can cause pH drift. Lowering alkalinity will also lower pH — monitor pH closely.');
    items.push({
      chemical: 'Sodium bisulfate (dry acid)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Lower alkalinity from ${measurement.alkalinity} ppm to target ${alkRange.ideal} ppm. Note: this will also lower pH.`,
      targetRange: `${alkRange.min}–${alkRange.max} ppm`,
      danger: classifyLevel(measurement.alkalinity, alkRange),
    });
  }

  // ── Cyanuric acid ──────────────────────────────────────────────

  const cyaRange = TARGET_RANGES.cyanuricAcid;
  if (measurement.cyanuricAcid < cyaRange.min) {
    // Cyanuric acid — ~13 g per 1,000 L raises CYA by ~10 ppm
    const diff = cyaRange.ideal - measurement.cyanuricAcid;
    const grams = Math.round((diff / 10) * 13 * (volLiters / 1000));
    const danger = classifyLevel(measurement.cyanuricAcid, cyaRange);
    items.push({
      chemical: 'Cyanuric acid (stabilizer / conditioner)',
      amount: formatAmount(grams),
      amountGrams: grams,
      reason: `Raise cyanuric acid from ${measurement.cyanuricAcid} ppm to target ${cyaRange.ideal} ppm.`,
      targetRange: `${cyaRange.min}–${cyaRange.max} ppm`,
      danger,
    });
  } else if (measurement.cyanuricAcid > cyaRange.max) {
    const danger = classifyLevel(measurement.cyanuricAcid, cyaRange);
    const hasWarningMsg = danger.label === 'warning' || danger.label === 'danger';
    if (hasWarningMsg) {
      warnings.push(
        `Cyanuric acid is ${danger.label === 'danger' ? 'critically ' : ''}high (${measurement.cyanuricAcid} ppm). ` +
        'High CYA reduces chlorine effectiveness. Partial drain and refill is the only practical way to lower it.',
      );
    }
    items.push({
      chemical: '—',
      amount: 'Partial drain & refill',
      amountGrams: 0,
      reason: `Cyanuric acid (${measurement.cyanuricAcid} ppm) is above the target range. Partial drain and refill with fresh water is recommended.`,
      targetRange: `${cyaRange.min}–${cyaRange.max} ppm`,
      danger,
    });
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
