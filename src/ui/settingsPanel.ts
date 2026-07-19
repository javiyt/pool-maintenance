import type { PoolSettings } from '../domain/settings';
import { DEFAULT_HISTORICAL_LEARNING, DEFAULT_SALT_CHLORINATOR } from '../domain/settings';
import type { HistoricalLearningConfig, SaltChlorinatorConfig } from '../domain/settings';
import {
  createChlorinatorConfigFromPreset,
  getChlorinatorModeDefinitions,
  getChlorinatorOutputControl,
  migrateSaltChlorinatorConfig,
} from '../domain/saltChlorinator';
import type { ChlorinatorModeDefinition, ChlorinatorOutputControl, ChlorinatorPresetId } from '../domain/saltChlorinator';
import { loadSettings, saveSettings } from '../domain/storage';
import { getLanguage, setLanguage, t, validateLanguage } from '../i18n/index';
import type { AppLanguage } from '../i18n/types';

type SaveState = 'disabled' | 'enabled' | 'saving' | 'saved' | 'error';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export class SettingsPanel {
  private panel: HTMLElement;
  private drawer: HTMLElement;
  private overlay: HTMLElement;
  private body: HTMLElement;
  private volumeInput: HTMLInputElement;
  private volumeUnitSelect: HTMLSelectElement;
  private poolTypeSelect: HTMLSelectElement;
  private unitSystemSelect: HTMLSelectElement;
  private scEnabled: HTMLInputElement;
  private scPreset: HTMLSelectElement;
  private scControlKind: HTMLSelectElement;
  private scManufacturer: HTMLInputElement;
  private scModel: HTMLInputElement;
  private scProduction: HTMLInputElement;
  private scOutput: HTMLInputElement;
  private scHours: HTMLInputElement;
  private scMaxOutput: HTMLInputElement;
  private scMaxHours: HTMLInputElement;
  private scBoostSupported: HTMLInputElement;
  private scBoostDuration: HTMLInputElement;
  private statusEl: HTMLElement;
  private scFields: NodeListOf<HTMLElement>;
  private hlEnabled: HTMLInputElement;
  private hlMinSamples: HTMLInputElement;
  private hlApplyLow: HTMLInputElement;
  private hlMinFactor: HTMLInputElement;
  private hlMaxFactor: HTMLInputElement;
  private hlFields: NodeListOf<HTMLElement>;
  private languageSelect: HTMLSelectElement;
  private saveBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private previousFocused: HTMLElement | null = null;
  private initialSnapshot = '';
  private saveState: SaveState = 'disabled';
  private onSave: ((s: PoolSettings) => void) | null = null;
  private onLangChange: ((lang: AppLanguage) => void) | null = null;

  constructor() {
    this.panel = requiredElement('settingsPanel');
    this.drawer = requiredElementBySelector('.settings-drawer');
    this.overlay = requiredElement('settingsOverlay');
    this.body = requiredElementBySelector('.settings-body');
    this.volumeInput = requiredElement<HTMLInputElement>('poolVolume');
    this.volumeUnitSelect = requiredElement<HTMLSelectElement>('volumeUnit');
    this.poolTypeSelect = requiredElement<HTMLSelectElement>('poolType');
    this.unitSystemSelect = requiredElement<HTMLSelectElement>('unitSystem');
    this.scEnabled = requiredElement<HTMLInputElement>('scEnabled');
    this.scPreset = requiredElement<HTMLSelectElement>('scPreset');
    this.scControlKind = requiredElement<HTMLSelectElement>('scControlKind');
    this.scManufacturer = requiredElement<HTMLInputElement>('scManufacturer');
    this.scModel = requiredElement<HTMLInputElement>('scModel');
    this.scProduction = requiredElement<HTMLInputElement>('scProduction');
    this.scOutput = requiredElement<HTMLInputElement>('scOutput');
    this.scHours = requiredElement<HTMLInputElement>('scHours');
    this.scMaxOutput = requiredElement<HTMLInputElement>('scMaxOutput');
    this.scMaxHours = requiredElement<HTMLInputElement>('scMaxHours');
    this.scBoostSupported = requiredElement<HTMLInputElement>('scBoostSupported');
    this.scBoostDuration = requiredElement<HTMLInputElement>('scBoostDuration');
    this.statusEl = requiredElement('settingsStatus');
    this.scFields = document.querySelectorAll('.sc-field') as NodeListOf<HTMLElement>;
    this.hlEnabled = requiredElement<HTMLInputElement>('hlEnabled');
    this.hlMinSamples = requiredElement<HTMLInputElement>('hlMinSamples');
    this.hlApplyLow = requiredElement<HTMLInputElement>('hlApplyLow');
    this.hlMinFactor = requiredElement<HTMLInputElement>('hlMinFactor');
    this.hlMaxFactor = requiredElement<HTMLInputElement>('hlMaxFactor');
    this.hlFields = document.querySelectorAll('.hl-field') as NodeListOf<HTMLElement>;
    this.languageSelect = requiredElement<HTMLSelectElement>('appLanguage');
    this.saveBtn = requiredElement<HTMLButtonElement>('settingsSaveBtn');
    this.cancelBtn = requiredElement<HTMLButtonElement>('settingsCancelBtn');
    this.closeBtn = requiredElement<HTMLButtonElement>('settingsCloseBtn');

    const toggleBtn = document.getElementById('settingsToggleBtn') as HTMLButtonElement | null;
    toggleBtn?.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.requestClose());
    this.cancelBtn.addEventListener('click', () => this.requestClose());
    this.overlay.addEventListener('click', () => this.requestClose());
    this.drawer.addEventListener('click', (e) => e.stopPropagation());
    this.saveBtn.addEventListener('click', () => this.handleSave());

    document.addEventListener('keydown', (e) => this.handleDocumentKeydown(e));

    this.scEnabled.addEventListener('change', () => {
      this.toggleScFields({ reveal: this.scEnabled.checked });
      this.handleFieldChange();
    });
    this.scPreset.addEventListener('change', () => {
      this.applyChlorinatorPreset(this.scPreset.value as ChlorinatorPresetId);
      this.toggleScFields();
      this.handleFieldChange();
    });
    this.scControlKind.addEventListener('change', () => {
      this.toggleScFields();
      this.handleFieldChange();
    });
    this.hlEnabled.addEventListener('change', () => {
      this.toggleHlFields({ reveal: this.hlEnabled.checked });
      this.handleFieldChange();
    });
    this.poolTypeSelect.addEventListener('change', () => this.handlePoolTypeChange());
    this.languageSelect.addEventListener('change', () => {
      this.applyLanguage(this.languageSelect.value as AppLanguage);
      this.handleFieldChange();
    });

    this.drawer.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((el) => {
      if (el === this.scEnabled || el === this.hlEnabled || el === this.poolTypeSelect || el === this.languageSelect) return;
      el.addEventListener('input', () => this.handleFieldChange());
      el.addEventListener('change', () => this.handleFieldChange());
    });
  }

  onChange(cb: (s: PoolSettings) => void): void {
    this.onSave = cb;
  }

  onLanguageChange(cb: (lang: AppLanguage) => void): void {
    this.onLangChange = cb;
  }

  open(): void {
    const s = loadSettings();
    this.previousFocused = document.activeElement as HTMLElement | null;

    this.volumeInput.value = s.volume > 0 ? String(s.volume) : '';
    this.volumeUnitSelect.value = s.volumeUnit;
    this.poolTypeSelect.value = s.poolType;
    this.unitSystemSelect.value = s.unitSystem;
    this.languageSelect.value = getLanguage();

    const sc = s.saltChlorinator ?? DEFAULT_SALT_CHLORINATOR;
    this.scEnabled.checked = s.poolType === 'saltwater' ? sc.enabled : false;
    this.scPreset.value = sc.presetId ?? 'custom';
    this.scControlKind.value = controlSelectValue(getChlorinatorOutputControl(sc));
    this.scManufacturer.value = sc.equipment?.manufacturer ?? '';
    this.scModel.value = sc.equipment?.model ?? '';
    this.scProduction.value = String(sc.productionGramsPerHour);
    this.scOutput.value = String(sc.currentOutputPercent);
    this.scHours.value = String(sc.filtrationHoursPerDay);
    this.scMaxOutput.value = String(sc.maxRecommendedOutputPercent);
    this.scMaxHours.value = String(sc.maxRecommendedHoursPerDay);
    const boost = getChlorinatorModeDefinitions(sc).find((mode) => mode.code === 'boost' && mode.supported);
    this.scBoostSupported.checked = Boolean(boost);
    this.scBoostDuration.value = boost?.fixedDurationHours !== undefined ? String(boost.fixedDurationHours) : '';
    this.toggleScFields();

    const hl = { ...DEFAULT_HISTORICAL_LEARNING, ...s.historicalLearning };
    this.hlEnabled.checked = hl.enabled;
    this.hlMinSamples.value = String(hl.minimumSamples);
    this.hlApplyLow.checked = hl.applyLowConfidence;
    this.hlMinFactor.value = String(hl.minCorrectionFactor);
    this.hlMaxFactor.value = String(hl.maxCorrectionFactor);
    this.toggleHlFields();

    this.clearValidation();
    this.statusEl.textContent = '';
    this.statusEl.className = 'status-msg';
    this.panel.hidden = false;
    this.body.scrollTop = 0;
    document.body.classList.add('drawer-open');

    this.initialSnapshot = this.currentSnapshot();
    this.setSaveState('disabled');
    window.setTimeout(() => this.firstFocusable()?.focus(), 0);
  }

  close(): void {
    this.panel.hidden = true;
    document.body.classList.remove('drawer-open');
    this.previousFocused?.focus?.();
  }

  getSettings(): PoolSettings {
    return loadSettings();
  }

  private requestClose(): void {
    if (this.hasPendingChanges() && !window.confirm(t('settings.discardChanges'))) {
      return;
    }
    this.close();
  }

  private handleDocumentKeydown(e: KeyboardEvent): void {
    if (this.panel.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.requestClose();
      return;
    }
    if (e.key === 'Tab') {
      this.trapFocus(e);
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    const focusable = this.focusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((el) => !el.hidden && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
  }

  private firstFocusable(): HTMLElement | undefined {
    return this.focusableElements()[0] ?? this.closeBtn;
  }

  private applyLanguage(lang: AppLanguage): void {
    const validated = validateLanguage(lang);
    if (validated === getLanguage()) return;

    setLanguage(validated);
    const settings = loadSettings();
    saveSettings({ ...settings, language: validated });
    this.onLangChange?.(validated);
  }

  private handlePoolTypeChange(): void {
    const previousScroll = this.body.scrollTop;
    const shouldShowChlorinator = this.poolTypeSelect.value === 'saltwater';
    const wasVisible = this.scEnabled.checked;
    this.scEnabled.checked = shouldShowChlorinator;
    this.toggleScFields({ reveal: shouldShowChlorinator && !wasVisible, preserveScrollTop: previousScroll });
    this.handleFieldChange();
  }

  private handleFieldChange(): void {
    if (this.saveState === 'saving') return;
    this.clearValidation();
    this.statusEl.textContent = '';
    this.statusEl.className = 'status-msg';
    this.setSaveState(this.hasPendingChanges() ? 'enabled' : 'disabled');
  }

  private hasPendingChanges(): boolean {
    return this.currentSnapshot() !== this.initialSnapshot;
  }

  private currentSnapshot(): string {
    return JSON.stringify({
      language: this.languageSelect.value,
      volume: this.volumeInput.value,
      volumeUnit: this.volumeUnitSelect.value,
      poolType: this.poolTypeSelect.value,
      unitSystem: this.unitSystemSelect.value,
      scEnabled: this.scEnabled.checked,
      scPreset: this.scPreset.value,
      scControlKind: this.scControlKind.value,
      scManufacturer: this.scManufacturer.value,
      scModel: this.scModel.value,
      scProduction: this.scProduction.value,
      scOutput: this.scOutput.value,
      scHours: this.scHours.value,
      scMaxOutput: this.scMaxOutput.value,
      scMaxHours: this.scMaxHours.value,
      scBoostSupported: this.scBoostSupported.checked,
      scBoostDuration: this.scBoostDuration.value,
      hlEnabled: this.hlEnabled.checked,
      hlMinSamples: this.hlMinSamples.value,
      hlApplyLow: this.hlApplyLow.checked,
      hlMinFactor: this.hlMinFactor.value,
      hlMaxFactor: this.hlMaxFactor.value,
    });
  }

  private toggleScFields(options: { reveal?: boolean; preserveScrollTop?: number } = {}): void {
    const visible = this.scEnabled.checked;
    for (const el of this.scFields) {
      el.hidden = !visible;
      el.style.display = visible ? '' : 'none';
    }
    if (visible) {
      const kind = this.scControlKind.value;
      const showPercent = kind === 'continuous-percentage';
      const showProduction = kind === 'runtime-only' || kind === 'fixed' || kind === 'continuous-percentage' || kind === 'discrete-levels';
      this.drawer.querySelectorAll<HTMLElement>('.sc-percent-field').forEach((el) => {
        el.hidden = !showPercent;
        el.style.display = showPercent ? '' : 'none';
      });
      this.drawer.querySelectorAll<HTMLElement>('.sc-production-field').forEach((el) => {
        el.hidden = !showProduction;
        el.style.display = showProduction ? '' : 'none';
      });
    }
    if (options.preserveScrollTop !== undefined) {
      this.body.scrollTop = options.preserveScrollTop;
    }
    if (options.reveal) {
      this.ensureVisible(this.scFields[0]);
    }
  }

  private toggleHlFields(options: { reveal?: boolean } = {}): void {
    const visible = this.hlEnabled.checked;
    for (const el of this.hlFields) {
      el.hidden = !visible;
      el.style.display = visible ? '' : 'none';
    }
    if (options.reveal) {
      this.ensureVisible(this.hlFields[0]);
    }
  }

  private validate(): HTMLElement | null {
    this.clearValidation();
    const volume = parseFloat(this.volumeInput.value);
    if (isNaN(volume) || volume <= 0) {
      return this.markInvalid(this.volumeInput, t('settings.enterVolume'));
    }
    if (volume > 10000000) {
      return this.markInvalid(this.volumeInput, t('settings.volumeTooLarge'));
    }
    return null;
  }

  private markInvalid(input: HTMLElement, message: string): HTMLElement {
    input.setAttribute('aria-invalid', 'true');
    this.showStatus(message, 'error');
    return input;
  }

  private clearValidation(): void {
    this.drawer.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
      el.removeAttribute('aria-invalid');
    });
  }

  private handleSave(): void {
    if (this.saveState === 'saving' || this.saveState === 'disabled') return;

    const invalid = this.validate();
    if (invalid) {
      this.setSaveState('error');
      this.ensureVisible(invalid);
      invalid.focus();
      return;
    }

    this.setSaveState('saving');
    try {
      const settings = this.buildSettings();
      saveSettings(settings);
      this.initialSnapshot = this.currentSnapshot();
      this.onSave?.(settings);
      this.showStatus(t('settings.saved'), 'success');
      this.setSaveState('saved');
      window.setTimeout(() => {
        if (!this.panel.hidden && !this.hasPendingChanges()) {
          this.setSaveState('disabled');
        }
      }, 1200);
    } catch {
      this.showStatus(t('settings.saveError'), 'error');
      this.setSaveState('error');
    }
  }

  private buildSettings(): PoolSettings {
    const existing = loadSettings();
    const settings: PoolSettings = {
      volume: parseFloat(this.volumeInput.value),
      volumeUnit: this.volumeUnitSelect.value as PoolSettings['volumeUnit'],
      poolType: this.poolTypeSelect.value as PoolSettings['poolType'],
      unitSystem: this.unitSystemSelect.value as PoolSettings['unitSystem'],
      language: existing.language,
    };

    if (this.scEnabled.checked) {
      const outputControl = this.buildOutputControl();
      const supportedModes = this.buildSupportedModes();
      const presetId = this.scPreset.value as ChlorinatorPresetId;
      const runtimeIncrementHours = DEFAULT_SALT_CHLORINATOR.minProgrammableHourIncrement ?? 1;
      const maxHours = parseFloat(this.scMaxHours.value) || DEFAULT_SALT_CHLORINATOR.maxRecommendedHoursPerDay;
      const sc: SaltChlorinatorConfig = {
        enabled: true,
        productionGramsPerHour: parseFloat(this.scProduction.value) || DEFAULT_SALT_CHLORINATOR.productionGramsPerHour,
        currentOutputPercent: parseFloat(this.scOutput.value) || (outputControl.kind === 'continuous-percentage' ? DEFAULT_SALT_CHLORINATOR.currentOutputPercent : 100),
        filtrationHoursPerDay: parseFloat(this.scHours.value) || DEFAULT_SALT_CHLORINATOR.filtrationHoursPerDay,
        maxRecommendedOutputPercent: parseFloat(this.scMaxOutput.value) || DEFAULT_SALT_CHLORINATOR.maxRecommendedOutputPercent,
        maxRecommendedHoursPerDay: maxHours,
        minProgrammableHourIncrement: runtimeIncrementHours,
        presetId,
        outputControl,
        runtimeControl: {
          supported: true,
          maximumHours: maxHours,
          incrementMinutes: runtimeIncrementHours * 60,
          schedulingType: presetId === 'intex-qs500-26668' ? 'internal-daily-cycle' : 'unknown',
        },
        supportedModes,
        usualOperatingMode: 'normal',
      };
      const manufacturer = this.scManufacturer.value.trim();
      const model = this.scModel.value.trim();
      if (manufacturer || model || presetId === 'intex-qs500-26668') {
        sc.equipment = {
          id: presetId === 'custom' ? `custom-${Date.now()}` : presetId,
          manufacturer: manufacturer || undefined,
          model: model || undefined,
          nominalChlorineOutputGramsPerHour: sc.productionGramsPerHour,
          outputControl,
          runtimeControl: sc.runtimeControl!,
          supportedModes,
          requiresWaterFlow: true,
          linkedFiltrationRequired: true,
          dataSource: presetId === 'custom' ? 'user-entered' : (presetId === 'unknown' ? 'unknown' : 'manufacturer'),
        };
      }
      settings.saltChlorinator = migrateSaltChlorinatorConfig(sc, new Date().toISOString());
    } else if (existing.saltChlorinator) {
      settings.saltChlorinator = { ...existing.saltChlorinator, enabled: false };
    }

    const hl: HistoricalLearningConfig = {
      enabled: this.hlEnabled.checked,
      minimumSamples: parseInt(this.hlMinSamples.value, 10) || DEFAULT_HISTORICAL_LEARNING.minimumSamples,
      applyLowConfidence: this.hlApplyLow.checked,
      minCorrectionFactor: parseFloat(this.hlMinFactor.value) || DEFAULT_HISTORICAL_LEARNING.minCorrectionFactor,
      maxCorrectionFactor: parseFloat(this.hlMaxFactor.value) || DEFAULT_HISTORICAL_LEARNING.maxCorrectionFactor,
    };
    settings.historicalLearning = hl;

    return settings;
  }

  private applyChlorinatorPreset(presetId: ChlorinatorPresetId): void {
    const preset = createChlorinatorConfigFromPreset(presetId);
    this.scControlKind.value = controlSelectValue(getChlorinatorOutputControl(preset));
    this.scManufacturer.value = preset.equipment?.manufacturer ?? '';
    this.scModel.value = preset.equipment?.model ?? '';
    this.scProduction.value = String(preset.productionGramsPerHour);
    this.scOutput.value = String(preset.currentOutputPercent);
    this.scHours.value = String(preset.filtrationHoursPerDay);
    this.scMaxOutput.value = String(preset.maxRecommendedOutputPercent);
    this.scMaxHours.value = String(preset.maxRecommendedHoursPerDay);
    const boost = getChlorinatorModeDefinitions(preset).find((mode) => mode.code === 'boost' && mode.supported);
    this.scBoostSupported.checked = Boolean(boost);
    this.scBoostDuration.value = boost?.fixedDurationHours !== undefined ? String(boost.fixedDurationHours) : '';
  }

  private buildOutputControl(): ChlorinatorOutputControl {
    switch (this.scControlKind.value) {
      case 'continuous-percentage':
        return {
          kind: 'continuous-percentage',
          minimumPercent: 0,
          maximumPercent: parseFloat(this.scMaxOutput.value) || DEFAULT_SALT_CHLORINATOR.maxRecommendedOutputPercent,
          incrementPercent: 1,
        };
      case 'discrete-levels':
        return {
          kind: 'discrete-levels',
          levels: [],
        };
      case 'automatic-orp':
        return {
          kind: 'automatic',
          controlBasis: 'orp',
        };
      case 'automatic-free-chlorine':
        return {
          kind: 'automatic',
          controlBasis: 'free-chlorine',
        };
      case 'externally-controlled':
        return {
          kind: 'externally-controlled',
          controllerType: 'other',
        };
      case 'fixed':
        return {
          kind: 'fixed',
        };
      case 'unknown':
        return {
          kind: 'unknown',
        };
      case 'runtime-only':
      default:
        return {
          kind: 'runtime-only',
        };
    }
  }

  private buildSupportedModes(): ChlorinatorModeDefinition[] {
    const modes: ChlorinatorModeDefinition[] = [
      {
        code: 'normal',
        supported: true,
        durationControl: 'configurable',
        minimumDurationHours: 0,
        maximumDurationHours: parseFloat(this.scMaxHours.value) || undefined,
        durationIncrementMinutes: (DEFAULT_SALT_CHLORINATOR.minProgrammableHourIncrement ?? 1) * 60,
        outputModel: this.scControlKind.value === 'runtime-only' || this.scControlKind.value === 'fixed'
          ? 'known-absolute-output'
          : 'same-as-normal',
        chlorineOutputGramsPerHour: this.scControlKind.value === 'runtime-only' || this.scControlKind.value === 'fixed'
          ? parseFloat(this.scProduction.value) || undefined
          : undefined,
      },
    ];

    if (this.scBoostSupported.checked) {
      const duration = parseFloat(this.scBoostDuration.value);
      modes.push({
        code: 'boost',
        supported: true,
        durationControl: Number.isFinite(duration) && duration > 0 ? 'fixed' : 'unknown',
        fixedDurationHours: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        outputModel: 'unknown',
        notes: ['Boost production is configured as unknown unless documented by the manufacturer.'],
      });
    }

    return modes;
  }

  private setSaveState(state: SaveState): void {
    this.saveState = state;
    this.saveBtn.dataset.state = state;
    this.saveBtn.disabled = state === 'disabled' || state === 'saving' || state === 'saved';
    if (state === 'saving') {
      this.saveBtn.textContent = t('settings.saving');
    } else if (state === 'saved') {
      this.saveBtn.textContent = t('settings.saved');
    } else {
      this.saveBtn.textContent = t('settings.save');
    }
  }

  private showStatus(msg: string, type: 'success' | 'error'): void {
    this.statusEl.textContent = msg;
    this.statusEl.className = `status-msg ${type}`;
  }

  private ensureVisible(el: Element | undefined): void {
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`SettingsPanel: required element #${id} not found.`);
  return el;
}

function requiredElementBySelector<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector(selector) as T | null;
  if (!el) throw new Error(`SettingsPanel: required element ${selector} not found.`);
  return el;
}

function controlSelectValue(control: ChlorinatorOutputControl): string {
  if (control.kind === 'automatic') {
    return control.controlBasis === 'free-chlorine' ? 'automatic-free-chlorine' : 'automatic-orp';
  }
  return control.kind;
}
