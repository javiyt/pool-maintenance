import type { Measurement } from './measurement';
import type { MaintenanceAction } from './actions';
import type { PoolSettings, HistoricalLearningConfig } from './settings';
import { DEFAULT_HISTORICAL_LEARNING, volumeInLiters } from './settings';
import {
  evaluateActionOutcomes,
  type ActionOutcome,
} from './actionOutcomeEvaluator';

// ── Public types ─────────────────────────────────────────────────

export type LearningConfidence = 'none' | 'low' | 'medium' | 'high';

type Metric = 'ph' | 'fac' | 'orp' | 'salt';
type PoolType = 'saltwater' | 'chlorine';
type TemperatureBand = 'cold' | 'normal' | 'warm' | 'hot';

export interface LearningFilters {
  poolType: PoolType;
  temperatureBand?: TemperatureBand;
  outputPercentBand?: string;
}

export interface LearnedAdjustment {
  id: string;
  actionType: string;
  metric: Metric;
  observedMedianEffect: number;
  observedMeanEffect: number;
  sampleSize: number;
  dispersion: number;
  theoreticalEffect?: number;
  correctionFactor?: number;
  confidence: LearningConfidence;
  filters: LearningFilters;
  latestSampleAt: string;
}

export interface HistoricalInsight {
  label: string;
  description: string;
  value: string;
  sampleSize: number;
  confidence: LearningConfidence;
  actionType: string;
  metric: Metric;
}

// ── Temperature bands ─────────────────────────────────────────────

export function getTemperatureBand(temperature: number): TemperatureBand {
  if (temperature < 15) return 'cold';
  if (temperature < 25) return 'normal';
  if (temperature < 30) return 'warm';
  return 'hot';
}

// ── Chlorinator output bands ──────────────────────────────────────

export function getOutputPercentBand(outputPercent: number): string {
  if (outputPercent <= 20) return '0-20';
  if (outputPercent <= 40) return '21-40';
  if (outputPercent <= 60) return '41-60';
  if (outputPercent <= 80) return '61-80';
  return '81-100';
}

// ── Robust statistics ────────────────────────────────────────────

/** Sort numbers in ascending order (mutates the array). */
function sortAsc(arr: number[]): number[] {
  return arr.sort((a, b) => a - b);
}

/** Compute the median of an array of numbers. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = sortAsc([...values]);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Compute the arithmetic mean. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Median absolute deviation — a robust measure of dispersion.
 * MAD = median(|x_i - median(x)|)
 */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

// ── Eligibility filter ───────────────────────────────────────────

/**
 * Determine whether an outcome is eligible for historical learning.
 *
 * Excludes:
 * - unknown effectiveness
 * - very low confidence (below 0.3)
 * - user-excluded actions (exclusionFlags.excludedFromLearning)
 * - outcomes with no significant field changes relevant to the action
 */
function isEligibleOutcome(
  outcome: ActionOutcome,
  action: MaintenanceAction,
): boolean {
  if (outcome.effectiveness === 'unknown') return false;
  if (outcome.confidence < 0.3) return false;
  if (action.exclusionFlags?.excludedFromLearning) return false;
  if (action.kind !== 'chemical' && action.kind !== 'chlorinator') return false;

  // For chemical actions, require a specific product type that affects a known metric
  if (action.kind === 'chemical') {
    if (!action.chemical) return false;
    const pt = action.chemical.productType;
    if (pt !== 'ph-reducer' && pt !== 'ph-increaser' &&
        pt !== 'chlorine-granules' && pt !== 'pool-salt') {
      return false;
    }
  }

  return true;
}

// ── Extract metric and effect from action + outcome ──────────────

interface MetricEffect {
  metric: Metric;
  effect: number;
}

function extractMetricEffect(
  action: MaintenanceAction,
  outcome: ActionOutcome,
): MetricEffect | null {
  if (action.kind === 'chemical' && action.chemical) {
    switch (action.chemical.productType) {
      case 'ph-reducer':
      case 'ph-increaser':
        if (outcome.changes.ph !== undefined) {
          return { metric: 'ph', effect: outcome.changes.ph };
        }
        return null;
      case 'chlorine-granules':
        if (outcome.changes.fac !== undefined) {
          return { metric: 'fac', effect: outcome.changes.fac };
        }
        return null;
      case 'pool-salt':
        if (outcome.changes.salt !== undefined) {
          return { metric: 'salt', effect: outcome.changes.salt };
        }
        return null;
    }
  }

  if (action.kind === 'chlorinator') {
    if (outcome.changes.fac !== undefined) {
      return { metric: 'fac', effect: outcome.changes.fac };
    }
  }

  return null;
}

// ── Action type string for grouping ──────────────────────────────

function actionTypeKey(action: MaintenanceAction): string {
  if (action.kind === 'chemical' && action.chemical) {
    return `chemical:${action.chemical.productType}`;
  }
  if (action.kind === 'chlorinator') {
    return 'chlorinator';
  }
  return action.kind;
}

// ── Theoretical effect estimation ─────────────────────────────────

interface TheoreticalInput {
  action: MaintenanceAction;
  settings: PoolSettings;
  beforeMeasurement: Measurement | null;
}

function estimateTheoreticalEffect(
  input: TheoreticalInput,
  metric: Metric,
): number | undefined {
  const { action, settings } = input;
  const volL = volumeInLiters(settings);
  if (volL <= 0) return undefined;
  const volM3 = volL / 1000;

  if (action.kind === 'chemical' && action.chemical) {
    const { productType, amount, unit } = action.chemical;
    const amountL = unit === 'l' ? amount : unit === 'ml' ? amount / 1000 : amount;

    switch (productType) {
      case 'ph-reducer': {
        // ~750ml per 50m³ reduces pH by 0.1
        const normAmount = unit === 'ml' ? amount : amountL * 1000;
        const expected = -(normAmount / 750) * (50 / volM3) * 0.1;
        return metric === 'ph' ? Math.round(expected * 100) / 100 : undefined;
      }
      case 'ph-increaser': {
        // ~1L per 50m³ raises pH by 0.1
        const normAmountL = unit === 'l' ? amount : amount / 1000;
        const expected = (normAmountL / 1) * (50 / volM3) * 0.1;
        return metric === 'ph' ? Math.round(expected * 100) / 100 : undefined;
      }
      case 'chlorine-granules': {
        // 3g/m³ raises FAC by ~1ppm
        if (unit !== 'g' && unit !== 'kg') return undefined;
        const grams = unit === 'kg' ? amount * 1000 : amount;
        const expected = (grams / 3) / volM3;
        return metric === 'fac' ? Math.round(expected * 100) / 100 : undefined;
      }
      case 'pool-salt': {
        // deltaPpm = (amount_kg * 1,000,000) / volume_liters
        if (unit !== 'kg' && unit !== 'g') return undefined;
        const kg = unit === 'g' ? amount / 1000 : amount;
        const expected = (kg * 1_000_000) / volL;
        return metric === 'salt' ? Math.round(expected) : undefined;
      }
    }
  }

  if (action.kind === 'chlorinator' && metric === 'fac') {
    const sc = settings.saltChlorinator;
    if (!sc || !sc.enabled || sc.productionGramsPerHour <= 0) return undefined;
    const chl = action.chlorinator;
    if (!chl) return undefined;

    // Theoretical FAC generation during additional runtime
    const outputPct = chl.previousOutputPercent !== undefined
      ? (chl.previousOutputPercent + chl.newOutputPercent) / 2
      : chl.newOutputPercent;
    const hours = chl.additionalHours ?? 1;
    // Effective production in g/h, then ppm per hour
    const effectiveGPerH = sc.productionGramsPerHour * (outputPct / 100);
    const ppmPerHour = (effectiveGPerH * hours) / volM3;
    return Math.round(ppmPerHour * 100) / 100;
  }

  return undefined;
}

// ── Find the before-measurement for an outcome ───────────────────

function findMeasurementById(
  measurements: Measurement[],
  id: string,
): Measurement | null {
  return measurements.find((m) => m.id === id) ?? null;
}

// ── Confidence level from sample size ────────────────────────────

function sampleSizeConfidence(n: number): LearningConfidence {
  if (n < 3) return 'none';
  if (n <= 4) return 'low';
  if (n <= 9) return 'medium';
  return 'high';
}

/**
 * Reduce confidence when dispersion is high relative to the median effect.
 * A coefficient of variation analog: if |MAD/median| > 0.5, drop one level.
 */
function adjustConfidenceForDispersion(
  base: LearningConfidence,
  med: number,
  disp: number,
): LearningConfidence {
  if (med === 0) return base;

  const relativeDispersion = Math.abs(disp / med);
  if (relativeDispersion > 1.0) {
    // High dispersion: drop by two levels
    if (base === 'high') return 'medium';
    if (base === 'medium') return 'low';
    if (base === 'low') return 'none';
    return 'none';
  }
  if (relativeDispersion > 0.5) {
    // Moderate dispersion: drop by one level
    if (base === 'high') return 'medium';
    if (base === 'medium') return 'low';
    if (base === 'low') return 'none';
    return 'none';
  }

  return base;
}

// ── Clamp correction factor ─────────────────────────────────────

function clampCorrection(factor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, factor));
}

// ── Grouping helper ──────────────────────────────────────────────

interface GroupKey {
  actionType: string;
  poolType: PoolType;
  metric: Metric;
  temperatureBand?: TemperatureBand;
  outputPercentBand?: string;
}

function buildGroupKey(
  actionType: string,
  poolType: PoolType,
  metric: Metric,
  tempBand?: TemperatureBand,
  outBand?: string,
): string {
  const parts = [actionType, poolType, metric];
  if (tempBand) parts.push(tempBand);
  if (outBand) parts.push(outBand);
  return parts.join('::');
}

function parseGroupKey(key: string): GroupKey {
  const parts = key.split('::');
  const [actionType, poolType, metric] = parts;
  return {
    actionType,
    poolType: poolType as PoolType,
    metric: metric as Metric,
    temperatureBand: parts[3] as TemperatureBand | undefined,
    outputPercentBand: parts[4],
  };
}

// ── Main entry point ─────────────────────────────────────────────

/**
 * Compute learned adjustments from measurement and action history.
 *
 * All calculations are deterministic and explainable — no machine learning.
 * Outcomes are recalculated from raw records each time (not persisted).
 *
 * @param config Optional configuration overrides. Uses defaults when omitted.
 */
export function computeLearning(
  measurements: Measurement[],
  actions: MaintenanceAction[],
  settings: PoolSettings,
  config?: HistoricalLearningConfig,
): LearnedAdjustment[] {
  if (measurements.length < 2 || actions.length === 0) return [];

  const {
    minimumSamples,
    minCorrectionFactor,
    maxCorrectionFactor,
  } = { ...DEFAULT_HISTORICAL_LEARNING, ...config };

  const outcomes = evaluateActionOutcomes(measurements, actions);
  if (outcomes.length === 0) return [];

  // Group effects by key
  const groups = new Map<string, { effects: number[]; samples: Array<{ performedAt: string }>; theoreticalEffects: number[] }>();

  for (const outcome of outcomes) {
    const action = actions.find((a) => a.id === outcome.actionId);
    if (!action) continue;

    if (!isEligibleOutcome(outcome, action)) continue;

    const metricEffect = extractMetricEffect(action, outcome);
    if (!metricEffect) continue;

    const aType = actionTypeKey(action);
    const poolType: PoolType = settings.poolType === 'saltwater' ? 'saltwater' : 'chlorine';

    // Find before measurement to get temperature and chlorinator output
    const beforeMeas = findMeasurementById(measurements, outcome.beforeMeasurementId);
    const tempBand = beforeMeas ? getTemperatureBand(beforeMeas.temperature) : undefined;
    const outBand = (action.kind === 'chlorinator' && action.chlorinator)
      ? getOutputPercentBand(action.chlorinator.previousOutputPercent ?? action.chlorinator.newOutputPercent)
      : undefined;

    const key = buildGroupKey(aType, poolType, metricEffect.metric, tempBand, outBand);

    if (!groups.has(key)) {
      groups.set(key, { effects: [], samples: [], theoreticalEffects: [] });
    }

    const group = groups.get(key)!;
    group.effects.push(metricEffect.effect);
    group.samples.push({ performedAt: action.performedAt });

    // Compute theoretical effect where possible
    const theoretical = estimateTheoreticalEffect(
      { action, settings, beforeMeasurement: beforeMeas },
      metricEffect.metric,
    );
    if (theoretical !== undefined && theoretical !== 0) {
      group.theoreticalEffects.push(theoretical);
    }
  }

  // Convert groups to LearnedAdjustment[]
  const adjustments: LearnedAdjustment[] = [];

  for (const [key, group] of groups) {
    const { actionType, poolType, metric, temperatureBand, outputPercentBand } = parseGroupKey(key);
    const n = group.effects.length;

    if (n < minimumSamples) continue; // No usable learning below minimum samples

    const med = Math.round(median(group.effects) * 100) / 100;
    const avg = Math.round(mean(group.effects) * 100) / 100;
    const disp = Math.round(mad(group.effects) * 100) / 100;

    let baseConf = sampleSizeConfidence(n);
    baseConf = adjustConfidenceForDispersion(baseConf, med, disp);

    // Use mean theoretical effect
    const avgTheoretical = group.theoreticalEffects.length > 0
      ? mean(group.theoreticalEffects)
      : undefined;
    const avgTheoreticalRounded = avgTheoretical !== undefined
      ? Math.round(avgTheoretical * 100) / 100
      : undefined;

    // Correction factor = observed median / theoretical mean
    let correctionFactor: number | undefined;
    if (avgTheoreticalRounded !== undefined && avgTheoreticalRounded !== 0) {
      correctionFactor = clampCorrection(med / avgTheoreticalRounded, minCorrectionFactor, maxCorrectionFactor);
      correctionFactor = Math.round(correctionFactor * 100) / 100;
    }

    const latestSample = [...group.samples].sort(
      (a, b) => b.performedAt.localeCompare(a.performedAt),
    )[0];

    adjustments.push({
      id: `learn-${key.replace(/::/g, '-')}`,
      actionType,
      metric,
      observedMedianEffect: med,
      observedMeanEffect: avg,
      sampleSize: n,
      dispersion: disp,
      theoreticalEffect: avgTheoreticalRounded,
      correctionFactor,
      confidence: baseConf,
      filters: {
        poolType,
        temperatureBand,
        outputPercentBand,
      },
      latestSampleAt: latestSample.performedAt,
    });
  }

  return adjustments.sort((a, b) => b.sampleSize - a.sampleSize);
}

// ── Historical insights (human-readable summaries) ───────────────

/**
 * Derive human-readable insights from learned adjustments.
 */
export function deriveInsights(adjustments: LearnedAdjustment[]): HistoricalInsight[] {
  const insights: HistoricalInsight[] = [];

  // FAC per chlorinator hour
  const chlorinatorFAC = adjustments.filter(
    (a) => a.actionType === 'chlorinator' && a.metric === 'fac' && a.confidence !== 'none',
  );
  for (const adj of chlorinatorFAC) {
    const bandLabel = adj.filters.outputPercentBand
      ? ` (output ${adj.filters.outputPercentBand}%)`
      : '';
    const tempLabel = adj.filters.temperatureBand
      ? `, ${adj.filters.temperatureBand} water` : '';
    insights.push({
      label: `FAC increase per chlorinator adjustment${bandLabel}${tempLabel}`,
      description: `Observed median FAC increase of ${adj.observedMedianEffect} ppm per chlorinator adjustment.`,
      value: `${adj.observedMedianEffect > 0 ? '+' : ''}${adj.observedMedianEffect} ppm`,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      actionType: adj.actionType,
      metric: adj.metric,
    });
  }

  // FAC response to chlorine granules
  const granulesFAC = adjustments.filter(
    (a) => a.actionType === 'chemical:chlorine-granules' && a.metric === 'fac' && a.confidence !== 'none',
  );
  for (const adj of granulesFAC) {
    const tempLabel = adj.filters.temperatureBand
      ? ` (${adj.filters.temperatureBand} water)` : '';
    insights.push({
      label: `FAC response to chlorine granules${tempLabel}`,
      description: `Observed median FAC change of ${adj.observedMedianEffect} ppm after chlorine granules application.`,
      value: `${adj.observedMedianEffect > 0 ? '+' : ''}${adj.observedMedianEffect} ppm`,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      actionType: adj.actionType,
      metric: adj.metric,
    });
  }

  // pH response to reducer/increaser
  const phAdjustments = adjustments.filter(
    (a) => (a.actionType === 'chemical:ph-reducer' || a.actionType === 'chemical:ph-increaser') &&
           a.metric === 'ph' && a.confidence !== 'none',
  );
  for (const adj of phAdjustments) {
    const productLabel = adj.actionType === 'chemical:ph-reducer' ? 'pH reducer' : 'pH increaser';
    const tempLabel = adj.filters.temperatureBand
      ? ` (${adj.filters.temperatureBand} water)` : '';
    insights.push({
      label: `pH response to ${productLabel}${tempLabel}`,
      description: `Observed median pH change of ${adj.observedMedianEffect} after ${productLabel} application.`,
      value: `${adj.observedMedianEffect > 0 ? '+' : ''}${adj.observedMedianEffect}`,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      actionType: adj.actionType,
      metric: adj.metric,
    });
  }

  // Salt response
  const saltAdjustments = adjustments.filter(
    (a) => a.actionType === 'chemical:pool-salt' && a.metric === 'salt' && a.confidence !== 'none',
  );
  for (const adj of saltAdjustments) {
    insights.push({
      label: `Salt level response to pool salt addition`,
      description: `Observed median salt increase of ${adj.observedMedianEffect} ppm after pool salt application.`,
      value: `+${adj.observedMedianEffect} ppm`,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      actionType: adj.actionType,
      metric: adj.metric,
    });
  }

  return insights;
}
