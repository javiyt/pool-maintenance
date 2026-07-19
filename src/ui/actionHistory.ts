import { loadActions, deleteAction, loadMeasurements } from '../domain/storage';
import type { MaintenanceAction, MaintenanceActionKind } from '../domain/actions';
import { evaluateActionOutcomes } from '../domain/actionOutcomeEvaluator';
import type { ActionOutcome, OutcomeEffectiveness } from '../domain/actionOutcomeEvaluator';
import { t, formatAmount, formatDateTime, formatDelta as formatLocalizedDelta, formatNumber } from '../i18n/index';
import type { TranslationKey, TranslationParams } from '../i18n/types';

export class ActionHistory {
  private content: HTMLElement;
  private onChangeCb: (() => void) | null = null;

  constructor() {
    this.content = document.getElementById('actionHistoryContent') as HTMLElement;
  }

  onChange(cb: () => void): void {
    this.onChangeCb = cb;
  }

  render(): void {
    const actions = loadActions();
    const measurements = loadMeasurements();

    if (actions.length === 0) {
      this.content.innerHTML = `<p class="empty-state">${escapeHtml(t('actionHistory.empty'))}</p>`;
      return;
    }

    // Compute outcomes from raw history (not persisted)
    const outcomes = evaluateActionOutcomes(measurements, actions);
    const outcomeMap = new Map<string, ActionOutcome>();
    for (const o of outcomes) {
      outcomeMap.set(o.actionId, o);
    }

    const sorted = [...actions].sort((a, b) => b.performedAt.localeCompare(a.performedAt));

    const items = sorted.map((a) => this.renderActionItem(a, outcomeMap.get(a.id))).join('');
    this.content.innerHTML = items;

    // Bind delete buttons
    this.content.querySelectorAll('.action-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm(t('actionHistory.deleteConfirm'))) {
          deleteAction(id);
          this.render();
          this.onChangeCb?.();
        }
      });
    });
  }

  private renderActionItem(a: MaintenanceAction, outcome?: ActionOutcome): string {
    const kindLabel = t(actionKindKey(a.kind));
    let detailsHtml = '';

    if (a.chemical) {
      const c = a.chemical;
      const amountStr = c.amount !== undefined && c.unit ? formatAmount(c.amount, c.unit) : '';
      const productName = c.product?.snapshot.name ?? c.mainComponent ?? c.productType ?? '';
      const category = c.product?.snapshot.category ?? c.productType ?? '';
      detailsHtml = `<div class="action-details">${escapeHtml([productName, amountStr, category ? productTypeLabel(category) : ''].filter(Boolean).join(' — '))}</div>`;
    } else if (a.chlorinator) {
      const parts: string[] = [];
      if (a.chlorinator.previousOutputPercent !== undefined && a.chlorinator.newOutputPercent !== undefined) {
        parts.push(t('actionDetails.chlorinator.outputChanged', {
          from: formatNumber(a.chlorinator.previousOutputPercent),
          to: formatNumber(a.chlorinator.newOutputPercent),
        }));
      } else if (a.chlorinator.newOutputPercent !== undefined) {
        parts.push(t('actionDetails.chlorinator.outputSet', { to: formatNumber(a.chlorinator.newOutputPercent) }));
      }
      if (a.chlorinator.additionalHours) parts.push(t('actionDetails.chlorinator.additionalHours', { hours: formatNumber(a.chlorinator.additionalHours) }));
      if (a.chlorinator.totalHours) parts.push(t('actionDetails.chlorinator.totalHoursPerDay', { hours: formatNumber(a.chlorinator.totalHours) }));
      if (a.chlorinator.boostActivated) parts.push('Boost');
      if (a.chlorinator.maintenanceTask) parts.push(a.chlorinator.maintenanceTask);
      detailsHtml = `<div class="action-details">${escapeHtml(parts.join(', '))}</div>`;
    } else if (a.filtration) {
      const parts: string[] = [];
      if (a.filtration.previousHours !== undefined) {
        parts.push(t('actionDetails.filtration.hoursChanged', {
          from: formatNumber(a.filtration.previousHours),
          to: formatNumber(a.filtration.newHours),
        }));
      } else {
        parts.push(t('actionDetails.filtration.hoursSet', { hours: formatNumber(a.filtration.newHours) }));
      }
      detailsHtml = `<div class="action-details">${escapeHtml(parts.join(', '))}</div>`;
    } else if (a.waterReplacement) {
      const parts: string[] = [];
      if (a.waterReplacement.estimatedLiters) parts.push(`${formatNumber(a.waterReplacement.estimatedLiters)} L`);
      if (a.waterReplacement.estimatedPercent) parts.push(`~${formatNumber(a.waterReplacement.estimatedPercent)}%`);
      detailsHtml = `<div class="action-details">${escapeHtml(t('actionDetails.waterReplacement', { details: parts.join(', ') }))}</div>`;
    }

    let relatedHtml = '';
    if (a.relatedMeasurementId) {
      relatedHtml = `<div class="action-related">${escapeHtml(t('outcome.linkedTo', { id: a.relatedMeasurementId.slice(0, 12) + '…' }))}</div>`;
    }

    if (a.notes) {
      detailsHtml += `<div class="action-details">${escapeHtml(a.notes)}</div>`;
    }

    // Outcome display
    let outcomeHtml = '';
    if (outcome) {
      const o = outcomeDisplay(outcome.effectiveness);
      const changesHtml = renderChanges(outcome.changes);
      const reasons = renderOutcomeReasons(outcome);
      outcomeHtml = `
        <div class="action-outcome ${o.cssClass}">
          <span class="action-outcome-badge">${escapeHtml(o.label)}</span>
          <span class="action-outcome-confidence">${escapeHtml(t('outcome.confidence', { pct: Math.round(outcome.confidence * 100) }))}</span>
          <div class="action-outcome-details">${changesHtml}</div>
          ${reasons.length > 0
            ? `<div class="action-outcome-reasons">${reasons.map((r) => escapeHtml(r)).join('<br>')}</div>`
            : ''}
        </div>
      `;
    }

    return `
      <div class="action-item" data-id="${escapeHtml(a.id)}">
        <div class="action-meta">
          <span class="action-kind-badge">${escapeHtml(kindLabel)}</span>
          <span class="history-date">${escapeHtml(formatDateTime(a.performedAt))}</span>
          <button class="action-delete" data-id="${escapeHtml(a.id)}">${escapeHtml(t('actionHistory.delete'))}</button>
        </div>
        <div class="action-description">${escapeHtml(a.description)}</div>
        ${detailsHtml}
        ${relatedHtml}
        ${outcomeHtml}
      </div>
    `;
  }
}

function renderChanges(changes: { ph?: number; ec?: number; tds?: number; salt?: number; orp?: number; fac?: number; temperature?: number }): string {
  const parts: string[] = [];
  if (changes.ph !== undefined) parts.push(t('outcome.changes.ph', { delta: formatDelta(changes.ph) }));
  if (changes.fac !== undefined) parts.push(t('outcome.changes.fac', { delta: formatDelta(changes.fac) }));
  if (changes.orp !== undefined) parts.push(t('outcome.changes.orp', { delta: formatDelta(changes.orp) }));
  if (changes.salt !== undefined) parts.push(t('outcome.changes.salt', { delta: formatDelta(changes.salt) }));
  if (changes.ec !== undefined) parts.push(t('outcome.changes.ec', { delta: formatDelta(changes.ec) }));
  if (changes.tds !== undefined) parts.push(t('outcome.changes.tds', { delta: formatDelta(changes.tds) }));
  if (changes.temperature !== undefined) parts.push(t('outcome.changes.temperature', { delta: formatDelta(changes.temperature) }));

  if (parts.length === 0) return t('outcome.noChanges');
  return parts.join(' · ');
}

function formatDelta(delta: number): string {
  return formatLocalizedDelta(delta);
}

function productTypeLabel(pt: string): string {
  const keyMap: Record<string, string> = {
    'ph-reducer': 'productType.phReducer',
    'ph-increaser': 'productType.phIncreaser',
    'chlorine-granules': 'productType.chlorineGranules',
    'chlorine-stabilizer': 'productType.chlorineStabilizer',
    'alkalinity-reducer': 'productType.alkalinityReducer',
    'pool-salt': 'productType.poolSalt',
    'fast-chlorine': 'productCategory.fastChlorine',
    'shock-chlorine': 'productCategory.shockChlorine',
    algaecide: 'productCategory.algaecide',
    clarifier: 'productCategory.clarifier',
    flocculant: 'productCategory.flocculant',
    stabilizer: 'productCategory.stabilizer',
    'chemical-cover': 'productCategory.chemicalCover',
    salt: 'productCategory.salt',
    other: 'productCategory.other',
  };
  return t(keyMap[pt] as any) ?? pt;
}

function actionKindKey(kind: MaintenanceActionKind): TranslationKey {
  const keyMap: Partial<Record<string, TranslationKey>> = {
    chemical: 'actionKind.chemical',
    chlorinator: 'actionKind.chlorinator',
    filtration: 'actionKind.filtration',
    'filter-backwash': 'actionKind.filterBackwash',
    'water-replacement': 'actionKind.waterReplacement',
    'water-top-up': 'actionKind.waterTopUp',
    'partial-drain': 'actionKind.partialDrain',
    'physical-cover': 'actionKind.physicalCover',
    'chemical-cover': 'actionKind.chemicalCover',
    algaecide: 'actionKind.algaecide',
    clarifier: 'actionKind.clarifier',
    flocculant: 'actionKind.flocculant',
    stabilizer: 'actionKind.stabilizer',
    'unknown-product': 'actionKind.unknownProduct',
    'equipment-maintenance': 'actionKind.equipmentMaintenance',
    inspection: 'actionKind.inspection',
    cleaning: 'actionKind.cleaning',
    'manual-test': 'actionKind.manualTest',
    other: 'actionKind.other',
  };
  return keyMap[kind] ?? 'actionKind.other';
}

function outcomeDisplay(effectiveness: OutcomeEffectiveness): { label: string; cssClass: string } {
  const keyMap: Record<OutcomeEffectiveness, TranslationKey> = {
    effective: 'outcome.effective',
    'partially-effective': 'outcome.partiallyEffective',
    ineffective: 'outcome.ineffective',
    unexpected: 'outcome.unexpected',
    inconclusive: 'outcome.inconclusive',
    unknown: 'outcome.unknown',
  };
  const cssMap: Record<OutcomeEffectiveness, string> = {
    effective: 'outcome-effective',
    'partially-effective': 'outcome-partial',
    ineffective: 'outcome-ineffective',
    unexpected: 'outcome-unexpected',
    inconclusive: 'outcome-unknown',
    unknown: 'outcome-unknown',
  };
  return { label: t(keyMap[effectiveness]), cssClass: cssMap[effectiveness] };
}

function renderOutcomeReasons(outcome: ActionOutcome): string[] {
  const explanationTexts = (outcome.explanationDetails ?? []).map((detail) => {
    if (detail.code === 'outcome.reason.fieldExpected') {
      const params = { ...(detail.params ?? {}) } as TranslationParams;
      const direction = typeof params.expectedDirection === 'string'
        ? t(directionKey(params.expectedDirection))
        : '';
      return t(detail.code, {
        ...params,
        field: typeof params.field === 'string' ? t(fieldKey(params.field)) : '',
        expectedDirection: direction,
        actualChange: typeof params.actualChange === 'number' ? formatLocalizedDelta(params.actualChange) : String(params.actualChange ?? ''),
      });
    }
    return t(detail.code, detail.params);
  });
  const confidenceTexts = (outcome.confidenceReasonCodes ?? []).map((reason) => {
    const text = t(reason.code, reason.params);
    return t('outcome.confidenceReduction', { reason: text, pct: reason.reductionPct });
  });
  return [...explanationTexts, ...confidenceTexts];
}

function directionKey(direction: string): TranslationKey {
  const map: Record<string, TranslationKey> = {
    increase: 'outcome.direction.increase',
    decrease: 'outcome.direction.decrease',
    any: 'outcome.direction.any',
    unknown: 'outcome.direction.unknown',
  };
  return map[direction] ?? 'outcome.direction.unknown';
}

function fieldKey(field: string): TranslationKey {
  const map: Record<string, TranslationKey> = {
    ph: 'field.ph',
    ec: 'field.ec',
    tds: 'field.tds',
    salt: 'field.salt',
    orp: 'field.orp',
    fac: 'field.fac',
    temperature: 'field.temperature',
  };
  return map[field] ?? 'field.fac';
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
