import { evaluateActionOutcomes } from '../actionOutcomeEvaluator';
import type { ActionOutcome } from '../actionOutcomeEvaluator';
import type { MaintenanceAction } from '../actions';
import { getTargetRange, TARGET_RANGES } from '../chemistry';
import type { Measurement } from '../measurement';
import type { PoolSettings } from '../settings';
import { analyzeTrends } from '../trendAnalysis';
import { DIAGNOSIS_ENGINE_VERSION } from '../shared/version';
import type { MeasurementField } from '../shared/measurementField';
import type { Diagnosis, DiagnosisSeverity, DiagnosisStatus } from './diagnosis';
import type { DiagnosisCode } from './diagnosisCode';
import type { DiagnosisContext, DiagnosisEngineConfig, PersistencePolicy } from './diagnosisContext';
import { DEFAULT_DIAGNOSIS_CONFIG } from './diagnosisContext';
import type { AlternativeExplanation, DiagnosisEvidence, MissingInput } from './diagnosisEvidence';
import { calculateDiagnosisConfidence } from './diagnosisConfidenceCalculator';
import { resolveDiagnoses } from './diagnosisResolver';

export interface DiagnosisEngineInput {
  settings: PoolSettings;
  measurements: Measurement[];
  actions?: MaintenanceAction[];
  outcomes?: ActionOutcome[];
  config?: Partial<DiagnosisEngineConfig>;
}

export interface DiagnosisEngineResult {
  diagnoses: Diagnosis[];
  evaluatedAt?: string;
  version: string;
  ruleOrder: string[];
}

type DiagnosisDraft = {
  code: DiagnosisCode;
  status: DiagnosisStatus;
  severity: DiagnosisSeverity;
  relatedFields: MeasurementField[];
  evidence: DiagnosisEvidence[];
  contradictoryEvidence?: DiagnosisEvidence[];
  alternativeExplanations?: AlternativeExplanation[];
  sourceMeasurementIds?: string[];
  sourceActionIds?: string[];
  sourceOutcomeIds?: string[];
  sourceContextIds?: string[];
  missingInputs?: MissingInput[];
  firstObservedAt?: string;
  lastObservedAt?: string;
  occurrenceCount?: number;
  persistence?: Diagnosis['persistence'];
  ruleIds: string[];
};

const RULE_ORDER = [
  'atomic-value-diagnoses',
  'trend-diagnoses',
  'persistence-diagnoses',
  'action-outcome-diagnoses',
  'composite-diagnoses',
];

export function runDiagnosisEngine(input: DiagnosisEngineInput): DiagnosisEngineResult {
  const measurements = [...input.measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const latest = measurements[measurements.length - 1];
  const actions = input.actions ?? [];
  const outcomes = input.outcomes ?? evaluateActionOutcomes(measurements, actions);
  const config = mergeConfig(input.config);

  if (!latest) {
    return {
      diagnoses: [],
      version: DIAGNOSIS_ENGINE_VERSION,
      ruleOrder: RULE_ORDER,
    };
  }

  const context: DiagnosisContext = {
    settings: input.settings,
    measurements,
    actions,
    outcomes,
    ranges: {
      ph: TARGET_RANGES.ph,
      fac: getTargetRange('fac', input.settings.poolType),
      salt: TARGET_RANGES.salt,
      orp: TARGET_RANGES.orp,
    },
    config,
  };

  const drafts: DiagnosisDraft[] = [
    ...buildAtomicDiagnoses(context, latest),
  ];
  drafts.push(...buildTrendDiagnoses(context, latest));
  drafts.push(...buildPersistenceDiagnoses(context, latest));
  drafts.push(...buildActionOutcomeDiagnoses(context, latest));
  drafts.push(...buildCompositeDiagnoses(context, latest, materializeDrafts(drafts, latest)));

  return {
    diagnoses: resolveDiagnoses(materializeDrafts(drafts, latest)),
    evaluatedAt: latest.measuredAt,
    version: DIAGNOSIS_ENGINE_VERSION,
    ruleOrder: RULE_ORDER,
  };
}

function buildAtomicDiagnoses(context: DiagnosisContext, latest: Measurement): DiagnosisDraft[] {
  const drafts: DiagnosisDraft[] = [];
  const { ph, fac, salt, orp } = context.ranges;

  drafts.push(valueDiagnosis({
    code: latest.ph < ph.min ? 'PH_LOW' : latest.ph > ph.max ? 'PH_HIGH' : 'PH_IN_RANGE',
    severity: latest.ph < ph.min || latest.ph > ph.max ? 'medium' : 'informational',
    field: 'ph',
    observedValue: latest.ph,
    expectedRange: ph,
    latest,
    ruleId: 'atomic.ph.range',
  }));

  const facCode: DiagnosisCode = latest.fac <= fac.min * 0.25
    ? 'FAC_CRITICALLY_LOW'
    : latest.fac < fac.min * 0.5
      ? 'FAC_VERY_LOW'
      : latest.fac < fac.min
        ? 'FAC_LOW'
        : 'FAC_IN_RANGE';
  const facSeverity: DiagnosisSeverity = facCode === 'FAC_CRITICALLY_LOW'
    ? 'critical'
    : facCode === 'FAC_VERY_LOW'
      ? 'high'
      : facCode === 'FAC_LOW'
        ? 'medium'
        : 'informational';
  drafts.push(valueDiagnosis({
    code: facCode,
    severity: facSeverity,
    field: 'fac',
    observedValue: latest.fac,
    expectedRange: fac,
    latest,
    ruleId: 'atomic.fac.range',
  }));

  if (latest.orp < 600) {
    drafts.push(valueDiagnosis({
      code: 'ORP_VERY_LOW',
      severity: 'high',
      field: 'orp',
      observedValue: latest.orp,
      expectedRange: orp,
      latest,
      ruleId: 'atomic.orp.very-low',
    }));
  } else if (latest.orp < orp.min) {
    drafts.push(valueDiagnosis({
      code: 'ORP_LOW',
      severity: 'medium',
      field: 'orp',
      observedValue: latest.orp,
      expectedRange: orp,
      latest,
      ruleId: 'atomic.orp.low',
    }));
  }

  if (context.settings.poolType === 'saltwater') {
    if (latest.salt < salt.min) {
      drafts.push(valueDiagnosis({
        code: 'SALT_LOW',
        severity: 'medium',
        field: 'salt',
        observedValue: latest.salt,
        expectedRange: salt,
        latest,
        ruleId: 'atomic.salt.low',
      }));
    } else if (latest.salt > salt.max) {
      drafts.push(valueDiagnosis({
        code: 'SALT_HIGH',
        severity: 'medium',
        field: 'salt',
        observedValue: latest.salt,
        expectedRange: salt,
        latest,
        ruleId: 'atomic.salt.high',
      }));
    }
  }

  if (latest.context?.visibleAlgae) {
    drafts.push(contextDiagnosis('VISIBLE_ALGAE', 'high', 'context.visible-algae', latest, 'visibleAlgae'));
  }
  if (latest.context?.waterClarity === 'cloudy') {
    drafts.push(contextDiagnosis('WATER_CLOUDY', 'medium', 'context.water-cloudy', latest, 'waterClarity'));
  }
  if ((latest.context?.waterAddedLiters ?? 0) > 0) {
    drafts.push(contextDiagnosis('RECENT_REFILL', 'informational', 'context.recent-refill', latest, 'waterAddedLiters'));
  }
  if (latest.context?.batherLoad === 'high' || latest.context?.sunlight === 'high') {
    drafts.push(contextDiagnosis('HIGH_CHLORINE_DEMAND_SUSPECTED', 'medium', 'context.high-demand', latest, latest.context.batherLoad === 'high' ? 'batherLoad' : 'sunlight'));
  }
  if (!latest.context) {
    drafts.push({
      code: 'INSUFFICIENT_CONTEXT',
      status: 'suspected',
      severity: 'informational',
      relatedFields: [],
      evidence: [{ type: 'context', code: 'CONTEXT_MISSING', measurementId: latest.id, weight: 0.25 }],
      missingInputs: [{ code: 'MEASUREMENT_CONTEXT', requiredFor: 'context-sensitive-diagnosis' }],
      ruleIds: ['atomic.context.missing'],
    });
  }

  drafts.push(missingInputDiagnosis('CYA_UNKNOWN', 'fac', latest, 'manual.cya.unknown', 'cyanuric-acid'));
  drafts.push(missingInputDiagnosis('ALKALINITY_UNKNOWN', 'ph', latest, 'manual.alkalinity.unknown', 'total-alkalinity'));

  return drafts;
}

function buildTrendDiagnoses(context: DiagnosisContext, latest: Measurement): DiagnosisDraft[] {
  const trends = analyzeTrends(context.measurements);
  const drafts: DiagnosisDraft[] = [];
  const facTrend = trends.find((trend) => trend.field === 'fac');
  if (facTrend?.direction === 'falling' && facTrend.severity !== 'info') {
    drafts.push({
      code: 'FAC_DECLINING',
      status: 'detected',
      severity: facTrend.severity === 'high' ? 'high' : 'medium',
      relatedFields: ['fac'],
      evidence: [{
        type: 'trend',
        code: 'FAC_TREND_FALLING',
        field: 'fac',
        observedValue: facTrend.latestValue,
        measurementId: latest.id,
        weight: 0.35,
      }],
      sourceMeasurementIds: context.measurements.slice(-3).map((m) => m.id),
      ruleIds: ['trend.fac.declining'],
    });
  } else if (facTrend?.direction === 'stable') {
    drafts.push({
      code: 'STABLE_TREND',
      status: 'detected',
      severity: 'informational',
      relatedFields: ['fac'],
      evidence: [{ type: 'trend', code: 'FAC_TREND_STABLE', field: 'fac', measurementId: latest.id, weight: 0.2 }],
      sourceMeasurementIds: context.measurements.slice(-3).map((m) => m.id),
      ruleIds: ['trend.fac.stable'],
    });
  }
  return drafts;
}

function buildPersistenceDiagnoses(context: DiagnosisContext, latest: Measurement): DiagnosisDraft[] {
  const lowFacSeries = collectConsecutiveLowFac(context.measurements, context.ranges.fac.min, context.config.persistence);
  if (!lowFacSeries.valid) {
    return lowFacSeries.reason
      ? [{
          code: 'INSUFFICIENT_EVIDENCE',
          status: 'inconclusive',
          severity: 'informational',
          relatedFields: ['fac'],
          evidence: [{ type: 'persistence', code: lowFacSeries.reason, field: 'fac', measurementId: latest.id, weight: 0.2 }],
          sourceMeasurementIds: lowFacSeries.measurements.map((m) => m.id),
          ruleIds: ['persistence.fac.insufficient-evidence'],
        }]
      : [];
  }

  const failedRelevantActions = context.outcomes.filter((outcome) => {
    const action = context.actions.find((item) => item.id === outcome.actionId);
    return actionAffectsChlorination(action) &&
      (outcome.effectiveness === 'ineffective' || outcome.effectiveness === 'unexpected' || outcome.effectiveness === 'inconclusive');
  }).length;

  return [{
    code: 'FAC_PERSISTENTLY_LOW',
    status: 'detected',
    severity: 'high',
    relatedFields: ['fac'],
    evidence: [
      {
        type: 'persistence',
        code: 'FAC_CONSECUTIVE_LOW',
        field: 'fac',
        observedValue: lowFacSeries.measurements.length,
        expectedRange: { min: context.config.persistence.minimumConsecutiveMeasurements },
        measurementId: latest.id,
        weight: 0.4,
      },
      {
        type: 'persistence',
        code: 'FAC_LOW_DURATION',
        field: 'fac',
        observedValue: lowFacSeries.durationHours,
        expectedRange: { min: context.config.persistence.minimumDurationHours, unit: 'h' },
        measurementId: latest.id,
        weight: 0.25,
      },
    ],
    sourceMeasurementIds: lowFacSeries.measurements.map((m) => m.id),
    sourceActionIds: context.actions.filter(actionAffectsChlorination).map((action) => action.id),
    sourceOutcomeIds: context.outcomes.filter((outcome) => actionAffectsChlorination(context.actions.find((action) => action.id === outcome.actionId))).map((outcome) => `outcome:${outcome.actionId}`),
    firstObservedAt: lowFacSeries.measurements[0]?.measuredAt,
    occurrenceCount: lowFacSeries.measurements.length,
    persistence: {
      durationHours: lowFacSeries.durationHours,
      consecutiveMeasurements: lowFacSeries.measurements.length,
      failedRelevantActions,
    },
    ruleIds: ['persistence.fac.persistently-low'],
  }];
}

function buildActionOutcomeDiagnoses(context: DiagnosisContext, latest: Measurement): DiagnosisDraft[] {
  const failedChlorination = context.outcomes.filter((outcome) => {
    const action = context.actions.find((item) => item.id === outcome.actionId);
    return actionAffectsChlorination(action) &&
      (outcome.effectiveness === 'ineffective' || outcome.effectiveness === 'unexpected' || outcome.effectiveness === 'inconclusive') &&
      (outcome.changes.fac ?? 0) <= context.config.instrumentPrecision.fac;
  });

  const drafts: DiagnosisDraft[] = [];
  if (failedChlorination.length > 0) {
    drafts.push({
      code: 'FAC_NOT_RESPONDING_TO_CHLORINATION',
      status: 'detected',
      severity: 'high',
      relatedFields: ['fac', 'orp'],
      evidence: failedChlorination.map((outcome) => ({
        type: 'action-outcome',
        code: 'CHLORINATION_NO_OBSERVABLE_RESPONSE',
        field: 'fac',
        observedValue: outcome.changes.fac ?? 0,
        actionId: outcome.actionId,
        outcomeId: `outcome:${outcome.actionId}`,
        weight: 0.35,
      })),
      sourceActionIds: failedChlorination.map((outcome) => outcome.actionId),
      sourceOutcomeIds: failedChlorination.map((outcome) => `outcome:${outcome.actionId}`),
      occurrenceCount: failedChlorination.length,
      ruleIds: ['actions.fac.not-responding-to-chlorination'],
    });
  }

  const pending = context.actions.filter((action) =>
    actionAffectsChlorination(action) &&
    !context.outcomes.some((outcome) => outcome.actionId === action.id) &&
    action.performedAt < latest.measuredAt,
  );
  if (pending.length > 0) {
    drafts.push({
      code: 'ACTION_AWAITING_RETEST',
      status: 'suspected',
      severity: 'informational',
      relatedFields: ['fac'],
      evidence: pending.map((action) => ({
        type: 'action-outcome',
        code: 'ACTION_HAS_NO_OUTCOME_YET',
        actionId: action.id,
        measurementId: latest.id,
        weight: 0.15,
      })),
      sourceActionIds: pending.map((action) => action.id),
      ruleIds: ['actions.awaiting-retest'],
    });
  }

  return drafts;
}

function buildCompositeDiagnoses(
  context: DiagnosisContext,
  latest: Measurement,
  diagnoses: Diagnosis[],
): DiagnosisDraft[] {
  const drafts: DiagnosisDraft[] = [];
  const has = (code: DiagnosisCode) => diagnoses.some((diagnosis) => diagnosis.code === code);

  if ((has('FAC_CRITICALLY_LOW') || has('FAC_VERY_LOW')) && has('ORP_VERY_LOW') && has('PH_IN_RANGE')) {
    drafts.push({
      code: 'SANITATION_COMPROMISED',
      status: 'detected',
      severity: 'critical',
      relatedFields: ['fac', 'orp', 'ph'],
      evidence: [
        { type: 'derived', code: 'FAC_LOW_AND_ORP_VERY_LOW', field: 'fac', measurementId: latest.id, weight: 0.45 },
        { type: 'derived', code: 'PH_DOES_NOT_EXPLAIN_ORP_LOW', field: 'ph', measurementId: latest.id, weight: 0.2 },
      ],
      sourceMeasurementIds: [latest.id],
      ruleIds: ['composite.sanitation-compromised'],
    });
  }

  const highOutputEvidence = latest.context?.chlorinatorOutputPercent !== undefined &&
    latest.context.chlorinatorOutputPercent >= 80;
  const highOutputAction = context.actions.some((action) =>
    action.kind === 'chlorinator' &&
    (action.chlorinator?.newOutputPercent ?? 0) >= 80,
  );
  if (
    has('FAC_PERSISTENTLY_LOW') &&
    has('FAC_NOT_RESPONDING_TO_CHLORINATION') &&
    (highOutputEvidence || highOutputAction || (context.settings.saltChlorinator?.currentOutputPercent ?? 0) >= 80)
  ) {
    drafts.push({
      code: 'CHLORINATOR_UNDERPERFORMANCE_SUSPECTED',
      status: 'suspected',
      severity: 'high',
      relatedFields: ['fac', 'orp', 'salt'],
      evidence: [
        { type: 'derived', code: 'PERSISTENT_LOW_FAC_AFTER_CHLORINATOR_ATTEMPTS', field: 'fac', measurementId: latest.id, weight: 0.4 },
        { type: 'configuration', code: 'CHLORINATOR_HIGH_OUTPUT', field: 'fac', observedValue: context.settings.saltChlorinator?.currentOutputPercent ?? latest.context?.chlorinatorOutputPercent ?? 'action-history', weight: 0.25 },
      ],
      alternativeExplanations: [
        { code: 'HIGH_CHLORINE_DEMAND', weight: has('HIGH_CHLORINE_DEMAND_SUSPECTED') ? 0.3 : 0.1 },
        { code: 'CYA_UNKNOWN', weight: has('CYA_UNKNOWN') ? 0.25 : 0.05 },
      ],
      sourceMeasurementIds: [latest.id],
      sourceActionIds: context.actions.filter(actionAffectsChlorination).map((action) => action.id),
      sourceOutcomeIds: context.outcomes.filter((outcome) => actionAffectsChlorination(context.actions.find((action) => action.id === outcome.actionId))).map((outcome) => `outcome:${outcome.actionId}`),
      ruleIds: ['composite.chlorinator-underperformance'],
    });
  }

  return drafts;
}

function materializeDrafts(drafts: DiagnosisDraft[], latest: Measurement): Diagnosis[] {
  return drafts.map((draft) => {
    const contradictoryEvidence = draft.contradictoryEvidence ?? [];
    const alternativeExplanations = draft.alternativeExplanations ?? [];
    const missingInputs = draft.missingInputs ?? [];
    const sourceMeasurementIds = draft.sourceMeasurementIds ?? [
      ...new Set(draft.evidence.map((evidence) => evidence.measurementId).filter((id): id is string => Boolean(id))),
    ];
    const sourceActionIds = draft.sourceActionIds ?? [
      ...new Set(draft.evidence.map((evidence) => evidence.actionId).filter((id): id is string => Boolean(id))),
    ];
    const sourceOutcomeIds = draft.sourceOutcomeIds ?? [
      ...new Set(draft.evidence.map((evidence) => evidence.outcomeId).filter((id): id is string => Boolean(id))),
    ];
    const sourceContextIds = draft.sourceContextIds ?? [
      ...new Set(draft.evidence.map((evidence) => evidence.contextId).filter((id): id is string => Boolean(id))),
    ];
    return {
      id: `${draft.code.toLowerCase()}-${latest.id}`,
      code: draft.code,
      detectedAt: latest.measuredAt,
      measurementId: latest.id,
      status: draft.status,
      severity: draft.severity,
      confidence: calculateDiagnosisConfidence({
        evidence: draft.evidence,
        contradictoryEvidence,
        missingInputCount: missingInputs.length,
        alternativeExplanationCount: alternativeExplanations.length,
      }),
      relatedFields: draft.relatedFields,
      evidence: draft.evidence,
      contradictoryEvidence,
      alternativeExplanations,
      sourceMeasurementIds,
      sourceActionIds,
      sourceOutcomeIds,
      sourceContextIds,
      missingInputs,
      firstObservedAt: draft.firstObservedAt,
      lastObservedAt: draft.lastObservedAt ?? latest.measuredAt,
      occurrenceCount: draft.occurrenceCount ?? 1,
      persistence: draft.persistence,
      ruleIds: draft.ruleIds,
      version: DIAGNOSIS_ENGINE_VERSION,
    };
  });
}

function valueDiagnosis(input: {
  code: DiagnosisCode;
  severity: DiagnosisSeverity;
  field: MeasurementField;
  observedValue: number;
  expectedRange: { min: number; max: number; unit: string };
  latest: Measurement;
  ruleId: string;
}): DiagnosisDraft {
  return {
    code: input.code,
    status: input.severity === 'informational' ? 'detected' : 'detected',
    severity: input.severity,
    relatedFields: [input.field],
    evidence: [{
      type: 'measurement',
      code: `${input.field.toUpperCase()}_CURRENT_VALUE`,
      field: input.field,
      observedValue: input.observedValue,
      expectedRange: {
        min: input.expectedRange.min,
        max: input.expectedRange.max,
        unit: input.expectedRange.unit,
      },
      measurementId: input.latest.id,
      weight: input.severity === 'informational' ? 0.3 : 0.45,
    }],
    sourceMeasurementIds: [input.latest.id],
    ruleIds: [input.ruleId],
  };
}

function contextDiagnosis(
  code: DiagnosisCode,
  severity: DiagnosisSeverity,
  evidenceCode: string,
  latest: Measurement,
  contextField: string,
): DiagnosisDraft {
  return {
    code,
    status: 'detected',
    severity,
    relatedFields: contextField === 'waterClarity' || contextField === 'visibleAlgae' ? ['fac', 'orp'] : ['fac'],
    evidence: [{
      type: 'context',
      code: evidenceCode,
      observedValue: latest.context?.[contextField as keyof NonNullable<Measurement['context']>] as string | number | boolean | undefined,
      measurementId: latest.id,
      contextId: `${latest.id}:context`,
      weight: severity === 'high' ? 0.4 : 0.25,
    }],
    sourceMeasurementIds: [latest.id],
    sourceContextIds: [`${latest.id}:context`],
    ruleIds: [evidenceCode],
  };
}

function missingInputDiagnosis(
  code: DiagnosisCode,
  field: MeasurementField,
  latest: Measurement,
  ruleId: string,
  missingField: string,
): DiagnosisDraft {
  return {
    code,
    status: 'inconclusive',
    severity: 'informational',
    relatedFields: [field],
    evidence: [{ type: 'derived', code: `${missingField.toUpperCase()}_NOT_AVAILABLE`, field, measurementId: latest.id, weight: 0.25 }],
    missingInputs: [{ code: missingField.toUpperCase(), field: missingField, requiredFor: code }],
    sourceMeasurementIds: [latest.id],
    ruleIds: [ruleId],
  };
}

function collectConsecutiveLowFac(
  measurements: Measurement[],
  minFac: number,
  policy: PersistencePolicy,
): { valid: boolean; measurements: Measurement[]; durationHours: number; reason?: string } {
  const low: Measurement[] = [];
  for (let index = measurements.length - 1; index >= 0; index -= 1) {
    const measurement = measurements[index];
    if (measurement.fac >= minFac) break;
    low.unshift(measurement);
  }
  if (low.length === 0) return { valid: false, measurements: [], durationHours: 0 };
  if (low.length < policy.minimumConsecutiveMeasurements) {
    return { valid: false, measurements: low, durationHours: durationHours(low), reason: 'NOT_ENOUGH_CONSECUTIVE_LOW_MEASUREMENTS' };
  }
  if (hasInvalidSpacing(low, policy)) {
    return { valid: false, measurements: low, durationHours: durationHours(low), reason: 'MEASUREMENTS_TOO_CLOSE_OR_GAP_TOO_LARGE' };
  }
  const duration = durationHours(low);
  if (duration < policy.minimumDurationHours) {
    return { valid: false, measurements: low, durationHours: duration, reason: 'LOW_DURATION_TOO_SHORT' };
  }
  return { valid: true, measurements: low, durationHours: duration };
}

function hasInvalidSpacing(measurements: Measurement[], policy: PersistencePolicy): boolean {
  for (let index = 1; index < measurements.length; index += 1) {
    const gap = hoursBetween(measurements[index - 1].measuredAt, measurements[index].measuredAt);
    if (policy.minimumMeasurementSpacingHours !== undefined && gap < policy.minimumMeasurementSpacingHours) return true;
    if (policy.maximumGapHours !== undefined && gap > policy.maximumGapHours) return true;
  }
  return false;
}

function durationHours(measurements: Measurement[]): number {
  if (measurements.length < 2) return 0;
  return Math.round(hoursBetween(measurements[0].measuredAt, measurements[measurements.length - 1].measuredAt) * 10) / 10;
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function actionAffectsChlorination(action: MaintenanceAction | undefined): action is MaintenanceAction {
  return Boolean(action && (
    action.kind === 'chlorinator' ||
    action.kind === 'filtration' ||
    (action.kind === 'chemical' && action.chemical?.productType === 'chlorine-granules')
  ));
}

function mergeConfig(config: Partial<DiagnosisEngineConfig> | undefined): DiagnosisEngineConfig {
  return {
    persistence: {
      ...DEFAULT_DIAGNOSIS_CONFIG.persistence,
      ...config?.persistence,
    },
    instrumentPrecision: {
      ...DEFAULT_DIAGNOSIS_CONFIG.instrumentPrecision,
      ...config?.instrumentPrecision,
    },
  };
}
