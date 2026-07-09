import {
  loadMeasurements,
  deleteMeasurement,
  saveMeasurements,
} from '../domain/storage';

export class HistoryPanel {
  private content: HTMLElement;
  private exportBtn: HTMLButtonElement;
  private importBtn: HTMLButtonElement;
  private importInput: HTMLInputElement;
  private onChangeCb: (() => void) | null = null;

  constructor() {
    this.content = document.getElementById('historyContent') as HTMLElement;
    this.exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
    this.importBtn = document.getElementById('importBtn') as HTMLButtonElement;
    this.importInput = document.getElementById('importFileInput') as HTMLInputElement;

    this.exportBtn.addEventListener('click', () => this.handleExport());
    this.importBtn.addEventListener('click', () => this.importInput.click());
    this.importInput.addEventListener('change', (e) => this.handleImport(e));
  }

  onChange(cb: () => void): void {
    this.onChangeCb = cb;
  }

  render(): void {
    const list = loadMeasurements();

    if (list.length === 0) {
      this.content.innerHTML =
        '<p class="empty-state">No measurements recorded yet. Fill in the form above and save your first measurement.</p>';
      return;
    }

    // Reverse chronological order by measuredAt
    const sorted = [...list].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

    const items = sorted.map((m) => {
      const vals: string[] = [];
      vals.push(`pH ${m.ph.toFixed(1)}`);
      vals.push(`FC ${m.freeChlorine.toFixed(1)}`);
      vals.push(`Alk ${m.alkalinity}`);
      vals.push(`CYA ${m.cyanuricAcid}`);
      if (m.salt !== undefined) vals.push(`Salt ${m.salt}`);
      if (m.temperature !== undefined) vals.push(`${m.temperature.toFixed(0)}°C`);

      return `
        <div class="history-item" data-id="${escapeHtml(m.id)}">
          <div class="history-meta">
            <span class="history-date">${escapeHtml(formatDateTime(m.measuredAt))}</span>
            <button class="history-delete" data-id="${escapeHtml(m.id)}">Delete</button>
          </div>
          <div class="history-values">
            ${vals.map((v) => `<span class="history-value">${escapeHtml(v)}</span>`).join('')}
          </div>
          ${m.notes ? `<div class="history-notes">${escapeHtml(m.notes)}</div>` : ''}
        </div>
      `;
    }).join('');

    this.content.innerHTML = items;

    // Bind delete buttons
    this.content.querySelectorAll('.history-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('Delete this measurement?')) {
          deleteMeasurement(id);
          this.render();
          this.onChangeCb?.();
        }
      });
    });
  }

  private handleExport(): void {
    const list = loadMeasurements();
    if (list.length === 0) {
      alert('No measurements to export.');
      return;
    }

    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pool-measurements-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleImport(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!Array.isArray(data)) throw new Error('Not an array');

        // Basic validation — each item must have at least id and measuredAt
        // (also accept date for backward compat with old export files)
        for (const item of data) {
          if (!item.id || (!item.measuredAt && !item.date)) {
            throw new Error('Each measurement must have an id and a date/measuredAt.');
          }
        }

        const existing = loadMeasurements();
        const merged = [...existing, ...data];
        saveMeasurements(merged);
        this.render();
        this.onChangeCb?.();
        alert(`Imported ${data.length} measurement(s) successfully.`);
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-imported
    this.importInput.value = '';
  }
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
