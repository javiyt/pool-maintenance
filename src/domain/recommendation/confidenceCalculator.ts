import type { MaintenanceAction } from '../actions';
import type { Measurement } from '../measurement';

export interface ConfidenceResult {
  confidence: number;
  reasons: string[];
  externalVariableCount: number;
}

function clamp(value: number): number {
  return Math.max(0.1, Math.min(0.9, value));
}

function reduction(reason: string, amount: number): { reason: string; amount: number } {
  return { reason, amount };
}

export function calculateOutcomeConfidence(input: {
  action: MaintenanceAction;
  before: Measurement;
  after: Measurement;
  elapsedHours: number;
  preferredMaxHours: number;
  interveningActions: number;
  explicitlyLinkedMeasurement: boolean;
}): ConfidenceResult {
  const reductions: Array<{ reason: string; amount: number }> = [];

  if (!input.explicitlyLinkedMeasurement) {
    reductions.push(reduction('No hay medición enlazada explícitamente; se usa la más cercana.', 0.2));
  }

  if (input.interveningActions > 0) {
    reductions.push(reduction(`${input.interveningActions} acción(es) entre la medición previa y posterior.`, Math.min(input.interveningActions * 0.3, 0.6)));
  }

  if (input.elapsedHours > input.preferredMaxHours) {
    reductions.push(reduction('La medición está fuera de la ventana preferida.', 0.2));
  }

  const ctx = input.after.context;
  if (ctx) {
    if ((ctx.waterAddedLiters ?? 0) > 0) reductions.push(reduction('Hubo reposición de agua.', 0.2));
    if (ctx.rainSincePreviousMeasurement) reductions.push(reduction('Hubo lluvia desde la medición anterior.', 0.15));
    if (ctx.poolCovered === false) reductions.push(reduction('La cubierta estuvo abierta.', 0.05));
    if (ctx.batherLoad === 'medium') reductions.push(reduction('Carga de bañistas media.', 0.1));
    if (ctx.batherLoad === 'high') reductions.push(reduction('Carga de bañistas alta.', 0.2));
    if (ctx.sunlight === 'high') reductions.push(reduction('Radiación solar alta.', 0.15));
    if (ctx.backwashPerformed) reductions.push(reduction('Se realizó lavado/contralavado.', 0.15));
    if ((ctx.chlorinatorHoursSincePreviousMeasurement ?? 0) > 0 && input.action.kind !== 'chlorinator') {
      reductions.push(reduction('El clorador funcionó entre mediciones.', 0.1));
    }
    if ((ctx.filtrationHoursSincePreviousMeasurement ?? 0) > 0 && input.action.kind !== 'filtration') {
      reductions.push(reduction('Hubo filtración entre mediciones.', 0.05));
    }
  }

  if (input.after.temperature !== undefined && input.before.temperature !== undefined) {
    const deltaTemp = Math.abs(input.after.temperature - input.before.temperature);
    if (deltaTemp >= 3) reductions.push(reduction(`La temperatura cambió ${Math.round(deltaTemp * 10) / 10} °C.`, 0.1));
  }

  const totalReduction = reductions.reduce((sum, item) => sum + item.amount, 0);
  const confidence = Math.round(clamp(0.85 - totalReduction) * 100) / 100;

  return {
    confidence,
    reasons: reductions.map((item) => `${item.reason} Confianza -${Math.round(item.amount * 100)}%.`),
    externalVariableCount: reductions.length,
  };
}
