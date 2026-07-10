import { loadActions, deleteAction, loadMeasurements } from '../domain/storage';
import type { MaintenanceAction, MaintenanceActionKind } from '../domain/actions';
import { evaluateActionOutcomes } from '../domain/actionOutcomeEvaluator';
import type { ActionOutcome, OutcomeEffectiveness } from '../domain/actionOutcomeEvaluator';

const ACTION_KIND_LABELS: Record<MaintenanceActionKind, string> = {
  chemical: 'Chemical',
  chlorinator: 'Chlorinator',
  filtration: 'Filtration',
  'water-replacement': 'Water',
  cleaning: 'Cleaning',
  'manual-test': 'Test',
  other: 'Other',
};

const OUTCOME_LABELS: Record<OutcomeEffectiveness, { label: string; cssClass: string }> = {
  effective: { label: 'Effective', cssClass: 'outcome-effective' },
  'partially-effective': { label: 'Partial', cssClass: 'outcome-partial' },
  ineffective: { label: 'Ineffective', cssClass: 'outcome-ineffective' },
  unexpected: { label: 'Unexpected', cssClass: 'outcome-unexpected' },
  unknown: { label: 'Unknown', cssClass: 'outcome-unknown' },
};

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
      this.content.innerHTML = '<p class="empty-state">No maintenance actions recorded yet.</p>';
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
        if (id && confirm('Delete this action?')) {
          deleteAction(id);
          this.render();
          this.onChangeCb?.();
        }
      });
    });
  }

  private renderActionItem(a: MaintenanceAction, outcome?: ActionOutcome): string {
    const kindLabel = ACTION_KIND_LABELS[a.kind] ?? a.kind;
    let detailsHtml = '';

    if (a.chemical) {
      const c = a.chemical;
      const amountStr = formatAmount(c.amount, c.unit);
      detailsHtml = `<div class="action-details">${escapeHtml(c.mainComponent)} — ${amountStr} (${productTypeLabel(c.productType)})</div>`;
    } else if (a.chlorinator) {
      const parts: string[] = [];
      if (a.chlorinator.previousOutputPercent !== undefined) {
        parts.push(`Output: ${a.chlorinator.previousOutputPercent}% → ${a.chlorinator.newOutputPercent}%`);
      } else {
        parts.push(`Output set to ${a.chlorinator.newOutputPercent}%`);
      }
      if (a.chlorinator.additionalHours) parts.push(`+${a.chlorinator.additionalHours}h`);
      if (a.chlorinator.totalHours) parts.push(`Total: ${a.chlorinator.totalHours}h/day`);
      detailsHtml = `<div class="action-details">${escapeHtml(parts.join(', '))}</div>`;
    } else if (a.filtration) {
      const parts: string[] = [];
      if (a.filtration.previousHours !== undefined) {
        parts.push(`Filtration: ${a.filtration.previousHours}h → ${a.filtration.newHours}h/day`);
      } else {
        parts.push(`Filtration set to ${a.filtration.newHours}h/day`);
      }
      detailsHtml = `<div class="action-details">${escapeHtml(parts.join(', '))}</div>`;
    } else if (a.waterReplacement) {
      const parts: string[] = [];
      if (a.waterReplacement.estimatedLiters) parts.push(`${a.waterReplacement.estimatedLiters} L`);
      if (a.waterReplacement.estimatedPercent) parts.push(`~${a.waterReplacement.estimatedPercent}%`);
      detailsHtml = `<div class="action-details">Water replacement: ${escapeHtml(parts.join(', '))}</div>`;
    }

    let relatedHtml = '';
    if (a.relatedMeasurementId) {
      relatedHtml = `<div class="action-related">Linked to measurement ${escapeHtml(a.relatedMeasurementId.slice(0, 12))}…</div>`;
    }

    if (a.notes) {
      detailsHtml += `<div class="action-details">${escapeHtml(a.notes)}</div>`;
    }

    // Outcome display
    let outcomeHtml = '';
    if (outcome) {
      const o = OUTCOME_LABELS[outcome.effectiveness] ?? OUTCOME_LABELS.unknown;
      const changesHtml = renderChanges(outcome.changes);
      outcomeHtml = `
        <div class="action-outcome ${o.cssClass}">
          <span class="action-outcome-badge">${escapeHtml(o.label)}</span>
          <span class="action-outcome-confidence">${Math.round(outcome.confidence * 100)}% confidence</span>
          <div class="action-outcome-details">${changesHtml}</div>
          ${outcome.confidenceReasons.length > 0
            ? `<div class="action-outcome-reasons">${outcome.confidenceReasons.map((r) => escapeHtml(r)).join('<br>')}</div>`
            : ''}
        </div>
      `;
    }

    return `
      <div class="action-item" data-id="${escapeHtml(a.id)}">
        <div class="action-meta">
          <span class="action-kind-badge">${escapeHtml(kindLabel)}</span>
          <span class="history-date">${escapeHtml(formatDateTime(a.performedAt))}</span>
          <button class="action-delete" data-id="${escapeHtml(a.id)}">Delete</button>
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
  if (changes.ph !== undefined) parts.push(`pH ${formatDelta(changes.ph)}`);
  if (changes.fac !== undefined) parts.push(`FAC ${formatDelta(changes.fac)}`);
  if (changes.orp !== undefined) parts.push(`ORP ${formatDelta(changes.orp)}`);
  if (changes.salt !== undefined) parts.push(`Salt ${formatDelta(changes.salt)}`);
  if (changes.ec !== undefined) parts.push(`EC ${formatDelta(changes.ec)}`);
  if (changes.tds !== undefined) parts.push(`TDS ${formatDelta(changes.tds)}`);
  if (changes.temperature !== undefined) parts.push(`Temp ${formatDelta(changes.temperature)}`);

  if (parts.length === 0) return 'No changes measured.';
  return parts.join(' · ');
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function formatAmount(amount: number, unit: string): string {
  if (unit === 'ml' && amount >= 1000) {
    return `${(amount / 1000).toFixed(1)} L`;
  }
  return `${amount} ${unit}`;
}

function productTypeLabel(pt: string): string {
  const labels: Record<string, string> = {
    'ph-reducer': 'pH reducer',
    'ph-increaser': 'pH increaser',
    'chlorine-granules': 'Chlorine',
    'chlorine-stabilizer': 'Stabilizer',
    'alkalinity-reducer': 'Alkalinity reducer',
    'pool-salt': 'Salt',
  };
  return labels[pt] ?? pt;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
