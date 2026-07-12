import type { MaintenanceAssistantResult, MaintenanceRecommendation } from '../domain/maintenanceAssistant';
import type { ActionFormPrefill } from './actionForm';
import type { MaintenanceActionKind } from '../domain/actions';
import type { TranslationKey, TranslationParams } from '../i18n/types';
import { t, formatNumber, formatAmount } from '../i18n/index';

export class RecommendationsPanel {
  private section: HTMLElement;
  private content: HTMLElement;
  private onPerformCb: ((prefill: ActionFormPrefill) => void) | null = null;

  constructor() {
    this.section = document.getElementById('recommendationsSection') as HTMLElement;
    this.content = document.getElementById('recContent') as HTMLElement;
  }

  onMarkAsPerformed(cb: (prefill: ActionFormPrefill) => void): void {
    this.onPerformCb = cb;
  }

  show(result: MaintenanceAssistantResult): void {
    this.section.hidden = false;

    const parts: string[] = [];

    // ── Status banner ───────────────────────────────────────────
    parts.push(this.renderStatusBanner(result));

    // ── Summary ─────────────────────────────────────────────────
    parts.push(`<div class="as-summary"><p>${escapeHtml(result.summary)}</p></div>`);

    // ── Next check suggestion ───────────────────────────────────
    parts.push(this.renderNextCheck(result));

    // ── Trends ──────────────────────────────────────────────────
    if (result.trends.length > 0) {
      parts.push(this.renderTrends(result));
    }

    // ── Recommendations grouped by kind ─────────────────────────
    if (result.recommendations.length > 0) {
      parts.push(this.renderGroupedRecommendations(result));
    }

    parts.push(`
      <div class="rec-disclaimer">
        ${escapeHtml(t('rec.disclaimer'))}
      </div>
    `);

    this.content.innerHTML = parts.join('');

    // Bind "Mark as performed" buttons
    this.bindPerformButtons();
  }

  hide(): void {
    this.section.hidden = true;
  }

  // ── Status banner ─────────────────────────────────────────────

  private renderStatusBanner(result: MaintenanceAssistantResult): string {
    const statusLabels: Record<string, TranslationKey> = {
      balanced: 'status.balanced',
      'needs-attention': 'status.needsAttention',
      'needs-correction': 'status.needsCorrection',
      unsafe: 'status.unsafe',
      'insufficient-data': 'status.insufficientData',
    };

    const statusClass = `as-status-${result.status}`;
    const key = statusLabels[result.status] as TranslationKey | undefined;
    const label = key ? t(key) : result.status;

    return `<div class="as-status-banner ${statusClass}">${escapeHtml(label)}</div>`;
  }

  // ── Next check ────────────────────────────────────────────────

  private renderNextCheck(result: MaintenanceAssistantResult): string {
    const { nextCheckSuggestion } = result;
    let timeStr = '';

    if (nextCheckSuggestion.hoursFromNow !== undefined) {
      if (nextCheckSuggestion.hoursFromNow < 24) {
        timeStr = t('nextCheck.hours', { hours: nextCheckSuggestion.hoursFromNow });
      } else {
        const days = Math.round(nextCheckSuggestion.hoursFromNow / 24);
        timeStr = t('nextCheck.days', { days });
      }
    }

    let html = '<div class="as-next-check">';
    html += `<strong>${escapeHtml(t('nextCheck.label'))}</strong> `;
    if (timeStr) {
      html += `${escapeHtml(timeStr)} — `;
    }
    html += `${escapeHtml(t(getNextCheckReasonKey(result.status)))}`;
    html += '</div>';

    return html;
  }

  // ── Trends section ────────────────────────────────────────────

  private renderTrends(result: MaintenanceAssistantResult): string {
    const parts: string[] = [`<div class="as-trends"><h3 class="as-subtitle">${escapeHtml(t('trends.title'))}</h3>`];

    const relevantTrends = result.trends.filter(
      (t) => t.field === 'ph' || t.field === 'fac' || t.field === 'orp' || t.field === 'salt' || t.field === 'temperature',
    );

    parts.push('<div class="as-trends-grid">');
    for (const trend of relevantTrends) {
      const directionIcon = trend.direction === 'rising' ? '↗' : trend.direction === 'falling' ? '↘' : trend.direction === 'stable' ? '→' : '?';
      const sevClass = `trend-${trend.severity}`;

      parts.push(`
        <div class="as-trend-item ${sevClass}" title="${escapeHtmlAttr(trend.message)}">
          <span class="trend-icon">${directionIcon}</span>
          <span class="trend-field">${escapeHtml(t(fieldToKey(trend.field)))}</span>
          <span class="trend-value">${escapeHtml(formatTrendValue(trend))}</span>
        </div>
      `);
    }
    parts.push('</div></div>');

    return parts.join('');
  }

  // ── Grouped recommendations ───────────────────────────────────

  private renderGroupedRecommendations(result: MaintenanceAssistantResult): string {
    // Group by kind in display order
    const kindOrder: Array<{ kind: string; label: string }> = [
      { kind: 'warning', label: t('group.warning') },
      { kind: 'chemical', label: t('group.chemical') },
      { kind: 'equipment', label: t('group.equipment') },
      { kind: 'filtration', label: t('group.filtration') },
      { kind: 'manual-test', label: t('group.manualTest') },
      { kind: 'monitor', label: t('group.monitor') },
      { kind: 'retest', label: t('group.retest') },
      { kind: 'no-action', label: t('group.noAction') },
    ];

    const groups = new Map<string, MaintenanceRecommendation[]>();
    for (const rec of result.recommendations) {
      const list = groups.get(rec.kind) ?? [];
      list.push(rec);
      groups.set(rec.kind, list);
    }

    const parts: string[] = ['<div class="as-recommendations">'];

    for (const { kind, label } of kindOrder) {
      const items = groups.get(kind);
      if (!items || items.length === 0) continue;

      // Check if all items in this group are 'info' severity
      const allInfo = items.every((i) => i.severity === 'info');

      parts.push(`<div class="as-rec-group ${allInfo ? 'as-rec-group-info' : ''}">
        <h4 class="as-rec-group-title">${escapeHtml(label)}</h4>
      `);

      for (const item of items) {
        parts.push(this.renderRecommendationItem(item));
      }

      parts.push('</div>');
    }

    parts.push('</div>');
    return parts.join('');
  }

  private renderRecommendationItem(item: MaintenanceRecommendation): string {
    const severityClass = item.severity === 'high' || item.severity === 'danger' ? 'rec-danger' : '';

    let nameHtml = '';
    if (item.genericProductNameKey || item.genericProductName) {
      const prodName = item.genericProductNameKey ? t(item.genericProductNameKey) : item.genericProductName!;
      nameHtml = `<div class="rec-chemical">${escapeHtml(prodName)}</div>`;
    }
    if (item.mainComponentKey || item.mainComponent) {
      const component = item.mainComponentKey ? t(item.mainComponentKey) : item.mainComponent!;
      nameHtml += `<div class="rec-component">${escapeHtml(t('rec.component.active', { name: component }))}</div>`;
    }
    // Equipment name: use equipmentNameKey if available
    if (item.equipmentNameKey || item.equipmentName) {
      const equipName = item.equipmentNameKey ? t(item.equipmentNameKey) : item.equipmentName!;
      nameHtml += `<div class="rec-equipment">${escapeHtml(equipName)}</div>`;
    }
    // Title: use titleKey if available
    const recTitle = item.titleKey
      ? t(item.titleKey, item.titleParams)
      : item.title;
    nameHtml += `<div class="rec-purpose"><strong>${escapeHtml(recTitle)}</strong></div>`;

    // Amount
    let amountHtml = '';
    if (item.estimatedAmount !== undefined && item.unit) {
      amountHtml = `<div class="rec-amount">${escapeHtml(formatAmount(item.estimatedAmount, item.unit))}</div>`;
    }

    // Summary: use summaryKey if available
    const recSummary = item.summaryKey
      ? t(item.summaryKey, item.summaryParams)
      : item.summary;
    const summaryHtml = `<div class="rec-detail">${escapeHtml(recSummary)}</div>`;

    // Reason: use reasonKey if available
    const recReason = item.reasonKey
      ? t(item.reasonKey, item.reasonParams)
      : item.reason;
    const reasonHtml = `<div class="rec-detail">${escapeHtml(recReason)}</div>`;

    // Equipment adjustments
    let equipHtml = '';
    if (item.suggestedOutputPercent !== undefined) {
      equipHtml += `<div class="rec-detail">${escapeHtml(t('empty.suggestedOutput', { output: String(item.suggestedOutputPercent) }))}</div>`;
    }
    if (item.suggestedAdditionalHours !== undefined) {
      equipHtml += `<div class="rec-detail">${escapeHtml(t('empty.suggestedHours', { hours: String(item.suggestedAdditionalHours) }))}</div>`;
    }

    // Current value + target range
    let rangeHtml = '';
    if (item.currentValue !== undefined && item.targetRange) {
      rangeHtml = `<div class="rec-detail">${escapeHtml(t('rec.currentValue', {
        value: formatNumber(item.currentValue),
        unit: item.targetRange.unit,
        min: formatNumber(item.targetRange.min),
        max: formatNumber(item.targetRange.max),
      }))}</div>`;
    }

    // Safety notes
    let safetyHtml = '';
    if (item.safetyNotes.length > 0) {
      safetyHtml = `<div class="rec-subsection"><strong>${escapeHtml(t('rec.safetyNotes'))}</strong><ul>${item.safetyNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Calculation notes
    let calcHtml = '';
    if (item.calculationNotes.length > 0) {
      calcHtml = `<div class="rec-subsection"><strong>${escapeHtml(t('rec.calcNotes.title'))}</strong><ul>${item.calculationNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Follow-up actions
    let followHtml = '';
    if (item.followUpActions.length > 0) {
      followHtml = `<div class="rec-subsection"><strong>${escapeHtml(t('rec.followUp.title'))}</strong><ul>${item.followUpActions.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Severity badge
    const severityKey: Record<string, TranslationKey> = {
      danger: 'severity.danger',
      high: 'severity.high',
      medium: 'severity.medium',
      low: 'severity.low',
    };
    const severityLabel = severityKey[item.severity]
      ? t(severityKey[item.severity])
      : t('severity.info');

    // Personalization (historical learning)
    const personalizationHtml = this.renderPersonalization(item);

    // "Mark as performed" button for actionable recommendations
    const performBtnHtml = this.renderPerformButton(item);

    return `
      <div class="rec-item ${severityClass}" data-rec-id="${escapeHtml(item.id)}">
        ${nameHtml}
        ${amountHtml}
        ${personalizationHtml}
        ${summaryHtml}
        ${reasonHtml}
        ${equipHtml}
        ${rangeHtml}
        ${safetyHtml}
        ${calcHtml}
        ${followHtml}
        <span class="rec-status rec-severity-${item.severity}">${escapeHtml(severityLabel)}</span>
        ${performBtnHtml}
      </div>
    `;
  }

  /**
   * Render personalization info from historical learning, if available.
   */
  private renderPersonalization(item: MaintenanceRecommendation): string {
    const p = item.personalization;
    if (!p) return '';

    const confidenceKey: Record<string, TranslationKey> = {
      high: 'confidence.high',
      medium: 'confidence.medium',
      low: 'confidence.low',
    };
    const confidenceLabel = t(confidenceKey[p.confidence ?? 'low']);

    const confidenceClass = p.confidence === 'high' ? 'badge-high'
      : p.confidence === 'medium' ? 'badge-medium'
      : 'badge-low';

    // Determine if this is a chlorinator (equipment) or granules (chemical) adjustment
    const isChlorinator = item.kind === 'equipment';

    // Build explanation using translation keys
    let explanationKey: TranslationKey;
    let explanationParams: TranslationParams = {};

    if (!p.applied) {
      // Insufficient data case
      explanationKey = isChlorinator
        ? 'personalization.explanation.insufficient.chlorinator'
        : 'personalization.explanation.insufficient.granules';
      explanationParams = {
        samples: String(p.sampleSize ?? 0),
        confidence: confidenceLabel,
      };
    } else if (p.theoreticalValue !== undefined && p.personalizedValue !== undefined && p.theoreticalValue !== p.personalizedValue) {
      // Adjusted case
      const cf = p.correctionFactor ?? 1;
      const direction = cf < 1 ? 'more' : 'less';
      const pct = Math.round(Math.abs((1 - cf) * 100));
      explanationKey = isChlorinator
        ? 'personalization.explanation.adjusted.chlorinator'
        : 'personalization.explanation.adjusted.granules';
      explanationParams = {
        theoretical: String(p.theoreticalValue),
        samples: String(p.sampleSize ?? 0),
        pct: String(pct),
        direction,
        personalised: String(p.personalizedValue),
      };
    } else {
      // Aligns (no adjustment needed) case
      const value = p.theoreticalValue ?? p.personalizedValue ?? 0;
      explanationKey = isChlorinator
        ? 'personalization.explanation.aligns.chlorinator'
        : 'personalization.explanation.aligns.granules';
      explanationParams = {
        value: String(value),
        samples: String(p.sampleSize ?? 0),
      };
    }

    let valueHtml = '';
    if (p.applied && p.theoreticalValue !== undefined && p.personalizedValue !== undefined) {
      valueHtml = `
        <div class="rec-personalization-values">
          <span class="rec-personalization-theoretical">${escapeHtml(t('rec.personalization.theoretical'))} ${escapeHtml(formatAmount(p.theoreticalValue, getUnit(item)))}</span>
          <span class="rec-personalization-arrow">→</span>
          <span class="rec-personalization-personalized">${escapeHtml(t('rec.personalization.personalized'))} ${escapeHtml(formatAmount(p.personalizedValue, getUnit(item)))}</span>
        </div>
      `;
    }

    return `
      <div class="rec-personalization">
        <div class="rec-personalization-header">
          <span class="rec-personalization-label">${escapeHtml(t('rec.personalization.title'))}</span>
          <span class="rec-personalization-badge ${confidenceClass}">${escapeHtml(confidenceLabel)}</span>
        </div>
        ${valueHtml}
        <div class="rec-personalization-meta">
          <span class="rec-personalization-samples">${escapeHtml(t('rec.personalization.samples', { count: String(p.sampleSize ?? 0) }))}</span>
        </div>
        <div class="rec-personalization-explanation">${escapeHtml(t(explanationKey, explanationParams))}</div>
      </div>
    `;
  }

  /**
   * Render a "Mark as performed" button if the recommendation is actionable.
   * Returns the button HTML string, or empty string if not actionable.
   */
  private renderPerformButton(item: MaintenanceRecommendation): string {
    const actionKind = recommendationToActionKind(item);
    if (!actionKind) return '';

    // Build a JSON data attribute with the prefill values so the click handler
    // can reconstruct the ActionFormPrefill
    const prefill: ActionFormPrefill = {
      kind: actionKind,
      description: item.title,
      recommendationId: item.id,
      retestAfterHours: item.retestAfterHours,
    };

    if (item.relatedFields.length > 0 && item.relatedFields[0]) {
      // We'll set relatedMeasurementId when the user clicks — we use the latest measurement
    }

    // Use personalized values when available
    const chemicalAmount = item.personalization?.applied
      ? item.personalization.personalizedValue
      : item.estimatedAmount;
    const addHours = item.personalization?.applied
      ? item.personalization.personalizedValue
      : item.suggestedAdditionalHours;

    if (item.chemicalProductId) {
      prefill.chemicalProductType = item.chemicalProductId as ActionFormPrefill['chemicalProductType'];
    }
    if (item.mainComponent) {
      prefill.chemicalComponent = item.mainComponent;
    }
    if (chemicalAmount !== undefined) {
      prefill.chemicalAmount = chemicalAmount;
    }
    if (item.unit) {
      prefill.chemicalUnit = item.unit as 'ml' | 'l' | 'g' | 'kg';
    }

    if (item.suggestedOutputPercent !== undefined) {
      prefill.chlorinatorNewOutput = item.suggestedOutputPercent;
    }
    if (addHours !== undefined) {
      prefill.chlorinatorAddHours = addHours;
    }
    if (item.suggestedFiltrationHours !== undefined) {
      prefill.filtrationNewHours = item.suggestedFiltrationHours;
    }

    return `<button class="rec-perform-btn" data-prefill='${escapeHtmlAttr(JSON.stringify(prefill))}'>${escapeHtml(t('rec.performButton'))}</button>`;
  }

  /**
   * Bind "Mark as performed" buttons after rendering.
   */
  private bindPerformButtons(): void {
    this.content.querySelectorAll('.rec-perform-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          const raw = (btn as HTMLElement).dataset.prefill;
          if (!raw) return;
          const prefill: ActionFormPrefill = JSON.parse(raw);

          // If the recommendation has related fields, link to the latest measurement
          const recEl = (btn as HTMLElement).closest('[data-rec-id]');
          if (recEl) {
            // Find related measurement select population is done in ActionForm.open()
          }

          this.onPerformCb?.(prefill);
        } catch {
          // Silently fail if prefill data is malformed
        }
      });
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Get the translation key for the next check reason based on pool status.
 */
function getNextCheckReasonKey(status: string): TranslationKey {
  const map: Record<string, TranslationKey> = {
    'unsafe': 'nextCheck.unsafe',
    'needs-correction': 'nextCheck.correction',
    'needs-attention': 'nextCheck.attention',
    'balanced': 'nextCheck.balanced',
    'insufficient-data': 'nextCheck.insufficientData',
  };
  return map[status] ?? 'nextCheck.insufficientData';
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Get the display unit for a recommendation, used for personalization rendering.
 */
function getUnit(item: MaintenanceRecommendation): string {
  if (item.unit) return item.unit;
  if (item.suggestedAdditionalHours !== undefined) return 'h';
  if (item.suggestedFiltrationHours !== undefined) return 'h';
  return '';
}

/**
 * Map a trend field name to its translation key.
 */
function fieldToKey(field: string): TranslationKey {
  const keyMap: Record<string, TranslationKey> = {
    ph: 'field.ph',
    ec: 'field.ec',
    tds: 'field.tds',
    salt: 'field.salt',
    orp: 'field.orp',
    fac: 'field.fac',
    temperature: 'field.temperature',
  };
  return keyMap[field] ?? (field as TranslationKey);
}

function formatTrendValue(trend: { field: string; latestValue: number; direction: string }): string {
  const field = trend.field;
  const fmt1 = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  if (field === 'ph') return formatNumber(trend.latestValue, undefined, fmt1);
  if (field === 'fac') return `${formatNumber(trend.latestValue, undefined, fmt1)} ppm`;
  if (field === 'orp') return `${formatNumber(trend.latestValue)} mV`;
  if (field === 'salt') return `${formatNumber(trend.latestValue)} ppm`;
  if (field === 'temperature') return `${formatNumber(trend.latestValue, undefined, fmt1)} °C`;
  return formatNumber(trend.latestValue);
}

/**
 * Map a recommendation kind to the corresponding MaintenanceActionKind,
 * or return undefined if the recommendation is not directly actionable.
 */
function recommendationToActionKind(
  rec: MaintenanceRecommendation,
): MaintenanceActionKind | undefined {
  switch (rec.kind) {
    case 'chemical':
      return 'chemical';
    case 'equipment':
      // Equipment recommendations for salt chlorinator → 'chlorinator'
      if (rec.equipmentName?.toLowerCase().includes('clorador')) {
        return 'chlorinator';
      }
      return 'other';
    case 'filtration':
      return 'filtration';
    case 'manual-test':
      return 'manual-test';
    default:
      return undefined;
  }
}
