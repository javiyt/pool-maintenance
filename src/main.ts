import { SettingsPanel } from './ui/settingsPanel';
import { MeasurementForm } from './ui/measurementForm';
import { RecommendationsPanel } from './ui/recommendationsPanel';
import { HistoryPanel } from './ui/historyPanel';
import { ActionForm } from './ui/actionForm';
import { ActionHistory } from './ui/actionHistory';
import { addMeasurement } from './domain/storage';
import { loadSettings, loadMeasurements } from './domain/storage';
import { runAssistant } from './domain/maintenanceAssistant';

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
  const result = runAssistant(measurements, settings);
  recommendationsPanel.show(result);
}

function init(): void {
  // Set default date-time to right now on the datetime-local input
  const dateTimeInput = document.getElementById('mDateTime') as HTMLInputElement;
  dateTimeInput.value = toLocalDatetime(new Date());

  const settingsPanel = new SettingsPanel();
  const measurementForm = new MeasurementForm();
  const recommendationsPanel = new RecommendationsPanel();
  const historyPanel = new HistoryPanel();
  const actionForm = new ActionForm();
  const actionHistory = new ActionHistory();

  // Re-render history whenever measurements change
  historyPanel.onChange(() => {
    historyPanel.render();
  });

  // Re-render history when settings change (e.g. pool type affects display)
  settingsPanel.onChange(() => {
    historyPanel.render();
  });

  // Handle measurement submission
  measurementForm.onSubmit((measurement) => {
    addMeasurement(measurement);
    historyPanel.render();

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

  // Action form save → update history
  actionForm.onSave(() => {
    actionHistory.render();
    // Re-run recommendations to reflect the recorded action
    runAndShowRecommendations(recommendationsPanel);
  });

  // Initial render
  historyPanel.render();
  actionHistory.render();
}

document.addEventListener('DOMContentLoaded', init);
