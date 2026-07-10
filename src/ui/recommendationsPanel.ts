import type { RecommendationsResult } from '../domain/chemistry';

export class RecommendationsPanel {
  private section: HTMLElement;
  private content: HTMLElement;

  constructor() {
    this.section = document.getElementById('recommendationsSection') as HTMLElement;
    this.content = document.getElementById('recContent') as HTMLElement;
  }

  show(result: RecommendationsResult): void {
    this.section.hidden = false;

    if (!result.canCalculate) {
      this.content.innerHTML = `<p class="rec-missing">${escapeHtml(result.missingReason)}</p>`;
      return;
    }

    const parts: string[] = [];

    // Warnings
    for (const w of result.warnings) {
      parts.push(`<div class="rec-warning">⚠ ${escapeHtml(w)}</div>`);
    }

    if (result.items.length === 0) {
      parts.push('<p>Todos los valores medidos están dentro de los rangos objetivo. No se requieren ajustes químicos.</p>');
    }

    for (const item of result.items) {
      const severityClass = item.severity === 'high' || item.severity === 'danger' ? 'rec-danger' : '';

      let nameHtml = '';
      if (item.genericProductName) {
        nameHtml = `<div class="rec-chemical">${escapeHtml(item.genericProductName)}</div>`;
      }
      if (item.mainComponent) {
        nameHtml += `<div class="rec-component">Componente activo: ${escapeHtml(item.mainComponent)}</div>`;
      }
      nameHtml += `<div class="rec-purpose"><strong>${escapeHtml(item.purpose)}</strong></div>`;

      // Amount
      let amountHtml = '';
      if (item.estimatedAmount !== undefined && item.unit) {
        amountHtml = `<div class="rec-amount">${escapeHtml(formatAmount(item.estimatedAmount, item.unit))}</div>`;
      }

      // Reason
      const reasonHtml = `<div class="rec-detail">${escapeHtml(item.reason)}</div>`;

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

      parts.push(`
        <div class="rec-item ${severityClass}">
          ${nameHtml}
          ${amountHtml}
          ${reasonHtml}
          ${rangeHtml}
          ${safetyHtml}
          ${calcHtml}
          ${followHtml}
          <span class="rec-status rec-severity-${item.severity}">${escapeHtml(severityLabel)}</span>
        </div>
      `);
    }

    parts.push(`
      <div class="rec-disclaimer">
        <strong>Importante:</strong> Estas son recomendaciones <em>aproximadas</em>.
        Siga siempre las instrucciones de dosificación en las etiquetas de sus productos químicos.
        Si no está seguro, consulte a un profesional de mantenimiento de piscinas.
      </div>
    `);

    this.content.innerHTML = parts.join('');
  }

  hide(): void {
    this.section.hidden = true;
  }
}

function formatAmount(amount: number, unit: string): string {
  if (amount <= 0) return '—';
  if (unit === 'ml' && amount >= 1000) {
    const l = (amount / 1000).toFixed(1);
    return `${l} l`;
  }
  return `${amount} ${unit}`;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
