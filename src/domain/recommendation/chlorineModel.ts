import type { SaltChlorinatorConfig } from '../saltChlorinator';

export interface ChlorineProductionModel {
  theoreticalProductionGrams: number;
  grossFacIncreasePpm: number;
  demandReservePpm: number;
  expectedObservableFacIncreasePpm: number;
  notes: string[];
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function estimateChlorinatorFacModel(input: {
  deltaPpm: number;
  poolVolumeLiters: number;
  config: SaltChlorinatorConfig;
  hours: number;
  temperature?: number;
  batherLoad?: 'none' | 'low' | 'medium' | 'high';
  sunlight?: 'none' | 'low' | 'medium' | 'high';
}): ChlorineProductionModel {
  const volumeM3 = input.poolVolumeLiters / 1000;
  const outputFactor = input.config.currentOutputPercent / 100;
  const theoreticalProductionGrams = input.config.productionGramsPerHour * outputFactor * input.hours;
  const grossFacIncreasePpm = volumeM3 > 0 ? theoreticalProductionGrams / volumeM3 : 0;

  let demandReservePpm = 0.2;
  if (input.temperature !== undefined && input.temperature > 30) demandReservePpm += 0.3;
  if (input.batherLoad === 'medium') demandReservePpm += 0.2;
  if (input.batherLoad === 'high') demandReservePpm += 0.5;
  if (input.sunlight === 'medium') demandReservePpm += 0.2;
  if (input.sunlight === 'high') demandReservePpm += 0.4;

  const expectedObservableFacIncreasePpm = Math.max(0, grossFacIncreasePpm - demandReservePpm);

  return {
    theoreticalProductionGrams: round(theoreticalProductionGrams),
    grossFacIncreasePpm: round(grossFacIncreasePpm),
    demandReservePpm: round(demandReservePpm),
    expectedObservableFacIncreasePpm: round(expectedObservableFacIncreasePpm),
    notes: [
      `Producción teórica: ${round(theoreticalProductionGrams)} g de cloro.`,
      `Incremento bruto de FAC: ${round(grossFacIncreasePpm)} ppm.`,
      `Reserva por demanda estimada: ${round(demandReservePpm)} ppm.`,
      `Incremento observable esperado: ${round(expectedObservableFacIncreasePpm)} ppm.`,
    ],
  };
}

