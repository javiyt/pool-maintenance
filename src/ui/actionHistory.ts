import { loadActions, deleteAction } from '../domain/storage';
import type { MaintenanceAction, MaintenanceActionKind } from '../domain/actions';

const ACTION_KIND_LABELS: Record<MaintenanceActionKind, string> = {
  chemical: 'Chemical',
  chlorinator: 'Chlorinator',
  filtration: 'Filtration',
  'water-replacement': 'Water',
  cleaning: 'Cleaning',
  'manual-test': 'Test',
  other: 'Other',
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
    const list = loadActions();

    if (list.length === 0) {
      this.content.innerHTML = '<p class="empty-state">No maintenance actions recorded yet.</p>';
      return;
    }

    const sorted = [...list].sort((a, b) => b.performedAt.localeCompare(a.performedAt));

    const items = sorted.map((a) => this.renderActionItem(a)).join('');
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

  private renderActionItem(a: MaintenanceAction): string {
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
      </div>
    `;
  }
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
