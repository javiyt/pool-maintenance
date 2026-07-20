import { t, formatDateTime } from '../i18n/index';
import {
  loadMeasurements,
  deleteMeasurement,
  exportData,
  parseImportData,
  applyImportResult,
  loadMeasurementDevices,
  loadActions,
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
      this.content.innerHTML = `<p class="empty-state">${t('history.empty')}</p>`;
      return;
    }

    // Reverse chronological order by measuredAt
    const sorted = [...list].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    const devicesById = new Map(loadMeasurementDevices().map((device) => [device.id, device]));

    const items = sorted.map((m) => {
      const vals: string[] = [];
      if (typeof m.ph === 'number') vals.push(`pH ${m.ph.toFixed(1)}`);
      if (typeof m.ec === 'number') vals.push(`EC ${m.ec} µS/cm`);
      if (typeof m.tds === 'number') vals.push(`TDS ${m.tds} ppm`);
      if (typeof m.salt === 'number') vals.push(`Salt ${m.salt} ppm`);
      if (typeof m.orp === 'number') vals.push(`ORP ${m.orp} mV`);
      if (typeof m.fac === 'number') vals.push(`FAC ${m.fac.toFixed(1)} ppm`);
      if (typeof m.temperature === 'number') vals.push(`${m.temperature.toFixed(1)} °C`);
      const sourceLines = Object.entries(m.values ?? {})
        .map(([code, trace]) => {
          if (!trace) return '';
          const snapshot = trace.sourceSnapshot;
          const originalName = snapshot?.deviceName ?? trace.deviceName;
          if (!originalName) return '';
          const currentDevice = trace.deviceId ? devicesById.get(trace.deviceId) : undefined;
          const currentName = currentDevice?.customName;
          const currentNamePart = currentName && currentName !== originalName
            ? ` · Nombre actual: ${currentName}`
            : '';
          return `<span>${escapeHtml(code)}: ${escapeHtml(originalName)}${escapeHtml(currentNamePart)} · ${escapeHtml(snapshot?.unit ?? trace.originalUnit)}</span>`;
        })
        .filter(Boolean)
        .join('');

      return `
        <div class="history-item" data-id="${escapeHtml(m.id)}">
          <div class="history-meta">
            <span class="history-date">${escapeHtml(formatDateTime(m.measuredAt))}</span>
            <button class="history-delete" data-id="${escapeHtml(m.id)}">${t('history.delete')}</button>
          </div>
          <div class="history-values">
            ${vals.map((v) => `<span class="history-value">${escapeHtml(v)}</span>`).join('')}
          </div>
          ${sourceLines ? `<div class="history-source-snapshots">${sourceLines}</div>` : ''}
          ${m.notes ? `<div class="history-notes">${escapeHtml(m.notes)}</div>` : ''}
        </div>
      `;
    }).join('');

    this.content.innerHTML = items;

    // Bind delete buttons
    this.content.querySelectorAll('.history-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm(t('history.deleteConfirm'))) {
          deleteMeasurement(id);
          this.render();
          this.onChangeCb?.();
        }
      });
    });
  }

  private handleExport(): void {
    const measurements = loadMeasurements();
    const actions = loadActions();
    if (measurements.length === 0 && actions.length === 0) {
      alert(t('history.export.empty'));
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
        const applied = applyImportResult(result);

        const messages: string[] = [];
        messages.push(t('history.import.success', { count: result.count }));

        if (applied.poolConfigUpdated) {
          messages.push(t('history.import.poolConfig'));
        }

        if (applied.measurementDevices.discovered > 0) {
          messages.push(`Medidores importados: ${applied.measurementDevices.created}`);
        }

        if (applied.actions.discovered > 0) {
          messages.push(t('history.import.actions', { count: applied.actions.created }));
          if (applied.actions.skipped > 0) {
            messages.push(`Acciones duplicadas omitidas: ${applied.actions.skipped}`);
          }
        }

        if (applied.followUps.discovered > 0) {
          messages.push(t('history.import.followUps', { count: applied.followUps.created }));
        }

        if (applied.actionExclusionsNormalized) {
          messages.push(t('history.import.exclusions'));
        }

        // Notify the user if duplicate measurements were skipped
        if (applied.measurements.skipped > 0) {
          messages.push(t('history.import.duplicates', { count: applied.measurements.skipped }));
        }

        this.render();
        this.onChangeCb?.();
        alert(messages.join('\n'));
      } catch (err) {
        alert(t('history.import.failed', { message: (err as Error).message }));
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-imported
    this.importInput.value = '';
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
