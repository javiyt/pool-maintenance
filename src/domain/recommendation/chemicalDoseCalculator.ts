import { volumeInLiters, type PoolSettings } from '../settings';
import { getProductById, type ChemicalProduct } from '../chemicalCatalog';

export type ChlorineCorrectionType =
  | 'maintenance-correction'
  | 'rapid-correction'
  | 'shock-treatment';

export interface ChemicalDoseCalculation {
  productId: string;
  productName: string;
  targetParameter: 'fac' | 'ph' | 'salt';
  correctionType?: ChlorineCorrectionType;
  currentValue: number;
  targetValue: number;
  delta: number;
  theoreticalAmount?: number;
  unit?: 'ml' | 'l' | 'g' | 'kg';
  notes: string[];
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function classifyChlorineCorrection(input: {
  fac: number;
  targetFac: number;
  orp?: number;
  visibleAlgae?: boolean;
  waterClarity?: 'clear' | 'slightly-cloudy' | 'cloudy';
  batherLoad?: 'none' | 'low' | 'medium' | 'high';
  persistentLowFac?: boolean;
}): ChlorineCorrectionType {
  const severeDeficit = input.targetFac - input.fac >= 1.5;
  const lowOrp = input.orp !== undefined && input.orp < 600;
  const waterProblem = input.visibleAlgae || input.waterClarity === 'cloudy';

  if (waterProblem || lowOrp || severeDeficit) return 'shock-treatment';
  if (input.persistentLowFac || input.batherLoad === 'high' || input.orp !== undefined && input.orp < 650) {
    return 'rapid-correction';
  }
  return 'maintenance-correction';
}

export function calculateFacDose(input: {
  productId: string;
  settings: PoolSettings;
  currentFac: number;
  targetFac: number;
  correctionType?: ChlorineCorrectionType;
}): ChemicalDoseCalculation {
  const product = getProductById(input.productId);
  const volumeL = volumeInLiters(input.settings);
  const delta = Math.max(0, input.targetFac - input.currentFac);

  const notes: string[] = [
    `Déficit de FAC: ${round(delta, 1)} ppm.`,
    '1 ppm equivale a 1 mg/L de cloro disponible.',
  ];

  if (!product) {
    notes.push(`Producto no encontrado en el catálogo: ${input.productId}.`);
    return {
      productId: input.productId,
      productName: input.productId,
      targetParameter: 'fac',
      correctionType: input.correctionType,
      currentValue: input.currentFac,
      targetValue: input.targetFac,
      delta,
      notes,
    };
  }

  if (volumeL <= 0) {
    notes.push('Ingresa el volumen de la piscina para obtener dosis.');
    return {
      productId: product.id,
      productName: product.genericName,
      targetParameter: 'fac',
      correctionType: input.correctionType,
      currentValue: input.currentFac,
      targetValue: input.targetFac,
      delta,
      notes,
    };
  }

  const availableChlorinePercent = product.availableChlorinePercent;
  if (!availableChlorinePercent || availableChlorinePercent <= 0) {
    notes.push('El producto no define porcentaje de cloro disponible; no se calcula dosis.');
    return {
      productId: product.id,
      productName: product.genericName,
      targetParameter: 'fac',
      correctionType: input.correctionType,
      currentValue: input.currentFac,
      targetValue: input.targetFac,
      delta,
      notes,
    };
  }

  const activeChlorineGrams = (delta * volumeL) / 1000;
  const productGrams = activeChlorineGrams / (availableChlorinePercent / 100);

  notes.push(`Volumen: ${volumeL.toLocaleString()} L.`);
  notes.push(`Cloro disponible requerido: ${round(activeChlorineGrams)} g.`);
  notes.push(`Producto: ${product.genericName}, ${availableChlorinePercent}% de cloro disponible.`);
  notes.push(`Cantidad teórica = ${round(activeChlorineGrams)} g / ${availableChlorinePercent}% = ${round(productGrams)} g.`);

  return {
    productId: product.id,
    productName: product.genericName,
    targetParameter: 'fac',
    correctionType: input.correctionType,
    currentValue: input.currentFac,
    targetValue: input.targetFac,
    delta,
    theoreticalAmount: round(productGrams),
    unit: 'g',
    notes,
  };
}

export function calculatePhDose(input: {
  product: ChemicalProduct;
  settings: PoolSettings;
  currentPh: number;
  targetPh: number;
  maxStep: number;
}): ChemicalDoseCalculation {
  const volumeL = volumeInLiters(input.settings);
  const volumeM3 = volumeL / 1000;
  const direction = input.targetPh >= input.currentPh ? 1 : -1;
  const rawDelta = Math.abs(input.targetPh - input.currentPh);
  const cappedDelta = Math.min(rawDelta, input.maxStep);
  const rule = input.product.dosageRule;
  const notes: string[] = [];

  if (rawDelta > cappedDelta) {
    notes.push(`Corrección limitada a ${input.maxStep} unidades de pH por ciclo.`);
  }

  if (!rule || !rule.changesValueBy || volumeM3 <= 0) {
    if (volumeM3 <= 0) notes.push('Ingresa el volumen de la piscina para obtener una dosis estimada.');
    return {
      productId: input.product.id,
      productName: input.product.genericName,
      targetParameter: 'ph',
      currentValue: input.currentPh,
      targetValue: input.targetPh,
      delta: direction * cappedDelta,
      notes,
    };
  }

  const amount = (cappedDelta / rule.changesValueBy) * rule.amount * (volumeM3 / rule.perVolumeM3);
  notes.push(`Dosis calculada para ${direction > 0 ? 'subir' : 'bajar'} ${cappedDelta.toFixed(1)} unidades de pH.`);

  return {
    productId: input.product.id,
    productName: input.product.genericName,
    targetParameter: 'ph',
    currentValue: input.currentPh,
    targetValue: input.targetPh,
    delta: direction * cappedDelta,
    theoreticalAmount: Math.round(amount),
    unit: rule.amountUnit,
    notes,
  };
}

