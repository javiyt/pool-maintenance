import { getTargetRange } from '../../chemistry';
import { getChlorinatorCapabilities } from '../../saltChlorinator';
import { calculateFacDose } from '../chemicalDoseCalculator';
import { STRUCTURED_RECOMMENDATION_ENGINE_VERSION } from '../../shared/version';
import type { Recommendation } from '../recommendation';
import type { RecommendationCode } from '../recommendationCode';
import type { RecommendationRule } from '../recommendationRule';
import type { RecommendationRuleContext } from '../recommendationRuleContext';

function baseRecommendation(
  context: RecommendationRuleContext,
  input: {
    code: RecommendationCode;
    sourceCodes: Parameters<RecommendationRuleContext['sourceIds']>[0];
    ruleId: string;
    category: Recommendation['category'];
    severity: Recommendation['severity'];
    priority: number;
    relatedFields: Recommendation['relatedFields'];
    explanationCodes: string[];
  },
): Recommendation {
  return {
    id: context.makeId(input.code),
    code: input.code,
    generatedAt: context.generatedAt,
    sourceDiagnosisIds: context.sourceIds(input.sourceCodes),
    generatedByRuleIds: [input.ruleId],
    category: input.category,
    severity: input.severity,
    priority: input.priority,
    state: 'active',
    relatedFields: input.relatedFields,
    dependencies: [],
    contraindications: [],
    safetyCodes: [],
    explanationCodes: input.explanationCodes,
    version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
    conflictResolutionCodes: [],
  };
}

export const restrictSwimmingRule: RecommendationRule = {
  id: 'rule.safety.restrict-swimming',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 1,
  requiredDiagnosisCodes: ['SANITATION_COMPROMISED'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('SANITATION_COMPROMISED'),
  generate: (context) => [{
    ...baseRecommendation(context, {
      code: 'RESTRICT_SWIMMING',
      sourceCodes: ['SANITATION_COMPROMISED'],
      ruleId: restrictSwimmingRule.id,
      category: 'safety',
      severity: 'critical',
      priority: 1,
      relatedFields: ['fac', 'orp'],
      explanationCodes: ['SANITATION_COMPROMISED_REQUIRES_SWIMMING_RESTRICTION'],
    }),
    safetyCodes: ['DO_NOT_SWIM_UNTIL_FAC_ORP_RETESTED'],
  }],
};

export const confirmFacManualRule: RecommendationRule = {
  id: 'rule.manual-test.confirm-fac',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 2,
  requiredDiagnosisCodes: ['FAC_CRITICALLY_LOW'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('FAC_CRITICALLY_LOW') || context.hasDiagnosis('SANITATION_COMPROMISED'),
  generate: (context) => [baseRecommendation(context, {
    code: 'MEASURE_FAC_MANUALLY',
    sourceCodes: ['FAC_CRITICALLY_LOW', 'SANITATION_COMPROMISED'],
    ruleId: confirmFacManualRule.id,
    category: 'manual-test',
    severity: context.hasDiagnosis('SANITATION_COMPROMISED') ? 'high' : 'medium',
    priority: 2,
    relatedFields: ['fac'],
    explanationCodes: ['CRITICAL_FAC_REQUIRES_MANUAL_CONFIRMATION'],
  })],
};

export const fastChlorineCorrectionRule: RecommendationRule = {
  id: 'rule.chemical.fast-chlorine-correction',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 3,
  requiredDiagnosisCodes: ['SANITATION_COMPROMISED'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('SANITATION_COMPROMISED'),
  generate: (context) => {
    const currentFac = context.numericEvidence('FAC_CRITICALLY_LOW', 'fac') ??
      context.numericEvidence('FAC_VERY_LOW', 'fac') ??
      context.numericEvidence('FAC_LOW', 'fac') ??
      0;
    const facRange = getTargetRange('fac', context.settings.poolType);
    const dose = calculateFacDose({
      productId: 'chlorine-granules',
      settings: context.settings,
      currentFac,
      targetFac: facRange.ideal,
      correctionType: 'rapid-correction',
    });
    return [{
      ...baseRecommendation(context, {
        code: 'APPLY_FAST_CHLORINE_CORRECTION',
        sourceCodes: ['SANITATION_COMPROMISED', 'FAC_CRITICALLY_LOW', 'ORP_VERY_LOW'],
        ruleId: fastChlorineCorrectionRule.id,
        category: 'chemical',
        severity: 'critical',
        priority: 3,
        relatedFields: ['fac', 'orp'],
        explanationCodes: ['FAST_CHLORINE_CORRECTION_FROM_DEFICIT_AND_CATALOG'],
      }),
      action: {
        type: 'chemical-dose',
        productId: 'chlorine-granules',
        amount: dose.theoreticalAmount,
        unit: dose.unit,
      },
      calculation: {
        input: {
          productId: 'chlorine-granules',
          currentFac,
          targetFac: facRange.ideal,
          poolVolume: context.settings.volume,
          poolVolumeUnit: context.settings.volumeUnit,
          correctionType: 'rapid-correction',
        },
        result: {
          amount: dose.theoreticalAmount,
          unit: dose.unit,
          notes: dose.notes,
        },
        notesCodes: ['NO_FIXED_SHOCK_DOSE', 'CATALOG_AVAILABLE_CHLORINE_USED'],
        engineVersion: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
      },
      dependencies: [{
        code: 'CONFIRM_FAC_MANUALLY',
        sourceDiagnosisId: context.getDiagnosis('FAC_CRITICALLY_LOW')?.id,
        blocksUntilResolved: false,
      }],
      safetyCodes: ['USE_PPE', 'DO_NOT_MIX_WITH_ACIDS', 'RETEST_BEFORE_SWIMMING'],
      followUp: {
        preferredAfterHours: 6,
        deadlineAfterHours: 24,
        measurementFields: ['fac', 'orp'],
      },
    }];
  },
};

export const retestFacOrpRule: RecommendationRule = {
  id: 'rule.monitoring.retest-fac-orp',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 4,
  requiredDiagnosisCodes: ['FAC_CRITICALLY_LOW', 'ORP_VERY_LOW'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('FAC_CRITICALLY_LOW') || context.hasDiagnosis('ORP_VERY_LOW'),
  generate: (context) => [baseRecommendation(context, {
    code: 'RETEST_FAC_AND_ORP',
    sourceCodes: ['FAC_CRITICALLY_LOW', 'ORP_VERY_LOW', 'SANITATION_COMPROMISED'],
    ruleId: retestFacOrpRule.id,
    category: 'monitoring',
    severity: 'high',
    priority: 4,
    relatedFields: ['fac', 'orp'],
    explanationCodes: ['RETEST_AFTER_CORRECTION_WINDOW'],
  })],
};

export const inspectChlorinatorRule: RecommendationRule = {
  id: 'rule.equipment.inspect-chlorinator',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 5,
  requiredDiagnosisCodes: ['CHLORINATOR_UNDERPERFORMANCE_SUSPECTED'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('CHLORINATOR_UNDERPERFORMANCE_SUSPECTED'),
  generate: (context) => [
    ['INSPECT_CHLORINATOR_CELL', 'CHECK_CHLORINATOR_CELL_FOR_SCALE'],
    ['CLEAN_CHLORINATOR_CELL', 'CLEAN_CELL_IF_SCALED'],
    ['VERIFY_CHLORINATOR_PRODUCTION', 'CONFIRM_CHLORINE_PRODUCTION'],
    ['CHECK_WATER_FLOW', 'CONFIRM_FLOW_AND_EQUIPMENT_ALARMS'],
  ].map(([code, explanation], index) => baseRecommendation(context, {
    code: code as RecommendationCode,
    sourceCodes: ['CHLORINATOR_UNDERPERFORMANCE_SUSPECTED', 'FAC_NOT_RESPONDING_TO_CHLORINATION'],
    ruleId: inspectChlorinatorRule.id,
    category: 'equipment',
    severity: 'high',
    priority: 5 + index,
    relatedFields: ['fac', 'orp', 'salt'],
    explanationCodes: [explanation],
  })),
};

export const cyaManualTestRule: RecommendationRule = {
  id: 'rule.manual-test.measure-cya',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 8,
  requiredDiagnosisCodes: ['CYA_UNKNOWN'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('CYA_UNKNOWN'),
  generate: (context) => [baseRecommendation(context, {
    code: 'MEASURE_CYA',
    sourceCodes: ['CYA_UNKNOWN', 'FAC_PERSISTENTLY_LOW', 'HIGH_CHLORINE_DEMAND_SUSPECTED'],
    ruleId: cyaManualTestRule.id,
    category: 'manual-test',
    severity: context.hasDiagnosis('FAC_PERSISTENTLY_LOW') ? 'high' : 'informational',
    priority: context.hasDiagnosis('FAC_PERSISTENTLY_LOW') ? 8 : 30,
    relatedFields: ['fac'],
    explanationCodes: ['CYA_UNKNOWN_LIMITS_CHLORINE_LOSS_DIAGNOSIS'],
  })],
};

export const totalChlorineManualTestRule: RecommendationRule = {
  id: 'rule.manual-test.measure-total-chlorine',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 9,
  requiredDiagnosisCodes: ['FAC_NOT_RESPONDING_TO_CHLORINATION'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('FAC_NOT_RESPONDING_TO_CHLORINATION'),
  generate: (context) => [baseRecommendation(context, {
    code: 'MEASURE_TOTAL_CHLORINE',
    sourceCodes: ['FAC_NOT_RESPONDING_TO_CHLORINATION'],
    ruleId: totalChlorineManualTestRule.id,
    category: 'manual-test',
    severity: 'high',
    priority: 9,
    relatedFields: ['fac'],
    explanationCodes: ['TOTAL_CHLORINE_HELPS_SEPARATE_COMBINED_CHLORINE'],
  })],
};

export const alkalinityManualTestRule: RecommendationRule = {
  id: 'rule.manual-test.measure-alkalinity',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 31,
  requiredDiagnosisCodes: ['ALKALINITY_UNKNOWN'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('ALKALINITY_UNKNOWN'),
  generate: (context) => [baseRecommendation(context, {
    code: 'MEASURE_TOTAL_ALKALINITY',
    sourceCodes: ['ALKALINITY_UNKNOWN'],
    ruleId: alkalinityManualTestRule.id,
    category: 'manual-test',
    severity: context.hasDiagnosis('PH_UNSTABLE') ? 'medium' : 'informational',
    priority: context.hasDiagnosis('PH_UNSTABLE') ? 15 : 31,
    relatedFields: ['ph'],
    explanationCodes: ['ALKALINITY_UNKNOWN_LIMITS_PH_STABILITY_DIAGNOSIS'],
  })],
};

export const dissolvedSolidsInvestigationRule: RecommendationRule = {
  id: 'rule.monitoring.ec-tds-investigation',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 32,
  requiredDiagnosisCodes: ['EC_TDS_ACCUMULATION_SUSPECTED'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('EC_TDS_ACCUMULATION_SUSPECTED'),
  generate: (context) => [baseRecommendation(context, {
    code: 'MEASURE_SATURATION_PARAMETERS',
    sourceCodes: ['EC_TDS_ACCUMULATION_SUSPECTED'],
    ruleId: dissolvedSolidsInvestigationRule.id,
    category: 'manual-test',
    severity: 'informational',
    priority: 32,
    relatedFields: ['ec', 'tds', 'salt'],
    explanationCodes: ['EC_TDS_CONTEXT_REQUESTS_SPECIFIC_MEASUREMENTS'],
  })].map((recommendation) => ({
    ...recommendation,
    followUp: {
      preferredAfterHours: 24,
      measurementFields: ['ec', 'tds', 'salt'],
    },
    decisionTrace: {
      determinantParameters: [],
      contextualParameters: ['ec', 'tds', 'salt'],
      requestedParameters: ['total-alkalinity', 'calcium-hardness', 'cya', 'product-history'],
      ignoredParameters: ['ec/tds-alone-for-chemical-selection'],
      derivedValues: context.getDiagnosis('EC_TDS_ACCUMULATION_SUSPECTED')?.evidence.some((item) => item.code === 'EC_PRIMARY_TDS_DERIVED_RISING') ? ['tds-from-ec'] : [],
      redundantValues: context.getDiagnosis('EC_TDS_ACCUMULATION_SUSPECTED')?.evidence.some((item) => item.code === 'EC_PRIMARY_TDS_DERIVED_RISING') ? ['tds'] : [],
    },
  })),
};

export const saltEcConsistencyRule: RecommendationRule = {
  id: 'rule.monitoring.repeat-salt-ec',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 18,
  requiredDiagnosisCodes: ['SALT_EC_INCONSISTENCY_SUSPECTED'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('SALT_EC_INCONSISTENCY_SUSPECTED'),
  generate: (context) => [baseRecommendation(context, {
    code: 'REPEAT_SALT_EC_MEASUREMENT',
    sourceCodes: ['SALT_EC_INCONSISTENCY_SUSPECTED'],
    ruleId: saltEcConsistencyRule.id,
    category: 'manual-test',
    severity: 'medium',
    priority: 18,
    relatedFields: ['salt', 'ec'],
    explanationCodes: ['SALT_EC_INCONSISTENCY_REQUIRES_RETEST_BEFORE_ADDING_SALT'],
  })],
};

export const pauseChemicalEscalationRule: RecommendationRule = {
  id: 'rule.monitoring.pause-chemical-escalation',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 7,
  requiredDiagnosisCodes: ['EC_TDS_DOSING_ESCALATION_RISK'],
  excludedDiagnosisCodes: [],
  matches: (context) => context.hasDiagnosis('EC_TDS_DOSING_ESCALATION_RISK'),
  generate: (context) => [baseRecommendation(context, {
    code: 'PAUSE_CHEMICAL_ESCALATION_RETEST',
    sourceCodes: ['EC_TDS_DOSING_ESCALATION_RISK'],
    ruleId: pauseChemicalEscalationRule.id,
    category: 'monitoring',
    severity: 'medium',
    priority: 7,
    relatedFields: ['ec', 'tds'],
    explanationCodes: ['RISING_EC_TDS_AFTER_CORRECTIONS_STOPS_AUTOMATIC_PRODUCT_ESCALATION'],
  })],
};

export const moderateChlorinatorRule: RecommendationRule = {
  id: 'rule.equipment.moderate-chlorinator-adjustment',
  version: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
  priority: 20,
  requiredDiagnosisCodes: ['FAC_LOW'],
  excludedDiagnosisCodes: ['SANITATION_COMPROMISED', 'FAC_NOT_RESPONDING_TO_CHLORINATION'],
  matches: (context) =>
    context.hasDiagnosis('FAC_LOW') &&
    !context.hasDiagnosis('SANITATION_COMPROMISED') &&
    !context.hasDiagnosis('FAC_NOT_RESPONDING_TO_CHLORINATION') &&
    context.settings.poolType === 'saltwater',
  generate: (context) => {
    const capabilities = context.settings.saltChlorinator
      ? getChlorinatorCapabilities(context.settings.saltChlorinator)
      : undefined;
    return chlorinatorRecommendationCodesForCapabilities(capabilities)
      .map((code, index) => baseRecommendation(context, {
        code,
        sourceCodes: ['FAC_LOW'],
        ruleId: moderateChlorinatorRule.id,
        category: 'equipment',
        severity: 'medium',
        priority: 20 + index,
        relatedFields: ['fac'],
        explanationCodes: ['MILD_LOW_FAC_CAN_USE_MODERATE_CHLORINATOR_ADJUSTMENT'],
      }));
  },
};

function chlorinatorRecommendationCodesForCapabilities(
  capabilities: ReturnType<typeof getChlorinatorCapabilities> | undefined,
): RecommendationCode[] {
  if (!capabilities) return ['IDENTIFY_CHLORINATOR_CAPABILITIES'];
  if (capabilities.supportsPercentageAdjustment) return ['ADJUST_CHLORINATOR_OUTPUT'];
  if (capabilities.supportsDiscreteLevels) return ['SET_CHLORINATOR_LEVEL'];
  if (capabilities.supportsAutomaticControl) {
    return ['REVIEW_CHLORINATOR_SETPOINT', 'CALIBRATE_CHLORINATOR_SENSOR'];
  }
  if (capabilities.supportsRuntimeAdjustment) return ['INCREASE_CHLORINATOR_RUNTIME'];
  return ['IDENTIFY_CHLORINATOR_CAPABILITIES'];
}

export const CORE_RECOMMENDATION_RULES: RecommendationRule[] = [
  restrictSwimmingRule,
  confirmFacManualRule,
  fastChlorineCorrectionRule,
  retestFacOrpRule,
  inspectChlorinatorRule,
  cyaManualTestRule,
  totalChlorineManualTestRule,
  alkalinityManualTestRule,
  dissolvedSolidsInvestigationRule,
  saltEcConsistencyRule,
  pauseChemicalEscalationRule,
  moderateChlorinatorRule,
];
