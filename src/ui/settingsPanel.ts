import type { PoolSettings } from '../domain/settings';
import { loadSettings, saveSettings } from '../domain/storage';

export class SettingsPanel {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private volumeInput: HTMLInputElement;
  private volumeUnitSelect: HTMLSelectElement;
  private poolTypeSelect: HTMLSelectElement;
  private unitSystemSelect: HTMLSelectElement;
  private statusEl: HTMLElement;
  private onSave: ((s: PoolSettings) => void) | null = null;

  constructor() {
    this.panel = document.getElementById('settingsPanel') as HTMLElement;
    this.overlay = document.getElementById('settingsOverlay') as HTMLElement;
    this.volumeInput = document.getElementById('poolVolume') as HTMLInputElement;
    this.volumeUnitSelect = document.getElementById('volumeUnit') as HTMLSelectElement;
    this.poolTypeSelect = document.getElementById('poolType') as HTMLSelectElement;
    this.unitSystemSelect = document.getElementById('unitSystem') as HTMLSelectElement;
    this.statusEl = document.getElementById('settingsStatus') as HTMLElement;

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
    this.statusEl.textContent = '';
    this.statusEl.className = 'status-msg';
    this.panel.hidden = false;
  }

  close(): void {
    this.panel.hidden = true;
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
