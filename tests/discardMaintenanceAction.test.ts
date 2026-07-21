import { beforeEach, describe, expect, it } from 'vitest';
import {
  DiscardMaintenanceActionUseCase,
  discardRecommendation,
  filterDiscardedRecommendations,
  reactivateDiscardedRecommendation,
} from '../src/application/discardMaintenanceAction';
import type { MaintenanceRecommendation } from '../src/domain/maintenanceAssistant';
import { runAssistant } from '../src/domain/maintenanceAssistant';
import type { MaintenanceAction } from '../src/domain/actions';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';
import {
  exportData,
  loadActions,
  parseImportData,
  saveActions,
  saveMeasurements,
  saveSettings,
} from '../src/domain/storage';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
});

describe('discardRecommendation', () => {
  it('persists a discarded recommendation with reason, note, review date, identity and audit', () => {
    const latest = measurement('m1', '2026-07-21T08:00:00.000Z');
    const settings = poolSettings();
    const reviewAt = '2026-07-22T08:00:00.000Z';

    const action = discardRecommendation({
      recommendation: phIncreaserRecommendation(),
      latestMeasurement: latest,
      settings,
      reason: 'natural-evolution-expected',
      notes: 'Piscina salina; el pH suele subir por sí solo.',
      expectedReviewAt: reviewAt,
      now: new Date('2026-07-21T09:20:00.000Z'),
    });

    expect(action.status).toBe('discarded');
    expect(action.discard?.reason).toBe('natural-evolution-expected');
    expect(action.discard?.notes).toBe('Piscina salina; el pH suele subir por sí solo.');
    expect(action.discard?.expectedReviewAt).toBe(reviewAt);
    expect(action.recommendationIdentity).toMatchObject({
      poolId: 'active-pool',
      sourceMeasurementId: 'm1',
      recommendationType: 'ph-increaser-liquid',
      targetParameter: 'ph',
    });
    expect(action.audit).toHaveLength(1);
    expect(loadActions()[0].status).toBe('discarded');
  });

  it('does not duplicate or reshow the same recommendation for the same source measurement', () => {
    const latest = measurement('m1', '2026-07-21T08:00:00.000Z');
    const settings = poolSettings();
    const rec = phIncreaserRecommendation();

    discardRecommendation({
      recommendation: rec,
      latestMeasurement: latest,
      settings,
      reason: 'not-needed-now',
      now: new Date('2026-07-21T09:20:00.000Z'),
    });
    discardRecommendation({
      recommendation: rec,
      latestMeasurement: latest,
      settings,
      reason: 'not-needed-now',
      now: new Date('2026-07-21T09:21:00.000Z'),
    });

    expect(loadActions()).toHaveLength(1);
    expect(filterDiscardedRecommendations([rec], loadActions(), latest)).toEqual([]);
  });

  it('allows the same recommendation after a new measurement', () => {
    const rec = phIncreaserRecommendation();
    const first = measurement('m1', '2026-07-21T08:00:00.000Z');
    const second = measurement('m2', '2026-07-22T08:00:00.000Z');

    discardRecommendation({
      recommendation: rec,
      latestMeasurement: first,
      settings: poolSettings(),
      reason: 'retest-first',
      now: new Date('2026-07-21T09:20:00.000Z'),
    });

    expect(filterDiscardedRecommendations([rec], loadActions(), second)).toEqual([rec]);
  });

  it('survives export and import with discard metadata', () => {
    saveSettings(poolSettings());
    saveMeasurements([measurement('m1', '2026-07-21T08:00:00.000Z')]);
    discardRecommendation({
      recommendation: phIncreaserRecommendation(),
      latestMeasurement: measurement('m1', '2026-07-21T08:00:00.000Z'),
      settings: poolSettings(),
      reason: 'professional-advice',
      notes: 'Esperar indicación del técnico.',
      now: new Date('2026-07-21T09:20:00.000Z'),
    });

    const parsed = parseImportData(JSON.stringify(exportData(new Date('2026-07-21T10:00:00.000Z'))));

    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].status).toBe('discarded');
    expect(parsed.actions[0].discard?.reason).toBe('professional-advice');
    expect(parsed.actions[0].discard?.notes).toBe('Esperar indicación del técnico.');
  });
});

describe('DiscardMaintenanceActionUseCase', () => {
  it('rejects completed and cancelled actions', () => {
    saveActions([
      actionWithStatus('completed'),
      actionWithStatus('cancelled', 'cancelled-action'),
    ]);
    const useCase = new DiscardMaintenanceActionUseCase();

    expect(() => useCase.executeSync({
      actionId: 'completed-action',
      reason: 'other',
      expectedVersion: 1,
    }, new Date('2026-07-21T09:20:00.000Z'))).toThrow('no se puede descartar');
    expect(() => useCase.executeSync({
      actionId: 'cancelled-action',
      reason: 'other',
      expectedVersion: 1,
    }, new Date('2026-07-21T09:20:00.000Z'))).toThrow('no se puede descartar');
  });

  it('reactivates a discarded recommendation while preserving discard audit', () => {
    const discarded = discardRecommendation({
      recommendation: phIncreaserRecommendation(),
      latestMeasurement: measurement('m1', '2026-07-21T08:00:00.000Z'),
      settings: poolSettings(),
      reason: 'measurement-uncertain',
      now: new Date('2026-07-21T09:20:00.000Z'),
    });

    const reactivated = reactivateDiscardedRecommendation(discarded.id, new Date('2026-07-21T09:30:00.000Z'));

    expect(reactivated.status).toBe('recommended');
    expect(reactivated.discard?.reason).toBe('measurement-uncertain');
    expect(reactivated.audit).toHaveLength(2);
  });
});

describe('saltwater pH recommendation regression', () => {
  it('prefers waiting and retesting for slightly low rising pH in saltwater pools', () => {
    const result = runAssistant([
      measurement('m1', '2026-07-20T08:00:00.000Z', { ph: 6.8 }),
      measurement('m2', '2026-07-21T08:00:00.000Z', { ph: 7.1 }),
    ], poolSettings({ poolType: 'saltwater' }));

    expect(result.recommendations.some((rec) => rec.chemicalProductId === 'ph-increaser-liquid')).toBe(false);
    expect(result.recommendations.some((rec) => rec.kind === 'retest' && rec.diagnosisCode === 'PH_LOW')).toBe(true);
  });

  it('keeps chemical correction for dangerously low pH in saltwater pools', () => {
    const result = runAssistant([
      measurement('m1', '2026-07-20T08:00:00.000Z', { ph: 6.2 }),
      measurement('m2', '2026-07-21T08:00:00.000Z', { ph: 6.5 }),
    ], poolSettings({ poolType: 'saltwater' }));

    expect(result.recommendations.some((rec) => rec.chemicalProductId === 'ph-increaser-liquid')).toBe(true);
  });

  it('keeps chemical correction when no rising trend exists', () => {
    const result = runAssistant([
      measurement('m1', '2026-07-20T08:00:00.000Z', { ph: 7.1 }),
    ], poolSettings({ poolType: 'saltwater' }));

    expect(result.recommendations.some((rec) => rec.chemicalProductId === 'ph-increaser-liquid')).toBe(true);
  });
});

function phIncreaserRecommendation(): MaintenanceRecommendation {
  return {
    id: 'rec-volatile',
    kind: 'chemical',
    severity: 'medium',
    title: 'Subir el pH',
    summary: 'El pH está bajo.',
    reason: 'El pH está por debajo del rango objetivo.',
    priority: 1,
    relatedFields: ['ph'],
    chemicalProductId: 'ph-increaser-liquid',
    estimatedAmount: 1000,
    unit: 'ml',
    calculationNotes: [],
    safetyNotes: [],
    followUpActions: [],
    state: 'actionable',
  };
}

function measurement(id: string, measuredAt: string, overrides: Partial<Measurement> = {}): Measurement {
  return {
    id,
    measuredAt,
    ph: 7.0,
    ec: 6640,
    tds: 3230,
    salt: 3200,
    orp: 672,
    fac: 1.2,
    temperature: 28,
    ...overrides,
  };
}

function poolSettings(overrides: Partial<PoolSettings> = {}): PoolSettings {
  return {
    volume: 50000,
    volumeUnit: 'liters',
    poolType: 'chlorine',
    unitSystem: 'metric',
    ...overrides,
  };
}

function actionWithStatus(status: MaintenanceAction['status'], id = `${status}-action`): MaintenanceAction {
  return {
    id,
    version: 1,
    status,
    performedAt: '2026-07-21T09:00:00.000Z',
    kind: 'chemical',
    actionType: 'chemical',
    category: 'chemical',
    description: 'Acción existente',
  };
}
