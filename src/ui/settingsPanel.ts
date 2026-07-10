import type { PoolSettings } from '../domain/settings';
import { DEFAULT_SALT_CHLORINATOR } from '../domain/settings';
import type { SaltChlorinatorConfig } from '../domain/settings';
import { loadSettings, saveSettings } from '../domain/storage';

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
  private onSave: ((s: PoolSettings) => void) | null = null;

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
  }

  onChange(cb: (s: PoolSettings) => void): void {
    this.onSave = cb;
  }

  open(): void {
    const s = loadSettings();
    this.volumeInput.value = s.volume > 0 ? String(s.volume) : '';
    this.volumeUnitSelect.value = s.volumeUnit;
    this.poolTypeSelect.value = s.poolType;
    this.unitSystemSelect.value = s.unitSystem;

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

  private handleSave(): void {
    const volume = parseFloat(this.volumeInput.value);

    if (isNaN(volume) || volume <= 0) {
      this.showStatus('Please enter a pool volume greater than 0.', 'error');
      return;
    }

    if (volume > 10000000) {
      this.showStatus('Volume seems unreasonably large. Please double-check.', 'error');
      return;
    }

    const settings: PoolSettings = {
      volume,
      volumeUnit: this.volumeUnitSelect.value as PoolSettings['volumeUnit'],
      poolType: this.poolTypeSelect.value as PoolSettings['poolType'],
      unitSystem: this.unitSystemSelect.value as PoolSettings['unitSystem'],
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

    saveSettings(settings);
    this.showStatus('Settings saved.', 'success');
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
