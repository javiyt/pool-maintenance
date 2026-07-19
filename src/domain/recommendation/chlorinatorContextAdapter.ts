import {
  getChlorinatorCapabilities,
  getCurrentProductionGramsPerHour,
  getChlorinatorOutputControl,
} from '../saltChlorinator';
import type {
  ChlorinatorCapabilities,
  ChlorinatorIntervalOperation,
  SaltChlorinatorConfig,
} from '../saltChlorinator';

export interface LegacyChlorinatorRecommendationContext {
  outputPercent?: number;
  outputPercentProvenance?: 'configured-percentage' | 'legacy-assumed-nominal-output';
  outputPercentRegulable: boolean;
  runtimeHours?: number;
  nominalProductionGramsPerHour?: number;
  boostMultiplier?: number;
  boostMultiplierProvenance?: 'manufacturer-known' | 'user-configured' | 'historically-estimated';
  capabilities: ChlorinatorCapabilities;
}

export class ChlorinatorRecommendationContextAdapter {
  from(
    chlorinator: SaltChlorinatorConfig,
    operation?: ChlorinatorIntervalOperation,
  ): LegacyChlorinatorRecommendationContext {
    const capabilities = getChlorinatorCapabilities(chlorinator);
    const outputControl = getChlorinatorOutputControl(chlorinator);
    const runtimeHours = operation?.normalOperation?.actualRuntimeMinutes !== undefined
      ? operation.normalOperation.actualRuntimeMinutes / 60
      : operation?.normalOperation?.runtimeHours ?? chlorinator.filtrationHoursPerDay;
    const nominalProductionGramsPerHour = capabilities.nominalOutputGramsPerHour ??
      getCurrentProductionGramsPerHour(chlorinator);
    const boostMultiplier = operation?.boostOperation?.outputKnowledge === 'manufacturer-known' ||
      operation?.boostOperation?.outputKnowledge === 'user-configured' ||
      operation?.boostOperation?.outputKnowledge === 'historically-estimated'
      ? operation.boostOperation.outputMultiplier
      : undefined;

    if (outputControl.kind === 'continuous-percentage') {
      return {
        outputPercent: operation?.normalOperation?.averageOutputPercent ??
          operation?.normalOperation?.outputPercent ??
          chlorinator.currentOutputPercent,
        outputPercentProvenance: 'configured-percentage',
        outputPercentRegulable: true,
        runtimeHours,
        nominalProductionGramsPerHour,
        boostMultiplier,
        boostMultiplierProvenance: boostMultiplier !== undefined
          ? operation?.boostOperation?.outputKnowledge as LegacyChlorinatorRecommendationContext['boostMultiplierProvenance']
          : undefined,
        capabilities,
      };
    }

    return {
      outputPercent: requiresNominalLegacyPercent(capabilities) ? 100 : undefined,
      outputPercentProvenance: requiresNominalLegacyPercent(capabilities)
        ? 'legacy-assumed-nominal-output'
        : undefined,
      outputPercentRegulable: false,
      runtimeHours,
      nominalProductionGramsPerHour,
      boostMultiplier,
      boostMultiplierProvenance: boostMultiplier !== undefined
        ? operation?.boostOperation?.outputKnowledge as LegacyChlorinatorRecommendationContext['boostMultiplierProvenance']
        : undefined,
      capabilities,
    };
  }
}

function requiresNominalLegacyPercent(capabilities: ChlorinatorCapabilities): boolean {
  return capabilities.controlType === 'fixed-output-runtime' &&
    capabilities.nominalOutputGramsPerHour !== undefined;
}
