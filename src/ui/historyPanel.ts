import { t, formatDateTime, getLocale } from '../i18n/index';
import type { Measurement } from '../domain/measurement';
import {
  loadMeasurements,
  deleteMeasurement,
  exportData,
  parseImportData,
  applyImportResult,
  loadMeasurementDevices,
  loadActions,
} from '../domain/storage';

const RECENT_MEASUREMENT_LIMIT = 10;

type HistoryMode =
  | { kind: 'recent' }
  | { kind: 'range'; from: string; to: string };

export interface MeasurementDateLimits {
  min: string;
  max: string;
}

export class HistoryPanel {
  private content: HTMLElement;
  private exportBtn: HTMLButtonElement;
  private importBtn: HTMLButtonElement;
  private importInput: HTMLInputElement;
  private mode: HistoryMode = { kind: 'recent' };
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

    const sorted = sortMeasurementsNewestFirst(list);
    const limits = getMeasurementDateLimits(sorted);
    if (!limits) {
      this.content.innerHTML = `<p class="empty-state">${t('history.empty')}</p>`;
      return;
    }

    const devicesById = new Map(loadMeasurementDevices().map((device) => [device.id, device]));
    const validation = this.mode.kind === 'range'
      ? validateMeasurementDateRange(this.mode.from, this.mode.to, limits)
      : { valid: true, error: '' };
    const selectedMeasurements = this.mode.kind === 'range' && validation.valid
      ? filterMeasurementsByDateRange(sorted, this.mode.from, this.mode.to)
      : sorted.slice(0, RECENT_MEASUREMENT_LIMIT);
    const resultsTitle = this.mode.kind === 'range' && validation.valid
      ? t('history.range.title', {
        from: formatLocalDate(this.mode.from),
        to: formatLocalDate(this.mode.to),
      })
      : t('history.recent.title');
    const resultsMeta = this.mode.kind === 'range' && validation.valid
      ? t('history.range.count', { count: selectedMeasurements.length })
      : t('history.recent.help');

    const items = selectedMeasurements.map((m) => {
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

    this.content.innerHTML = `
      ${this.renderSearchForm(limits, validation.error)}
      <section class="history-results" aria-labelledby="history-results-heading">
        <div class="history-results-header">
          <div>
            <h3 id="history-results-heading">${escapeHtml(resultsTitle)}</h3>
            <p>${escapeHtml(resultsMeta)}</p>
          </div>
          ${this.mode.kind === 'range' && validation.valid
    ? `<button type="button" class="btn-secondary" data-history-action="clear-filter">${escapeHtml(t('history.range.clear'))}</button>`
    : ''}
        </div>
        ${items || this.renderEmptyRangeState()}
      </section>
    `;

    this.bindSearchControls(limits);
    this.content.querySelectorAll('.history-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm(t('history.deleteConfirm'))) {
          deleteMeasurement(id);
          this.mode = { kind: 'recent' };
          this.render();
          this.onChangeCb?.();
        }
      });
    });
  }

  private renderSearchForm(limits: MeasurementDateLimits, error: string): string {
    const from = this.mode.kind === 'range' ? this.mode.from : '';
    const to = this.mode.kind === 'range' ? this.mode.to : '';
    const fromMax = to || limits.max;
    const toMin = from || limits.min;
    const boundsText = t('history.search.bounds', {
      from: formatLocalDate(limits.min),
      to: formatLocalDate(limits.max),
    });

    return `
      <section class="history-date-search" aria-labelledby="history-search-heading">
        <div class="history-date-search-header">
          <div>
            <h3 id="history-search-heading">${escapeHtml(t('history.search.title'))}</h3>
            <p>${escapeHtml(boundsText)}</p>
          </div>
          <button type="button" class="btn-secondary" data-history-action="view-all">${escapeHtml(t('history.search.viewAll'))}</button>
        </div>
        <form id="historyDateSearchForm" class="history-date-form" novalidate>
          <div class="field">
            <label for="historyDateFrom">${escapeHtml(t('history.search.from'))}</label>
            <input
              id="historyDateFrom"
              type="date"
              value="${escapeHtml(from)}"
              min="${escapeHtml(limits.min)}"
              max="${escapeHtml(fromMax)}"
              data-history-date="from"
            />
          </div>
          <div class="field">
            <label for="historyDateTo">${escapeHtml(t('history.search.to'))}</label>
            <input
              id="historyDateTo"
              type="date"
              value="${escapeHtml(to)}"
              min="${escapeHtml(toMin)}"
              max="${escapeHtml(limits.max)}"
              data-history-date="to"
            />
          </div>
          <button type="submit" class="btn-primary" ${error || !from || !to ? 'disabled' : ''}>${escapeHtml(t('history.search.submit'))}</button>
        </form>
        <p class="history-date-help">${escapeHtml(t('history.search.emptyHint'))}</p>
        <div class="form-errors history-date-error" aria-live="polite" role="alert">${escapeHtml(error)}</div>
      </section>
    `;
  }

  private renderEmptyRangeState(): string {
    return `
      <div class="empty-state history-range-empty">
        <p>${escapeHtml(t('history.range.empty'))}</p>
        <div class="history-empty-actions">
          <button type="button" class="btn-secondary" data-history-action="clear-filter">${escapeHtml(t('history.range.clear'))}</button>
          <button type="button" class="btn-secondary" data-history-action="latest">${escapeHtml(t('history.range.latest'))}</button>
        </div>
      </div>
    `;
  }

  private bindSearchControls(limits: MeasurementDateLimits): void {
    const form = this.content.querySelector<HTMLFormElement>('#historyDateSearchForm');
    const fromInput = this.content.querySelector<HTMLInputElement>('#historyDateFrom');
    const toInput = this.content.querySelector<HTMLInputElement>('#historyDateTo');
    const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const errorEl = this.content.querySelector<HTMLElement>('.history-date-error');

    const updateValidation = () => {
      if (!fromInput || !toInput || !submit || !errorEl) return;
      fromInput.max = toInput.value || limits.max;
      toInput.min = fromInput.value || limits.min;
      const validation = validateMeasurementDateRange(fromInput.value, toInput.value, limits);
      errorEl.textContent = validation.error;
      submit.disabled = !validation.valid;
    };

    fromInput?.addEventListener('input', updateValidation);
    toInput?.addEventListener('input', updateValidation);
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!fromInput || !toInput) return;
      const validation = validateMeasurementDateRange(fromInput.value, toInput.value, limits);
      if (!validation.valid) {
        updateValidation();
        return;
      }
      this.mode = { kind: 'range', from: fromInput.value, to: toInput.value };
      this.render();
    });

    this.content.querySelectorAll<HTMLElement>('[data-history-action]').forEach((element) => {
      element.addEventListener('click', () => {
        const action = element.dataset.historyAction;
        if (action === 'view-all') {
          this.mode = { kind: 'range', from: limits.min, to: limits.max };
        } else {
          this.mode = { kind: 'recent' };
        }
        this.render();
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

export function sortMeasurementsNewestFirst(measurements: Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

export function getMeasurementDateLimits(measurements: Measurement[]): MeasurementDateLimits | null {
  const dates = measurements
    .map((measurement) => localDateKeyFromISO(measurement.measuredAt))
    .filter((value): value is string => Boolean(value))
    .sort();
  if (dates.length === 0) return null;
  return {
    min: dates[0],
    max: dates[dates.length - 1],
  };
}

export function validateMeasurementDateRange(
  from: string,
  to: string,
  limits: MeasurementDateLimits,
): { valid: boolean; error: string } {
  if (!from || !to) return { valid: false, error: '' };
  if (!isDateKey(from) || !isDateKey(to)) return { valid: false, error: t('history.range.invalid') };
  if (from < limits.min || from > limits.max || to < limits.min || to > limits.max) {
    return { valid: false, error: t('history.range.outOfBounds') };
  }
  if (from > to) {
    return { valid: false, error: t('history.range.orderError') };
  }
  return { valid: true, error: '' };
}

export function filterMeasurementsByDateRange(
  measurements: Measurement[],
  from: string,
  to: string,
): Measurement[] {
  return measurements.filter((measurement) => {
    const measuredDate = localDateKeyFromISO(measurement.measuredAt);
    return measuredDate !== null && measuredDate >= from && measuredDate <= to;
  });
}

function localDateKeyFromISO(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatLocalDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
