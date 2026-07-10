import type { MaintenanceAssistantResult, MaintenanceRecommendation } from '../domain/maintenanceAssistant';
import type { ActionFormPrefill } from './actionForm';
import type { MaintenanceActionKind } from '../domain/actions';

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
        <strong>Importante:</strong> Estas son recomendaciones <em>aproximadas</em>.
        Siga siempre las instrucciones de dosificación en las etiquetas de sus productos químicos.
        Si no está seguro, consulte a un profesional de mantenimiento de piscinas.
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
    const statusLabels: Record<string, string> = {
      balanced: 'En equilibrio',
      'needs-attention': 'Requiere atención',
      'needs-correction': 'Requiere corrección',
      unsafe: '⚠️ No seguro',
      'insufficient-data': 'Sin datos suficientes',
    };

    const statusClass = `as-status-${result.status}`;
    const label = statusLabels[result.status] ?? result.status;

    return `<div class="as-status-banner ${statusClass}">${escapeHtml(label)}</div>`;
  }

  // ── Next check ────────────────────────────────────────────────

  private renderNextCheck(result: MaintenanceAssistantResult): string {
    const { nextCheckSuggestion } = result;
    let timeStr = '';

    if (nextCheckSuggestion.hoursFromNow !== undefined) {
      if (nextCheckSuggestion.hoursFromNow < 24) {
        timeStr = `~${nextCheckSuggestion.hoursFromNow} hora(s)`;
      } else {
        const days = Math.round(nextCheckSuggestion.hoursFromNow / 24);
        timeStr = `~${days} día(s)`;
      }
    }

    let html = '<div class="as-next-check">';
    html += '<strong>Próxima revisión recomendada:</strong> ';
    if (timeStr) {
      html += `${escapeHtml(timeStr)} — `;
    }
    html += `${escapeHtml(nextCheckSuggestion.reason)}`;
    html += '</div>';

    return html;
  }

  // ── Trends section ────────────────────────────────────────────

  private renderTrends(result: MaintenanceAssistantResult): string {
    const parts: string[] = ['<div class="as-trends"><h3 class="as-subtitle">Tendencias</h3>'];

    const relevantTrends = result.trends.filter(
      (t) => t.field === 'ph' || t.field === 'fac' || t.field === 'orp' || t.field === 'salt' || t.field === 'temperature',
    );

    parts.push('<div class="as-trends-grid">');
    for (const trend of relevantTrends) {
      const directionIcon = trend.direction === 'rising' ? '↗' : trend.direction === 'falling' ? '↘' : trend.direction === 'stable' ? '→' : '?';
      const sevClass = `trend-${trend.severity}`;

      parts.push(`
        <div class="as-trend-item ${sevClass}" title="${escapeHtml(trend.message)}">
          <span class="trend-icon">${directionIcon}</span>
          <span class="trend-field">${escapeHtml(fieldLabel(trend.field))}</span>
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
      { kind: 'warning', label: 'Alertas urgentes' },
      { kind: 'chemical', label: 'Correcciones químicas' },
      { kind: 'equipment', label: 'Ajustes de equipo' },
      { kind: 'filtration', label: 'Ajustes de filtración' },
      { kind: 'manual-test', label: 'Pruebas manuales' },
      { kind: 'monitor', label: 'Monitoreo' },
      { kind: 'retest', label: 'Repetir medición' },
      { kind: 'no-action', label: 'Sin acción requerida' },
    ];

    const groups = new Map<string, MaintenanceRecommendation[]>();
    for (const rec of result.recommendations) {
      const list = groups.get(rec.kind) ?? [];
      list.push(rec);
      groups.set(rec.kind, list);
    }

    const parts: string[] = ['<div class="as-recommendations"><h3 class="as-subtitle">Recomendaciones</h3>'];

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
    if (item.genericProductName) {
      nameHtml = `<div class="rec-chemical">${escapeHtml(item.genericProductName)}</div>`;
    }
    if (item.mainComponent) {
      nameHtml += `<div class="rec-component">Componente activo: ${escapeHtml(item.mainComponent)}</div>`;
    }
    nameHtml += `<div class="rec-purpose"><strong>${escapeHtml(item.title)}</strong></div>`;

    // Amount
    let amountHtml = '';
    if (item.estimatedAmount !== undefined && item.unit) {
      amountHtml = `<div class="rec-amount">${escapeHtml(formatAmount(item.estimatedAmount, item.unit))}</div>`;
    }

    // Reason
    const reasonHtml = `<div class="rec-detail">${escapeHtml(item.reason)}</div>`;

    // Summary
    const summaryHtml = `<div class="rec-detail">${escapeHtml(item.summary)}</div>`;

    // Equipment adjustments
    let equipHtml = '';
    if (item.suggestedOutputPercent !== undefined) {
      equipHtml += `<div class="rec-detail">Producción sugerida: ${item.suggestedOutputPercent}%</div>`;
    }
    if (item.suggestedAdditionalHours !== undefined) {
      equipHtml += `<div class="rec-detail">Horas adicionales sugeridas: ${item.suggestedAdditionalHours}h</div>`;
    }

    // Current value + target range
    let rangeHtml = '';
    if (item.currentValue !== undefined && item.targetRange) {
      rangeHtml = `<div class="rec-detail">Valor actual: ${item.currentValue} ${escapeHtml(item.targetRange.unit)} — Rango objetivo: ${item.targetRange.min}–${item.targetRange.max} ${escapeHtml(item.targetRange.unit)}</div>`;
    }

    // Safety notes
    let safetyHtml = '';
    if (item.safetyNotes.length > 0) {
      safetyHtml = `<div class="rec-subsection"><strong>Precauciones:</strong><ul>${item.safetyNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Calculation notes
    let calcHtml = '';
    if (item.calculationNotes.length > 0) {
      calcHtml = `<div class="rec-subsection"><strong>Notas de cálculo:</strong><ul>${item.calculationNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Follow-up actions
    let followHtml = '';
    if (item.followUpActions.length > 0) {
      followHtml = `<div class="rec-subsection"><strong>Próximos pasos:</strong><ul>${item.followUpActions.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`;
    }

    // Severity badge
    const severityLabel = item.severity === 'danger' ? 'Peligro'
      : item.severity === 'high' ? 'Alta'
      : item.severity === 'medium' ? 'Media'
      : item.severity === 'low' ? 'Baja'
      : 'Informativo';

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

    const confidenceLabel = p.confidence === 'high' ? 'Alta'
      : p.confidence === 'medium' ? 'Media'
      : p.confidence === 'low' ? 'Baja'
      : 'Ninguna';
    const confidenceClass = p.confidence === 'high' ? 'badge-high'
      : p.confidence === 'medium' ? 'badge-medium'
      : 'badge-low';

    let valueHtml = '';
    if (p.applied && p.theoreticalValue !== undefined && p.personalizedValue !== undefined) {
      valueHtml = `
        <div class="rec-personalization-values">
          <span class="rec-personalization-theoretical">Teórico: ${formatAmount(p.theoreticalValue, getUnit(item))}</span>
          <span class="rec-personalization-arrow">→</span>
          <span class="rec-personalization-personalized">Personalizado: ${formatAmount(p.personalizedValue, getUnit(item))}</span>
        </div>
      `;
    }

    return `
      <div class="rec-personalization">
        <div class="rec-personalization-header">
          <span class="rec-personalization-label">Aprendizaje histórico</span>
          <span class="rec-personalization-badge ${confidenceClass}">${escapeHtml(confidenceLabel)}</span>
        </div>
        ${valueHtml}
        <div class="rec-personalization-meta">
          <span class="rec-personalization-samples">${p.sampleSize ?? 0} muestra(s)</span>
        </div>
        <div class="rec-personalization-explanation">${escapeHtml(p.explanation)}</div>
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
    const prefill: ActionFormPrefill = { kind: actionKind, description: item.title };

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

    return `<button class="rec-perform-btn" data-prefill='${escapeHtmlAttr(JSON.stringify(prefill))}'>Mark as performed</button>`;
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

function formatAmount(amount: number, unit: string): string {
  if (amount <= 0) return '—';
  if (unit === 'ml' && amount >= 1000) {
    const l = (amount / 1000).toFixed(1);
    return `${l} l`;
  }
  return `${amount} ${unit}`;
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

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    ph: 'pH',
    ec: 'EC',
    tds: 'TDS',
    salt: 'Sal',
    orp: 'ORP',
    fac: 'FAC',
    temperature: 'Temp',
  };
  return labels[field] ?? field;
}

function formatTrendValue(trend: { field: string; latestValue: number; direction: string }): string {
  const field = trend.field;
  if (field === 'ph') return trend.latestValue.toFixed(1);
  if (field === 'fac') return `${trend.latestValue.toFixed(1)} ppm`;
  if (field === 'orp') return `${trend.latestValue} mV`;
  if (field === 'salt') return `${trend.latestValue} ppm`;
  if (field === 'temperature') return `${trend.latestValue.toFixed(1)} °C`;
  return String(trend.latestValue);
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
