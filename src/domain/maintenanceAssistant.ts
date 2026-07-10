import type { Measurement } from './measurement';
import type { PoolSettings, HistoricalLearningConfig } from './settings';
import { volumeInLiters, DEFAULT_HISTORICAL_LEARNING } from './settings';
import { getTargetRange, classifyLevel, TARGET_RANGES } from './chemistry';
import { analyzeTrends } from './trendAnalysis';
import type { MeasurementTrend } from './trendAnalysis';
import { calculateChlorinatorAdjustment } from './saltChlorinator';
import type { SaltChlorinatorConfig } from './saltChlorinator';
import type { MaintenanceAction } from './actions';
import { computeLearning, getTemperatureBand, getOutputPercentBand } from './historicalLearning';
import type { LearnedAdjustment, LearningConfidence } from './historicalLearning';

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

export interface MaintenanceRecommendation {
  id: string;
  kind: MaintenanceActionKind;
  severity: RecommendationSeverity;
  title: string;
  summary: string;
  reason: string;
  priority: number;
  relatedFields: Array<keyof Measurement>;
  chemicalProductId?: string;
  genericProductName?: string;
  mainComponent?: string;
  estimatedAmount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg';
  equipmentName?: string;
  suggestedOutputPercent?: number;
  suggestedAdditionalHours?: number;
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
): MaintenanceAssistantResult {
  if (measurements.length === 0) {
    return {
      status: 'insufficient-data',
      summary: 'No hay mediciones almacenadas. Guarda al menos una medición para obtener recomendaciones.',
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
    });
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
        recommendations.push({
          id: nextId(),
          kind: 'monitor',
          severity: 'medium',
          title: 'Corregir pH antes de ajustar cloro',
          summary: 'El pH debe estar dentro del rango antes de ajustar el cloro.',
          reason: `El pH (${latest.ph.toFixed(1)}) está fuera del rango. El cloro es menos eficaz con pH desajustado.`,
          priority: 2,
          relatedFields: ['ph', 'fac'],
          calculationNotes: ['Corregir el pH primero para que el cloro sea eficaz.'],
          safetyNotes: [],
          followUpActions: ['Aplicar corrección de pH.', 'Esperar 4–6 horas.', 'Reevaluar FAC.'],
          retestAfterHours: 6,
        });
      } else {
        // pH is acceptable → proceed with saltwater-specific logic for low FAC
        const chlorinatorConfig: SaltChlorinatorConfig | undefined = settings.saltChlorinator;

        if (chlorinatorConfig && chlorinatorConfig.enabled && hasVolume) {
          const deltaPpm = facRange.ideal - latest.fac;
          const adjustment = calculateChlorinatorAdjustment(deltaPpm, volLiters, chlorinatorConfig);
          const canAdjustFully = adjustment.hoursNeeded <= chlorinatorConfig.maxRecommendedHoursPerDay;
          const isTooLarge = adjustment.hoursNeeded > chlorinatorConfig.maxRecommendedHoursPerDay * 2;

          const calcNotes: string[] = [
            `Déficit de cloro: ${deltaPpm.toFixed(1)} ppm.`,
            `Volumen: ${volLiters.toLocaleString()} L.`,
            `Producción del clorador: ${chlorinatorConfig.productionGramsPerHour} g/h al ${chlorinatorConfig.currentOutputPercent}%.`,
            `Horas necesarias: ${adjustment.hoursNeeded.toFixed(1)} h.`,
          ];

          const sev: RecommendationSeverity =
            isVeryLowFac || isLowOrp ? 'high' : (isTooLarge ? 'high' : 'medium');

          if (adjustment.suggestedOutputPercent !== undefined || adjustment.suggestedAdditionalHours !== undefined) {
            if (adjustment.suggestedOutputPercent !== undefined) {
              calcNotes.push(`Aumentar la producción del clorador al ${adjustment.suggestedOutputPercent}%.`);
            }
            if (adjustment.suggestedAdditionalHours !== undefined && adjustment.suggestedAdditionalHours > 0) {
              calcNotes.push(`Añadir ${adjustment.suggestedAdditionalHours} hora(s) adicional(es) de filtración/cloración.`);
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
                'Aplicar los ajustes recomendados al clorador.',
                'Medir FAC después del ciclo de filtración.',
              ],
              retestAfterHours: 24,
            });
          }

          if (isTooLarge || !canAdjustFully) {
            const shockG = hasVolume ? Math.round(25 * volM3) : 0;
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
                estimatedAmount: hasVolume ? shockG : undefined,
                unit: hasVolume ? 'g' : undefined,
                targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
                currentValue: latest.fac,
                calculationNotes: [
                  `Dosis de choque: ${shockG} g para ${volM3} m³.`,
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
        } else if (isVeryLowFac || isLowOrp) {
          const shockG = hasVolume ? Math.round(25 * volM3) : 0;
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
            estimatedAmount: hasVolume ? shockG : undefined,
            unit: hasVolume ? 'g' : undefined,
            targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
            currentValue: latest.fac,
            calculationNotes: [
              hasVolume ? `Dosis estimada: ${shockG} g para ${volM3} m³.` : 'Ingresa el volumen para obtener dosis.',
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
        recommendations.push({
          id: nextId(),
          kind: 'monitor',
          severity: 'medium',
          title: 'Corregir pH antes de ajustar cloro',
          summary: 'El pH debe estar dentro del rango antes de añadir cloro.',
          reason: `El pH (${latest.ph.toFixed(1)}) está fuera del rango. El cloro es menos eficaz con pH desajustado.`,
          priority: 2,
          relatedFields: ['ph', 'fac'],
          calculationNotes: ['Corregir el pH primero para que el cloro sea eficaz.'],
          safetyNotes: [],
          followUpActions: ['Aplicar corrección de pH.', 'Esperar 4–6 horas.', 'Reevaluar FAC.'],
          retestAfterHours: 6,
        });
      } else {
        const targetCl = facRange.ideal;
        const isLowOrp = latest.orp !== undefined && latest.orp !== null && latest.orp < 650;
        const isVeryLow = latest.fac < facRange.min * 0.5;
        const maintG = hasVolume ? Math.round(3 * volM3) : 0;
        const shockG = hasVolume ? Math.round(25 * volM3) : 0;
        const g = isVeryLow || isLowOrp ? shockG : maintG;
        const isShock = isVeryLow || isLowOrp;
        const sev: RecommendationSeverity = isLowOrp ? 'high' : (isVeryLow ? 'high' : 'medium');

        const calcNotes: string[] = [
          `Dosis estimada: ${isShock ? 'choque' : 'mantenimiento'} — ${g > 0 ? `${g} g` : 'calcular con el volumen'} para subir de ${latest.fac.toFixed(1)} ppm a ${targetCl.toFixed(1)} ppm.`,
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
          estimatedAmount: hasVolume ? g : undefined,
          unit: hasVolume ? 'g' : undefined,
          targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
          currentValue: latest.fac,
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
      const adjustment = calculateChlorinatorAdjustment(deltaPpm, volLiters, chlorinatorConfig);

      if (adjustment.suggestedOutputPercent !== undefined || adjustment.suggestedAdditionalHours !== undefined) {
        const calcNotes: string[] = [
          `FAC actual: ${latest.fac.toFixed(1)} ppm. Objetivo: ${facRange.ideal.toFixed(1)} ppm.`,
          `Déficit: ${deltaPpm.toFixed(1)} ppm.`,
          `Volumen: ${volLiters.toLocaleString()} L.`,
        ];

        if (adjustment.suggestedOutputPercent !== undefined) {
          calcNotes.push(`Aumentar producción del clorador al ${adjustment.suggestedOutputPercent}%.`);
        }
        if (adjustment.suggestedAdditionalHours !== undefined && adjustment.suggestedAdditionalHours > 0) {
          calcNotes.push(`Añadir ${adjustment.suggestedAdditionalHours} hora(s) adicional(es).`);
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
            'Aplicar los ajustes recomendados.',
            'Medir FAC después del ciclo de filtración.',
          ],
          retestAfterHours: 24,
        });
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

  // ── Build summary ─────────────────────────────────────────────
  const summary = buildSummary(worstStatus, latest, settings);

  // ── Next check suggestion ─────────────────────────────────────
  const nextCheck = determineNextCheck(recommendations, worstStatus);

  return {
    status: worstStatus,
    summary,
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
): string {
  switch (status) {
    case 'balanced':
      return `El agua está en equilibrio. pH ${latest.ph.toFixed(1)}, FAC ${latest.fac.toFixed(1)} ppm — ambos dentro del rango. Sigue con el mantenimiento regular.`;
    case 'needs-attention':
      return `Algunos valores requieren atención. Se recomienda monitorear y tomar medidas preventivas.`;
    case 'needs-correction':
      return `Es necesario corregir algunos parámetros del agua. Revisa las recomendaciones detalladas a continuación.`;
    case 'unsafe':
      return `⚠️ El agua puede no ser segura. Toma medidas correctivas inmediatas y evita bañarte hasta que los valores estén dentro de los rangos seguros.`;
    case 'insufficient-data':
      return 'No hay suficientes datos para generar recomendaciones.';
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
    // Preserve per-treatment cap: never exceed shock level (25 g/m³)
    const volM3 = volumeInLiters(settings) / 1000;
    const maxG = volM3 > 0 ? Math.round(25 * volM3) : theoreticalValue * 2;
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
  const result = runAssistant(measurements, settings);

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
