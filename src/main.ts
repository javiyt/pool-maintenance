import { SettingsPanel } from './ui/settingsPanel';
import { MeasurementForm } from './ui/measurementForm';
import { RecommendationsPanel } from './ui/recommendationsPanel';
import { HistoryPanel } from './ui/historyPanel';
import { addMeasurement } from './domain/storage';
import { calculateRecommendations } from './domain/chemistry';
import { loadSettings } from './domain/storage';

function toLocalDatetime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function init(): void {
  // Set default date-time to right now on the datetime-local input
  const dateTimeInput = document.getElementById('mDateTime') as HTMLInputElement;
  dateTimeInput.value = toLocalDatetime(new Date());

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
