import type { MaintenanceRecommendation } from '../domain/maintenanceAssistant';
import type { Measurement } from '../domain/measurement';
import type { PoolSettings } from '../domain/settings';
import {
  addAction,
  loadActions,
  saveActions,
} from '../domain/storage';
import {
  generateActionId,
  type ChemicalProductType,
  type MaintenanceAction,
  type MaintenanceActionAuditEntry,
  type MaintenanceActionDiscardReason,
  type MaintenanceActionKind,
  type MaintenanceActionStatus,
  type RecommendationIdentity,
} from '../domain/actions';
import { buildRecommendationSnapshot } from '../domain/recommendation/recommendationSnapshot';

const ACTIVE_POOL_ID = 'active-pool';

export interface DiscardMaintenanceActionCommand {
  actionId: string;
  reason: MaintenanceActionDiscardReason;
  notes?: string;
  expectedReviewAt?: string;
  expectedVersion: number;
}

export interface DiscardRecommendationCommand {
  recommendation: MaintenanceRecommendation;
  latestMeasurement: Measurement;
  settings: PoolSettings;
  reason: MaintenanceActionDiscardReason;
  notes?: string;
  expectedReviewAt?: string;
  discardedBy?: 'user' | 'professional' | 'import' | 'system';
  now?: Date;
}

export class DiscardMaintenanceActionUseCase {
  execute(command: DiscardMaintenanceActionCommand): Promise<MaintenanceAction> {
    return Promise.resolve(this.executeSync(command));
  }

  executeSync(command: DiscardMaintenanceActionCommand, now = new Date()): MaintenanceAction {
    assertValidDiscardReason(command.reason);
    assertReviewDateIsFuture(command.expectedReviewAt, now);

    const actions = loadActions();
    const action = actions.find((candidate) => candidate.id === command.actionId);
    if (!action) throw new Error('La acción no existe.');
    if ((action.version ?? 1) !== command.expectedVersion) throw new Error('La acción fue modificada por otro proceso.');
    if (!isDiscardableStatus(action.status ?? 'recommended')) {
      throw new Error('Esta acción no se puede descartar en su estado actual.');
    }

    const discardedAt = now.toISOString();
    const next: MaintenanceAction = {
      ...action,
      status: 'discarded',
      version: (action.version ?? 1) + 1,
      discard: {
        discardedAt,
        reason: command.reason,
        notes: command.notes?.trim() || undefined,
        discardedBy: 'user',
        expectedReviewAt: command.expectedReviewAt,
      },
      audit: [
        ...(action.audit ?? []),
        auditEntry(discardedAt, 'user', action.status ?? 'recommended', 'discarded', command.reason, command.notes),
      ],
    };

    saveActions(actions.map((candidate) => candidate.id === action.id ? next : candidate));
    return next;
  }
}

export function discardRecommendation(command: DiscardRecommendationCommand): MaintenanceAction {
  assertValidDiscardReason(command.reason);
  const now = command.now ?? new Date();
  assertReviewDateIsFuture(command.expectedReviewAt, now);

  const identity = buildRecommendationIdentity(command.recommendation, command.latestMeasurement);
  const existing = loadActions().find((action) =>
    action.status === 'discarded' && sameRecommendationIdentity(action.recommendationIdentity, identity),
  );
  if (existing) return existing;

  const discardedAt = now.toISOString();
  const action: MaintenanceAction = {
    id: generateActionId(),
    schemaVersion: 2,
    version: 1,
    status: 'discarded',
    performedAt: discardedAt,
    kind: recommendationToActionKind(command.recommendation),
    actionType: recommendationToActionKind(command.recommendation),
    category: recommendationCategory(command.recommendation),
    description: recommendationTitle(command.recommendation),
    relatedMeasurementId: command.latestMeasurement.id,
    relatedRecommendationId: command.recommendation.id,
    recommendationId: command.recommendation.id,
    recommendationIdentity: identity,
    recommendationSnapshot: buildRecommendationSnapshot({
      recommendation: command.recommendation,
      latestMeasurement: command.latestMeasurement,
      settings: command.settings,
      capturedAt: now,
    }),
    origin: 'recommendation',
    discard: {
      discardedAt,
      reason: command.reason,
      notes: command.notes?.trim() || undefined,
      discardedBy: command.discardedBy ?? 'user',
      expectedReviewAt: command.expectedReviewAt,
    },
    audit: [
      auditEntry(discardedAt, command.discardedBy ?? 'user', 'recommended', 'discarded', command.reason, command.notes),
    ],
    performedValuesProvenance: 'confirmed-from-recommendation',
    chemical: command.recommendation.kind === 'chemical'
      ? {
        productType: chemicalProductType(command.recommendation.chemicalProductId),
        mainComponent: command.recommendation.mainComponent,
        amount: command.recommendation.estimatedAmount,
        unit: command.recommendation.unit,
      }
      : undefined,
    chlorinator: command.recommendation.kind === 'equipment'
      ? {
        newOutputPercent: command.recommendation.suggestedOutputPercent,
        additionalHours: command.recommendation.suggestedAdditionalHours,
        newOutputLevelId: command.recommendation.suggestedOutputLevelId,
      }
      : undefined,
    filtration: command.recommendation.kind === 'filtration' && command.recommendation.suggestedFiltrationHours !== undefined
      ? { newHours: command.recommendation.suggestedFiltrationHours }
      : undefined,
  };

  addAction(action);
  return action;
}

export function reactivateDiscardedRecommendation(actionId: string, now = new Date()): MaintenanceAction {
  const actions = loadActions();
  const action = actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error('La acción no existe.');
  if (action.status !== 'discarded') throw new Error('Solo se pueden reactivar recomendaciones descartadas.');

  const at = now.toISOString();
  const next: MaintenanceAction = {
    ...action,
    status: 'recommended',
    version: (action.version ?? 1) + 1,
    audit: [
      ...(action.audit ?? []),
      auditEntry(at, 'user', 'discarded', 'recommended', undefined, 'Reactivación de recomendación descartada.'),
    ],
  };
  saveActions(actions.map((candidate) => candidate.id === action.id ? next : candidate));
  return next;
}

export function filterDiscardedRecommendations(
  recommendations: MaintenanceRecommendation[],
  actions: MaintenanceAction[],
  latestMeasurement?: Measurement,
): MaintenanceRecommendation[] {
  if (!latestMeasurement) return recommendations;
  const discarded = actions
    .filter((action) => action.status === 'discarded' && action.recommendationIdentity)
    .map((action) => action.recommendationIdentity!);
  if (discarded.length === 0) return recommendations;

  return recommendations.filter((recommendation) => {
    const identity = buildRecommendationIdentity(recommendation, latestMeasurement);
    return !discarded.some((candidate) => sameRecommendationIdentity(candidate, identity));
  });
}

export function buildRecommendationIdentity(
  recommendation: MaintenanceRecommendation,
  latestMeasurement: Measurement,
): RecommendationIdentity {
  return {
    poolId: ACTIVE_POOL_ID,
    sourceMeasurementId: latestMeasurement.id,
    recommendationType: recommendation.chemicalProductId
      ?? recommendation.recommendedChlorinatorAction
      ?? recommendation.diagnosisCode
      ?? recommendation.titleKey
      ?? recommendation.kind,
    targetParameter: recommendation.relatedFields[0] ? String(recommendation.relatedFields[0]) : undefined,
  };
}

export function sameRecommendationIdentity(
  a: RecommendationIdentity | undefined,
  b: RecommendationIdentity | undefined,
): boolean {
  if (!a || !b) return false;
  return a.poolId === b.poolId
    && a.sourceMeasurementId === b.sourceMeasurementId
    && a.recommendationType === b.recommendationType
    && a.targetParameter === b.targetParameter;
}

export function isDiscardableStatus(status: MaintenanceActionStatus): boolean {
  return status === 'recommended' || status === 'planned' || status === 'in-progress';
}

function auditEntry(
  at: string,
  actor: 'user' | 'professional' | 'import' | 'system',
  from: MaintenanceActionStatus,
  to: MaintenanceActionStatus,
  reason?: MaintenanceActionDiscardReason,
  notes?: string,
): MaintenanceActionAuditEntry {
  return {
    at,
    actor,
    from,
    to,
    reason,
    notes: notes?.trim() || undefined,
  };
}

function assertValidDiscardReason(reason: MaintenanceActionDiscardReason): void {
  const valid: MaintenanceActionDiscardReason[] = [
    'natural-evolution-expected',
    'not-needed-now',
    'measurement-uncertain',
    'retest-first',
    'alternative-action-applied',
    'professional-advice',
    'product-unavailable',
    'not-applicable-to-pool',
    'other',
  ];
  if (!valid.includes(reason)) throw new Error('El motivo de descarte no es válido.');
}

function assertReviewDateIsFuture(expectedReviewAt: string | undefined, now: Date): void {
  if (!expectedReviewAt) return;
  const reviewAt = new Date(expectedReviewAt).getTime();
  if (!Number.isFinite(reviewAt)) throw new Error('La fecha de revisión no es válida.');
  if (reviewAt <= now.getTime()) throw new Error('La fecha de revisión debe ser futura.');
}

function recommendationToActionKind(recommendation: MaintenanceRecommendation): MaintenanceActionKind {
  if (recommendation.kind === 'chemical') return 'chemical';
  if (recommendation.kind === 'equipment') return recommendation.equipmentName?.toLowerCase().includes('clorador') || recommendation.recommendedChlorinatorAction ? 'chlorinator' : 'equipment-maintenance';
  if (recommendation.kind === 'filtration') return 'filtration';
  if (recommendation.kind === 'manual-test' || recommendation.kind === 'retest') return 'manual-test';
  if (recommendation.kind === 'monitor' || recommendation.kind === 'warning') return 'inspection';
  return 'other';
}

function recommendationCategory(recommendation: MaintenanceRecommendation): MaintenanceAction['category'] {
  if (recommendation.kind === 'chemical') return 'chemical';
  if (recommendation.kind === 'equipment') return 'equipment';
  if (recommendation.kind === 'filtration') return 'filtration';
  if (recommendation.kind === 'manual-test' || recommendation.kind === 'retest') return 'measurement';
  if (recommendation.kind === 'monitor' || recommendation.kind === 'warning') return 'inspection';
  return 'custom';
}

function recommendationTitle(recommendation: MaintenanceRecommendation): string {
  return recommendation.title;
}

function chemicalProductType(productId: string | undefined): ChemicalProductType | undefined {
  if (!productId) return undefined;
  if (productId === 'ph-increaser-liquid') return 'ph-increaser';
  if (productId === 'ph-reducer-liquid') return 'ph-reducer';
  if (productId === 'chlorine-granules') return 'chlorine-granules';
  if (productId === 'pool-salt') return 'pool-salt';
  return productId as ChemicalProductType;
}
