import { t, formatDateTime } from '../i18n/index';
import type { TranslationKey } from '../i18n/types';
import {
  loadActions,
  saveActions,
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
} from '../domain/followUp';
import type { MaintenanceAction } from '../domain/actions';

const EVENT_TYPE_KEYS: Array<{ key: string; tKey: TranslationKey }> = [
  { key: 'rain', tKey: 'event.rain' },
  { key: 'manyBathers', tKey: 'event.manyBathers' },
  { key: 'refill', tKey: 'event.refill' },
  { key: 'cleaning', tKey: 'event.cleaning' },
  { key: 'coverRemoved', tKey: 'event.coverRemoved' },
  { key: 'equipmentIssue', tKey: 'event.equipmentIssue' },
];

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
        `<p class="empty-state">${escapeHtml(t('followup.empty'))}</p>`;
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
          <h3 class="followup-section-title">${escapeHtml(t('followup.pending.title'))}</h3>
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
          <h3 class="followup-section-title">${escapeHtml(t('followup.evaluated.title'))}</h3>
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
          <h3 class="followup-section-title">${escapeHtml(t('followup.effective.title'))}</h3>
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
          <h3 class="followup-section-title">${escapeHtml(t('followup.ineffective.title'))}</h3>
          <div class="followup-list">
            ${ineffUnexp.slice(0, 5).map((fu) => this.renderEvaluatedItem(fu, actionMap, false)).join('')}
          </div>
          ${ineffUnexp.length > 5 ? `<p class="followup-more">${escapeHtml(t('followup.more', { count: ineffUnexp.length - 5 }))}</p>` : ''}
        </div>
      `);
    }

    this.content.innerHTML = sections.join('') || `<p class="empty-state">${escapeHtml(t('followup.noData'))}</p>`;

    // Bind flag/note controls
    this.bindControls();
  }

  private renderPendingItem(fu: FollowUp, actionMap: Map<string, MaintenanceAction>): string {
    const action = actionMap.get(fu.actionId);
    const actionDesc = action ? escapeHtml(action.description) : 'Unknown action';
    const delayLabel = delayHoursToString(fu.suggestedRetestDelay);
    const statusLabel = t(fu.status === 'retest-due' ? 'followup.dueNow' : 'followup.awaitingRetest');

    // Generate a message based on action kind
    const actionKind = action?.kind;
    const message = this.getPendingMessage(actionKind, actionDesc);

    return `
      <div class="followup-item followup-pending" data-fu-id="${escapeHtml(fu.id)}">
        <div class="followup-meta">
          <span class="followup-status-badge ${fu.status === 'retest-due' ? 'badge-due' : 'badge-waiting'}">${statusLabel}</span>
          <span class="followup-time">${escapeHtml(t('followup.retestAfter', { delay: delayLabel }))}</span>
        </div>
        <div class="followup-message">${escapeHtml(message)}</div>
        <div class="followup-actions">
          <div class="followup-flags">
            <label class="followup-flag">
              <input type="checkbox" class="fu-atypical" ${fu.atypical ? 'checked' : ''} />
              ${escapeHtml(t('followup.atypical'))}
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-incorrect" ${fu.incorrectlyRecorded ? 'checked' : ''} />
              ${escapeHtml(t('followup.incorrectRecord'))}
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-exclude" ${fu.excludedFromLearning ? 'checked' : ''} />
              ${escapeHtml(t('followup.excludeFromLearning'))}
            </label>
          </div>
          <div class="followup-event-notes">
            <select class="fu-event-select">
              <option value="">${escapeHtml(t('followup.addEvent'))}</option>
              ${EVENT_TYPE_KEYS.map(({ key, tKey }) =>
                `<option value="${key}">${escapeHtml(t(tKey))}</option>`
              ).join('')}
            </select>
            ${fu.unusualEventNotes.length > 0
              ? `<div class="followup-event-tags">${fu.unusualEventNotes.map((n) => {
                  const label = n.eventType in EVENT_TYPE_KEYS_MAP
                    ? t(EVENT_TYPE_KEYS_MAP[n.eventType as keyof typeof EVENT_TYPE_KEYS_MAP])
                    : n.eventType;
                  return `<span class="followup-event-tag">${escapeHtml(label)}${n.note ? `: ${escapeHtml(n.note)}` : ''}</span>`;
                }).join('')}</div>`
              : ''}
          </div>
        </div>
        ${action?.unusualEventNotes && action.unusualEventNotes.length > 0
          ? `<div class="followup-event-tags">${action.unusualEventNotes.map((n: any) => {
              const label = n.eventType in EVENT_TYPE_KEYS_MAP
                ? t(EVENT_TYPE_KEYS_MAP[n.eventType as keyof typeof EVENT_TYPE_KEYS_MAP])
                : n.eventType;
              return `<span class="followup-event-tag">${escapeHtml(label)}${n.note ? `: ${escapeHtml(n.note)}` : ''}</span>`;
            }).join('')}</div>`
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
      const effectivenessKey: TranslationKey = outcome.effectiveness === 'effective' ? 'outcome.effective'
        : outcome.effectiveness === 'partially-effective' ? 'outcome.partiallyEffective'
        : outcome.effectiveness === 'ineffective' ? 'outcome.ineffective'
        : outcome.effectiveness === 'unexpected' ? 'outcome.unexpected'
        : outcome.effectiveness === 'inconclusive' ? 'outcome.inconclusive'
        : 'outcome.unknown';

      const effectivenessEmoji: Record<string, string> = {
        'effective': '✅',
        'partially-effective': '🟡',
        'ineffective': '❌',
        'unexpected': '🔮',
        'inconclusive': '❔',
      };
      const emoji = effectivenessEmoji[outcome.effectiveness] ?? '❓';
      const effectivenessLabel = `${emoji} ${t(effectivenessKey)}`;

      const changesHtml = renderChanges(outcome.changes);
      outcomeHtml = `
        <div class="followup-outcome">
          <span class="followup-effectiveness">${escapeHtml(effectivenessLabel)}</span>
          <span class="followup-confidence">${escapeHtml(t('outcome.confidence', { pct: Math.round(outcome.confidence * 100) }))}</span>
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
              ${escapeHtml(t('followup.atypical'))}
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-incorrect" ${fu.incorrectlyRecorded ? 'checked' : ''} />
              ${escapeHtml(t('followup.incorrectRecord'))}
            </label>
            <label class="followup-flag">
              <input type="checkbox" class="fu-exclude" ${fu.excludedFromLearning ? 'checked' : ''} />
              ${escapeHtml(t('followup.excludeFromLearning'))}
            </label>
          </div>
        </div>
      </div>
    `;
  }

  private getPendingMessage(actionKind: string | undefined, actionDesc: string): string {
    switch (actionKind) {
      case 'chemical':
        return t('followup.pending.chemical', { desc: stripAddedPrefix(actionDesc) });
      case 'chlorinator':
        return t('followup.pending.chlorinator');
      case 'filtration':
        return t('followup.pending.filtration');
      case 'water-replacement':
        return t('followup.pending.waterReplacement');
      default:
        return t('followup.pending.generic', { desc: actionDesc });
    }
  }

  private getOutcomeMessage(action: MaintenanceAction | undefined, outcome: ActionOutcome): string {
    if (!action) return '';
    const changes: string[] = [];
    if (outcome.changes.fac !== undefined) changes.push(t('outcome.changes.fac', { delta: formatDelta(outcome.changes.fac) }));
    if (outcome.changes.ph !== undefined) changes.push(t('outcome.changes.ph', { delta: formatDelta(outcome.changes.ph) }));
    if (outcome.changes.orp !== undefined) changes.push(t('outcome.changes.orp', { delta: formatDelta(outcome.changes.orp) }));
    if (outcome.changes.salt !== undefined) changes.push(t('outcome.changes.salt', { delta: formatDelta(outcome.changes.salt) }));

    if (changes.length > 0) {
      return changes.join(', ') + '.';
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

        const atypical = (item.querySelector('.fu-atypical') as HTMLInputElement)?.checked ?? false;
        const incorrectlyRecorded = (item.querySelector('.fu-incorrect') as HTMLInputElement)?.checked ?? false;
        const excludedFromLearning = (item.querySelector('.fu-exclude') as HTMLInputElement)?.checked ?? false;

        const updated = setFollowUpExclusionFlags(fu, {
          atypical,
          incorrectlyRecorded,
          excludedFromLearning,
        });
        updateFollowUp(fuId, {
          atypical: updated.atypical,
          incorrectlyRecorded: updated.incorrectlyRecorded,
          excludedFromLearning: updated.excludedFromLearning,
        });

        // Sync exclusion flags to the associated Action so computeLearning respects them
        const actions = loadActions();
        const actionIdx = actions.findIndex((a) => a.id === fu.actionId);
        if (actionIdx !== -1) {
          actions[actionIdx] = {
            ...actions[actionIdx],
            exclusionFlags: { atypical, incorrectlyRecorded, excludedFromLearning },
          };
          saveActions(actions);
        }
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

/** Lookup from event type string (e.g. 'rain') to its TranslationKey. */
const EVENT_TYPE_KEYS_MAP: Record<string, TranslationKey> = {
  rain: 'event.rain',
  manyBathers: 'event.manyBathers',
  refill: 'event.refill',
  cleaning: 'event.cleaning',
  coverRemoved: 'event.coverRemoved',
  equipmentIssue: 'event.equipmentIssue',
};

function renderChanges(changes: { ph?: number; ec?: number; tds?: number; salt?: number; orp?: number; fac?: number; temperature?: number }): string {
  const parts: string[] = [];
  if (changes.ph !== undefined) parts.push(t('outcome.changes.ph', { delta: formatDelta(changes.ph) }));
  if (changes.fac !== undefined) parts.push(t('outcome.changes.fac', { delta: formatDelta(changes.fac) }));
  if (changes.orp !== undefined) parts.push(t('outcome.changes.orp', { delta: formatDelta(changes.orp) }));
  if (changes.salt !== undefined) parts.push(t('outcome.changes.salt', { delta: formatDelta(changes.salt) }));
  if (changes.ec !== undefined) parts.push(t('outcome.changes.ec', { delta: formatDelta(changes.ec) }));
  if (changes.tds !== undefined) parts.push(t('outcome.changes.tds', { delta: formatDelta(changes.tds) }));
  if (changes.temperature !== undefined) parts.push(t('outcome.changes.temperature', { delta: formatDelta(changes.temperature) }));

  if (parts.length === 0) return t('outcome.noChanges');
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

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Strip a leading "Added " (case-insensitive) prefix from a description string. */
function stripAddedPrefix(s: string): string {
  return s.replace(/^[Aa]dded\s/, '');
}
