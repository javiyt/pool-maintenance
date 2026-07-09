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
      parts.push(`<div class="rec-warning rec-danger">⚠ ${escapeHtml(w)}</div>`);
    }

    if (result.items.length === 0) {
      parts.push('<p>All measured values are within target ranges. No chemical adjustments needed.</p>');
    }

    for (const item of result.items) {
      const statusLabel = item.danger?.label ?? 'ok';
      const statusMsg = item.danger?.message ?? '';
      parts.push(`
        <div class="rec-item">
          <div class="rec-chemical">${escapeHtml(item.chemical)}</div>
          <div class="rec-amount">${escapeHtml(item.amount)}</div>
          <div class="rec-detail">${escapeHtml(item.reason)}</div>
          <div class="rec-detail">Target: ${escapeHtml(item.targetRange)}</div>
          <span class="rec-status ${statusLabel}">${escapeHtml(statusMsg)}</span>
        </div>
      `);
    }

    parts.push(`
      <div class="rec-disclaimer">
        <strong>Important:</strong> These are <em>approximate</em> recommendations.
        Always follow the dosage instructions on your chemical product labels.
        If you are unsure, consult a professional pool service.
      </div>
    `);

    this.content.innerHTML = parts.join('');
  }

  hide(): void {
    this.section.hidden = true;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
