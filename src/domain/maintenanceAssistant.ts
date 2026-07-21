import type { Measurement } from './measurement';
import type { PoolSettings, HistoricalLearningConfig } from './settings';
import { volumeInLiters, DEFAULT_HISTORICAL_LEARNING } from './settings';
import { getTargetRange, getTargetRangeSnapshot, classifyLevel, TARGET_RANGES } from './chemistry';
import type { TargetRange, TargetRangeSnapshot } from './chemistry';
import { analyzeTrends } from './trendAnalysis';
import type { MeasurementTrend } from './trendAnalysis';
import {
  calculateChlorinatorAdjustment,
  describeChlorinatorProduction,
  getChlorinatorCapabilities,
} from './saltChlorinator';
import type { ChlorinatorCapabilities, SaltChlorinatorConfig } from './saltChlorinator';
import type { MaintenanceAction } from './actions';
import { evaluateActionOutcomes } from './actionOutcomeEvaluator';
import { computeLearning, getTemperatureBand, getOutputPercentBand } from './historicalLearning';
import type { LearnedAdjustment, LearningConfidence } from './historicalLearning';
import { calculateFacDose, classifyChlorineCorrection, type ChlorineCorrectionType } from './recommendation/chemicalDoseCalculator';
import { estimateChlorinatorFacModel } from './recommendation/chlorineModel';
import { analyzeRecommendationEscalation, type EscalationAnalysis } from './recommendation/recommendationEscalationEngine';
import type { TranslationKey, TranslationParams } from '../i18n/types';

// ── Types ─────────────────────────────────────────────────────────

export type MaintenanceActionKind =
  | 'chemical'
  | 'equipment'
  | 'filtration'
  | 'retest'
  | 'monitor'
  | 'manual-test'
  | 'warning'
  | 'no-action';

export type RecommendationSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'danger';

export type RecommendationState =
  | 'actionable'
  | 'blocked'
  | 'pending-retest'
  | 'informational';

export type DiagnosisCode =
  | 'PH_CRITICAL'
  | 'FAC_CRITICAL_LOW'
  | 'ORP_VERY_LOW'
  | 'ORP_BELOW_TARGET'
  | 'PH_LOW'
  | 'PH_HIGH'
  | 'FAC_LOW'
  | 'FAC_HIGH'
  | 'SALT_LOW'
  | 'SALT_HIGH'
  | 'CHLORINATOR_ADJUST'
  | 'CHLORINATOR_PREVENTIVE'
  | 'MANUAL_TEST_REQUIRED'
  | 'TREND_MONITOR'
  | 'ALL_GOOD';

export interface RecommendationDependency {
  recommendationId?: string;
  condition:
    | 'ph-in-range'
    | 'salt-in-range'
    | 'retest-completed'
    | 'manual-value-available';
  explanationKey: TranslationKey;
}

export interface MaintenanceRecommendation {
  id: string;
  kind: MaintenanceActionKind;
  severity: RecommendationSeverity;
  title: string;
  summary: string;
  reason: string;
  /** Translation key for the title (rendered instead of `title` when available). */
  titleKey?: TranslationKey;
  /** Translation parameters for the title. */
  titleParams?: TranslationParams;
  /** Translation key for the summary (rendered instead of `summary` when available). */
  summaryKey?: TranslationKey;
  /** Translation parameters for the summary. */
  summaryParams?: TranslationParams;
  /** Translation key for the reason (rendered instead of `reason` when available). */
  reasonKey?: TranslationKey;
  /** Translation parameters for the reason. */
  reasonParams?: TranslationParams;
  priority: number;
  relatedFields: Array<keyof Measurement>;
  chemicalProductId?: string;
  genericProductName?: string;
  /** Translation key for the generic product name. */
  genericProductNameKey?: TranslationKey;
  mainComponent?: string;
  /** Translation key for the main component. */
  mainComponentKey?: TranslationKey;
  estimatedAmount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg';
  equipmentName?: string;
  equipmentNameKey?: TranslationKey;
  suggestedOutputPercent?: number;
  suggestedAdditionalHours?: number;
  suggestedOutputLevelId?: string;
  recommendedChlorinatorAction?:
    | 'increase-runtime'
    | 'increase-output-percent'
    | 'set-output-level'
    | 'review-setpoint'
    | 'calibrate-sensor'
    | 'identify-capabilities';
  suggestedFiltrationHours?: number;
  targetRange?: {
    min: number;
    max: number;
    unit: string;
  };
  currentValue?: number;
  calculationNotes: string[];
  safetyNotes: string[];
  followUpActions: string[];
  retestAfterHours?: number;
  personalization?: RecommendationPersonalization;
  chlorineCorrectionType?: ChlorineCorrectionType;
  escalationLevel?: EscalationAnalysis['level'];
  /** Recommendation state for staged plans. */
  state?: RecommendationState;
  /** Dependencies that must be resolved before this rec is actionable. */
  dependencies?: RecommendationDependency[];
  /** Stage number for staged maintenance plans (1-based). */
  stage?: number;
  diagnosisCode?: DiagnosisCode;
  rangePolicy?: {
    general?: TargetRangeSnapshot;
    configured?: TargetRangeSnapshot;
    custom?: TargetRange;
    selected: 'general' | 'configured' | 'custom';
    origin: 'catalog' | 'settings' | 'user';
  };
}

export interface RecommendationPersonalization {
  applied: boolean;
  theoreticalValue?: number;
  personalizedValue?: number;
  correctionFactor?: number;
  sampleSize?: number;
  confidence?: LearningConfidence;
  explanation: string;
}

export interface MaintenanceAssistantResult {
  status:
    | 'balanced'
    | 'needs-attention'
    | 'needs-correction'
    | 'unsafe'
    | 'insufficient-data';
  summary: string;
  summaryKey?: TranslationKey;
  summaryParams?: TranslationParams;
  recommendations: MaintenanceRecommendation[];
  trends: MeasurementTrend[];
  nextCheckSuggestion: {
    recommendedAt?: string;
    hoursFromNow?: number;
    reason: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────

let _counter = 0;
function nextId(): string {
  _counter += 1;
  return `ma-${Date.now()}-${_counter}`;
}

function makeRange(min: number, max: number, unit: string) {
  return { min, max, unit };
}

function sortBySeverity(a: MaintenanceRecommendation, b: MaintenanceRecommendation): number {
  const order: Record<string, number> = { danger: 0, high: 1, medium: 2, low: 3, info: 4 };
  return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
}

function buildChlorineDose(input: {
  latest: Measurement;
  settings: PoolSettings;
  targetFac: number;
  correctionType: ChlorineCorrectionType;
}): ReturnType<typeof calculateFacDose> {
  return calculateFacDose({
    productId: 'chlorine-granules',
    settings: input.settings,
    currentFac: input.latest.fac,
    targetFac: input.targetFac,
    correctionType: input.correctionType,
  });
}

function buildCapabilityBasedChlorinatorRecommendation(input: {
  severity: RecommendationSeverity;
  priority: number;
  latest: Measurement;
  facRange: TargetRange;
  capabilities: ChlorinatorCapabilities;
  calculationNotes: string[];
  preventive: boolean;
}): MaintenanceRecommendation {
  const base = {
    id: nextId(),
    kind: 'equipment' as const,
    severity: input.severity,
    title: input.preventive ? 'Optimizar clorador salino' : 'Ajustar clorador salino',
    summary: input.preventive
      ? `Revisar el clorador para llevar el FAC de ${input.latest.fac.toFixed(1)} ppm a ${input.facRange.ideal.toFixed(1)} ppm.`
      : `Revisar el clorador salino para aumentar el FAC de ${input.latest.fac.toFixed(1)} ppm a ${input.facRange.ideal.toFixed(1)} ppm.`,
    reason: input.preventive
      ? `El FAC (${input.latest.fac.toFixed(1)} ppm) está dentro del rango pero por debajo del valor ideal.`
      : `El FAC (${input.latest.fac.toFixed(1)} ppm) está por debajo del rango (${input.facRange.min}–${input.facRange.max} ppm).`,
    priority: input.priority,
    relatedFields: ['fac'] as Array<keyof Measurement>,
    equipmentName: 'Clorador salino',
    targetRange: makeRange(input.facRange.min, input.facRange.max, 'ppm'),
    currentValue: input.latest.fac,
    calculationNotes: input.calculationNotes,
    safetyNotes: [] as string[],
    followUpActions: [] as string[],
    retestAfterHours: 24,
  };

  if (input.capabilities.supportsDiscreteLevels) {
    const nextLevel = input.capabilities.availableLevels?.[1] ?? input.capabilities.availableLevels?.[0];
    return {
      ...base,
      recommendedChlorinatorAction: 'set-output-level',
      suggestedOutputLevelId: nextLevel?.id,
      calculationNotes: [
        ...input.calculationNotes,
        nextLevel
          ? `Cambiar al nivel ${nextLevel.id}; no se inventa equivalencia porcentual si el fabricante no la declara.`
          : 'El equipo usa niveles, pero no hay niveles configurados para calcular un cambio exacto.',
      ],
      followUpActions: [
        nextLevel ? `Configurar el nivel ${nextLevel.id}.` : 'Configurar los niveles disponibles del clorador.',
        'Medir FAC después del ciclo de filtración.',
      ],
    };
  }

  if (input.capabilities.supportsAutomaticControl) {
    return {
      ...base,
      recommendedChlorinatorAction: 'review-setpoint',
      calculationNotes: [
        ...input.calculationNotes,
        'El equipo declara control automático; no se recomienda porcentaje ni horas manuales no soportadas.',
      ],
      followUpActions: [
        'Revisar la consigna del clorador automático.',
        'Inspeccionar o calibrar el sensor si el valor no responde.',
        'Medir FAC después del ciclo de control.',
      ],
    };
  }

  return {
    ...base,
    recommendedChlorinatorAction: 'identify-capabilities',
    severity: input.severity === 'low' ? 'info' : input.severity,
    calculationNotes: [
      ...input.calculationNotes,
      'Faltan capacidades del clorador; no se calcula una duración ni porcentaje operativo.',
    ],
    followUpActions: [
      'Identificar fabricante, modelo y forma de control del clorador.',
      'Revisar manualmente caudal, sal, célula y alarmas.',
      'Medir FAC después de cualquier intervención.',
    ],
  };
}

function buildTemporaryChlorineCorrectionRecommendation(input: {
  latest: Measurement;
  settings: PoolSettings;
  facRange: TargetRange;
  severity: RecommendationSeverity;
  isLowOrp: boolean;
  escalation: EscalationAnalysis;
}): MaintenanceRecommendation {
  const correctionType = classifyChlorineCorrection({
    fac: input.latest.fac,
    targetFac: input.facRange.ideal,
    orp: input.latest.orp,
    visibleAlgae: input.latest.context?.visibleAlgae,
    waterClarity: input.latest.context?.waterClarity,
    batherLoad: input.latest.context?.batherLoad,
    persistentLowFac: input.escalation.level !== 'NORMAL',
  });
  const dose = buildChlorineDose({
    latest: input.latest,
    settings: input.settings,
    targetFac: input.facRange.ideal,
    correctionType,
  });
  return {
    id: nextId(),
    kind: 'chemical',
    severity: input.severity,
    title: 'Cloro granulado — acción correctiva temporal',
    summary: 'Aplicar cloro granulado como acción temporal mientras se revisa el clorador.',
    reason: `El FAC está muy bajo${input.isLowOrp ? ` y el ORP (${input.latest.orp} mV) también está bajo` : ''}. Se necesita una acción correctiva inmediata.`,
    priority: 4,
    relatedFields: ['fac', 'orp'],
    chemicalProductId: 'chlorine-granules',
    genericProductName: 'Cloro granulado',
    mainComponent: 'Cloro de disolución rápida',
    estimatedAmount: dose.theoreticalAmount,
    unit: dose.unit,
    targetRange: makeRange(input.facRange.min, input.facRange.max, 'ppm'),
    currentValue: input.latest.fac,
    chlorineCorrectionType: correctionType,
    escalationLevel: input.escalation.level,
    calculationNotes: [
      ...dose.notes,
      `Tipo de corrección: ${correctionType}.`,
      'Usar solo como medida temporal mientras se revisa el clorador.',
    ],
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'No mezclar con ácidos u otros productos químicos.',
      'Añadir en horas de baja radiación solar.',
      'Esperar al menos 30 minutos antes de bañarse.',
    ],
    followUpActions: [
      'Aplicar el cloro granulado.',
      'Revisar el clorador salino.',
      'Medir FAC y ORP después de 4–6 horas.',
    ],
    retestAfterHours: 6,
  };
}

function shouldUseCapabilityOnlyChlorinatorRecommendation(capabilities: ChlorinatorCapabilities): boolean {
  return capabilities.supportsDiscreteLevels ||
    capabilities.supportsAutomaticControl ||
    capabilities.controlType === 'unknown' ||
    !capabilities.hasKnownNormalProduction;
}

function attachRecommendationAuditMetadata(
  recs: MaintenanceRecommendation[],
  settings: PoolSettings,
): void {
  const generalFac = getTargetRangeSnapshot('fac', 'chlorine');
  const configuredFac = getTargetRangeSnapshot('fac', settings.poolType);

  for (const rec of recs) {
    rec.diagnosisCode ??= inferDiagnosisCode(rec);

    if (rec.targetRange && rec.relatedFields.includes('fac')) {
      rec.rangePolicy = {
        general: generalFac,
        configured: configuredFac,
        selected: settings.poolType === 'saltwater' ? 'configured' : 'general',
        origin: 'catalog',
      };
    }
  }
}

function inferDiagnosisCode(rec: MaintenanceRecommendation): DiagnosisCode | undefined {
  if (rec.kind === 'no-action' && rec.severity === 'info') return 'ALL_GOOD';
  if (rec.kind === 'manual-test') return 'MANUAL_TEST_REQUIRED';
  if (rec.kind === 'equipment' && rec.severity === 'low') return 'CHLORINATOR_PREVENTIVE';
  if (rec.kind === 'equipment') return 'CHLORINATOR_ADJUST';
  if (rec.relatedFields.includes('ph') && rec.severity === 'danger') return 'PH_CRITICAL';
  if (rec.relatedFields.includes('fac') && rec.severity === 'danger') return 'FAC_CRITICAL_LOW';
  if (rec.relatedFields.includes('salt') && rec.chemicalProductId === 'pool-salt') return 'SALT_LOW';
  if (rec.relatedFields.includes('salt') && rec.kind === 'warning') return 'SALT_HIGH';
  if (rec.relatedFields.includes('fac') && rec.kind === 'no-action') return 'FAC_HIGH';
  if (rec.relatedFields.includes('fac')) return 'FAC_LOW';
  if (rec.relatedFields.includes('ph') && rec.chemicalProductId === 'ph-increaser-liquid') return 'PH_LOW';
  if (rec.relatedFields.includes('ph') && rec.chemicalProductId === 'ph-reducer-liquid') return 'PH_HIGH';
  if (rec.kind === 'monitor') return 'TREND_MONITOR';
  return undefined;
}

function addEscalationRecommendations(
  recommendations: MaintenanceRecommendation[],
  escalation: EscalationAnalysis,
  latest: Measurement,
  facRange: TargetRange,
  settings: PoolSettings,
): void {
  if (escalation.level === 'NORMAL') return;

  recommendations.push({
    id: nextId(),
    kind: 'equipment',
    severity: escalation.level === 'DIAGNOSTIC' || escalation.level === 'CRITICAL' ? 'high' : 'medium',
    title: 'Revisar clorador salino',
    summary: 'El FAC bajo es persistente y los intentos recientes no muestran recuperación suficiente.',
    reason: escalation.reasons.join(' '),
    priority: 2,
    relatedFields: ['fac', 'orp'],
    equipmentName: 'Clorador salino',
    targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
    currentValue: latest.fac,
    escalationLevel: escalation.level,
    calculationNotes: [
      ...escalation.reasons,
      'El motor escala porque el comportamiento observado de esta piscina no confirma recuperación con ajustes del clorador.',
    ],
    safetyNotes: latest.fac < facRange.min * 0.5
      ? ['Evitar bañarse hasta recuperar el FAC dentro del rango.']
      : [],
    followUpActions: [
      'Comprobar que el clorador produce cloro.',
      'Comprobar célula electrolítica y posibles incrustaciones.',
      'Comprobar caudal y alarmas del equipo.',
      'Limpiar la célula si hay cal visible siguiendo el manual del fabricante.',
    ],
    retestAfterHours: 24,
  });

  recommendations.push({
    id: nextId(),
    kind: 'manual-test',
    severity: escalation.level === 'PERSISTENT' ? 'medium' : 'high',
    title: 'Diagnóstico manual de cloro',
    summary: 'Confirmar FAC con prueba manual y medir cloro total y ácido cianúrico.',
    reason: 'Cuando el FAC no recupera tras varios intentos, hay que separar error de medición, cloro combinado, estabilizador insuficiente y fallo de producción.',
    priority: 3,
    relatedFields: ['fac', 'orp'],
    targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
    currentValue: latest.fac,
    escalationLevel: escalation.level,
    calculationNotes: [
      'Medición manual de FAC para validar el sensor o fotómetro habitual.',
      'Medición de cloro total para detectar cloro combinado.',
      'Medición de ácido cianúrico para estimar pérdida por radiación solar.',
    ],
    safetyNotes: [],
    followUpActions: [
      'Medir FAC manualmente.',
      'Medir cloro total.',
      'Medir ácido cianúrico.',
      'Registrar los resultados como notas o nueva medición.',
    ],
    retestAfterHours: 6,
  });

  if (escalation.level === 'CRITICAL' || escalation.level === 'DIAGNOSTIC') {
    const correctionType = classifyChlorineCorrection({
      fac: latest.fac,
      targetFac: facRange.ideal,
      orp: latest.orp,
      visibleAlgae: latest.context?.visibleAlgae,
      waterClarity: latest.context?.waterClarity,
      batherLoad: latest.context?.batherLoad,
      persistentLowFac: true,
    });
    const dose = buildChlorineDose({
      latest,
      settings,
      targetFac: facRange.ideal,
      correctionType,
    });

    recommendations.push({
      id: nextId(),
      kind: 'chemical',
      severity: 'high',
      title: 'Cloro rápido temporal',
      summary: 'Aplicar cloro de disolución rápida como corrección temporal mientras se diagnostica el clorador.',
      reason: 'El historial indica FAC bajo persistente sin recuperación observable suficiente tras varios intentos.',
      priority: 4,
      relatedFields: ['fac', 'orp'],
      chemicalProductId: 'chlorine-granules',
      genericProductName: 'Cloro granulado',
      mainComponent: 'Cloro de disolución rápida',
      estimatedAmount: dose.theoreticalAmount,
      unit: dose.unit,
      targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
      currentValue: latest.fac,
      chlorineCorrectionType: correctionType,
      escalationLevel: escalation.level,
      calculationNotes: [
        ...dose.notes,
        `Tipo de corrección: ${correctionType}.`,
        'No es una dosis fija de choque; se calcula desde volumen, FAC actual, FAC objetivo y concentración del producto.',
      ],
      safetyNotes: [
        'Manejar con guantes y gafas de protección.',
        'No mezclar con ácidos u otros productos químicos.',
        'Añadir en horas de baja radiación solar.',
        'Esperar al menos 30 minutos antes de bañarse y volver a medir antes de usar la piscina.',
      ],
      followUpActions: [
        'Aplicar el cloro rápido temporal.',
        'Medir FAC y ORP después de 4–6 horas.',
        'Completar la revisión del clorador.',
      ],
      retestAfterHours: 6,
    });
  }
}

// ── Translation key enrichment ──────────────────────────────────

/**
 * Enrich recommendations with translation keys based on structured
 * properties (kind, chemicalProductId, etc.) so the UI can render
 * in any language without the domain knowing the selected language.
 */
function enrichRecommendationKeys(
  recs: MaintenanceRecommendation[],
  latest: Measurement,
  _phRange: TargetRange,
  _facRange: TargetRange,
  _saltRange: TargetRange,
  _settings: PoolSettings,
): void {
  for (const rec of recs) {
    // ── Product name / component keys ──────────────────────────
    if (rec.chemicalProductId) {
      const pid = rec.chemicalProductId;
      const productKeyMap: Record<string, { nameKey: TranslationKey; componentKey: TranslationKey }> = {
        'ph-reducer-liquid': { nameKey: 'product.phReducer.name', componentKey: 'product.phReducer.component' },
        'ph-increaser-liquid': { nameKey: 'product.phIncreaser.name', componentKey: 'product.phIncreaser.component' },
        'chlorine-granules': { nameKey: 'product.chlorineGranules.name', componentKey: 'product.chlorineGranules.component' },
        'chlorine-stabilizer': { nameKey: 'product.chlorineStabilizer.name', componentKey: 'product.chlorineStabilizer.component' },
        'total-alkalinity-reducer': { nameKey: 'product.alkalinityReducer.name', componentKey: 'product.alkalinityReducer.component' },
        'pool-salt': { nameKey: 'product.poolSalt.name', componentKey: 'product.poolSalt.component' },
      };
      const pm = productKeyMap[pid];
      if (pm) {
        rec.genericProductNameKey = pm.nameKey;
        rec.mainComponentKey = pm.componentKey;
      }
    }

    // ── Equipment name ─────────────────────────────────────────
    if (rec.kind === 'equipment' && rec.equipmentName?.toLowerCase().includes('clorador')) {
      rec.equipmentNameKey = 'equipment.chlorinator';
    }

    // ── Title / summary / reason keys ──────────────────────────
    const phVal = latest.ph?.toFixed(1) ?? '';
    const facVal = latest.fac?.toFixed(1) ?? '';
    const orpVal = latest.orp ?? 0;

    // Strategy: match by (kind, severity, chemicalProductId, priority) combo
    if (rec.kind === 'warning' && rec.severity === 'danger' && rec.relatedFields.includes('ph')) {
      rec.titleKey = 'rec.ph.critical.title';
      rec.summaryKey = 'rec.ph.critical.summary';
      rec.summaryParams = { value: phVal };
      rec.reasonKey = 'rec.ph.critical.reason';
      rec.reasonParams = { value: phVal, min: String(_phRange.min), max: String(_phRange.max) };
    } else if (rec.kind === 'warning' && rec.severity === 'danger' && rec.relatedFields.includes('fac')) {
      rec.titleKey = 'rec.fac.critical.title';
      rec.summaryKey = 'rec.fac.critical.summary';
      rec.summaryParams = { value: facVal };
      rec.reasonKey = 'rec.fac.critical.reason';
      rec.reasonParams = { value: facVal, min: String(_facRange.min), max: String(_facRange.max) };
    } else if (rec.diagnosisCode === 'ORP_VERY_LOW') {
      rec.titleKey = 'rec.orp.veryLow.title';
      rec.summaryKey = 'rec.orp.veryLow.summary';
      rec.summaryParams = { value: String(orpVal) };
      rec.reasonKey = 'rec.orp.veryLow.reason';
      rec.reasonParams = { value: String(orpVal) };
    } else if (rec.diagnosisCode === 'ORP_BELOW_TARGET') {
      rec.titleKey = 'rec.orp.below650.title';
      rec.summaryKey = 'rec.orp.below650.summary';
      rec.summaryParams = { value: String(orpVal) };
      rec.reasonKey = 'rec.orp.below650.reason';
      rec.reasonParams = { value: String(orpVal) };
    } else if (rec.kind === 'retest' && rec.diagnosisCode === 'PH_LOW') {
      rec.titleKey = 'rec.ph.waitSaltwater.title';
      rec.summaryKey = 'rec.ph.waitSaltwater.summary';
      rec.summaryParams = { value: phVal };
      rec.reasonKey = 'rec.ph.waitSaltwater.reason';
    } else if (rec.kind === 'monitor' && rec.severity === 'low' && rec.relatedFields.includes('temperature')) {
      rec.titleKey = 'rec.temp.high.title';
      rec.summaryKey = 'rec.temp.high.summary';
      rec.summaryParams = { value: latest.temperature?.toFixed(1) ?? '' };
      rec.reasonKey = 'rec.temp.high.reason';
    } else if (rec.chemicalProductId === 'ph-increaser-liquid') {
      rec.titleKey = 'rec.ph.raise.title';
      rec.summaryKey = 'rec.ph.raise.summary';
      rec.summaryParams = { value: phVal, min: String(_phRange.min), max: String(_phRange.max) };
      rec.reasonKey = 'rec.ph.raise.reason';
      rec.reasonParams = { value: phVal, min: String(_phRange.min), max: String(_phRange.max) };
    } else if (rec.chemicalProductId === 'ph-reducer-liquid') {
      rec.titleKey = 'rec.ph.lower.title';
      rec.summaryKey = 'rec.ph.lower.summary';
      rec.summaryParams = { value: phVal, min: String(_phRange.min), max: String(_phRange.max) };
      rec.reasonKey = 'rec.ph.lower.reason';
      rec.reasonParams = { value: phVal, min: String(_phRange.min), max: String(_phRange.max) };
    } else if (rec.chemicalProductId === 'pool-salt') {
      rec.titleKey = 'rec.salt.add.title';
      rec.summaryKey = 'rec.salt.add.summary';
      rec.summaryParams = { value: String(latest.salt ?? 0), min: String(_saltRange.min), max: String(_saltRange.max) };
      rec.reasonKey = 'rec.salt.add.reason';
      rec.reasonParams = { value: String(latest.salt ?? 0), target: String(_saltRange.ideal), min: String(_saltRange.min), max: String(_saltRange.max) };
    } else if (rec.chemicalProductId === 'chlorine-granules' && rec.severity !== 'info') {
      if (rec.title.includes('acción correctiva temporal') || rec.title.includes('temporary corrective')) {
        rec.titleKey = 'rec.chlorine.shockTemp.title';
        rec.summaryKey = 'rec.chlorine.shockTemp.summary';
        rec.reasonKey = 'rec.chlorine.shockTemp.reason';
        const orpExtra = latest.orp !== undefined && latest.orp < 650 ? ` y el ORP (${latest.orp} mV) también está bajo` : '';
        rec.reasonParams = { orpExtra };
      } else {
        rec.titleKey = 'rec.chlorine.granules.title';
        rec.summaryKey = 'rec.chlorine.granules.summary';
        rec.summaryParams = { value: facVal };
        rec.reasonKey = 'rec.chlorine.granules.reason';
        const orpExtra = latest.orp !== undefined && latest.orp < 650 ? ` y el ORP (${latest.orp} mV) también está bajo` : '';
        rec.reasonParams = { value: facVal, min: String(_facRange.min), max: String(_facRange.max), orpExtra };
      }
    } else if (rec.kind === 'equipment' && rec.equipmentName?.toLowerCase().includes('clorador')) {
      if (rec.severity === 'low') {
        rec.titleKey = 'rec.chlorinator.optimize.title';
        rec.summaryKey = 'rec.chlorinator.optimize.summary';
        rec.summaryParams = { current: facVal, target: String(_facRange.ideal) };
        rec.reasonKey = 'rec.chlorinator.optimize.reason';
        rec.reasonParams = { current: facVal, target: String(_facRange.ideal) };
      } else {
        rec.titleKey = 'rec.chlorinator.adjust.title';
        rec.summaryKey = 'rec.chlorinator.adjust.summary';
        rec.summaryParams = { current: facVal, target: String(_facRange.ideal) };
        rec.reasonKey = 'rec.chlorinator.adjust.reason';
        rec.reasonParams = { current: facVal, min: String(_facRange.min), max: String(_facRange.max) };
      }
    } else if (rec.kind === 'warning' && rec.severity === 'medium' && rec.title.includes('grande')) {
      rec.titleKey = 'rec.largeCorrection.title';
      rec.summaryKey = 'rec.largeCorrection.summary';
      rec.reasonKey = 'rec.largeCorrection.reason';
      const hours = rec.suggestedAdditionalHours ?? rec.suggestedOutputPercent ?? 0;
      rec.reasonParams = { hours: String(hours) };
    } else if (rec.kind === 'monitor' && rec.severity === 'medium' && rec.relatedFields.includes('ph') && rec.relatedFields.includes('fac')) {
      rec.titleKey = 'rec.ph.correctFirst.title';
      rec.summaryKey = 'rec.ph.correctFirst.summary';
      rec.reasonKey = 'rec.ph.correctFirst.reason';
      rec.reasonParams = { value: phVal };
    } else if (rec.kind === 'monitor' && rec.severity === 'medium' && !rec.relatedFields.includes('ph') && rec.relatedFields.includes('fac')) {
      rec.titleKey = 'rec.fac.slightlyLow.title';
      rec.summaryKey = 'rec.fac.slightlyLow.summary';
      rec.summaryParams = { value: facVal };
      rec.reasonKey = 'rec.fac.slightlyLow.reason';
      rec.reasonParams = { value: facVal, min: String(_facRange.min), max: String(_facRange.max) };
    } else if (rec.kind === 'no-action' && rec.severity !== 'info' && rec.relatedFields.includes('fac')) {
      rec.titleKey = 'rec.fac.high.title';
      rec.summaryKey = 'rec.fac.high.summary';
      rec.summaryParams = { value: facVal, min: String(_facRange.min), max: String(_facRange.max) };
      rec.reasonKey = 'rec.fac.high.reason';
      rec.reasonParams = { value: facVal, min: String(_facRange.min), max: String(_facRange.max) };
    } else if (rec.kind === 'warning' && rec.severity === 'medium' && rec.relatedFields.includes('salt')) {
      rec.titleKey = 'rec.salt.high.title';
      rec.summaryKey = 'rec.salt.high.summary';
      rec.summaryParams = { value: String(latest.salt ?? 0), min: String(_saltRange.min), max: String(_saltRange.max) };
      rec.reasonKey = 'rec.salt.high.reason';
    } else if (rec.kind === 'manual-test' && rec.title.includes('ácido cianúrico')) {
      rec.titleKey = 'rec.cya.measure.title';
      rec.summaryKey = 'rec.cya.measure.summary';
      rec.reasonKey = 'rec.cya.measure.reason';
    } else if (rec.kind === 'manual-test' && rec.title.includes('alcalinidad')) {
      rec.titleKey = 'rec.alkalinity.measure.title';
      rec.summaryKey = 'rec.alkalinity.measure.summary';
      rec.reasonKey = 'rec.alkalinity.measure.reason';
    } else if (rec.kind === 'monitor' && rec.title.includes('FAC en descenso')) {
      rec.titleKey = 'rec.fac.dropping.title';
      rec.summaryKey = 'rec.fac.dropping.summary';
      rec.summaryParams = { value: facVal };
    } else if (rec.kind === 'monitor' && rec.title.includes('ORP en descenso')) {
      rec.titleKey = 'rec.orp.dropping.title';
      rec.summaryKey = 'rec.orp.dropping.summary';
      rec.summaryParams = { value: String(orpVal) };
    } else if (rec.kind === 'monitor' && rec.title.includes('Sal en descenso')) {
      rec.titleKey = 'rec.salt.dropping.title';
      rec.summaryKey = 'rec.salt.dropping.summary';
      rec.summaryParams = { value: String(latest.salt ?? 0) };
    } else if (rec.kind === 'monitor' && rec.severity === 'low' && rec.title.includes('pH en aumento')) {
      rec.titleKey = 'rec.ph.rising.title';
      rec.summaryKey = 'rec.ph.rising.summary';
      rec.summaryParams = { value: phVal };
    } else if (rec.kind === 'no-action' && rec.severity === 'info' && rec.title.includes('Todo en orden')) {
      rec.titleKey = 'rec.allGood.title';
      rec.summaryKey = 'rec.allGood.summary';
      rec.reasonKey = 'rec.allGood.reason';
    }
  }
}

// ── Main assistant ────────────────────────────────────────────────

/**
 * Run the maintenance assistant with a full measurement history and
 * pool settings.
 *
 * Analyzes trends, checks all water parameters against target ranges
 * based on pool type (saltwater / chlorine), and generates a complete
 * set of recommendations including chemical corrections, equipment
 * adjustments, filtration changes, manual test suggestions, and
 * monitoring advice.
 *
 * Recommendations are conservative, brand-free, and explainable.
 */
export function runAssistant(
  measurements: Measurement[],
  settings: PoolSettings,
  actions: MaintenanceAction[] = [],
): MaintenanceAssistantResult {
  if (measurements.length === 0) {
    return {
      status: 'insufficient-data',
      summary: 'No hay mediciones almacenadas. Guarda al menos una medición para obtener recomendaciones.',
      summaryKey: 'summary.noMeasurements',
      recommendations: [],
      trends: [],
      nextCheckSuggestion: {
        reason: 'No hay datos para analizar.',
      },
    };
  }

  // Sort by most recent first
  const sorted = [...measurements].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  );
  const latest = sorted[0];

  // Analyze trends from all history
  const trends = analyzeTrends(measurements);

  // Check if latest has required fields
  if (latest.ph === undefined || latest.ph === null || latest.fac === undefined || latest.fac === null) {
    return {
      status: 'insufficient-data',
      summary: 'La última medición no contiene los valores necesarios (pH y FAC).',
      summaryKey: 'summary.missingRequiredFields',
      recommendations: [],
      trends,
      nextCheckSuggestion: {
        reason: 'Completa la medición con pH y FAC.',
      },
    };
  }

  const isSaltwater = settings.poolType === 'saltwater';
  const volLiters = settings.volume > 0 ? volumeInLiters(settings) : 0;
  const volM3 = volLiters / 1000;
  const hasVolume = settings.volume > 0;

  const phRange = TARGET_RANGES.ph;
  const facRange = getTargetRange('fac', settings.poolType);
  const saltRange = TARGET_RANGES.salt;
  const outcomes = actions.length > 0 ? evaluateActionOutcomes(measurements, actions) : [];
  const escalation = analyzeRecommendationEscalation({
    measurements,
    actions,
    outcomes,
    facRange,
  });

  const phClass = classifyLevel(latest.ph, phRange);
  const facClass = classifyLevel(latest.fac, facRange);
  const phAcceptable = latest.ph >= phRange.min && latest.ph <= phRange.max;

  const recommendations: MaintenanceRecommendation[] = [];
  let worstStatus: MaintenanceAssistantResult['status'] = 'balanced';

  // ── Helper to set worst status ────────────────────────────────
  function updateStatus(s: MaintenanceAssistantResult['status']): void {
    const order = ['balanced', 'needs-attention', 'needs-correction', 'unsafe'];
    if (order.indexOf(s) > order.indexOf(worstStatus)) {
      worstStatus = s;
    }
  }

  // ── Helper: pH danger warning ─────────────────────────────────
  if (phClass.label === 'danger') {
    updateStatus('unsafe');
    recommendations.push({
      id: nextId(),
      kind: 'warning',
      severity: 'danger',
      title: 'pH crítico',
      summary: `El pH (${latest.ph.toFixed(1)}) está críticamente fuera de rango.`,
      reason: `El valor de pH ${latest.ph.toFixed(1)} está peligrosamente fuera del rango objetivo ${phRange.min}–${phRange.max}.`,
      priority: 0,
      relatedFields: ['ph'],
      calculationNotes: ['Buscar asistencia profesional si el pH no se corrige.'],
      safetyNotes: ['Evitar bañarse hasta que el pH esté dentro del rango seguro.'],
      followUpActions: ['Corregir el pH inmediatamente.', 'Medir nuevamente después de 4–6 horas.'],
      retestAfterHours: 6,
    });
  }

  // ── Helper: FAC danger warning ────────────────────────────────
  if (facClass.label === 'danger') {
    updateStatus('unsafe');
    recommendations.push({
      id: nextId(),
      kind: 'warning',
      severity: 'danger',
      title: 'FAC críticamente bajo',
      summary: `El FAC (${latest.fac.toFixed(1)} ppm) está críticamente bajo. La piscina puede no ser segura.`,
      reason: `El FAC (${latest.fac.toFixed(1)} ppm) está peligrosamente por debajo del rango objetivo de ${facRange.min}–${facRange.max} ppm.`,
      priority: 0,
      relatedFields: ['fac'],
      calculationNotes: ['El agua puede no ser apta para el baño.'],
      safetyNotes: ['Evitar bañarse hasta que el FAC esté dentro del rango seguro.'],
      followUpActions: ['Aplicar cloro granulado inmediatamente.', 'Medir nuevamente después de 4–6 horas.'],
      retestAfterHours: 6,
    });
  }

  // ── ORP warning ───────────────────────────────────────────────
  if (latest.orp !== undefined && latest.orp !== null) {
    if (latest.orp < 600) {
      updateStatus('needs-correction');
      recommendations.push({
        id: nextId(),
        kind: 'warning',
        severity: 'high',
        title: 'ORP muy bajo',
        summary: `El ORP (${latest.orp} mV) está muy bajo. La desinfección puede estar comprometida.`,
        reason: `El ORP (${latest.orp} mV) está por debajo de 600 mV, lo que indica una capacidad de desinfección insuficiente.`,
        priority: 5,
        relatedFields: ['orp', 'fac'],
        diagnosisCode: 'ORP_VERY_LOW',
        calculationNotes: [
          'Un ORP bajo indica que el agua no está suficientemente desinfectada.',
          'Verificar el nivel de FAC y el funcionamiento del sistema de cloración.',
        ],
        safetyNotes: ['Evitar bañarse hasta que el ORP mejore.'],
        followUpActions: ['Aumentar el nivel de FAC.', 'Medir ORP y FAC nuevamente en 4–6 horas.'],
        retestAfterHours: 6,
      });
    } else if (latest.orp < 650) {
      updateStatus('needs-attention');
      recommendations.push({
        id: nextId(),
        kind: 'monitor',
        severity: 'medium',
        title: 'ORP por debajo de 650 mV',
        summary: `El ORP (${latest.orp} mV) está por debajo de 650 mV.`,
        reason: `El ORP (${latest.orp} mV) está entre 600 y 649 mV. La efectividad de la desinfección puede estar reducida.`,
        priority: 10,
        relatedFields: ['orp'],
        diagnosisCode: 'ORP_BELOW_TARGET',
        calculationNotes: [
          'Valores de ORP entre 600–649 mV indican precaución.',
          'Monitorear y verificar que no siga bajando.',
        ],
        safetyNotes: [],
        followUpActions: ['Monitorear ORP y FAC.', 'Medir nuevamente en 24 horas.'],
        retestAfterHours: 24,
      });
    }
  }

  // ── Temperature warning ───────────────────────────────────────
  if (latest.temperature !== undefined && latest.temperature !== null && latest.temperature > 30) {
    recommendations.push({
      id: nextId(),
      kind: 'monitor',
      severity: 'low',
      title: 'Temperatura alta',
      summary: `La temperatura del agua (${latest.temperature.toFixed(1)} °C) supera los 30 °C.`,
      reason: 'Con temperaturas superiores a 30 °C, la demanda de cloro aumenta y la eficacia del cloro puede verse afectada.',
      priority: 20,
      relatedFields: ['temperature', 'fac'],
      calculationNotes: [
        'La demanda de cloro aumenta con la temperatura.',
        'Medir el FAC con más frecuencia en condiciones de calor.',
      ],
      safetyNotes: [],
      followUpActions: ['Medir FAC con mayor frecuencia.', 'Asegurar una filtración adecuada.'],
      retestAfterHours: 12,
    });
  }

  // ── 1. pH correction ──────────────────────────────────────────
  if (latest.ph < phRange.min) {
    const phTrend = trends.find((trend) => trend.field === 'ph');
    const slightlyLow = phRange.min - latest.ph <= 0.2;
    const canWaitInSaltwaterPool = settings.poolType === 'saltwater'
      && phClass.label !== 'danger'
      && slightlyLow
      && phTrend?.direction === 'rising';

    if (canWaitInSaltwaterPool) {
      updateStatus('needs-attention');
      recommendations.push({
        id: nextId(),
        kind: 'retest',
        severity: 'low',
        title: 'Esperar y volver a medir',
        summary: `El pH (${latest.ph.toFixed(1)}) está ligeramente bajo, pero la tendencia reciente es ascendente.`,
        reason: 'En piscinas salinas el pH suele aumentar durante el funcionamiento. Espera 12–24 horas y vuelve a medir antes de añadir incrementador de pH.',
        priority: 1,
        relatedFields: ['ph'],
        targetRange: makeRange(phRange.min, phRange.max, ''),
        currentValue: latest.ph,
        diagnosisCode: 'PH_LOW',
        calculationNotes: [
          'Piscina salina con tendencia ascendente de pH.',
          'No se recomienda dosificar todavía mientras no haya urgencia.',
        ],
        safetyNotes: [],
        followUpActions: [
          'Esperar 12–24 horas.',
          'Volver a medir el pH antes de añadir incrementador.',
        ],
        retestAfterHours: 24,
        state: 'pending-retest',
        stage: 1,
      });
    } else {
      updateStatus('needs-correction');
      const delta = phRange.ideal - latest.ph;
      const capped = Math.min(delta, 0.2);
      const isCapped = capped < delta;
      const amountMl = hasVolume ? Math.round((capped / 0.1) * 1000 * (volM3 / 50)) : 0;

      const notes: string[] = [];
      if (isCapped) {
        notes.push(`Corrección limitada a 0.2 unidades de pH por ciclo. Dosis calculada para subir de ${latest.ph.toFixed(1)} a ${(latest.ph + capped).toFixed(1)}.`);
        notes.push('Volver a medir y repetir si es necesario.');
      } else {
        notes.push(`Dosis calculada para subir de ${latest.ph.toFixed(1)} al valor objetivo de ${phRange.ideal.toFixed(1)}.`);
      }
      if (!hasVolume) notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');

      recommendations.push({
        id: nextId(),
        kind: 'chemical',
        severity: phClass.label === 'danger' ? 'high' : 'medium',
        title: 'Subir el pH',
        summary: `El pH (${latest.ph.toFixed(1)}) está por debajo del rango (${phRange.min}–${phRange.max}).`,
        reason: `El pH (${latest.ph.toFixed(1)}) está por debajo del rango objetivo de ${phRange.min}–${phRange.max}.`,
        priority: 1,
        relatedFields: ['ph'],
        chemicalProductId: 'ph-increaser-liquid',
        genericProductName: 'Incrementador de pH líquido',
        mainComponent: 'Base alcalina incrementadora de pH',
        estimatedAmount: hasVolume ? amountMl : undefined,
        unit: hasVolume ? 'ml' : undefined,
        targetRange: makeRange(phRange.min, phRange.max, ''),
        currentValue: latest.ph,
        calculationNotes: notes,
        safetyNotes: [
          'Manejar con guantes y gafas de protección.',
          'Añadir gradualmente cerca del retorno de agua.',
          'No mezclar con otros productos químicos.',
        ],
        followUpActions: [
          'Medir el pH después de 4–6 horas.',
          'Repetir la dosis si el pH sigue bajo.',
        ],
        retestAfterHours: 6,
        state: 'actionable',
        stage: 1,
      });
    }
  } else if (latest.ph > phRange.max) {
    updateStatus('needs-correction');
    const delta = latest.ph - phRange.ideal;
    const capped = Math.min(delta, 0.2);
    const isCapped = capped < delta;
    const amountMl = hasVolume ? Math.round((capped / 0.1) * 750 * (volM3 / 50)) : 0;

    const notes: string[] = [];
    if (isCapped) {
      notes.push(`Corrección limitada a 0.2 unidades de pH por ciclo. Dosis calculada para bajar de ${latest.ph.toFixed(1)} a ${(latest.ph - capped).toFixed(1)}.`);
      notes.push('Volver a medir y repetir si es necesario.');
    } else {
      notes.push(`Dosis calculada para bajar de ${latest.ph.toFixed(1)} al valor objetivo de ${phRange.ideal.toFixed(1)}.`);
    }
    if (!hasVolume) notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');

    recommendations.push({
      id: nextId(),
      kind: 'chemical',
      severity: phClass.label === 'danger' ? 'high' : 'medium',
      title: 'Bajar el pH',
      summary: `El pH (${latest.ph.toFixed(1)}) está por encima del rango (${phRange.min}–${phRange.max}).`,
      reason: `El pH (${latest.ph.toFixed(1)}) está por encima del rango objetivo de ${phRange.min}–${phRange.max}.`,
      priority: 1,
      relatedFields: ['ph'],
      chemicalProductId: 'ph-reducer-liquid',
      genericProductName: 'Reductor de pH líquido',
      mainComponent: 'Ácido reductor de pH',
      estimatedAmount: hasVolume ? amountMl : undefined,
      unit: hasVolume ? 'ml' : undefined,
      targetRange: makeRange(phRange.min, phRange.max, ''),
      currentValue: latest.ph,
      calculationNotes: notes,
      safetyNotes: [
        'Manejar con guantes y gafas de protección.',
        'Añadir gradualmente cerca del retorno de agua.',
        'No mezclar con otros productos químicos.',
      ],
      followUpActions: [
        'Medir el pH después de 4–6 horas.',
        'Repetir la dosis si el pH sigue alto.',
      ],
      retestAfterHours: 6,
      state: 'actionable',
      stage: 1,
    });
  }

  // ── 2. FAC / chlorine logic ───────────────────────────────────
  if (latest.fac < facRange.min) {
    updateStatus('needs-correction');

    if (isSaltwater) {
      // ── Saltwater pool with low FAC ──
      const isVeryLowFac = latest.fac < facRange.min * 0.5;
      const isLowOrp = latest.orp !== undefined && latest.orp !== null && latest.orp < 650;

      // Check if we should recommend pH correction first
      if (!phAcceptable) {
        // Stage 1: pH correction (duplicate of the pH rec above, with stage marker)
        // Stage 2: blocked sanitation recommendation
        const isVeryLowFac = latest.fac < facRange.min * 0.5;
        const isLowOrp = latest.orp !== undefined && latest.orp !== null && latest.orp < 650;

        // Add a sanitation warning that's visible but labeled as blocked
        if (isVeryLowFac || isLowOrp) {
          const sanitSev: RecommendationSeverity = isLowOrp ? 'high' : (isVeryLowFac ? 'high' : 'medium');
          recommendations.push({
            id: nextId(),
            kind: 'warning',
            severity: sanitSev,
            title: isVeryLowFac ? 'FAC críticamente bajo — corregir pH primero' : 'ORP bajo — corregir pH primero',
            summary: isVeryLowFac
              ? `El FAC (${latest.fac.toFixed(1)} ppm) está críticamente bajo. Ajustar el clorador después de corregir el pH.`
              : `El ORP (${latest.orp} mV) está bajo y el FAC (${latest.fac.toFixed(1)} ppm) necesita atención. Corregir pH primero.`,
            reason: `El pH (${latest.ph.toFixed(1)}) está fuera de rango. La desinfección está comprometida, pero el cloro es ineficaz con pH desajustado.`,
            priority: 2,
            relatedFields: ['ph', 'fac', 'orp'],
            state: 'blocked',
            stage: 2,
            dependencies: [
              {
                condition: 'ph-in-range',
                explanationKey: 'rec.dependency.phInRange',
              },
              {
                condition: 'retest-completed',
                explanationKey: 'rec.dependency.retestPh',
              },
            ],
            calculationNotes: [
              'Corregir el pH primero (Stage 1) para que el cloro sea eficaz.',
              'El cloro es menos eficaz con pH desajustado.',
              'No aplicar una dosis agresiva de cloro mientras el pH esté fuera de rango.',
            ],
            safetyNotes: isVeryLowFac
              ? ['Evitar bañarse hasta que el FAC esté dentro del rango seguro.', 'Corregir pH primero.']
              : ['Evitar bañarse hasta que el ORP mejore.', 'Corregir pH primero.'],
            followUpActions: [
              'Stage 1: Aplicar corrección de pH.',
              'Esperar 4–6 horas.',
              'Stage 2: Retestear pH, luego ajustar clorador si FAC/ORP siguen bajos.',
            ],
            retestAfterHours: 6,
          });
        } else {
          // FAC slightly low but NOT critical — still block it behind pH correction
          recommendations.push({
            id: nextId(),
            kind: 'monitor',
            severity: 'medium',
            title: 'Corregir pH antes de ajustar cloro — plan por etapas',
            summary: 'El pH debe estar dentro del rango antes de ajustar el cloro.',
            reason: `El pH (${latest.ph.toFixed(1)}) está fuera del rango. El cloro es menos eficaz con pH desajustado.`,
            priority: 2,
            relatedFields: ['ph', 'fac'],
            state: 'blocked',
            stage: 2,
            dependencies: [
              {
                condition: 'ph-in-range',
                explanationKey: 'rec.dependency.phInRange',
              },
            ],
            calculationNotes: ['Corregir el pH primero para que el cloro sea eficaz.'],
            safetyNotes: [],
            followUpActions: ['Aplicar corrección de pH.', 'Esperar 4–6 horas.', 'Reevaluar FAC.'],
            retestAfterHours: 6,
          });
        }
      } else {
        // pH is acceptable → proceed with saltwater-specific logic for low FAC
        const chlorinatorConfig: SaltChlorinatorConfig | undefined = settings.saltChlorinator;

        if (chlorinatorConfig && chlorinatorConfig.enabled && hasVolume) {
          const deltaPpm = facRange.ideal - latest.fac;
          const chlorinatorCapabilities = getChlorinatorCapabilities(chlorinatorConfig);
          if (shouldUseCapabilityOnlyChlorinatorRecommendation(chlorinatorCapabilities)) {
            const sev: RecommendationSeverity = isVeryLowFac || isLowOrp ? 'high' : 'medium';
            recommendations.push(buildCapabilityBasedChlorinatorRecommendation({
              severity: sev,
              priority: 3,
              latest,
              facRange,
              capabilities: chlorinatorCapabilities,
              preventive: false,
              calculationNotes: [
                `Déficit de cloro: ${deltaPpm.toFixed(1)} ppm.`,
                `Volumen: ${volLiters.toLocaleString()} L.`,
                describeChlorinatorProduction(chlorinatorConfig),
              ],
            }));
            if (isVeryLowFac || isLowOrp) {
              recommendations.push(buildTemporaryChlorineCorrectionRecommendation({
                latest,
                settings,
                facRange,
                severity: sev,
                isLowOrp,
                escalation,
              }));
            }
          } else {
            const adjustment = calculateChlorinatorAdjustment(deltaPpm, volLiters, chlorinatorConfig);
            const canAdjustFully = adjustment.hoursNeeded <= chlorinatorConfig.maxRecommendedHoursPerDay;
            const isTooLarge = adjustment.hoursNeeded > chlorinatorConfig.maxRecommendedHoursPerDay * 2;

            const calcNotes: string[] = [
              `Déficit de cloro: ${deltaPpm.toFixed(1)} ppm.`,
              `Volumen: ${volLiters.toLocaleString()} L.`,
              describeChlorinatorProduction(chlorinatorConfig),
              `Horas necesarias: ${adjustment.hoursNeeded.toFixed(1)} h.`,
            ];
            const chlorineModel = estimateChlorinatorFacModel({
              deltaPpm,
              poolVolumeLiters: volLiters,
              config: chlorinatorConfig,
              hours: Math.min(adjustment.hoursNeeded, chlorinatorConfig.maxRecommendedHoursPerDay),
              temperature: latest.temperature,
              batherLoad: latest.context?.batherLoad,
              sunlight: latest.context?.sunlight,
            });
            calcNotes.push(...chlorineModel.notes);

            const sev: RecommendationSeverity =
              isVeryLowFac || isLowOrp ? 'high' : (isTooLarge ? 'high' : 'medium');

            if (adjustment.suggestedOutputPercent !== undefined || adjustment.suggestedAdditionalHours !== undefined) {
              if (adjustment.suggestedOutputPercent !== undefined) {
                calcNotes.push(`Aumentar la producción del clorador al ${adjustment.suggestedOutputPercent}%.`);
              }
              if (adjustment.suggestedAdditionalHours !== undefined && adjustment.suggestedAdditionalHours > 0) {
                calcNotes.push(`Añadir ${adjustment.suggestedAdditionalHours} hora(s) adicional(es) de filtración/cloración.`);
                if (adjustment.runtimeCalculation && adjustment.runtimeCalculation.roundingPolicy === 'ceil-to-supported-increment') {
                  calcNotes.push(`Cálculo teórico: ${Math.round(adjustment.runtimeCalculation.theoreticalAdditionalMinutes)} minutos.`);
                  calcNotes.push(`Ajuste operativo: ${adjustment.runtimeCalculation.operationalAdditionalMinutes} minutos.`);
                  calcNotes.push(`Redondeo: incremento soportado de ${adjustment.runtimeCalculation.supportedIncrementMinutes} minutos.`);
                }
              }
              if (!chlorinatorCapabilities.canAdjustPercentage && chlorinatorCapabilities.supportsBoost) {
                calcNotes.push('El equipo no declara ajuste porcentual; usar horas y modo boost solo si el fabricante lo permite.');
              }

              recommendations.push({
                id: nextId(),
                kind: 'equipment',
                severity: sev,
                title: 'Ajustar clorador salino',
                summary: `Ajustar el clorador salino para aumentar el FAC de ${latest.fac.toFixed(1)} ppm a ${facRange.ideal.toFixed(1)} ppm.`,
                reason: `El FAC (${latest.fac.toFixed(1)} ppm) está por debajo del rango (${facRange.min}–${facRange.max} ppm). El pH está en rango.`,
                priority: 3,
                relatedFields: ['fac'],
                equipmentName: 'Clorador salino',
                suggestedOutputPercent: adjustment.suggestedOutputPercent,
                suggestedAdditionalHours: adjustment.suggestedAdditionalHours,
                targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
                currentValue: latest.fac,
                calculationNotes: calcNotes,
                safetyNotes: [],
                followUpActions: [
                  chlorinatorCapabilities.canAdjustPercentage
                    ? 'Aplicar los ajustes recomendados al clorador.'
                    : 'Ajustar el ciclo diario o activar boost siguiendo las instrucciones del fabricante.',
                  'Medir FAC después del ciclo de filtración.',
                ],
                retestAfterHours: 24,
              });
            }

            if (isTooLarge || !canAdjustFully) {
              recommendations.push({
                id: nextId(),
                kind: 'warning',
                severity: 'medium',
                title: 'Corrección grande — verificar equipo',
                summary: 'La corrección necesaria es grande. Verificar el estado del clorador y las celdas electrolíticas.',
                reason: `Se necesitan ${adjustment.hoursNeeded.toFixed(0)} horas de cloración para alcanzar el nivel objetivo.`,
                priority: 6,
                relatedFields: ['fac'],
                calculationNotes: [
                  'Un déficit grande puede indicar un problema con el clorador o las celdas.',
                  'Verificar que las celdas no estén calcificadas o desgastadas.',
                ],
                safetyNotes: [],
                followUpActions: [
                  'Inspeccionar el clorador salino y las celdas electrolíticas.',
                  'Limpiar las celdas si están calcificadas.',
                  'Como acción temporal, aplicar cloro granulado.',
                ],
                retestAfterHours: 24,
              });

              if (isVeryLowFac || isLowOrp) {
                const correctionType = classifyChlorineCorrection({
                  fac: latest.fac,
                  targetFac: facRange.ideal,
                  orp: latest.orp,
                  visibleAlgae: latest.context?.visibleAlgae,
                  waterClarity: latest.context?.waterClarity,
                  batherLoad: latest.context?.batherLoad,
                  persistentLowFac: escalation.level !== 'NORMAL',
                });
                const dose = buildChlorineDose({
                  latest,
                  settings,
                  targetFac: facRange.ideal,
                  correctionType,
                });
                recommendations.push({
                  id: nextId(),
                  kind: 'chemical',
                  severity: sev,
                  title: 'Cloro granulado — acción correctiva temporal',
                  summary: 'Aplicar cloro granulado como acción temporal mientras se revisa el clorador.',
                  reason: `El FAC está muy bajo${isLowOrp ? ` y el ORP (${latest.orp} mV) también está bajo` : ''}. Se necesita una acción correctiva inmediata.`,
                  priority: 4,
                  relatedFields: ['fac', 'orp'],
                  chemicalProductId: 'chlorine-granules',
                  genericProductName: 'Cloro granulado',
                  mainComponent: 'Cloro de disolución rápida',
                  estimatedAmount: dose.theoreticalAmount,
                  unit: dose.unit,
                  targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
                  currentValue: latest.fac,
                  chlorineCorrectionType: correctionType,
                  escalationLevel: escalation.level,
                  calculationNotes: [
                    ...dose.notes,
                    `Tipo de corrección: ${correctionType}.`,
                    'Usar solo como medida temporal mientras se revisa el clorador.',
                  ],
                  safetyNotes: [
                    'Manejar con guantes y gafas de protección.',
                    'No mezclar con ácidos u otros productos químicos.',
                    'Añadir en horas de baja radiación solar.',
                    'Esperar al menos 30 minutos antes de bañarse.',
                  ],
                  followUpActions: [
                    'Aplicar el cloro granulado.',
                    'Revisar el clorador salino.',
                    'Medir FAC y ORP después de 4–6 horas.',
                  ],
                  retestAfterHours: 6,
                });
              }
            }

            if (
              escalation.level !== 'NORMAL' &&
              (isVeryLowFac || isLowOrp) &&
              !recommendations.some((rec) => rec.chemicalProductId === 'chlorine-granules')
            ) {
              recommendations.push(buildTemporaryChlorineCorrectionRecommendation({
                latest,
                settings,
                facRange,
                severity: sev,
                isLowOrp,
                escalation,
              }));
            }
          }
        } else if (isVeryLowFac || isLowOrp) {
          const correctionType = classifyChlorineCorrection({
            fac: latest.fac,
            targetFac: facRange.ideal,
            orp: latest.orp,
            visibleAlgae: latest.context?.visibleAlgae,
            waterClarity: latest.context?.waterClarity,
            batherLoad: latest.context?.batherLoad,
            persistentLowFac: escalation.level !== 'NORMAL',
          });
          const dose = buildChlorineDose({
            latest,
            settings,
            targetFac: facRange.ideal,
            correctionType,
          });
          recommendations.push({
            id: nextId(),
            kind: 'chemical',
            severity: isLowOrp ? 'high' : 'medium',
            title: 'Cloro granulado',
            summary: `Aplicar cloro granulado. FAC (${latest.fac.toFixed(1)} ppm) está bajo.`,
            reason: `El FAC (${latest.fac.toFixed(1)} ppm) está por debajo del rango (${facRange.min}–${facRange.max} ppm)${isLowOrp ? ` y el ORP (${latest.orp} mV) también está bajo` : ''}.`,
            priority: 4,
            relatedFields: ['fac', 'orp'],
            chemicalProductId: 'chlorine-granules',
            genericProductName: 'Cloro granulado',
            mainComponent: 'Cloro de disolución rápida',
            estimatedAmount: dose.theoreticalAmount,
            unit: dose.unit,
            targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
            currentValue: latest.fac,
            chlorineCorrectionType: correctionType,
            escalationLevel: escalation.level,
            calculationNotes: [
              ...dose.notes,
              `Tipo de corrección: ${correctionType}.`,
              isLowOrp ? 'ORP bajo — aumentar la severidad de la recomendación.' : '',
            ].filter(Boolean),
            safetyNotes: [
              'Manejar con guantes y gafas de protección.',
              'No mezclar con ácidos u otros productos químicos.',
              'Añadir en horas de baja radiación solar.',
            ],
            followUpActions: [
              'Aplicar el cloro granulado.',
              'Medir FAC después de 4–6 horas.',
              'Si la piscina es salina, verificar el clorador salino.',
            ],
            retestAfterHours: 6,
          });
        } else {
          recommendations.push({
            id: nextId(),
            kind: 'monitor',
            severity: 'medium',
            title: 'FAC ligeramente bajo',
            summary: `El FAC (${latest.fac.toFixed(1)} ppm) está ligeramente por debajo del rango.`,
            reason: `El FAC (${latest.fac.toFixed(1)} ppm) está por debajo del rango objetivo de ${facRange.min}–${facRange.max} ppm.`,
            priority: 8,
            relatedFields: ['fac'],
            calculationNotes: [
              'Verificar el funcionamiento del sistema de cloración.',
              'Aumentar horas de filtración si es necesario.',
            ],
            safetyNotes: [],
            followUpActions: [
              'Revisar el sistema de cloración.',
              'Medir FAC nuevamente en 24 horas.',
            ],
            retestAfterHours: 24,
          });
        }
      }
    } else {
      // ── Chlorine pool with low FAC ──
      if (!phAcceptable) {
        // Stage 2: blocked sanitation recommendation behind pH correction
        const isVeryLow = latest.fac < facRange.min * 0.5;
        const isLowOrp = latest.orp !== undefined && latest.orp !== null && latest.orp < 650;

        if (isVeryLow || isLowOrp) {
          const sanitSev: RecommendationSeverity = isLowOrp ? 'high' : (isVeryLow ? 'high' : 'medium');
          recommendations.push({
            id: nextId(),
            kind: 'warning',
            severity: sanitSev,
            title: isVeryLow ? 'FAC críticamente bajo — corregir pH primero' : 'ORP bajo — corregir pH primero',
            summary: isVeryLow
              ? `El FAC (${latest.fac.toFixed(1)} ppm) está críticamente bajo. Añadir cloro después de corregir el pH.`
              : `El ORP (${latest.orp} mV) está bajo y el FAC (${latest.fac.toFixed(1)} ppm) necesita atención. Corregir pH primero.`,
            reason: `El pH (${latest.ph.toFixed(1)}) está fuera de rango. La desinfección está comprometida, pero el cloro es ineficaz con pH desajustado.`,
            priority: 2,
            relatedFields: ['ph', 'fac', 'orp'],
            state: 'blocked',
            stage: 2,
            dependencies: [
              {
                condition: 'ph-in-range',
                explanationKey: 'rec.dependency.phInRange',
              },
              {
                condition: 'retest-completed',
                explanationKey: 'rec.dependency.retestPh',
              },
            ],
            calculationNotes: [
              'Corregir el pH primero (Stage 1) para que el cloro sea eficaz.',
              'El cloro es menos eficaz con pH desajustado.',
              'No aplicar una dosis agresiva de cloro mientras el pH esté fuera de rango.',
            ],
            safetyNotes: isVeryLow
              ? ['Evitar bañarse hasta que el FAC esté dentro del rango seguro.', 'Corregir pH primero.']
              : ['Evitar bañarse hasta que el ORP mejore.', 'Corregir pH primero.'],
            followUpActions: [
              'Stage 1: Aplicar corrección de pH.',
              'Esperar 4–6 horas.',
              'Stage 2: Retestear pH, luego aplicar cloro si FAC/ORP siguen bajos.',
            ],
            retestAfterHours: 6,
          });
        } else {
          recommendations.push({
            id: nextId(),
            kind: 'monitor',
            severity: 'medium',
            title: 'Corregir pH antes de ajustar cloro — plan por etapas',
            summary: 'El pH debe estar dentro del rango antes de añadir cloro.',
            reason: `El pH (${latest.ph.toFixed(1)}) está fuera del rango. El cloro es menos eficaz con pH desajustado.`,
            priority: 2,
            relatedFields: ['ph', 'fac'],
            state: 'blocked',
            stage: 2,
            dependencies: [
              {
                condition: 'ph-in-range',
                explanationKey: 'rec.dependency.phInRange',
              },
            ],
            calculationNotes: ['Corregir el pH primero para que el cloro sea eficaz.'],
            safetyNotes: [],
            followUpActions: ['Aplicar corrección de pH.', 'Esperar 4–6 horas.', 'Reevaluar FAC.'],
            retestAfterHours: 6,
          });
        }
      } else {
        const targetCl = facRange.ideal;
        const isLowOrp = latest.orp !== undefined && latest.orp !== null && latest.orp < 650;
        const isVeryLow = latest.fac < facRange.min * 0.5;
        const correctionType = classifyChlorineCorrection({
          fac: latest.fac,
          targetFac: targetCl,
          orp: latest.orp,
          visibleAlgae: latest.context?.visibleAlgae,
          waterClarity: latest.context?.waterClarity,
          batherLoad: latest.context?.batherLoad,
          persistentLowFac: escalation.level !== 'NORMAL',
        });
        const dose = buildChlorineDose({
          latest,
          settings,
          targetFac: targetCl,
          correctionType,
        });
        const sev: RecommendationSeverity = isLowOrp ? 'high' : (isVeryLow ? 'high' : 'medium');

        const calcNotes: string[] = [
          ...dose.notes,
          `Tipo de corrección: ${correctionType}.`,
        ];
        if (isLowOrp) {
          calcNotes.push(`ORP bajo (${latest.orp} mV) — aumentar la severidad de la recomendación.`);
          updateStatus('needs-correction');
        }
        if (isVeryLow) updateStatus('unsafe');
        if (!hasVolume) calcNotes.push('Ingresa el volumen para obtener dosis estimada.');

        recommendations.push({
          id: nextId(),
          kind: 'chemical',
          severity: sev,
          title: 'Cloro granulado',
          summary: `Aplicar cloro granulado. FAC (${latest.fac.toFixed(1)} ppm) está bajo.`,
          reason: `El FAC (${latest.fac.toFixed(1)} ppm) está por debajo del rango (${facRange.min}–${facRange.max} ppm)${isLowOrp ? ` y el ORP (${latest.orp} mV) también está bajo` : ''}.`,
          priority: 4,
          relatedFields: ['fac', 'orp'],
          chemicalProductId: 'chlorine-granules',
          genericProductName: 'Cloro granulado',
          mainComponent: 'Cloro de disolución rápida',
          estimatedAmount: dose.theoreticalAmount,
          unit: dose.unit,
          targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
          currentValue: latest.fac,
          chlorineCorrectionType: correctionType,
          escalationLevel: escalation.level,
          calculationNotes: calcNotes,
          safetyNotes: [
            'Manejar con guantes y gafas de protección.',
            'No mezclar con ácidos u otros productos químicos.',
            'Añadir en horas de baja radiación solar.',
            'Esperar al menos 30 minutos antes de bañarse.',
          ],
          followUpActions: [
            'Aplicar el cloro granulado.',
            'Medir FAC después de 4–6 horas.',
          ],
          retestAfterHours: 6,
        });
      }
    }
  } else if (latest.fac > facRange.max) {
    updateStatus('needs-attention');
    recommendations.push({
      id: nextId(),
      kind: 'no-action',
      severity: facClass.label === 'danger' ? 'high' : 'medium',
      title: 'FAC alto — no añadir cloro',
      summary: `El FAC (${latest.fac.toFixed(1)} ppm) está por encima del rango (${facRange.min}–${facRange.max} ppm).`,
      reason: `El FAC (${latest.fac.toFixed(1)} ppm) supera el rango objetivo. No añadir más cloro. El nivel bajará con el tiempo y la radiación solar.`,
      priority: 7,
      relatedFields: ['fac'],
      targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
      currentValue: latest.fac,
      calculationNotes: [
        'El cloro se disipa naturalmente con el tiempo y la radiación solar.',
        'No se recomienda añadir productos para reducir el cloro.',
      ],
      safetyNotes: [
        'Evitar bañarse hasta que el nivel baje.',
        'El cloro alto puede irritar la piel y los ojos.',
      ],
      followUpActions: [
        'Esperar y medir nuevamente en 24 horas.',
        'Evitar bañarse mientras el FAC esté elevado.',
      ],
      retestAfterHours: 24,
    });
  }

  if (isSaltwater && latest.fac < facRange.min && phAcceptable) {
    if (escalation.level === 'CRITICAL' || escalation.level === 'DIAGNOSTIC') {
      updateStatus('unsafe');
    } else if (escalation.level === 'PERSISTENT') {
      updateStatus('needs-correction');
    }
    addEscalationRecommendations(recommendations, escalation, latest, facRange, settings);
  }

  // ── 3. Salt correction (saltwater pools only, independent of FAC) ──
  if (isSaltwater && latest.salt !== undefined && latest.salt !== null) {
    if (latest.salt < saltRange.min) {
      updateStatus('needs-correction');
      const deltaPpm = saltRange.ideal - latest.salt;
      const kg = hasVolume
        ? Math.round((deltaPpm * volLiters / 1_000_000) * 100) / 100
        : 0;

      const notes: string[] = [
        `Sal actual: ${latest.salt} ppm. Objetivo: ${saltRange.ideal} ppm.`,
      ];
      if (hasVolume) {
        notes.push(`Estimación: ${deltaPpm} ppm × ${volLiters.toLocaleString()} L / 1.000.000 = ${kg.toFixed(1)} kg de sal.`);
        notes.push('Añadir sal antes de esperar que el clorador produzca cloro eficazmente.');
      } else {
        notes.push('Ingresa el volumen de la piscina para obtener una cantidad estimada.');
      }

      recommendations.push({
        id: nextId(),
        kind: 'chemical',
        severity: 'high',
        title: 'Añadir sal para piscina',
        summary: `La sal (${latest.salt} ppm) está por debajo del rango (${saltRange.min}–${saltRange.max} ppm).`,
        reason: `Sin suficiente sal (${latest.salt} ppm), el clorador salino no puede producir cloro eficazmente. Objetivo: ${saltRange.ideal} ppm.`,
        priority: 3,
        relatedFields: ['salt'],
        chemicalProductId: 'pool-salt',
        genericProductName: 'Sal para piscina',
        mainComponent: 'Cloruro sódico',
        estimatedAmount: hasVolume ? kg : undefined,
        unit: hasVolume ? 'kg' : undefined,
        targetRange: makeRange(saltRange.min, saltRange.max, 'ppm'),
        currentValue: latest.salt,
        calculationNotes: notes,
        safetyNotes: [
          'Distribuir uniformemente por la superficie.',
          'Cepillar el fondo si se acumulan cristales.',
        ],
        followUpActions: [
          'Añadir la sal calculada.',
          'Medir la sal nuevamente después de 24 horas.',
          'Si la sal está en rango, verificar el FAC y el clorador.',
        ],
        retestAfterHours: 24,
      });
    } else if (latest.salt > saltRange.max) {
      recommendations.push({
        id: nextId(),
        kind: 'warning',
        severity: 'medium',
        title: 'Sal alta — dilución parcial recomendada',
        summary: `La sal (${latest.salt} ppm) supera el rango recomendado (${saltRange.min}–${saltRange.max} ppm).`,
        reason: 'No existe un producto químico para reducir la sal. Se recomienda dilución o reemplazo parcial de agua.',
        priority: 15,
        relatedFields: ['salt'],
        calculationNotes: [
          'La sal no se puede reducir con productos químicos.',
          'Drenar parcialmente y rellenar con agua fresca.',
          'Consultar con un profesional si es necesario.',
        ],
        safetyNotes: ['Realizar el drenaje parcial con cuidado.'],
        followUpActions: [
          'Drenar parcialmente y rellenar con agua fresca.',
          'Medir la sal después del relleno.',
        ],
        retestAfterHours: 48,
      });
    }
  }

  // ── 4. Proactive chlorinator adjustment (saltwater, FAC within range but below ideal) ──
  if (
    isSaltwater &&
    phAcceptable &&
    latest.fac >= facRange.min &&
    latest.fac < facRange.ideal &&
    settings.saltChlorinator &&
    settings.saltChlorinator.enabled &&
    hasVolume
  ) {
    const chlorinatorConfig = settings.saltChlorinator;
    const deltaPpm = facRange.ideal - latest.fac;
    if (deltaPpm > 0.2) {
      const chlorinatorCapabilities = getChlorinatorCapabilities(chlorinatorConfig);
      if (shouldUseCapabilityOnlyChlorinatorRecommendation(chlorinatorCapabilities)) {
        recommendations.push(buildCapabilityBasedChlorinatorRecommendation({
          severity: 'low',
          priority: 12,
          latest,
          facRange,
          capabilities: chlorinatorCapabilities,
          preventive: true,
          calculationNotes: [
            `FAC actual: ${latest.fac.toFixed(1)} ppm. Objetivo: ${facRange.ideal.toFixed(1)} ppm.`,
            `Déficit: ${deltaPpm.toFixed(1)} ppm.`,
            `Volumen: ${volLiters.toLocaleString()} L.`,
            describeChlorinatorProduction(chlorinatorConfig),
          ],
        }));
      } else {
        const adjustment = calculateChlorinatorAdjustment(deltaPpm, volLiters, chlorinatorConfig);

      if (adjustment.suggestedOutputPercent !== undefined || adjustment.suggestedAdditionalHours !== undefined) {
        const calcNotes: string[] = [
          `FAC actual: ${latest.fac.toFixed(1)} ppm. Objetivo: ${facRange.ideal.toFixed(1)} ppm.`,
          `Déficit: ${deltaPpm.toFixed(1)} ppm.`,
          `Volumen: ${volLiters.toLocaleString()} L.`,
          describeChlorinatorProduction(chlorinatorConfig),
        ];

        if (adjustment.suggestedOutputPercent !== undefined) {
          calcNotes.push(`Aumentar producción del clorador al ${adjustment.suggestedOutputPercent}%.`);
        }
        if (adjustment.suggestedAdditionalHours !== undefined && adjustment.suggestedAdditionalHours > 0) {
          calcNotes.push(`Añadir ${adjustment.suggestedAdditionalHours} hora(s) adicional(es).`);
          if (adjustment.runtimeCalculation && adjustment.runtimeCalculation.roundingPolicy === 'ceil-to-supported-increment') {
            calcNotes.push(`Cálculo teórico: ${Math.round(adjustment.runtimeCalculation.theoreticalAdditionalMinutes)} minutos.`);
            calcNotes.push(`Ajuste operativo: ${adjustment.runtimeCalculation.operationalAdditionalMinutes} minutos.`);
            calcNotes.push(`Redondeo: incremento soportado de ${adjustment.runtimeCalculation.supportedIncrementMinutes} minutos.`);
          }
        }
        if (!chlorinatorCapabilities.canAdjustPercentage && chlorinatorCapabilities.supportsBoost) {
          calcNotes.push('El equipo no declara ajuste porcentual; usar horas o boost solo si corresponde a su ficha.');
        }

        recommendations.push({
          id: nextId(),
          kind: 'equipment',
          severity: 'low',
          title: 'Optimizar clorador salino',
          summary: `Ajustar el clorador para llevar el FAC de ${latest.fac.toFixed(1)} ppm a ${facRange.ideal.toFixed(1)} ppm.`,
          reason: `El FAC (${latest.fac.toFixed(1)} ppm) está dentro del rango pero por debajo del valor ideal de ${facRange.ideal.toFixed(1)} ppm. Un ajuste preventivo ayuda a mantener la calidad del agua.`,
          priority: 12,
          relatedFields: ['fac'],
          equipmentName: 'Clorador salino',
          suggestedOutputPercent: adjustment.suggestedOutputPercent,
          suggestedAdditionalHours: adjustment.suggestedAdditionalHours,
          targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
          currentValue: latest.fac,
          calculationNotes: calcNotes,
          safetyNotes: [],
          followUpActions: [
            chlorinatorCapabilities.canAdjustPercentage
              ? 'Aplicar los ajustes recomendados.'
              : 'Ajustar horas o programa diario segun la ficha del clorador.',
            'Medir FAC después del ciclo de filtración.',
          ],
          retestAfterHours: 24,
        });
      }
      }
    }
  }

  // ── 4. Manual test suggestions ─────────────────────────────────
  // Stabilizer informational (no cyanuric acid measurement)
  if (latest.fac < facRange.min) {
    recommendations.push({
      id: nextId(),
      kind: 'manual-test',
      severity: 'info',
      title: 'Medir ácido cianúrico (estabilizador)',
      summary: 'El medidor digital no mide ácido cianúrico. Considera medirlo manualmente.',
      reason: 'El estabilizador (ácido cianúrico) protege el cloro de la degradación solar. Sin esta medición, no se puede calcular la dosis de estabilizador.',
      priority: 30,
      relatedFields: ['fac'],
      calculationNotes: [
        'El medidor digital no mide ácido cianúrico.',
        'Usar un kit de prueba manual para obtener este valor.',
      ],
      safetyNotes: [],
      followUpActions: [
        'Medir el ácido cianúrico con un kit manual.',
        'Si está por debajo de 30 ppm, considerar añadir estabilizador.',
      ],
    });
  }

  // Alkalinity informational (no alkalinity measurement)
  recommendations.push({
    id: nextId(),
    kind: 'manual-test',
    severity: 'info',
    title: 'Medir alcalinidad total',
    summary: 'El medidor digital no mide alcalinidad total. Considera medirla manualmente.',
    reason: 'La alcalinidad total ayuda a estabilizar el pH. Sin esta medición, no se puede calcular la dosis de reductor de alcalinidad.',
    priority: 31,
    relatedFields: ['ph'],
    calculationNotes: [
      'El medidor digital no mide alcalinidad total.',
      'Usar un kit de prueba manual para obtener este valor.',
    ],
    safetyNotes: [],
    followUpActions: [
      'Medir la alcalinidad total con un kit manual.',
      'El rango recomendado es 80–120 ppm.',
    ],
  });

  // ── 5. Trend-based adjustments ─────────────────────────────────
  for (const trend of trends) {
    const tField = trend.field;
    if (trend.direction === 'falling' && trend.severity !== 'info') {
      if (tField === 'fac' && trend.severity === 'high') {
        updateStatus('needs-correction');
        recommendations.push({
          id: nextId(),
          kind: 'monitor',
          severity: 'high',
          title: 'FAC en descenso',
          summary: `El FAC está bajando (${trend.latestValue.toFixed(1)} ppm). Monitorear de cerca.`,
          reason: trend.message,
          priority: 9,
          relatedFields: ['fac'],
          calculationNotes: [],
          safetyNotes: [],
          followUpActions: [
            'Medir FAC con más frecuencia.',
            'Verificar el sistema de cloración.',
          ],
          retestAfterHours: 6,
        });
      }
      if (tField === 'orp' && trend.severity === 'high') {
        updateStatus('needs-attention');
        recommendations.push({
          id: nextId(),
          kind: 'monitor',
          severity: 'medium',
          title: 'ORP en descenso',
          summary: `El ORP está bajando (${trend.latestValue} mV). Verificar desinfección.`,
          reason: trend.message,
          priority: 11,
          relatedFields: ['orp'],
          calculationNotes: [],
          safetyNotes: [],
          followUpActions: [
            'Monitorear ORP y FAC.',
            'Verificar el sistema de cloración.',
          ],
          retestAfterHours: 12,
        });
      }
      if (tField === 'salt' && trend.severity === 'medium') {
        recommendations.push({
          id: nextId(),
          kind: 'monitor',
          severity: 'low',
          title: 'Sal en descenso',
          summary: `La sal está bajando (${trend.latestValue} ppm). Verificar posibles pérdidas.`,
          reason: trend.message,
          priority: 22,
          relatedFields: ['salt'],
          calculationNotes: [
            'La sal no se evapora ni se consume. Una bajada puede indicar pérdida de agua por rebose, arrastre o fugas.',
          ],
          safetyNotes: [],
          followUpActions: [
            'Verificar posibles pérdidas de agua.',
            'Medir la sal nuevamente.',
          ],
          retestAfterHours: 48,
        });
      }
    }
    if (tField === 'ph' && trend.direction === 'rising' && phAcceptable) {
      // pH drifting up while still in range → proactive monitoring
      recommendations.push({
        id: nextId(),
        kind: 'monitor',
        severity: 'low',
        title: 'pH en aumento',
        summary: `El pH (${trend.latestValue.toFixed(1)}) está subiendo. Monitorear.`,
        reason: 'El pH está dentro del rango pero muestra tendencia al alza.',
        priority: 18,
        relatedFields: ['ph'],
        calculationNotes: ['Si el pH sigue subiendo, puede requerir corrección.'],
        safetyNotes: [],
        followUpActions: ['Medir el pH nuevamente en 24 horas.'],
        retestAfterHours: 24,
      });
    }
  }

  // ── 6. Balanced status check ──────────────────────────────────
  const hasActionableItems = recommendations.some(
    (r) => r.severity === 'danger' || r.severity === 'high' || r.severity === 'medium',
  );

  if (!hasActionableItems) {
    if (worstStatus === 'balanced') {
      recommendations.push({
        id: nextId(),
        kind: 'no-action',
        severity: 'info',
        title: 'Todo en orden',
        summary: 'Todos los valores están dentro de los rangos objetivo.',
        reason: 'Los parámetros del agua están estables y dentro de los rangos recomendados.',
        priority: 100,
        relatedFields: [],
        calculationNotes: [],
        safetyNotes: [],
        followUpActions: ['Mantener la rutina de mantenimiento.', 'Medir nuevamente en 24–48 horas.'],
        retestAfterHours: 48,
      });
    }
  }

  // ── Sort recommendations by severity ──────────────────────────
  recommendations.sort(sortBySeverity);

  // ── Audit metadata and translation keys ─────────────────────
  attachRecommendationAuditMetadata(recommendations, settings);
  enrichRecommendationKeys(recommendations, latest, phRange, facRange, saltRange, settings);

  // ── Build summary ─────────────────────────────────────────────
  const summaryMessage = buildSummary(worstStatus, latest, settings);

  // ── Next check suggestion ─────────────────────────────────────
  const nextCheck = determineNextCheck(recommendations, worstStatus);

  return {
    status: worstStatus,
    summary: summaryMessage.text,
    summaryKey: summaryMessage.key,
    summaryParams: summaryMessage.params,
    recommendations,
    trends,
    nextCheckSuggestion: nextCheck,
  };
}

// ── Summary builder ───────────────────────────────────────────────

function buildSummary(
  status: MaintenanceAssistantResult['status'],
  latest: Measurement,
  _settings: PoolSettings,
): { key: TranslationKey; params?: TranslationParams; text: string } {
  switch (status) {
    case 'balanced': {
      const params = { ph: latest.ph.toFixed(1), fac: latest.fac.toFixed(1) };
      return {
        key: 'summary.balanced',
        params,
        text: `El agua está en equilibrio. pH ${params.ph}, FAC ${params.fac} ppm: ambos dentro del rango. Sigue con el mantenimiento regular.`,
      };
    }
    case 'needs-attention':
      return {
        key: 'summary.needsAttention',
        text: 'Algunos valores requieren atención. Se recomienda monitorear y tomar medidas preventivas.',
      };
    case 'needs-correction':
      return {
        key: 'summary.needsCorrection',
        text: 'Es necesario corregir algunos parámetros del agua. Revisa las recomendaciones detalladas a continuación.',
      };
    case 'unsafe':
      return {
        key: 'summary.unsafe',
        text: 'El agua puede no ser segura. Toma medidas correctivas inmediatas y evita bañarte hasta que los valores estén dentro de los rangos seguros.',
      };
    case 'insufficient-data':
      return {
        key: 'summary.insufficientData',
        text: 'No hay suficientes datos para generar recomendaciones.',
      };
  }
}

// ── Next check helper ─────────────────────────────────────────────

function determineNextCheck(
  recommendations: MaintenanceRecommendation[],
  status: MaintenanceAssistantResult['status'],
): { recommendedAt?: string; hoursFromNow?: number; reason: string } {
  if (status === 'insufficient-data') {
    return { reason: 'Guarda una medición para obtener recomendaciones.' };
  }

  if (status === 'unsafe') {
    const retestHours = recommendations
      .filter((r) => r.retestAfterHours)
      .map((r) => r.retestAfterHours!)
      .sort((a, b) => a - b);
    const hours = retestHours.length > 0 ? retestHours[0] : 6;
    return {
      hoursFromNow: hours,
      reason: 'Valores no seguros detectados. Realizar una nueva medición pronto y evitar bañarse.',
    };
  }

  if (status === 'needs-correction') {
    const retestHours = recommendations
      .filter((r) => r.retestAfterHours)
      .map((r) => r.retestAfterHours!)
      .sort((a, b) => a - b);
    const hours = retestHours.length > 0 ? retestHours[0] : 6;
    return {
      hoursFromNow: hours,
      reason: 'Se ha recomendado una corrección química. Realizar una nueva medición para verificar los resultados.',
    };
  }

  if (status === 'needs-attention') {
    return {
      hoursFromNow: 24,
      reason: 'Valores bajo observación. Realizar una nueva medición en 24 horas para monitorear la evolución.',
    };
  }

  // Balanced
  return {
    hoursFromNow: 48,
    reason: 'Todos los valores están en equilibrio. Realizar una nueva medición en 24–48 horas como parte del mantenimiento regular.',
  };
}

// ── Personalization helpers ──────────────────────────────────────

/**
 * Check whether a learned adjustment has sufficient confidence
 * to be applied as a personalization.
 */
function isConfidenceSufficient(
  adj: LearnedAdjustment,
  config: HistoricalLearningConfig,
): boolean {
  if (adj.confidence === 'none') return false;
  if (adj.confidence === 'low' && !config.applyLowConfidence) return false;
  if (adj.confidence === 'low' && config.applyLowConfidence) return true;
  // medium or high — always sufficient
  return true;
}

/**
 * Find the best matching learned adjustment for a given action type
 * and metric. Tries to match by temperature band first, then falls
 * back to any band, then any adjustment with the same action type and metric.
 */
function findMatchingAdjustment(
  adjustments: LearnedAdjustment[],
  actionType: string,
  metric: string,
  poolType: string,
  temperatureBand?: string,
  outputPercentBand?: string,
): LearnedAdjustment | undefined {
  const candidates = adjustments.filter(
    (a) =>
      a.actionType === actionType &&
      a.metric === metric &&
      a.filters.poolType === poolType,
  );

  if (candidates.length === 0) return undefined;

  // Try exact temperature + output match
  if (temperatureBand && outputPercentBand) {
    const exact = candidates.find(
      (a) =>
        a.filters.temperatureBand === temperatureBand &&
        a.filters.outputPercentBand === outputPercentBand,
    );
    if (exact) return exact;
  }

  // Try temperature match (any output)
  if (temperatureBand) {
    const byTemp = candidates.find(
      (a) => a.filters.temperatureBand === temperatureBand,
    );
    if (byTemp) return byTemp;
  }

  // Try output band match (any temperature)
  if (outputPercentBand) {
    const byOutput = candidates.find(
      (a) => a.filters.outputPercentBand === outputPercentBand,
    );
    if (byOutput) return byOutput;
  }

  // Fall back to any adjustment with no band filter
  return candidates.find(
    (a) => !a.filters.temperatureBand && !a.filters.outputPercentBand,
  );
}

/**
 * Find the best matching adjustment for equipment (chlorinator)
 * recommendations.
 */
function findChlorinatorAdjustment(
  adjustments: LearnedAdjustment[],
  settings: PoolSettings,
  latestMeasurement: Measurement | null,
): LearnedAdjustment | undefined {
  const tempBand = latestMeasurement
    ? getTemperatureBand(latestMeasurement.temperature)
    : undefined;
  const outBand = settings.saltChlorinator
    ? getOutputPercentBand(settings.saltChlorinator.currentOutputPercent)
    : undefined;

  return findMatchingAdjustment(
    adjustments,
    'chlorinator',
    'fac',
    settings.poolType,
    tempBand,
    outBand,
  );
}

/**
 * Find the best matching adjustment for chemical (e.g. chlorine granules)
 * recommendations.
 */
function findChemicalAdjustment(
  adjustments: LearnedAdjustment[],
  productActionType: string,
  settings: PoolSettings,
  latestMeasurement: Measurement | null,
): LearnedAdjustment | undefined {
  const tempBand = latestMeasurement
    ? getTemperatureBand(latestMeasurement.temperature)
    : undefined;

  return findMatchingAdjustment(
    adjustments,
    productActionType,
    'fac',
    settings.poolType,
    tempBand,
  );
}

/**
 * Apply personalization to a single recommendation based on
 * historical learned adjustments.
 *
 * Returns the personalization info or undefined if personalization
 * should not be applied.
 */
export function applyPersonalization(
  rec: MaintenanceRecommendation,
  adjustments: LearnedAdjustment[],
  latestMeasurement: Measurement | null,
  settings: PoolSettings,
  config: HistoricalLearningConfig,
): RecommendationPersonalization | undefined {
  if (!config.enabled) return undefined;

  // ── Chlorinator equipment adjustments ──────────────────────────
  if (
    rec.kind === 'equipment' &&
    rec.equipmentName?.toLowerCase().includes('clorador') &&
    rec.suggestedAdditionalHours !== undefined
  ) {
    const adj = findChlorinatorAdjustment(adjustments, settings, latestMeasurement);
    if (!adj) return undefined;
    if (!isConfidenceSufficient(adj, config)) {
      return {
        applied: false,
        sampleSize: adj.sampleSize,
        confidence: adj.confidence,
        explanation: `Insufficient historical data (${adj.sampleSize} sample${adj.sampleSize !== 1 ? 's' : ''}, ${adj.confidence} confidence) to personalize. Continue recording chlorinator adjustments.`,
      };
    }

    const theoreticalValue = rec.suggestedAdditionalHours;
    const cf = adj.correctionFactor ?? 1;
    const rawPersonalized = theoreticalValue / cf;
    const maxHours = settings.saltChlorinator?.maxRecommendedHoursPerDay ?? 12;
    const personalizedValue = Math.round(Math.min(rawPersonalized, maxHours) * 10) / 10;
    const adjusted = personalizedValue !== theoreticalValue;

    const direction = cf < 1 ? 'less' : 'more';
    const pct = Math.round(Math.abs((1 - cf) * 100));

    return {
      applied: adjusted,
      theoreticalValue,
      personalizedValue,
      correctionFactor: cf,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      explanation: adjusted
        ? `The theoretical estimate is ${theoreticalValue} additional hours. Based on ${adj.sampleSize} similar historical actions, your pool has produced approximately ${pct}% ${direction} FAC than expected. The personalized estimate is ${personalizedValue} hours.`
        : `The theoretical estimate of ${theoreticalValue} hours aligns with historical observations from ${adj.sampleSize} similar actions. No adjustment needed.`,
    };
  }

  // ── Chemical (chlorine granules) ───────────────────────────────
  if (
    rec.kind === 'chemical' &&
    rec.chemicalProductId === 'chlorine-granules' &&
    rec.estimatedAmount !== undefined
  ) {
    const adj = findChemicalAdjustment(
      adjustments,
      'chemical:chlorine-granules',
      settings,
      latestMeasurement,
    );
    if (!adj) return undefined;
    if (!isConfidenceSufficient(adj, config)) {
      return {
        applied: false,
        sampleSize: adj.sampleSize,
        confidence: adj.confidence,
        explanation: `Insufficient historical data (${adj.sampleSize} sample${adj.sampleSize !== 1 ? 's' : ''}, ${adj.confidence} confidence) to personalize chlorine dosage. Continue recording chlorine applications.`,
      };
    }

    const theoreticalValue = rec.estimatedAmount;
    const cf = adj.correctionFactor ?? 1;
    const rawPersonalized = theoreticalValue / cf;
    // Preserve a conservative personalization cap without using a fixed shock dose.
    const maxG = theoreticalValue * 1.5;
    const personalizedValue = Math.round(Math.min(rawPersonalized, maxG));
    const adjusted = personalizedValue !== theoreticalValue;

    const direction = cf < 1 ? 'less' : 'more';
    const pct = Math.round(Math.abs((1 - cf) * 100));

    return {
      applied: adjusted,
      theoreticalValue,
      personalizedValue,
      correctionFactor: cf,
      sampleSize: adj.sampleSize,
      confidence: adj.confidence,
      explanation: adjusted
        ? `The theoretical estimate is ${theoreticalValue}g of chlorine granules. Based on ${adj.sampleSize} similar historical actions, your pool has responded approximately ${pct}% ${direction} effectively than expected. The personalized estimate is ${personalizedValue}g.`
        : `The theoretical estimate of ${theoreticalValue}g aligns with historical observations from ${adj.sampleSize} similar actions. No adjustment needed.`,
    };
  }

  return undefined;
}

/**
 * Run the full maintenance assistant with personalized recommendations.
 *
 * First generates theoretical recommendations via `runAssistant`, then
 * enriches applicable recommendations with historical learning adjustments.
 */
export function runPersonalizedAssistant(
  measurements: Measurement[],
  actions: MaintenanceAction[],
  settings: PoolSettings,
): MaintenanceAssistantResult {
  const result = runAssistant(measurements, settings, actions);

  const config: HistoricalLearningConfig = {
    ...DEFAULT_HISTORICAL_LEARNING,
    ...settings.historicalLearning,
  };

  if (!config.enabled) return result;

  const adjustments = computeLearning(measurements, actions, settings, config);
  if (adjustments.length === 0) return result;

  const sorted = [...measurements].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  );
  const latest = sorted[0] ?? null;

  const enrichedRecommendations = result.recommendations.map((rec) => {
    const personalization = applyPersonalization(
      rec,
      adjustments,
      latest,
      settings,
      config,
    );
    if (personalization) {
      return { ...rec, personalization };
    }
    return rec;
  });

  return {
    ...result,
    recommendations: enrichedRecommendations,
  };
}
