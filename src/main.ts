import { SettingsPanel } from './ui/settingsPanel';
import { MeasurementForm } from './ui/measurementForm';
import { RecommendationsPanel } from './ui/recommendationsPanel';
import { HistoryPanel } from './ui/historyPanel';
import { ActionForm } from './ui/actionForm';
import { ActionHistory } from './ui/actionHistory';
import { HistoricalInsightsPanel } from './ui/historicalInsights';
import { FollowUpDashboard } from './ui/followUpDashboard';
import { addMeasurement, addFollowUp } from './domain/storage';
import { loadSettings, loadMeasurements, loadActions } from './domain/storage';
import { runPersonalizedAssistant } from './domain/maintenanceAssistant';
import { createFollowUp } from './domain/followUp';
import {
  setLanguage,
  detectBrowserLanguage,
  validateLanguage,
  t,
} from './i18n/index';
import type { AppLanguage } from './i18n/types';

function toLocalDatetime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function runAndShowRecommendations(
  recommendationsPanel: RecommendationsPanel,
): void {
  const settings = loadSettings();
  const measurements = loadMeasurements();
  const actions = loadActions();
  const result = runPersonalizedAssistant(measurements, actions, settings);
  recommendationsPanel.show(result);
}

function init(): void {
  // ── Initialize language ───────────────────────────────────────
  const savedSettings = loadSettings();
  const browserLang = detectBrowserLanguage();
  const initialLang = savedSettings.language
    ? validateLanguage(savedSettings.language)
    : browserLang;
  setLanguage(initialLang);

  // Set the <html lang> attribute
  document.documentElement.lang = initialLang === 'es' ? 'es' : 'en';

  // Set the document title
  document.title = t('app.title');

  // Set default date-time to right now on the datetime-local input
  const dateTimeInput = document.getElementById('mDateTime') as HTMLInputElement;
  dateTimeInput.value = toLocalDatetime(new Date());

  const settingsPanel = new SettingsPanel();
  const measurementForm = new MeasurementForm();
  const recommendationsPanel = new RecommendationsPanel();
  const historyPanel = new HistoryPanel();
  const actionForm = new ActionForm();
  const actionHistory = new ActionHistory();
  const historicalInsights = new HistoricalInsightsPanel();
  const followUpDashboard = new FollowUpDashboard();

  // ── Full re-render function (used on language change) ─────────
  function fullReRender(): void {
    // Update document title and html lang
    document.title = t('app.title');

    // Re-render all dynamic content
    historyPanel.render();
    actionHistory.render();
    historicalInsights.render();

    // Re-run recommendations if there are measurements
    const measurements = loadMeasurements();
    if (measurements.length > 0) {
      runAndShowRecommendations(recommendationsPanel);
    } else {
      recommendationsPanel.hide();
    }
  }

  // ── Handle language change from settings ──────────────────────
  settingsPanel.onLanguageChange((lang: AppLanguage) => {
    setLanguage(lang);
    fullReRender();
    // Update language dropdown to reflect current setting
    const langSelect = document.getElementById('appLanguage') as HTMLSelectElement;
    if (langSelect) langSelect.value = lang;
  });

  // Re-render history whenever measurements change
  historyPanel.onChange(() => {
    historyPanel.render();
    historicalInsights.render();
  });

  // Re-render history when settings change (e.g. pool type affects display)
  settingsPanel.onChange(() => {
    historyPanel.render();
    historicalInsights.render();
  });

  // Handle measurement submission
  measurementForm.onSubmit((measurement) => {
    addMeasurement(measurement);
    historyPanel.render();
    historicalInsights.render();

    // Evaluate pending follow-ups against new measurement
    followUpDashboard.evaluatePending();
    followUpDashboard.render();

    // Run the maintenance assistant with full history
    runAndShowRecommendations(recommendationsPanel);

    // Scroll to recommendations
    setTimeout(() => {
      document.getElementById('recommendationsSection')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  });

  // "Mark as performed" from recommendations → open action form with prefill
  recommendationsPanel.onMarkAsPerformed((prefill) => {
    actionForm.open(prefill);
  });

  // Action form save → update history and create follow-up
  actionForm.onSave((action, followUpInfo) => {
    actionHistory.render();
    historicalInsights.render();

    // Create a follow-up record for this action
    const followUp = createFollowUp(
      action,
      followUpInfo?.recommendationId,
      action.relatedMeasurementId,
      followUpInfo?.retestAfterHours,
    );
    if (followUp) {
      addFollowUp(followUp);
    }
    followUpDashboard.render();

    // Re-run recommendations to reflect the recorded action
    runAndShowRecommendations(recommendationsPanel);
  });

  // Initial render
  historyPanel.render();
  actionHistory.render();
  historicalInsights.render();
  followUpDashboard.render();
}

document.addEventListener('DOMContentLoaded', init);
