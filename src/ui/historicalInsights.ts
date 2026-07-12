import { t } from '../i18n/index';
import {
  computeLearning,
  deriveInsights,
  type HistoricalInsight,
  type LearningConfidence,
} from '../domain/historicalLearning';
import { loadMeasurements, loadActions, loadSettings } from '../domain/storage';

export class HistoricalInsightsPanel {
  private content: HTMLElement;

  constructor() {
    this.content = document.getElementById('insightsContent') as HTMLElement;
  }

  render(): void {
    const measurements = loadMeasurements();
    const actions = loadActions();
    const settings = loadSettings();

    if (measurements.length < 2 || actions.length < 3) {
      this.content.innerHTML = `<p class="empty-state">${t('insights.insufficient')}</p>`;
      return;
    }

    const adjustments = computeLearning(measurements, actions, settings);
    const insights = deriveInsights(adjustments);

    if (insights.length === 0) {
      this.content.innerHTML = `<p class="empty-state">${t('insights.empty')}</p>`;
      return;
    }

    const items = insights.map((insight) => this.renderInsightCard(insight)).join('\n');

    this.content.innerHTML = `
      <div class="insights-disclaimer">${t('insights.disclaimer')}</div>
      <div class="insights-grid">
        ${items}
      </div>
      <details class="insights-details">
        <summary>${t('insights.rawLabel')}</summary>
        <pre class="insights-raw">${escapeHtml(JSON.stringify(adjustments, null, 2))}</pre>
      </details>
    `;
  }

  private renderInsightCard(insight: HistoricalInsight): string {
    const badgeClass = confidenceBadgeClass(insight.confidence);
    const badgeLabel = confidenceLabel(insight.confidence);

    return `
      <div class="insight-card">
        <div class="insight-header">
          <span class="insight-label">${escapeHtml(insight.label)}</span>
          <span class="insight-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="insight-value">${escapeHtml(insight.value)}</div>
        <div class="insight-meta">
          <span class="insight-description">${escapeHtml(insight.description)}</span>
        </div>
        <div class="insight-footer">
          <span class="insight-sample-count">${t('insights.basedOn')} ${insight.sampleSize} ${insight.sampleSize === 1 ? t('insights.observation') : t('insights.observations')}</span>
        </div>
      </div>
    `;
  }
}

function confidenceBadgeClass(confidence: LearningConfidence): string {
  switch (confidence) {
    case 'high': return 'badge-high';
    case 'medium': return 'badge-medium';
    case 'low': return 'badge-low';
    case 'none': return 'badge-none';
  }
}

function confidenceLabel(confidence: LearningConfidence): string {
  switch (confidence) {
    case 'high': return t('confidence.high');
    case 'medium': return t('confidence.medium');
    case 'low': return t('confidence.low');
    case 'none': return t('confidence.none');
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
