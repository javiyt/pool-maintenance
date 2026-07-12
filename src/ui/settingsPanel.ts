import type { PoolSettings } from '../domain/settings';
import { DEFAULT_SALT_CHLORINATOR, DEFAULT_HISTORICAL_LEARNING } from '../domain/settings';
import type { SaltChlorinatorConfig, HistoricalLearningConfig } from '../domain/settings';
import { loadSettings, saveSettings } from '../domain/storage';
import { t, setLanguage, getLanguage, validateLanguage } from '../i18n/index';
import type { AppLanguage } from '../i18n/types';

export class SettingsPanel {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private volumeInput: HTMLInputElement;
  private volumeUnitSelect: HTMLSelectElement;
  private poolTypeSelect: HTMLSelectElement;
  private unitSystemSelect: HTMLSelectElement;
  private scEnabled: HTMLInputElement;
  private scProduction: HTMLInputElement;
  private scOutput: HTMLInputElement;
  private scHours: HTMLInputElement;
  private scMaxOutput: HTMLInputElement;
  private scMaxHours: HTMLInputElement;
  private statusEl: HTMLElement;
  private scFields: NodeListOf<HTMLElement>;
  private hlEnabled: HTMLInputElement;
  private hlMinSamples: HTMLInputElement;
  private hlApplyLow: HTMLInputElement;
  private hlMinFactor: HTMLInputElement;
  private hlMaxFactor: HTMLInputElement;
  private hlFields: NodeListOf<HTMLElement>;
  private languageSelect: HTMLSelectElement;
  private onSave: ((s: PoolSettings) => void) | null = null;
  private onLangChange: ((lang: AppLanguage) => void) | null = null;

  constructor() {
    this.panel = document.getElementById('settingsPanel') as HTMLElement;
    this.overlay = document.getElementById('settingsOverlay') as HTMLElement;
    this.volumeInput = document.getElementById('poolVolume') as HTMLInputElement;
    this.volumeUnitSelect = document.getElementById('volumeUnit') as HTMLSelectElement;
    this.poolTypeSelect = document.getElementById('poolType') as HTMLSelectElement;
    this.unitSystemSelect = document.getElementById('unitSystem') as HTMLSelectElement;
    this.scEnabled = document.getElementById('scEnabled') as HTMLInputElement;
    this.scProduction = document.getElementById('scProduction') as HTMLInputElement;
    this.scOutput = document.getElementById('scOutput') as HTMLInputElement;
    this.scHours = document.getElementById('scHours') as HTMLInputElement;
    this.scMaxOutput = document.getElementById('scMaxOutput') as HTMLInputElement;
    this.scMaxHours = document.getElementById('scMaxHours') as HTMLInputElement;
    this.statusEl = document.getElementById('settingsStatus') as HTMLElement;
    this.scFields = document.querySelectorAll('.sc-field') as NodeListOf<HTMLElement>;
    this.hlEnabled = document.getElementById('hlEnabled') as HTMLInputElement;
    this.hlMinSamples = document.getElementById('hlMinSamples') as HTMLInputElement;
    this.hlApplyLow = document.getElementById('hlApplyLow') as HTMLInputElement;
    this.hlMinFactor = document.getElementById('hlMinFactor') as HTMLInputElement;
    this.hlMaxFactor = document.getElementById('hlMaxFactor') as HTMLInputElement;
    this.hlFields = document.querySelectorAll('.hl-field') as NodeListOf<HTMLElement>;
    this.languageSelect = document.getElementById('appLanguage') as HTMLSelectElement;

    const toggleBtn = document.getElementById('settingsToggleBtn') as HTMLButtonElement;
    const closeBtn = document.getElementById('settingsCloseBtn') as HTMLButtonElement;
    const saveBtn = document.getElementById('settingsSaveBtn') as HTMLButtonElement;

    toggleBtn.addEventListener('click', () => this.open());
    closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());
    saveBtn.addEventListener('click', () => this.handleSave());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.panel.hidden) this.close();
    });

    // Toggle salt chlorinator fields visibility
    this.scEnabled.addEventListener('change', () => this.toggleScFields());
    // Toggle historical learning fields visibility
    this.hlEnabled.addEventListener('change', () => this.toggleHlFields());
  }

  onChange(cb: (s: PoolSettings) => void): void {
    this.onSave = cb;
  }

  onLanguageChange(cb: (lang: AppLanguage) => void): void {
    this.onLangChange = cb;
  }

  open(): void {
    const s = loadSettings();
    this.volumeInput.value = s.volume > 0 ? String(s.volume) : '';
    this.volumeUnitSelect.value = s.volumeUnit;
    this.poolTypeSelect.value = s.poolType;
    this.unitSystemSelect.value = s.unitSystem;
    this.languageSelect.value = getLanguage();

    // Salt chlorinator fields
    const sc = s.saltChlorinator ?? DEFAULT_SALT_CHLORINATOR;
    this.scEnabled.checked = sc.enabled;
    this.scProduction.value = String(sc.productionGramsPerHour);
    this.scOutput.value = String(sc.currentOutputPercent);
    this.scHours.value = String(sc.filtrationHoursPerDay);
    this.scMaxOutput.value = String(sc.maxRecommendedOutputPercent);
    this.scMaxHours.value = String(sc.maxRecommendedHoursPerDay);
    this.toggleScFields();

    this.statusEl.textContent = '';
    this.statusEl.className = 'status-msg';

    // Historical learning fields
    const hl = { ...DEFAULT_HISTORICAL_LEARNING, ...s.historicalLearning };
    this.hlEnabled.checked = hl.enabled;
    this.hlMinSamples.value = String(hl.minimumSamples);
    this.hlApplyLow.checked = hl.applyLowConfidence;
    this.hlMinFactor.value = String(hl.minCorrectionFactor);
    this.hlMaxFactor.value = String(hl.maxCorrectionFactor);
    this.toggleHlFields();

    this.panel.hidden = false;
  }

  close(): void {
    this.panel.hidden = true;
  }

  private toggleScFields(): void {
    const visible = this.scEnabled.checked;
    for (const el of this.scFields) {
      (el as HTMLElement).style.display = visible ? '' : 'none';
    }
  }

  private toggleHlFields(): void {
    const visible = this.hlEnabled.checked;
    for (const el of this.hlFields) {
      (el as HTMLElement).style.display = visible ? '' : 'none';
    }
  }

  private handleSave(): void {
    const volume = parseFloat(this.volumeInput.value);

    if (isNaN(volume) || volume <= 0) {
      this.showStatus(t('settings.enterVolume'), 'error');
      return;
    }

    if (volume > 10000000) {
      this.showStatus(t('settings.volumeTooLarge'), 'error');
      return;
    }

    // Handle language change immediately
    const newLang = validateLanguage(this.languageSelect.value);
    if (newLang !== getLanguage()) {
      setLanguage(newLang);
    }

    const settings: PoolSettings = {
      volume,
      volumeUnit: this.volumeUnitSelect.value as PoolSettings['volumeUnit'],
      poolType: this.poolTypeSelect.value as PoolSettings['poolType'],
      unitSystem: this.unitSystemSelect.value as PoolSettings['unitSystem'],
      language: newLang,
    };

    // Salt chlorinator config
    if (this.scEnabled.checked) {
      const sc: SaltChlorinatorConfig = {
        enabled: true,
        productionGramsPerHour: parseFloat(this.scProduction.value) || DEFAULT_SALT_CHLORINATOR.productionGramsPerHour,
        currentOutputPercent: parseFloat(this.scOutput.value) || DEFAULT_SALT_CHLORINATOR.currentOutputPercent,
        filtrationHoursPerDay: parseFloat(this.scHours.value) || DEFAULT_SALT_CHLORINATOR.filtrationHoursPerDay,
        maxRecommendedOutputPercent: parseFloat(this.scMaxOutput.value) || DEFAULT_SALT_CHLORINATOR.maxRecommendedOutputPercent,
        maxRecommendedHoursPerDay: parseFloat(this.scMaxHours.value) || DEFAULT_SALT_CHLORINATOR.maxRecommendedHoursPerDay,
      };
      settings.saltChlorinator = sc;
    }

    // Historical learning config
    const hl: HistoricalLearningConfig = {
      enabled: this.hlEnabled.checked,
      minimumSamples: parseInt(this.hlMinSamples.value, 10) || DEFAULT_HISTORICAL_LEARNING.minimumSamples,
      applyLowConfidence: this.hlApplyLow.checked,
      minCorrectionFactor: parseFloat(this.hlMinFactor.value) || DEFAULT_HISTORICAL_LEARNING.minCorrectionFactor,
      maxCorrectionFactor: parseFloat(this.hlMaxFactor.value) || DEFAULT_HISTORICAL_LEARNING.maxCorrectionFactor,
    };
    settings.historicalLearning = hl;

    saveSettings(settings);
    this.showStatus(t('settings.saved'), 'success');

    // Notify language change first (so UI re-renders before settings panel closes)
    if (newLang !== undefined) {
      this.onLangChange?.(newLang);
    }

    this.onSave?.(settings);
  }

  private showStatus(msg: string, type: 'success' | 'error'): void {
    this.statusEl.textContent = msg;
    this.statusEl.className = `status-msg ${type}`;
  }

  /** Return the currently saved settings (for display in other panels). */
  getSettings(): PoolSettings {
    return loadSettings();
  }
}
