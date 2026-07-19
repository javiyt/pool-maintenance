import type { MaintenanceAction } from './actions';
import { CATALOG, CHEMICAL_CATALOG_VERSION } from './chemicalCatalog';
import { getTargetRangeSnapshot, type TargetRangeSnapshot } from './chemistry';
import { evaluateActionOutcomes, type ActionOutcome, type AssessmentSnapshot } from './actionOutcomeEvaluator';
import type { Diagnosis } from './diagnosis/diagnosis';
import { runDiagnosisEngine } from './diagnosis/diagnosisEngine';
import { computeLearning, type LearnedAdjustment } from './historicalLearning';
import { estimateAlkalinityState, estimateCyanuricAcidState, ALGORITHM_VERSION, type LatentParameterEstimate } from './latentStateEstimator';
import type { FollowUp, ActionNote } from './followUp';
import type { Measurement, MeasurementContext } from './measurement';
import { runAssistant, type MaintenanceAssistantResult } from './maintenanceAssistant';
import type { PoolSettings } from './settings';
import { buildRecommendationSnapshot, type RecommendationSnapshot } from './recommendation/recommendationSnapshot';
import type { Recommendation } from './recommendation/recommendation';
import { runRecommendationEngine } from './recommendation/recommendationEngine';
import type { RecommendationPlan } from './recommendation/recommendationPlan';
import {
  APPLICATION_VERSION,
  DIAGNOSIS_ENGINE_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
  STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
} from './recommendation/versions';

export interface VersionedSnapshot {
  schemaVersion: number;
  capturedAt: string;
}

export interface MeasurementContextSnapshot extends VersionedSnapshot {
  measurementId: string;
  intervalStart?: string;
  intervalEnd: string;
  context: MeasurementContext;
  origins: Record<string, string>;
}

export interface DiagnosisSnapshot extends VersionedSnapshot {
  diagnosisId: string;
  diagnosisCode?: string;
  recommendationId: string;
  classification: {
    severity: string;
    status?: string;
    relatedFields: string[];
  };
  sourceMeasurementId?: string;
  targetRanges: TargetRangeSnapshot[];
  engineVersion: string;
}

export interface DerivedEstimateSnapshot extends VersionedSnapshot {
  estimateId: string;
  estimate: LatentParameterEstimate;
  inputMeasurementIds: string[];
  inputActionIds: string[];
  estimatorVersion: string;
}

export interface FollowUpSnapshot extends VersionedSnapshot {
  followUp: FollowUp;
  observationStartAt: string;
  preferredAt?: string;
  deadlineAt?: string;
  currentStatus: FollowUp['status'];
  transitionHistory: FollowUp['statusHistory'];
  completedByMeasurementId?: string;
  completedLate: boolean;
  atypical: boolean;
  incorrectlyRecorded: boolean;
  excludedFromLearning: boolean;
  unusualEvents: ActionNote[];
}

export interface ActionOutcomeSnapshot extends VersionedSnapshot {
  outcome: ActionOutcome;
  evaluatorVersion: string;
}

export interface UnusualEventSnapshot extends VersionedSnapshot {
  eventId: string;
  followUpId?: string;
  actionId?: string;
  event: ActionNote;
}

export interface LearningStateSnapshot extends VersionedSnapshot {
  learningEngineVersion: string;
  adjustments: LearnedAdjustment[];
  inputMeasurementIds: string[];
  inputActionIds: string[];
}

export interface ProductSnapshot extends VersionedSnapshot {
  productId: string;
  catalogVersion: string;
  product: unknown;
}

export interface AssessmentExportSnapshot extends VersionedSnapshot {
  status: MaintenanceAssistantResult['status'];
  summary: string;
  latestMeasurementId?: string;
  recommendationIds: string[];
  targetRanges: TargetRangeSnapshot[];
  engineVersions: {
    application: string;
    diagnosisEngine: string;
    recommendationEngine: string;
    structuredRecommendationEngine: string;
    outcomeEvaluator: string;
    chemicalCatalog: string;
  };
}

export interface ExportSnapshots {
  maintenanceActions: MaintenanceAction[];
  actionOutcomes: ActionOutcomeSnapshot[];
  diagnoses: Diagnosis[];
  recommendations: Recommendation[];
  recommendationPlans: RecommendationPlan[];
  historicalLearningState: LearningStateSnapshot;
  measurementContexts: MeasurementContextSnapshot[];
  assessmentSnapshots: AssessmentExportSnapshot[];
  diagnosisSnapshots: DiagnosisSnapshot[];
  recommendationSnapshots: RecommendationSnapshot[];
  derivedEstimateSnapshots: DerivedEstimateSnapshot[];
  followUpSnapshots: FollowUpSnapshot[];
  actionOutcomeSnapshots: ActionOutcomeSnapshot[];
  unusualEvents: UnusualEventSnapshot[];
  learningStateSnapshots: LearningStateSnapshot[];
  productSnapshots: ProductSnapshot[];
}

export function buildExportSnapshots(input: {
  measurements: Measurement[];
  actions: MaintenanceAction[];
  followUps: FollowUp[];
  settings: PoolSettings;
  capturedAt: string;
}): ExportSnapshots {
  const latest = [...input.measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const assistant = runAssistant(input.measurements, input.settings, input.actions);
  const outcomes = evaluateActionOutcomes(input.measurements, input.actions);
  const diagnosis = runDiagnosisEngine({
    settings: input.settings,
    measurements: input.measurements,
    actions: input.actions,
    outcomes,
  });
  const structuredRecommendation = runRecommendationEngine({
    settings: input.settings,
    diagnoses: diagnosis.diagnoses,
    generatedAt: diagnosis.evaluatedAt,
  });
  const learning = computeLearning(
    input.measurements,
    input.actions,
    input.settings,
    input.settings.historicalLearning,
  );

  const actionOutcomeSnapshots = outcomes.map((outcome) => ({
    schemaVersion: 1,
    capturedAt: input.capturedAt,
    outcome,
    evaluatorVersion: outcome.evaluatorVersion,
  }));
  const historicalLearningState = {
    schemaVersion: 1,
    capturedAt: input.capturedAt,
    learningEngineVersion: '1.0.0',
    adjustments: learning,
    inputMeasurementIds: input.measurements.map((m) => m.id),
    inputActionIds: input.actions.map((a) => a.id),
  };

  return {
    maintenanceActions: input.actions,
    actionOutcomes: actionOutcomeSnapshots,
    diagnoses: diagnosis.diagnoses,
    recommendations: structuredRecommendation.recommendations,
    recommendationPlans: structuredRecommendation.plans,
    historicalLearningState,
    measurementContexts: buildMeasurementContextSnapshots(input.measurements, input.capturedAt),
    assessmentSnapshots: latest
      ? [{
          schemaVersion: 1,
          capturedAt: input.capturedAt,
          status: assistant.status,
          summary: assistant.summary,
          latestMeasurementId: latest.id,
          recommendationIds: assistant.recommendations.map((rec) => rec.id),
          targetRanges: [
            getTargetRangeSnapshot('ph', input.settings.poolType),
            getTargetRangeSnapshot('fac', input.settings.poolType),
            getTargetRangeSnapshot('salt', input.settings.poolType),
            getTargetRangeSnapshot('orp', input.settings.poolType),
          ],
          engineVersions: {
            application: APPLICATION_VERSION,
            diagnosisEngine: DIAGNOSIS_ENGINE_VERSION,
            recommendationEngine: RECOMMENDATION_ENGINE_VERSION,
            structuredRecommendationEngine: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
            outcomeEvaluator: OUTCOME_EVALUATOR_VERSION,
            chemicalCatalog: CHEMICAL_CATALOG_VERSION,
          },
        }]
      : [],
    diagnosisSnapshots: diagnosis.diagnoses.map((diagnosis) => ({
      schemaVersion: 1,
      capturedAt: input.capturedAt,
      diagnosisId: diagnosis.id,
      diagnosisCode: diagnosis.code,
      recommendationId: '',
      classification: {
        severity: diagnosis.severity,
        status: diagnosis.status,
        relatedFields: diagnosis.relatedFields.map(String),
      },
      sourceMeasurementId: diagnosis.measurementId,
      targetRanges: diagnosis.relatedFields
        .map((field) => field === 'ph' || field === 'fac' || field === 'salt' || field === 'orp'
          ? getTargetRangeSnapshot(field, input.settings.poolType)
          : undefined)
        .filter((range): range is TargetRangeSnapshot => Boolean(range)),
      engineVersion: DIAGNOSIS_ENGINE_VERSION,
    })),
    recommendationSnapshots: assistant.recommendations.map((rec) =>
      buildRecommendationSnapshot({
        recommendation: rec,
        latestMeasurement: latest,
        settings: input.settings,
        capturedAt: new Date(input.capturedAt),
      }),
    ),
    derivedEstimateSnapshots: latest
      ? [
          buildDerivedEstimateSnapshot('alkalinity', estimateAlkalinityState(input.measurements, input.actions, input.settings), input),
          buildDerivedEstimateSnapshot('cyanuric-acid', estimateCyanuricAcidState(input.measurements, input.actions, input.settings), input),
        ]
      : [],
    followUpSnapshots: input.followUps.map((fu) => buildFollowUpSnapshot(fu, input.capturedAt)),
    actionOutcomeSnapshots,
    unusualEvents: buildUnusualEventSnapshots(input.actions, input.followUps, input.capturedAt),
    learningStateSnapshots: [historicalLearningState],
    productSnapshots: CATALOG.map((product) => ({
      schemaVersion: 1,
      capturedAt: input.capturedAt,
      productId: product.id,
      catalogVersion: CHEMICAL_CATALOG_VERSION,
      product,
    })),
  };
}

function buildMeasurementContextSnapshots(
  measurements: Measurement[],
  capturedAt: string,
): MeasurementContextSnapshot[] {
  const sorted = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return sorted
    .filter((measurement) => measurement.context)
    .map((measurement, index) => {
      const context = measurement.context!;
      const intervalStart = context.intervalStart ?? sorted[index - 1]?.measuredAt;
      const intervalEnd = context.intervalEnd ?? measurement.measuredAt;
      const defaultOrigin = context.source ?? 'user';
      const origins = Object.keys(context).reduce<Record<string, string>>((acc, field) => {
        acc[field] = context.fieldOrigins?.find((o) => o.field === field)?.origin ?? defaultOrigin;
        return acc;
      }, {});
      return {
        schemaVersion: 1,
        capturedAt,
        measurementId: measurement.id,
        intervalStart,
        intervalEnd,
        context: {
          ...context,
          intervalStart,
          intervalEnd,
          source: defaultOrigin,
        },
        origins,
      };
    });
}

function buildDerivedEstimateSnapshot(
  estimateId: string,
  estimate: LatentParameterEstimate,
  input: {
    measurements: Measurement[];
    actions: MaintenanceAction[];
    capturedAt: string;
  },
): DerivedEstimateSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: input.capturedAt,
    estimateId,
    estimate,
    inputMeasurementIds: input.measurements.map((m) => m.id),
    inputActionIds: input.actions.map((a) => a.id),
    estimatorVersion: ALGORITHM_VERSION,
  };
}

function buildFollowUpSnapshot(followUp: FollowUp, capturedAt: string): FollowUpSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    followUp,
    observationStartAt: followUp.createdAt,
    preferredAt: followUp.dueAt,
    deadlineAt: followUp.dueAt
      ? new Date(new Date(followUp.createdAt).getTime() + followUp.suggestedRetestDelay * 3 * 3_600_000).toISOString()
      : undefined,
    currentStatus: followUp.status,
    transitionHistory: followUp.statusHistory ?? [],
    completedByMeasurementId: followUp.evaluationMeasurementId,
    completedLate: followUp.status === 'completed-late',
    atypical: followUp.atypical,
    incorrectlyRecorded: followUp.incorrectlyRecorded,
    excludedFromLearning: followUp.excludedFromLearning,
    unusualEvents: followUp.unusualEventNotes,
  };
}

function buildUnusualEventSnapshots(
  actions: MaintenanceAction[],
  followUps: FollowUp[],
  capturedAt: string,
): UnusualEventSnapshot[] {
  const snapshots: UnusualEventSnapshot[] = [];
  for (const followUp of followUps) {
    followUp.unusualEventNotes.forEach((event, index) => {
      snapshots.push({
        schemaVersion: 1,
        capturedAt,
        eventId: `fu-${followUp.id}-${index}`,
        followUpId: followUp.id,
        actionId: followUp.actionId,
        event,
      });
    });
  }
  for (const action of actions) {
    action.unusualEventNotes?.forEach((event, index) => {
      snapshots.push({
        schemaVersion: 1,
        capturedAt,
        eventId: `act-${action.id}-${index}`,
        actionId: action.id,
        event,
      });
    });
  }
  return snapshots;
}

export type { AssessmentSnapshot };
