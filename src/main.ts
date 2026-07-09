import { SettingsPanel } from './ui/settingsPanel';
import { MeasurementForm } from './ui/measurementForm';
import { RecommendationsPanel } from './ui/recommendationsPanel';
import { HistoryPanel } from './ui/historyPanel';
import { addMeasurement } from './domain/storage';
import { calculateRecommendations } from './domain/chemistry';
import { loadSettings } from './domain/storage';

function init(): void {
  // Set today's date as default on the date input
  const dateInput = document.getElementById('mDate') as HTMLInputElement;
  dateInput.value = new Date().toISOString().slice(0, 10);

  const settingsPanel = new SettingsPanel();
  const measurementForm = new MeasurementForm();
  const recommendationsPanel = new RecommendationsPanel();
  const historyPanel = new HistoryPanel();

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

    // Calculate and show recommendations
    const settings = loadSettings();
    const result = calculateRecommendations(measurement, settings);
    recommendationsPanel.show(result);

    // Scroll to recommendations
    setTimeout(() => {
      document.getElementById('recommendationsSection')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  });

  // Initial render
  historyPanel.render();
}

document.addEventListener('DOMContentLoaded', init);
