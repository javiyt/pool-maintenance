import {
  loadMeasurements,
  deleteMeasurement,
  exportData,
  parseImportData,
  mergeMeasurements,
  saveMeasurements,
  saveSettings,
  loadActions,
  saveActions,
  mergeActions,
  loadFollowUps,
  saveFollowUps,
  mergeFollowUps,
  normalizeActionExclusionFlags,
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
      vals.push(`EC ${m.ec} µS/cm`);
      vals.push(`TDS ${m.tds} ppm`);
      vals.push(`Salt ${m.salt} ppm`);
      vals.push(`ORP ${m.orp} mV`);
      vals.push(`FAC ${m.fac.toFixed(1)} ppm`);
      vals.push(`${m.temperature.toFixed(1)} °C`);

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
    const measurements = loadMeasurements();
    if (measurements.length === 0) {
      alert('No measurements to export.');
      return;
    }

    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pool-export-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private handleImport(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseImportData(reader.result as string);

        const existing = loadMeasurements();
        const merged = mergeMeasurements(existing, result.measurements);
        saveMeasurements(merged);

        const messages: string[] = [];
        messages.push(`Imported ${result.count} measurement(s).`);

        if (result.poolConfig) {
          saveSettings(result.poolConfig);
          messages.push('Pool configuration restored from file.');
        }

        // Merge imported actions if present (v4+)
        if (result.actions && result.actions.length > 0) {
          const existingActions = loadActions();
          const mergedActions = mergeActions(existingActions, result.actions);
          saveActions(mergedActions);
          messages.push(`Imported ${result.actions.length} action(s).`);
        }

        // Merge imported follow-ups if present (v6+)
        if (result.followUps && result.followUps.length > 0) {
          const existingFus = loadFollowUps();
          const mergedFus = mergeFollowUps(existingFus, result.followUps);
          saveFollowUps(mergedFus);
          messages.push(`Imported ${result.followUps.length} follow-up(s).`);

          // Normalize exclusion flags: sync follow-up exclusions to actions
          // so imported exclusion state takes effect without UI interaction.
          const currentActions = loadActions();
          const allFollowUps = loadFollowUps();
          const normalizedActions = normalizeActionExclusionFlags(currentActions, allFollowUps);
          if (normalizedActions !== currentActions) {
            saveActions(normalizedActions);
            messages.push('Applied exclusion flags from follow-up records.');
          }
        }

        // Notify the user if duplicate measurements were skipped
        const skipped = result.count - (merged.length - existing.length);
        if (skipped > 0) {
          messages.push(`${skipped} duplicate(s) skipped.`);
        }

        this.render();
        this.onChangeCb?.();
        alert(messages.join('\n'));
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
