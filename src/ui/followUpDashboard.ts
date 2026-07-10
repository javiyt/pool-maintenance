import {
  loadActions,
  loadFollowUps,
  saveFollowUps,
  loadMeasurements,
  updateFollowUp,
} from '../domain/storage';
import { evaluateActionOutcomes } from '../domain/actionOutcomeEvaluator';
import type { ActionOutcome } from '../domain/actionOutcomeEvaluator';
import {
  updateFollowUpStatuses,
  getPendingRetests,
  getRecentlyEvaluated,
  getEffectiveActions,
  getIneffectiveOrUnexpectedActions,
  getEligibleFollowUps,
  markFollowUpEvaluated,
  setFollowUpExclusionFlags,
  addUnusualEventNote,
  type FollowUp,
  type UnusualEventType,
  UNUSUAL_EVENT_LABELS,
} from '../domain/followUp';
import type { MaintenanceAction } from '../domain/actions';

export class FollowUpDashboard {
  private content: HTMLElement;

  constructor() {
    this.content = document.getElementById('followUpDashboardContent') as HTMLElement;
  }

  /**
   * Evaluate eligible follow-ups against the latest measurement data.
   * Call this after a new measurement is saved.
   */
  evaluatePending(): void {
    let followUps = loadFollowUps();
    const measurements = loadMeasurements();
    const actions = loadActions();

    if (measurements.length === 0 || followUps.length === 0) return;

    // Update statuses (due, expired)
    followUps = updateFollowUpStatuses(followUps);
    saveFollowUps(followUps);

    // Get eligible follow-ups for evaluation
    const eligible = getEligibleFollowUps(followUps);
    if (eligible.length === 0) return;

    // Compute all outcomes
    const outcomes = evaluateActionOutcomes(measurements, actions);
    const outcomeMap = new Map<string, ActionOutcome>();
    for (const o of outcomes) {
      outcomeMap.set(o.actionId, o);
    }

    // Match outcomes to eligible follow-ups
    let changed = false;
    for (const fu of eligible) {
      const outcome = outcomeMap.get(fu.actionId);
      if (outcome) {
        followUps = markFollowUpEvaluated(followUps, fu.actionId, outcome);
        changed = true;
      }
    }

    if (changed) {
      saveFollowUps(followUps);
    }
  }

  render(): void {
    let followUps = loadFollowUps();
    const actions = loadActions();

    // Update statuses first
    followUps = updateFollowUpStatuses(followUps);
    saveFollowUps(followUps);

    if (followUps.length === 0) {
      this.content.innerHTML =
        '<p class="empty-state">No follow-up actions to track. When you mark a recommendation as performed, a follow-up will appear here.</p>';
      return;
    }

    const actionMap = new Map(actions.map((a) => [a.id, a]));
    const pending = getPendingRetests(followUps);
    const recent = getRecentlyEvaluated(followUps);
    const effective = getEffectiveActions(followUps);
    const ineffUnexp = getIneffectiveOrUnexpectedActions(followUps);

    const sections: string[] = [];

    // ── Pending retests section ──
    if (pending.length > 0) {
      sections.push(`
        <div class="followup-section">
          <h3 class="followup-section-title">Pending Retests</h3>
          <div class="followup-list">
            ${pending.map((fu) => this.renderPendingItem(fu, actionMap)).join('')}
          </div>
        </div>
      `);
    }

    // ── Recently evaluated section ──
    if (recent.length > 0) {
      sections.push(`
        <div class="followup-section">
          <h3 class="followup-section-title">Recently Evaluated</h3>
          <div class="followup-list">
            ${recent.map((fu) => this.renderEvaluatedItem(fu, actionMap)).join('')}
          </div>
        </div>
      `);
    }

    // ── Effective actions section ──
    if (effective.length > 0) {
      sections.push(`
        <div class="followup-section">
          <h3 class="followup-section-title">Effective Actions</h3>
          <div class="followup-list">
            ${effective.slice(0, 5).map((fu) => this.renderEvaluatedItem(fu, actionMap)).join('')}
          </div>
        </div>
      `);
    }

    // ── Ineffective / unexpected section ──
    if (ineffUnexp.length > 0) {
      sections.push(`
        <div class="followup-section">
          <h3 class="followup-section-title">Ineffective or Unexpected Actions</h3>
          <div class="followup-list">
            ${ineffUnexp.slice(0, 5).map((fu) => this.renderEvaluatedItem(fu, actionMap, false)).join('')}
          </div>
          ${ineffUnexp.length > 5 ? `<p class="followup-more">+ ${ineffUnexp.length - 5} more</p>` : ''}
        </div>
      `);
    }

    this.content.innerHTML = sections.join('') || '<p class="empty-state">No follow-up data to display.</p>';

    // Bind flag/note controls
    this.bindControls();
  }

  private renderPendingItem(fu: FollowUp, actionMap: Map<string, MaintenanceAction>): string {
    const action = actionMap.get(fu.actionId);
    const actionDesc = action ? escapeHtml(action.description) : 'Unknown action';
    const delayLabel = delayHoursToString(fu.suggestedRetestDelay);
    const statusLabel = fu.status === 'retest-due' ? '🔴 Due now' : '⏳ Awaiting retest';

    // Generate a message based on action kind
    const actionKind = action?.kind;
    const message = this.getPendingMessage(actionKind, actionDesc);

    return `
      <div class="followup-item followup-pending" data-fu-id="${escapeHtml(fu.id)}">
        <div class="followup-meta">
          <span class="followup-status-badge ${fu.status === 'retest-due' ? 'badge-due' : 'badge-waiting'}">${statusLabel}</span>
          <span class="followup-time">Retest after ~${delayLabel}</span>
        </div>
        <div class="followup-message">${escapeHtml(message)}</div>
        <div class="followup-actions">
          <div class="followup-flags">
            <label class="followup-flag">
              <input type="checkbox" class="fu-atypical" ${fu.atypical ? 'checked' : ''} />
              Atypical
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-incorrect" ${fu.incorrectlyRecorded ? 'checked' : ''} />
              Incorrect record
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-exclude" ${fu.excludedFromLearning ? 'checked' : ''} />
              Exclude from learning
            </label>
          </div>
          <div class="followup-event-notes">
            <select class="fu-event-select">
              <option value="">Add unusual event…</option>
              ${Object.entries(UNUSUAL_EVENT_LABELS).map(([key, label]) =>
                `<option value="${key}">${escapeHtml(label)}</option>`
              ).join('')}
            </select>
            ${fu.unusualEventNotes.length > 0
              ? `<div class="followup-event-tags">${fu.unusualEventNotes.map((n) =>
                  `<span class="followup-event-tag">${escapeHtml(UNUSUAL_EVENT_LABELS[n.eventType as UnusualEventType] ?? n.eventType)}${n.note ? `: ${escapeHtml(n.note)}` : ''}</span>`
                ).join('')}</div>`
              : ''}
          </div>
        </div>
        ${action?.unusualEventNotes && action.unusualEventNotes.length > 0
          ? `<div class="followup-event-tags">${action.unusualEventNotes.map((n: any) =>
              `<span class="followup-event-tag">${escapeHtml(UNUSUAL_EVENT_LABELS[n.eventType as UnusualEventType] ?? n.eventType)}${n.note ? `: ${escapeHtml(n.note)}` : ''}</span>`
            ).join('')}</div>`
          : ''}
      </div>
    `;
  }

  private renderEvaluatedItem(fu: FollowUp, actionMap: Map<string, MaintenanceAction>, showEffectiveness: boolean = true): string {
    const action = actionMap.get(fu.actionId);
    const actionDesc = action ? escapeHtml(action.description) : 'Unknown action';
    const outcome = fu.outcome;

    let outcomeHtml = '';
    if (outcome && showEffectiveness) {
      const effectivenessLabel = outcome.effectiveness === 'effective' ? '✅ Effective'
        : outcome.effectiveness === 'partially-effective' ? '🟡 Partial'
        : outcome.effectiveness === 'ineffective' ? '❌ Ineffective'
        : outcome.effectiveness === 'unexpected' ? '🔮 Unexpected'
        : '❓ Unknown';

      const changesHtml = renderChanges(outcome.changes);
      outcomeHtml = `
        <div class="followup-outcome">
          <span class="followup-effectiveness">${effectivenessLabel}</span>
          <span class="followup-confidence">${Math.round(outcome.confidence * 100)}% confidence</span>
          <div class="followup-changes">${changesHtml}</div>
        </div>
      `;
    }

    const message = outcome && outcome.changes
      ? this.getOutcomeMessage(action, outcome)
      : '';

    return `
      <div class="followup-item followup-evaluated" data-fu-id="${escapeHtml(fu.id)}">
        <div class="followup-meta">
          <span class="followup-date">${escapeHtml(formatDateTime(fu.evaluatedAt ?? fu.createdAt))}</span>
          <span class="followup-description">${actionDesc}</span>
        </div>
        ${message ? `<div class="followup-message">${escapeHtml(message)}</div>` : ''}
        ${outcomeHtml}
        <div class="followup-actions">
          <div class="followup-flags">
            <label class="followup-flag">
              <input type="checkbox" class="fu-atypical" ${fu.atypical ? 'checked' : ''} />
              Atypical
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-incorrect" ${fu.incorrectlyRecorded ? 'checked' : ''} />
              Incorrect record
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-exclude" ${fu.excludedFromLearning ? 'checked' : ''} />
              Exclude from learning
            </label>
          </div>
        </div>
      </div>
    `;
  }

  private getPendingMessage(actionKind: string | undefined, actionDesc: string): string {
    switch (actionKind) {
      case 'chemical':
        return `You added ${actionDesc.toLowerCase().replace(/^added\s+/i, '')}. Add a new measurement to evaluate the result.`;
      case 'chlorinator':
        return `You adjusted the chlorinator. Add a new measurement to see if FAC has improved.`;
      case 'filtration':
        return `You changed the filtration schedule. Add a new measurement to check the effect on water quality.`;
      case 'water-replacement':
        return `You performed a water replacement. Add a new measurement to check salt and TDS levels.`;
      default:
        return `Action recorded: ${actionDesc}. Add a new measurement to evaluate the result.`;
    }
  }

  private getOutcomeMessage(action: MaintenanceAction | undefined, outcome: ActionOutcome): string {
    if (!action) return '';
    const changes: string[] = [];
    if (outcome.changes.fac !== undefined) changes.push(`FAC ${formatDelta(outcome.changes.fac)} ppm`);
    if (outcome.changes.ph !== undefined) changes.push(`pH ${formatDelta(outcome.changes.ph)}`);
    if (outcome.changes.orp !== undefined) changes.push(`ORP ${formatDelta(outcome.changes.orp)}`);
    if (outcome.changes.salt !== undefined) changes.push(`Salt ${formatDelta(outcome.changes.salt)}`);

    if (changes.length > 0) {
      return `${changes.join(', ')} after the action.`;
    }
    return '';
  }

  private bindControls(): void {
    // Bind flag checkboxes
    this.content.querySelectorAll('.fu-atypical, .fu-incorrect, .fu-exclude').forEach((cb) => {
      cb.addEventListener('change', () => {
        const item = (cb as HTMLElement).closest('[data-fu-id]') as HTMLElement;
        if (!item) return;
        const fuId = item.dataset.fuId;
        if (!fuId) return;

        const fu = loadFollowUps().find((f) => f.id === fuId);
        if (!fu) return;

        const updated = setFollowUpExclusionFlags(fu, {
          atypical: (item.querySelector('.fu-atypical') as HTMLInputElement)?.checked,
          incorrectlyRecorded: (item.querySelector('.fu-incorrect') as HTMLInputElement)?.checked,
          excludedFromLearning: (item.querySelector('.fu-exclude') as HTMLInputElement)?.checked,
        });
        updateFollowUp(fuId, {
          atypical: updated.atypical,
          incorrectlyRecorded: updated.incorrectlyRecorded,
          excludedFromLearning: updated.excludedFromLearning,
        });
      });
    });

    // Bind event note selects
    this.content.querySelectorAll('.fu-event-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const item = (sel as HTMLElement).closest('[data-fu-id]') as HTMLElement;
        if (!item) return;
        const fuId = item.dataset.fuId;
        if (!fuId) return;
        const eventType = (sel as HTMLSelectElement).value;
        if (!eventType) return;

        const fu = loadFollowUps().find((f) => f.id === fuId);
        if (!fu) return;

        const updated = addUnusualEventNote(fu, eventType as UnusualEventType);
        // Also update the action's unusualEventNotes
        updateFollowUp(fuId, { unusualEventNotes: updated.unusualEventNotes });
        (sel as HTMLSelectElement).value = '';
        this.render();
      });
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function renderChanges(changes: { ph?: number; ec?: number; tds?: number; salt?: number; orp?: number; fac?: number; temperature?: number }): string {
  const parts: string[] = [];
  if (changes.ph !== undefined) parts.push(`pH ${formatDelta(changes.ph)}`);
  if (changes.fac !== undefined) parts.push(`FAC ${formatDelta(changes.fac)}`);
  if (changes.orp !== undefined) parts.push(`ORP ${formatDelta(changes.orp)}`);
  if (changes.salt !== undefined) parts.push(`Salt ${formatDelta(changes.salt)}`);
  if (changes.ec !== undefined) parts.push(`EC ${formatDelta(changes.ec)}`);
  if (changes.tds !== undefined) parts.push(`TDS ${formatDelta(changes.tds)}`);
  if (changes.temperature !== undefined) parts.push(`Temp ${formatDelta(changes.temperature)}`);

  if (parts.length === 0) return 'No changes measured.';
  return parts.join(' · ');
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function delayHoursToString(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
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
