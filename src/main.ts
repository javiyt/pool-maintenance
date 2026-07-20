import { SettingsPanel } from './ui/settingsPanel';
import { MeasurementForm } from './ui/measurementForm';
import { RecommendationsPanel } from './ui/recommendationsPanel';
import { HistoryPanel } from './ui/historyPanel';
import { ActionForm } from './ui/actionForm';
import { ActionHistory } from './ui/actionHistory';
import { HistoricalInsightsPanel } from './ui/historicalInsights';
import { FollowUpDashboard } from './ui/followUpDashboard';
import { DashboardPanel } from './ui/dashboardPanel';
import { MeasurementDevicesPage } from './ui/measurementDevicesPage';
import { AppShell } from './ui/appShell';
import { PwaController } from './ui/pwaController';
import { addMeasurement, addFollowUp } from './domain/storage';
import { loadSettings, saveSettings, loadMeasurements, loadActions } from './domain/storage';
import { runPersonalizedAssistant } from './domain/maintenanceAssistant';
import { createFollowUp } from './domain/followUp';
import {
  setLanguage,
  validateLanguage,
  t,
  applyStaticTranslations,
} from './i18n/index';
import { applyThemePreference } from './ui/theme';

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
  recommendationsPanel.setHistory(measurements, actions, settings);
  const result = runPersonalizedAssistant(measurements, actions, settings);
  recommendationsPanel.show(result);
}

function init(): void {
  // ── Initialize language ───────────────────────────────────────
  const savedSettings = loadSettings();
  const initialLang = savedSettings.language
    ? validateLanguage(savedSettings.language)
    : 'es';
  setLanguage(initialLang);
  applyThemePreference(savedSettings.appearance ?? 'system');

  // Persist browser-derived default on first visit so the selector
  // and reload behaviour remain deterministic
  if (!savedSettings.language) {
    saveSettings({ ...savedSettings, language: initialLang });
  }

  // Apply translations to static HTML elements (headings, labels, etc.)
  applyStaticTranslations();

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
  const dashboardPanel = new DashboardPanel();
  const measurementDevicesPage = new MeasurementDevicesPage();
  const pwaController = new PwaController({
    unsavedChanges: () => measurementForm.hasUnsavedChanges() || actionForm.hasUnsavedChanges(),
  });
  const appShell = new AppShell((route) => {
    settingsPanel.open();
    if (route === '/settings/install') {
      document.getElementById('installSettingsSection')?.scrollIntoView({ block: 'start' });
    }
    if (route === '/settings/backup') {
      document.getElementById('backupSettingsSection')?.scrollIntoView({ block: 'start' });
    }
  }, (route) => {
    if (route === '/settings/measurement-devices' || route.startsWith('/settings/measurement-devices/')) {
      measurementDevicesPage.render(route);
    }
  });

  // ── Full re-render function (used on language change) ─────────
  function fullReRender(): void {
    // Re-apply static translations to all data-i18n elements
    applyStaticTranslations();

    // Update document title and html lang
    document.title = t('app.title');

    // Re-render all dynamic content
    historyPanel.render();
    actionHistory.render();
    historicalInsights.render();
    followUpDashboard.render();
    dashboardPanel.render();
    measurementDevicesPage.render(appShell.currentRoute());
    pwaController.renderInstall();

    // Re-run recommendations if there are measurements
    const measurements = loadMeasurements();
    if (measurements.length > 0) {
      runAndShowRecommendations(recommendationsPanel);
    } else {
      recommendationsPanel.hide();
    }
  }

  // ── Handle language change from settings ──────────────────────
  settingsPanel.onLanguageChange(() => {
    fullReRender();
  });

  // Re-render history whenever measurements change
  historyPanel.onChange(() => {
    historyPanel.render();
    actionHistory.render();
    historicalInsights.render();
    followUpDashboard.render();
    dashboardPanel.render();
    if (loadMeasurements().length > 0) {
      runAndShowRecommendations(recommendationsPanel);
    } else {
      recommendationsPanel.hide();
    }
  });

  // Re-render history when settings change (e.g. pool type affects display)
  settingsPanel.onChange(() => {
    measurementForm.refreshChlorinatorContextFields();
    historyPanel.render();
    historicalInsights.render();
    applyThemePreference(loadSettings().appearance ?? 'system');
    dashboardPanel.render();
  });

  // Handle measurement submission
  measurementForm.onSubmit((measurement) => {
    addMeasurement(measurement);
    historyPanel.render();
    historicalInsights.render();
    dashboardPanel.render();
    pwaController.noteMeaningfulAction();

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

  document.getElementById('recordActionBtn')?.addEventListener('click', () => {
    actionForm.open();
  });

  // Action form save → update history and create follow-up
  actionForm.onSave((action, followUpInfo) => {
    actionHistory.render();
    historicalInsights.render();
    dashboardPanel.render();

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
    dashboardPanel.render();
  });

  // Initial render
  dashboardPanel.render();
  historyPanel.render();
  actionHistory.render();
  historicalInsights.render();
  followUpDashboard.render();
  if (loadMeasurements().length > 0) {
    runAndShowRecommendations(recommendationsPanel);
  }
  appShell.start();
  pwaController.start();
}

document.addEventListener('DOMContentLoaded', init);
