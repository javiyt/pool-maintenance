import { runPersonalizedAssistant } from '../domain/maintenanceAssistant';
import type { Measurement } from '../domain/measurement';
import { loadActions, loadMeasurements, loadSettings } from '../domain/storage';
import { formatDateTime, formatNumber, t } from '../i18n/index';
import type { TranslationKey } from '../i18n/types';

type MeasurementState = 'normal' | 'low' | 'high' | 'critical' | 'unknown';

interface MeasurementCardView {
  key: TranslationKey;
  value: number | undefined;
  unit: string;
  state: MeasurementState;
  range: string;
}

export class DashboardPanel {
  private readonly statusContent: HTMLElement;
  private readonly measurementsContent: HTMLElement;
  private readonly activityContent: HTMLElement;

  constructor() {
    this.statusContent = requiredElement('dashboardStatusContent');
    this.measurementsContent = requiredElement('dashboardMeasurementsContent');
    this.activityContent = requiredElement('dashboardActivityContent');
  }

  render(): void {
    const measurements = loadMeasurements();
    const settings = loadSettings();
    const actions = loadActions();
    const latest = [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];

    if (!latest) {
      this.statusContent.innerHTML = `
        <div class="status-summary status-summary-empty">
          <div>
            <p class="eyebrow">${escapeHtml(t('dashboard.statusLabel'))}</p>
            <h2>${escapeHtml(t('summary.noMeasurements'))}</h2>
            <p>${escapeHtml(t('dashboard.emptySummary'))}</p>
          </div>
          <a class="btn-primary btn-inline" href="/measurements/new" data-route-link>${escapeHtml(t('dashboard.firstMeasurement'))}</a>
        </div>
      `;
      this.measurementsContent.innerHTML = `<p class="empty-state">${escapeHtml(t('dashboard.measurements.empty'))}</p>`;
      this.activityContent.innerHTML = `<p class="empty-state">${escapeHtml(t('dashboard.activity.empty'))}</p>`;
      return;
    }

    const result = runPersonalizedAssistant(measurements, actions, settings);
    const firstRecommendation = result.recommendations.find((rec) => rec.state !== 'informational')
      ?? result.recommendations[0];

    this.statusContent.innerHTML = `
      <div class="status-summary status-${escapeHtml(result.status)}">
        <div>
          <p class="eyebrow">${escapeHtml(t('dashboard.statusLabel'))}</p>
          <h2>${escapeHtml(statusLabel(result.status))}</h2>
          <p>${escapeHtml(summaryText(result.status))}</p>
          <p class="status-meta">${escapeHtml(t('dashboard.lastMeasurement', { date: formatDateTime(latest.measuredAt) }))}</p>
        </div>
        <a class="btn-primary btn-inline" href="${firstRecommendation ? '/actions' : '/measurements/new'}" data-route-link>
          ${escapeHtml(firstRecommendation ? t('dashboard.viewNextAction') : t('dashboard.measureAgain'))}
        </a>
      </div>
    `;

    this.measurementsContent.innerHTML = `
      <div class="measurement-grid">
        ${buildMeasurementCards(latest).map(renderMeasurementCard).join('')}
      </div>
    `;

    this.activityContent.innerHTML = renderActivity(latest, actions.length);
  }
}

function buildMeasurementCards(m: Measurement): MeasurementCardView[] {
  return [
    { key: 'field.fac', value: m.fac, unit: 'ppm', state: stateForRange(m.fac, 1, 3, 0.5, 5), range: '1-3 ppm' },
    { key: 'field.ph', value: m.ph, unit: '', state: stateForRange(m.ph, 7.2, 7.6, 6.8, 8), range: '7.2-7.6' },
    { key: 'field.orp', value: m.orp, unit: 'mV', state: stateForRange(m.orp, 650, 800, 600, 850), range: '650-800 mV' },
    { key: 'field.salt', value: m.salt, unit: 'ppm', state: stateForRange(m.salt, 2700, 3400, 2200, 4000), range: '2700-3400 ppm' },
    { key: 'field.temperature', value: m.temperature, unit: 'C', state: stateForRange(m.temperature, 10, 30, 0, 34), range: '10-30 C' },
    { key: 'field.ec', value: m.ec, unit: 'uS/cm', state: 'unknown', range: t('dashboard.range.contextual') },
    { key: 'field.tds', value: m.tds, unit: 'ppm', state: 'unknown', range: t('dashboard.range.contextual') },
  ];
}

function stateForRange(value: number | undefined, min: number, max: number, criticalLow: number, criticalHigh: number): MeasurementState {
  if (value === undefined || Number.isNaN(value)) return 'unknown';
  if (value < criticalLow || value > criticalHigh) return 'critical';
  if (value < min) return 'low';
  if (value > max) return 'high';
  return 'normal';
}

function renderMeasurementCard(card: MeasurementCardView): string {
  return `
    <article class="measurement-card measurement-${card.state}">
      <div class="measurement-card-header">
        <h3>${escapeHtml(t(card.key))}</h3>
        <span class="status-badge status-badge-${card.state}">${escapeHtml(t(stateKey(card.state)))}</span>
      </div>
      <div class="measurement-value">${escapeHtml(card.value === undefined ? '-' : formatNumber(card.value))}<span>${escapeHtml(card.unit)}</span></div>
      <p>${escapeHtml(t('dashboard.targetRange', { range: card.range }))}</p>
    </article>
  `;
}

function renderActivity(latest: Measurement, actionCount: number): string {
  return `
    <ol class="timeline compact-timeline">
      <li class="timeline-item">
        <span class="timeline-marker"></span>
        <div>
          <strong>${escapeHtml(t('dashboard.activity.measurement'))}</strong>
          <p>${escapeHtml(formatDateTime(latest.measuredAt))}</p>
        </div>
      </li>
      <li class="timeline-item">
        <span class="timeline-marker"></span>
        <div>
          <strong>${escapeHtml(t('dashboard.activity.actions'))}</strong>
          <p>${escapeHtml(t('dashboard.activity.actionsCount', { count: String(actionCount) }))}</p>
        </div>
      </li>
    </ol>
  `;
}

function statusLabel(status: string): string {
  const map: Record<string, TranslationKey> = {
    balanced: 'status.balanced',
    'needs-attention': 'status.needsAttention',
    'needs-correction': 'status.needsCorrection',
    unsafe: 'status.unsafe',
    'insufficient-data': 'status.insufficientData',
  };
  return t(map[status] ?? 'status.insufficientData');
}

function summaryText(status: string): string {
  const map: Record<string, TranslationKey> = {
    balanced: 'summary.balanced',
    'needs-attention': 'summary.needsAttention',
    'needs-correction': 'summary.needsCorrection',
    unsafe: 'summary.unsafe',
    'insufficient-data': 'summary.insufficientData',
  };
  return t(map[status] ?? 'summary.insufficientData');
}

function stateKey(state: MeasurementState): TranslationKey {
  const map: Record<MeasurementState, TranslationKey> = {
    normal: 'measurement.state.normal',
    low: 'measurement.state.low',
    high: 'measurement.state.high',
    critical: 'measurement.state.critical',
    unknown: 'measurement.state.unknown',
  };
  return map[state];
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
