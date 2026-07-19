// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from '../src/ui/settingsPanel';
import { loadSettings, saveSettings } from '../src/domain/storage';
import { setLanguage } from '../src/i18n/index';

function createSettingsPanelHTML(): void {
  document.body.innerHTML = `
    <button id="settingsToggleBtn">open</button>
    <aside id="settingsPanel" class="settings-panel" role="dialog" aria-modal="true" hidden>
      <div class="settings-overlay" id="settingsOverlay"></div>
      <div class="settings-drawer">
        <div class="settings-header">
          <h2>Configuración</h2>
          <button id="settingsCloseBtn" type="button">Cerrar</button>
        </div>
        <div class="settings-body">
          <div class="field">
            <label for="appLanguage">Idioma</label>
            <select id="appLanguage">
              <option value="en">Inglés</option>
              <option value="es">Español</option>
            </select>
          </div>
          <div class="field">
            <label for="poolVolume">Volumen</label>
            <input type="number" id="poolVolume" />
          </div>
          <div class="field">
            <label for="volumeUnit">Unidad</label>
            <select id="volumeUnit">
              <option value="liters">Litros</option>
              <option value="cubicMeters">Metros cúbicos</option>
            </select>
          </div>
          <div class="field">
            <label for="poolType">Tipo</label>
            <select id="poolType">
              <option value="chlorine">Piscina de cloro</option>
              <option value="saltwater">Piscina salina</option>
            </select>
          </div>
          <div class="field">
            <label for="unitSystem">Sistema</label>
            <select id="unitSystem">
              <option value="metric">Métrico</option>
              <option value="imperial">Imperial</option>
            </select>
          </div>
          <label for="scEnabled">
            <input type="checkbox" id="scEnabled" />
            Clorador salino instalado
          </label>
          <div class="field sc-field"><label for="scProduction">Producción</label><input type="number" id="scProduction" /></div>
          <div class="field sc-field"><label for="scOutput">Producción actual</label><input type="number" id="scOutput" /></div>
          <div class="field sc-field"><label for="scHours">Horas</label><input type="number" id="scHours" /></div>
          <div class="field sc-field"><label for="scMaxOutput">Máx. producción</label><input type="number" id="scMaxOutput" /></div>
          <div class="field sc-field"><label for="scMaxHours">Máx. horas</label><input type="number" id="scMaxHours" /></div>
          <label for="hlEnabled">
            <input type="checkbox" id="hlEnabled" />
            Aprendizaje histórico
          </label>
          <div class="field hl-field"><label for="hlMinSamples">Muestras</label><input type="number" id="hlMinSamples" /></div>
          <div class="field hl-field"><label for="hlApplyLow">Baja confianza</label><input type="checkbox" id="hlApplyLow" /></div>
          <div class="field hl-field"><label for="hlMinFactor">Factor mínimo</label><input type="number" id="hlMinFactor" /></div>
          <div class="field hl-field"><label for="hlMaxFactor">Factor máximo</label><input type="number" id="hlMaxFactor" /></div>
        </div>
        <div class="settings-footer">
          <p id="settingsStatus" class="status-msg" aria-live="polite"></p>
          <div class="settings-actions">
            <button id="settingsCancelBtn" type="button">Cancelar</button>
            <button id="settingsSaveBtn" type="button">Guardar configuración</button>
          </div>
        </div>
      </div>
    </aside>
  `;
}

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  document.body.className = '';
  setLanguage('es');
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'confirm', {
    value: vi.fn(() => true),
    writable: true,
    configurable: true,
  });
  Element.prototype.scrollIntoView = vi.fn();
  createSettingsPanelHTML();
});

function change(el: HTMLInputElement | HTMLSelectElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('SettingsPanel drawer', () => {
  it('opens with non-saltwater pool, locks body scroll, and keeps actions outside scrollable content', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const panel = new SettingsPanel();
    panel.open();

    expect(document.getElementById('settingsPanel')!.hidden).toBe(false);
    expect(document.body.classList.contains('drawer-open')).toBe(true);
    expect(document.querySelector('.settings-body')!.contains(document.getElementById('settingsSaveBtn'))).toBe(false);
    expect(document.querySelector('.settings-footer')!.contains(document.getElementById('settingsSaveBtn'))).toBe(true);
    expect((document.querySelector('.sc-field') as HTMLElement).hidden).toBe(true);
  });

  it('changing to saltwater reveals chlorinator fields without hiding the footer action', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const panel = new SettingsPanel();
    panel.open();

    const poolType = document.getElementById('poolType') as HTMLSelectElement;
    poolType.value = 'saltwater';
    change(poolType);

    expect((document.getElementById('scEnabled') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('.sc-field') as HTMLElement).hidden).toBe(false);
    expect(document.querySelector('.settings-footer')!.contains(document.getElementById('settingsSaveBtn'))).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('validates before save and scrolls/focuses the first invalid field', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const panel = new SettingsPanel();
    panel.open();

    const volume = document.getElementById('poolVolume') as HTMLInputElement;
    volume.value = '';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('settingsSaveBtn')!.click();

    expect(volume.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('settingsStatus')!.textContent).toContain('volumen');
    expect(document.activeElement).toBe(volume);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('saves a completed saltwater form', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const panel = new SettingsPanel();
    panel.open();

    const poolType = document.getElementById('poolType') as HTMLSelectElement;
    poolType.value = 'saltwater';
    change(poolType);
    document.getElementById('settingsSaveBtn')!.click();

    const saved = loadSettings();
    expect(saved.poolType).toBe('saltwater');
    expect(saved.saltChlorinator?.enabled).toBe(true);
    expect(document.getElementById('settingsSaveBtn')!.dataset.state).toBe('saved');
  });

  it('traps focus inside the drawer and releases body scroll on close', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const panel = new SettingsPanel();
    panel.open();

    const closeBtn = document.getElementById('settingsCloseBtn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('settingsCancelBtn') as HTMLButtonElement;
    cancelBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeBtn);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('settingsPanel')!.hidden).toBe(true);
    expect(document.body.classList.contains('drawer-open')).toBe(false);
  });

  it('asks for confirmation before closing with pending changes', () => {
    saveSettings({ volume: 50000, volumeUnit: 'liters', poolType: 'chlorine', unitSystem: 'metric', language: 'es' });
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    const panel = new SettingsPanel();
    panel.open();

    const volume = document.getElementById('poolVolume') as HTMLInputElement;
    volume.value = '60000';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(confirm).toHaveBeenCalled();
    expect(document.getElementById('settingsPanel')!.hidden).toBe(false);
  });
});
