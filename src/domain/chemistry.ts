import type { PoolSettings } from './settings';
import { volumeInLiters } from './settings';
import type { Measurement } from './measurement';

// ── Severity type ─────────────────────────────────────────────────

export type RecommendationSeverity = 'info' | 'low' | 'medium' | 'high' | 'danger';

// ── Target ranges ─────────────────────────────────────────────────

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

// ── Product recommendation model ──────────────────────────────────

export interface ProductRecommendation {
  id: string;
  chemicalProductId?: string;
  genericProductName?: string;
  mainComponent?: string;
  purpose: string;
  estimatedAmount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg';
  severity: RecommendationSeverity;
  reason: string;
  currentValue?: number;
  targetRange?: { min: number; max: number; unit: string };
  safetyNotes: string[];
  calculationNotes: string[];
  followUpActions: string[];
}

export interface RecommendationsResult {
  canCalculate: boolean;
  missingReason: string;
  items: ProductRecommendation[];
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────

let _counter = 0;
function nextId(): string {
  _counter += 1;
  return `rec-${Date.now()}-${_counter}`;
}

function severityFromLabel(label: 'danger' | 'warning' | 'ok'): RecommendationSeverity {
  switch (label) {
    case 'danger':  return 'high';
    case 'warning': return 'medium';
    case 'ok':      return 'info';
  }
}

function makeRange(min: number, max: number, unit: string) {
  return { min, max, unit };
}

// ── Main recommendation engine ────────────────────────────────────

/**
 * Generate chemical recommendations based on a measurement and pool settings.
 *
 * Uses the generic chemical catalog (src/domain/chemicalCatalog.ts) for
 * product information.  Recommendations use generic product names and
 * active components — no commercial brand names are shown.
 *
 * All formulas are **approximate**.  Always follow the dosage instructions
 * on the product label.  These calculations assume standard residential
 * pool conditions.
 */
export function calculateRecommendations(
  measurement: Measurement,
  settings: PoolSettings,
): RecommendationsResult {
  // ── Guard: missing required measurements ────────────────────────
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

  // ── Guard: missing / zero volume → qualitative-only ────────────
  const volM3 = settings.volume > 0
    ? volumeInLiters(settings) / 1000
    : 0;
  const volLiters = settings.volume > 0 ? volumeInLiters(settings) : 0;
  const hasVolume = settings.volume > 0;

  const isSaltwater = settings.poolType === 'saltwater';
  const items: ProductRecommendation[] = [];
  const warnings: string[] = [];

  // ── Phases ─────────────────────────────────────────────────────
  // 1. Danger warnings (inline)
  // 2. pH correction
  // 3. FAC / chlorine / ORP sanitation
  // 4. Salt (saltwater only)
  // 5. Stabilizer informational note
  // 6. Alkalinity informational note
  // 7. Temperature notes
  // 8. TDS/EC informational notes

  // ── Helper: add danger warnings ────────────────────────────────
  function addDangerWarning(msg: string): void {
    warnings.push(`⚠️ ${msg}`);
  }

  // ── 0. Collect danger warnings first ───────────────────────────

  const phRange = TARGET_RANGES.ph;
  const phClass = classifyLevel(measurement.ph, phRange);
  if (phClass.label === 'danger') {
    addDangerWarning(`pH is critically ${measurement.ph < phRange.min ? 'low' : 'high'} (${measurement.ph}). Consider professional advice.`);
  }

  const facRange = getTargetRange('fac', settings.poolType);
  const facClass = classifyLevel(measurement.fac, facRange);
  if (facClass.label === 'danger') {
    addDangerWarning(`FAC is critically low (${measurement.fac} ppm). Pool may be unsafe.`);
  }

  // ORP
  if (measurement.orp !== undefined && measurement.orp !== null) {
    if (measurement.orp < 600) {
      addDangerWarning(`ORP (${measurement.orp} mV) is very low — water sanitation may be compromised.`);
    } else if (measurement.orp < 650) {
      warnings.push(`ORP (${measurement.orp} mV) is below 650 mV. Sanitation effectiveness may be reduced.`);
    }
  }

  // ── 1. pH correction ──────────────────────────────────────────

  const targetPh = phRange.ideal; // 7.4

  if (measurement.ph < phRange.min) {
    // pH too low → recommend pH increaser
    const delta = targetPh - measurement.ph;
    const capped = Math.min(delta, 0.2); // cap at 0.2 per cycle
    const isCapped = capped < delta;

    const amountMl = hasVolume
      ? Math.round((capped / 0.1) * 1000 * (volM3 / 50))
      : 0;

    const notes: string[] = [];
    if (isCapped) {
      notes.push(`Corrección limitada a 0.2 unidades de pH por ciclo de tratamiento para evitar sobredosificación. Dosis calculada para subir de ${measurement.ph.toFixed(1)} a ${(measurement.ph + capped).toFixed(1)}.`);
      notes.push('Volver a medir y repetir si es necesario.');
    } else {
      notes.push(`Dosis calculada para subir de ${measurement.ph.toFixed(1)} al valor objetivo de ${targetPh.toFixed(1)}.`);
    }
    if (!hasVolume) {
      notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');
    }

    items.push({
      id: nextId(),
      chemicalProductId: 'ph-increaser-liquid',
      genericProductName: 'Incrementador de pH líquido',
      mainComponent: 'Base alcalina incrementadora de pH',
      purpose: 'Subir el pH del agua',
      estimatedAmount: hasVolume ? amountMl : undefined,
      unit: hasVolume ? 'ml' : undefined,
      severity: severityFromLabel(phClass.label),
      reason: `El pH (${measurement.ph.toFixed(1)}) está por debajo del rango objetivo de ${phRange.min}–${phRange.max}.`,
      currentValue: measurement.ph,
      targetRange: makeRange(phRange.min, phRange.max, ''),
      safetyNotes: [
        'Manejar con guantes y gafas de protección.',
        'Añadir gradualmente cerca del retorno de agua.',
        'No mezclar con otros productos químicos.',
      ],
      calculationNotes: notes,
      followUpActions: [
        'Medir el pH después de 4–6 horas.',
        'Repetir la dosis si el pH sigue bajo.',
      ],
    });
  } else if (measurement.ph > phRange.max) {
    // pH too high → recommend pH reducer
    const delta = measurement.ph - targetPh;
    const capped = Math.min(delta, 0.2);
    const isCapped = capped < delta;

    const amountMl = hasVolume
      ? Math.round((capped / 0.1) * 750 * (volM3 / 50))
      : 0;

    const notes: string[] = [];
    if (isCapped) {
      notes.push(`Corrección limitada a 0.2 unidades de pH por ciclo de tratamiento. Dosis calculada para bajar de ${measurement.ph.toFixed(1)} a ${(measurement.ph - capped).toFixed(1)}.`);
      notes.push('Volver a medir y repetir si es necesario.');
    } else {
      notes.push(`Dosis calculada para bajar de ${measurement.ph.toFixed(1)} al valor objetivo de ${targetPh.toFixed(1)}.`);
    }
    if (!hasVolume) {
      notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');
    }

    items.push({
      id: nextId(),
      chemicalProductId: 'ph-reducer-liquid',
      genericProductName: 'Reductor de pH líquido',
      mainComponent: 'Ácido reductor de pH',
      purpose: 'Bajar el pH del agua',
      estimatedAmount: hasVolume ? amountMl : undefined,
      unit: hasVolume ? 'ml' : undefined,
      severity: severityFromLabel(phClass.label),
      reason: `El pH (${measurement.ph.toFixed(1)}) está por encima del rango objetivo de ${phRange.min}–${phRange.max}.`,
      currentValue: measurement.ph,
      targetRange: makeRange(phRange.min, phRange.max, ''),
      safetyNotes: [
        'Manejar con guantes y gafas de protección.',
        'Añadir gradualmente cerca del retorno de agua.',
        'No mezclar con otros productos químicos.',
      ],
      calculationNotes: notes,
      followUpActions: [
        'Medir el pH después de 4–6 horas.',
        'Repetir la dosis si el pH sigue alto.',
      ],
    });
  }

  // ── Check if pH is within acceptable range for chlorine work ───
  const phAcceptable = measurement.ph >= phRange.min && measurement.ph <= phRange.max;

  // ── 2. FAC / chlorine / ORP sanitation ─────────────────────────

  if (isSaltwater) {
    // ── Saltwater pool chlorine logic ──
    if (measurement.fac < facRange.min) {
      if (phAcceptable) {
        // pH is OK → check chlorinator first
        const sev: RecommendationSeverity = facClass.label === 'danger' ? 'high' : 'medium';
        // Determine: if FAC is very low and/or ORP is low, recommend shock
        const isVeryLowFac = measurement.fac < facRange.min * 0.5;
        const isLowOrp = measurement.orp !== undefined && measurement.orp !== null && measurement.orp < 650;

        const chlorinatorNote = `El FAC (${measurement.fac} ppm) está por debajo del rango objetivo de ${facRange.min}–${facRange.max} ppm para piscinas salinas. Verificar el funcionamiento del clorador salino, las horas de filtración y el estado de las celdas electrolíticas.`;

        const notes: string[] = [chlorinatorNote];

        if (isVeryLowFac || isLowOrp) {
          // Recommend shock treatment with chlorine granules
          const shockG = hasVolume ? Math.round(25 * volM3) : 0;
          notes.push('Nivel de cloro muy bajo o ORP bajo — se recomienda tratamiento de choque con cloro granulado como medida correctiva.');
          if (!hasVolume) {
            notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');
          }

          items.push({
            id: nextId(),
            chemicalProductId: 'chlorine-granules',
            genericProductName: 'Cloro granulado',
            mainComponent: 'Cloro de disolución rápida',
            purpose: 'Tratamiento de choque para piscinas salinas',
            estimatedAmount: hasVolume ? shockG : undefined,
            unit: hasVolume ? 'g' : undefined,
            severity: sev,
            reason: `El FAC (${measurement.fac} ppm) está bajo y ${isLowOrp ? `el ORP (${measurement.orp} mV) también está bajo` : 'requiere acción correctiva'}.`,
            currentValue: measurement.fac,
            targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
            safetyNotes: [
              'Manejar con guantes y gafas de protección.',
              'No mezclar con ácidos u otros productos químicos.',
              'Añadir en horas de baja radiación solar.',
              'Esperar al menos 30 minutos antes de bañarse.',
            ],
            calculationNotes: notes,
            followUpActions: [
              'Verificar el funcionamiento del clorador salino.',
              'Aumentar las horas de filtración.',
              'Medir FAC y ORP después de 24 horas.',
            ],
          });
        } else {
          // Mildly low FAC, just recommend checking the chlorinator
          items.push({
            id: nextId(),
            chemicalProductId: undefined,
            genericProductName: undefined,
            mainComponent: undefined,
            purpose: 'Verificar sistema de cloración salina',
            estimatedAmount: undefined,
            unit: undefined,
            severity: sev,
            reason: `El FAC (${measurement.fac} ppm) está por debajo del rango (${facRange.min}–${facRange.max} ppm). El pH está dentro del rango aceptable.`,
            currentValue: measurement.fac,
            targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
            safetyNotes: [],
            calculationNotes: notes,
            followUpActions: [
              'Revisar el clorador salino, las celdas electrolíticas y el tiempo de filtración.',
              'Medir FAC después de 24 horas.',
              'Si el FAC sigue bajo, considerar tratamiento de choque con cloro granulado.',
            ],
          });
        }

        // If ORP is also low, increase severity on existing items
        if (isLowOrp && items.length > 0) {
          const lastIdx = items.length - 1;
          if (items[lastIdx].severity === 'medium') {
            items[lastIdx].severity = 'high';
          }
        }
      } else {
        // pH is bad → recommend correcting pH first
        items.push({
          id: nextId(),
          chemicalProductId: undefined,
          genericProductName: undefined,
          mainComponent: undefined,
          purpose: 'Corregir el pH antes de ajustar el cloro',
          estimatedAmount: undefined,
          unit: undefined,
          severity: 'medium',
          reason: `El pH (${measurement.ph.toFixed(1)}) está fuera del rango (${phRange.min}–${phRange.max}). Corregir el pH primero para que el cloro sea eficaz.`,
          currentValue: measurement.ph,
          targetRange: makeRange(phRange.min, phRange.max, ''),
          safetyNotes: [],
          calculationNotes: [
            'El cloro es menos eficaz cuando el pH está fuera del rango.',
            'Ajustar el pH antes de añadir cloro.',
          ],
          followUpActions: [
            'Aplicar el producto de corrección de pH recomendado.',
            'Esperar 4–6 horas y medir el pH.',
            'Si el pH está dentro del rango, evaluar el FAC.',
          ],
        });
      }
    } else if (measurement.fac > facRange.max) {
      items.push({
        id: nextId(),
        chemicalProductId: undefined,
        genericProductName: undefined,
        mainComponent: undefined,
        purpose: 'No añadir cloro — nivel alto',
        estimatedAmount: undefined,
        unit: undefined,
        severity: facClass.label === 'danger' ? 'high' : 'medium',
        reason: `El FAC (${measurement.fac.toFixed(1)} ppm) está por encima del rango objetivo de ${facRange.min}–${facRange.max} ppm. No añadir más cloro.`,
        currentValue: measurement.fac,
        targetRange: makeRange(facRange.min, facRange.max, 'ppm'),
        safetyNotes: [
          'Evitar bañarse hasta que el nivel baje.',
          'La exposición a cloro alto puede irritar la piel y los ojos.',
        ],
        calculationNotes: [
          'El cloro se disipa naturalmente con el tiempo y la radiación solar.',
          'No se recomienda añadir productos químicos para reducir el cloro.',
        ],
        followUpActions: [
          'Esperar y medir el FAC nuevamente en 24 horas.',
          'Evitar bañarse mientras el FAC esté elevado.',
          'Reducir horas de cloración si es necesario.',
        ],
      });
    }
  } else {
    // ── Chlorine pool logic ──
    const clRange = facRange;

    if (measurement.fac < clRange.min) {
      // Low FAC
      if (phAcceptable) {
        // pH acceptable → recommend chlorine granules (maintenance dose)
        const targetCl = clRange.ideal;
        // maintenance: 3 g/m³
        const maintG = hasVolume ? Math.round(3 * volM3) : 0;

        const isLowOrp = measurement.orp !== undefined && measurement.orp !== null && measurement.orp < 650;
        const isVeryLow = measurement.fac < clRange.min * 0.5;

        // For very low FAC or low ORP, use shock dose
        const g = isVeryLow || isLowOrp
          ? (hasVolume ? Math.round(25 * volM3) : 0)
          : maintG;

        let desc = isVeryLow || isLowOrp
          ? 'Dosis de choque'
          : 'Dosis de mantenimiento';

        const sev: RecommendationSeverity =
          isLowOrp
            ? 'high'
            : isVeryLow
              ? (facClass.label === 'danger' ? 'high' : 'medium')
              : 'medium';

        const notes: string[] = [
          `Dosis estimada: ${desc} — ${g > 0 ? `${g} g` : 'calcular con el volumen de la piscina'} para subir de ${measurement.fac.toFixed(1)} ppm al objetivo de ${targetCl.toFixed(1)} ppm.`,
        ];
        if (isLowOrp) {
          notes.push(`ORP bajo (${measurement.orp} mV) — aumentar la severidad de la recomendación.`);
        }
        if (!hasVolume) {
          notes.push('Ingresa el volumen de la piscina en Configuración para obtener una dosis estimada.');
        }

        items.push({
          id: nextId(),
          chemicalProductId: 'chlorine-granules',
          genericProductName: 'Cloro granulado',
          mainComponent: 'Cloro de disolución rápida',
          purpose: 'Aumentar el cloro libre disponible',
          estimatedAmount: hasVolume ? g : undefined,
          unit: hasVolume ? 'g' : undefined,
          severity: sev,
          reason: `El FAC (${measurement.fac.toFixed(1)} ppm) está por debajo del rango (${clRange.min}–${clRange.max} ppm)${isLowOrp ? ` y el ORP (${measurement.orp} mV) también está bajo` : ''}.`,
          currentValue: measurement.fac,
          targetRange: makeRange(clRange.min, clRange.max, 'ppm'),
          safetyNotes: [
            'Manejar con guantes y gafas de protección.',
            'No mezclar con ácidos u otros productos químicos.',
            'Añadir en horas de baja radiación solar.',
            'Esperar al menos 30 minutos antes de bañarse.',
          ],
          calculationNotes: notes,
          followUpActions: [
            'Medir FAC después de 4–6 horas.',
            'Ajustar la dosis si es necesario.',
          ],
        });
      } else {
        // pH is bad → recommend correcting pH first
        items.push({
          id: nextId(),
          chemicalProductId: undefined,
          genericProductName: undefined,
          mainComponent: undefined,
          purpose: 'Corregir el pH antes de ajustar el cloro',
          estimatedAmount: undefined,
          unit: undefined,
          severity: 'medium',
          reason: `El pH (${measurement.ph.toFixed(1)}) está fuera del rango (${phRange.min}–${phRange.max}). Corregir el pH primero para que el cloro sea eficaz.`,
          currentValue: measurement.ph,
          targetRange: makeRange(phRange.min, phRange.max, ''),
          safetyNotes: [],
          calculationNotes: [
            'El cloro es menos eficaz cuando el pH está fuera del rango.',
            'Ajustar el pH antes de añadir cloro.',
          ],
          followUpActions: [
            'Aplicar el producto de corrección de pH recomendado.',
            'Esperar 4–6 horas y medir el pH.',
            'Si el pH está dentro del rango, evaluar el FAC.',
          ],
        });
      }
    } else if (measurement.fac > clRange.max) {
      // FAC above target
      items.push({
        id: nextId(),
        chemicalProductId: undefined,
        genericProductName: undefined,
        mainComponent: undefined,
        purpose: 'No añadir cloro — nivel alto',
        estimatedAmount: undefined,
        unit: undefined,
        severity: facClass.label === 'danger' ? 'high' : 'medium',
        reason: `El FAC (${measurement.fac.toFixed(1)} ppm) está por encima del rango objetivo de ${clRange.min}–${clRange.max} ppm. No añadir más cloro.`,
        currentValue: measurement.fac,
        targetRange: makeRange(clRange.min, clRange.max, 'ppm'),
        safetyNotes: [
          'Evitar bañarse hasta que el nivel baje.',
          'La exposición a cloro alto puede irritar la piel y los ojos.',
        ],
        calculationNotes: [
          'El cloro se disipa naturalmente con el tiempo y la radiación solar.',
          'No se recomienda añadir productos químicos para reducir el cloro.',
        ],
        followUpActions: [
          'Esperar y medir el FAC nuevamente en 24 horas.',
          'Evitar bañarse mientras el FAC esté elevado.',
        ],
      });
    }
  }

  // ── 3. Salt (saltwater pools only) ─────────────────────────────

  if (isSaltwater && measurement.salt !== undefined && measurement.salt !== null) {
    const saltRange = TARGET_RANGES.salt;

    if (measurement.salt < saltRange.min) {
      const deltaPpm = saltRange.ideal - measurement.salt;
      const kg = hasVolume
        ? Math.round((deltaPpm * volLiters / 1_000_000) * 100) / 100
        : 0;

      const notes: string[] = [
        `Sal actual: ${measurement.salt} ppm. Objetivo: ${saltRange.ideal} ppm.`,
      ];
      if (hasVolume) {
        notes.push(`Estimación: ${deltaPpm} ppm × ${volLiters.toLocaleString()} L / 1.000.000 = ${kg.toFixed(1)} kg de sal.`);
        notes.push('Esta es una estimación. La cantidad real puede variar según la temperatura y las condiciones del agua.');
      } else {
        notes.push('Ingresa el volumen de la piscina en Configuración para obtener una cantidad estimada.');
      }

      items.push({
        id: nextId(),
        chemicalProductId: 'pool-salt',
        genericProductName: 'Sal para piscina',
        mainComponent: 'Cloruro sódico',
        purpose: 'Aumentar la concentración de sal en piscinas salinas',
        estimatedAmount: hasVolume ? kg : undefined,
        unit: hasVolume ? 'kg' : undefined,
        severity: severityFromLabel(
          classifyLevel(measurement.salt, saltRange).label,
        ),
        reason: `La sal (${measurement.salt} ppm) está por debajo del rango de ${saltRange.min}–${saltRange.max} ppm.`,
        currentValue: measurement.salt,
        targetRange: makeRange(saltRange.min, saltRange.max, 'ppm'),
        safetyNotes: [
          'Distribuir uniformemente por la superficie.',
          'Cepillar el fondo si se acumulan cristales.',
        ],
        calculationNotes: notes,
        followUpActions: [
          'Medir la sal después de 24 horas.',
          'Repetir la dosis si es necesario.',
        ],
      });
    } else if (measurement.salt > saltRange.max) {
      items.push({
        id: nextId(),
        chemicalProductId: undefined,
        genericProductName: undefined,
        mainComponent: undefined,
        purpose: 'Dilución o reemplazo parcial de agua',
        estimatedAmount: undefined,
        unit: undefined,
        severity: 'medium',
        reason: `La sal (${measurement.salt} ppm) está por encima del rango de ${saltRange.min}–${saltRange.max} ppm. No existe un producto químico para reducir la sal.`,
        currentValue: measurement.salt,
        targetRange: makeRange(saltRange.min, saltRange.max, 'ppm'),
        safetyNotes: [
          'Realizar el drenaje parcial con cuidado para no dañar la estructura.',
          'Consultar con un profesional si no estás seguro.',
        ],
        calculationNotes: [
          'La sal no se puede reducir químicamente.',
          'Se recomienda drenar parcialmente y rellenar con agua fresca.',
        ],
        followUpActions: [
          'Drenar parcialmente la piscina y rellenar con agua fresca.',
          'Medir la sal después de rellenar.',
        ],
      });
    }
  }

  // ── 4. Stabilizer informational note ────────────────────────────
  // Always show this when FAC is relevant and the meter doesn't measure cyanuric acid
  if (measurement.fac < facRange.min) {
    items.push({
      id: nextId(),
      chemicalProductId: 'chlorine-stabilizer',
      genericProductName: 'Estabilizador de cloro',
      mainComponent: 'Ácido cianúrico',
      purpose: 'Información — el estabilizador protege el cloro frente al sol',
      estimatedAmount: undefined,
      unit: undefined,
      severity: 'info',
      reason: 'El medidor digital no mide ácido cianúrico. Si el cloro se consume rápidamente, puede ser necesario añadir estabilizador.',
      safetyNotes: [
        'Disolver en agua tibia antes de añadir.',
        'Añadir lentamente en el skimmer.',
      ],
      calculationNotes: [
        'El medidor digital no mide ácido cianúrico.',
        'No se puede calcular la dosis sin una medición manual de ácido cianúrico.',
        'Realizar una prueba de ácido cianúrico con un kit de prueba manual.',
      ],
      followUpActions: [
        'Realizar una prueba de ácido cianúrico con un kit manual.',
        'Si el nivel es bajo, añadir estabilizador según las indicaciones del producto.',
      ],
    });
  }

  // ── 5. Alkalinity informational note ────────────────────────────
  items.push({
    id: nextId(),
    chemicalProductId: 'total-alkalinity-reducer',
    genericProductName: 'Reductor de alcalinidad total',
    mainComponent: 'Ácido reductor de alcalinidad',
    purpose: 'Información — la alcalinidad total ayuda a estabilizar el pH',
    estimatedAmount: undefined,
    unit: undefined,
    severity: 'info',
    reason: 'El medidor digital no mide alcalinidad total. Si el pH es inestable, puede ser necesario medir y ajustar la alcalinidad.',
    safetyNotes: [
      'Manejar con guantes y gafas de protección.',
      'Añadir gradualmente cerca del retorno de agua.',
    ],
    calculationNotes: [
      'El medidor digital no mide alcalinidad total.',
      'No se puede calcular la dosis sin una medición manual de alcalinidad.',
      'Realizar una prueba de alcalinidad con un kit de prueba manual.',
    ],
    followUpActions: [
      'Realizar una prueba de alcalinidad total con un kit manual.',
      'Si la alcalinidad está alta, añadir reductor según las indicaciones.',
    ],
  });

  // ── 6. Temperature notes ──────────────────────────────────────
  if (measurement.temperature !== undefined && measurement.temperature !== null) {
    if (measurement.temperature > 30) {
      warnings.push(`La temperatura del agua es de ${measurement.temperature} °C. La demanda de cloro puede aumentar con temperaturas elevadas.`);
    }
  }

  // ── 7. TDS/EC informational notes ──────────────────────────────
  if (measurement.tds !== undefined && measurement.tds !== null && measurement.tds > 5000) {
    warnings.push(`TDS alto (${measurement.tds} ppm). Considerar drenaje parcial si los niveles continúan aumentando.`);
  }

  if (measurement.ec !== undefined && measurement.ec !== null && measurement.ec > 10000) {
    warnings.push(`CE alta (${measurement.ec} µS/cm). Valores altos pueden indicar exceso de sólidos disueltos.`);
  }

  return {
    canCalculate: true,
    missingReason: '',
    items,
    warnings,
  };
}
