import type { MeasurementCapability, MeasurementParameterCode, MeasurementUnit } from '../domain/measurement';
import {
  createMeasurementDevice,
  defaultUnit,
  deviceDisplayName,
  deviceLifecycleStatus,
  duplicateMeasurementDevice,
  setMeasurementDeviceLifecycle,
  updateMeasurementDevice,
  validateMeasurementDevice,
  type MeasurementDevice,
  type MeasurementDeviceParameter,
  type MeasurementDeviceType,
} from '../domain/measurementDevice';
import {
  deleteMeasurementDeviceSafely,
  getMeasurementDeviceUsage,
  loadMeasurementDevices,
  loadMeasurements,
  saveMeasurementDevices,
} from '../domain/storage';
import { formatDateTime } from '../i18n/index';
import { appRouteUrl, currentApplicationPathname } from '../applicationRuntime';
import type { AppRoute } from './appShell';

const PARAMETERS: MeasurementParameterCode[] = [
  'ph',
  'fac',
  'orp',
  'salt',
  'ec',
  'tds',
  'temperature',
  'totalChlorine',
  'alkalinity',
  'calciumHardness',
  'cya',
  'bromine',
];

const DEVICE_TYPES: MeasurementDeviceType[] = [
  'photometer',
  'reagent-kit',
  'test-strips',
  'digital-multiparameter',
  'fixed-sensor',
  'chlorinator',
  'controller',
  'laboratory',
  'manual',
  'custom',
];

const CAPABILITIES: MeasurementCapability[] = ['direct', 'estimated', 'calculated', 'manual-entry', 'unsupported'];
const UNITS: MeasurementUnit[] = ['ph', 'us-cm', 'ppm', 'mv', 'celsius', 'fahrenheit', 'boolean', 'custom'];

export class MeasurementDevicesPage {
  private readonly content: HTMLElement;
  private editingDevice: MeasurementDevice | null = null;
  private initialSnapshot = '';

  constructor() {
    this.content = document.getElementById('measurementDevicesContent') as HTMLElement;

    this.content.addEventListener('click', (event) => this.handleClick(event));
    this.content.addEventListener('change', (event) => this.handleChange(event));
    this.content.addEventListener('input', () => this.handleInput());
    window.addEventListener('beforeunload', (event) => {
      if (!this.hasPendingChanges()) return;
      event.preventDefault();
    });
  }

  render(route: AppRoute = currentApplicationPathname() as AppRoute): void {
    const editId = editDeviceIdFromRoute(route);
    if (editId) {
      this.renderEditor(editId);
      return;
    }
    this.editingDevice = null;
    this.initialSnapshot = '';
    this.renderList();
  }

  hasPendingChanges(): boolean {
    const form = this.content.querySelector<HTMLFormElement>('#measurementDeviceEditForm');
    if (!form || !this.editingDevice) return false;
    return this.formSnapshot(form) !== this.initialSnapshot;
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-device-action], [data-param-action]');
    if (!button) return;

    const action = button.dataset.deviceAction;
    const deviceId = button.dataset.deviceId;
    if (action === 'view' && deviceId) {
      this.renderDeviceDetails(deviceId);
      return;
    }
    if (action === 'duplicate' && deviceId) {
      this.duplicateDevice(deviceId);
      return;
    }
    if (action === 'archive' && deviceId) {
      this.archiveDevice(deviceId);
      return;
    }
    if (action === 'delete' && deviceId) {
      this.deleteDevice(deviceId);
      return;
    }
    if (action === 'cancel-edit') {
      this.cancelEdit();
      return;
    }
    if (action === 'save-edit') {
      const form = this.content.querySelector<HTMLFormElement>('#measurementDeviceEditForm');
      if (form) this.saveEdit(form);
      return;
    }
    if (action === 'add-parameter') {
      this.addParameterEditor();
      return;
    }

    const paramAction = button.dataset.paramAction;
    if (paramAction === 'remove') {
      this.removeParameterEditor(button.dataset.paramCode);
    }
  }

  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) return;
    if (target.matches('[data-param-code-select]')) {
      const parameterCard = target.closest<HTMLElement>('.measurement-device-param-card');
      const unit = parameterCard?.querySelector<HTMLSelectElement>('[name$=".unit"]');
      if (unit && !unit.dataset.userChanged) unit.value = defaultUnit(target.value as MeasurementParameterCode);
    }
    if (target.matches('[name$=".unit"]')) target.dataset.userChanged = 'true';
    if (target.matches('[name$=".capability"]')) this.syncDerivationVisibility(target.closest<HTMLElement>('.measurement-device-param-card'));
    this.updateDirtyState();
  }

  private handleInput(): void {
    this.updateDirtyState();
  }

  private renderList(message?: string): void {
    const devices = loadMeasurementDevices();
    const measurements = loadMeasurements();

    if (devices.length === 0) {
      this.content.innerHTML = `
        ${message ? `<div class="status-msg success">${escapeHtml(message)}</div>` : ''}
        <div class="section-block">
          <div class="section-header">
            <h2>Medidores configurados</h2>
            <a class="btn-primary btn-inline" href="/settings/measurement-devices/new/edit" data-route-link>Crear medidor</a>
          </div>
          <p class="empty-state">No hay medidores configurados.</p>
        </div>
      `;
      return;
    }

    const rows = devices.map((device) => {
      const usage = getMeasurementDeviceUsage(device.id, measurements);
      const lastCalibration = latestCalibration(device);
      const status = deviceStatusLabels(device, usage.lastUsedAt, lastCalibration);
      return `
        <article class="measurement-device-row" data-device-id="${escapeHtml(device.id)}">
          <div class="measurement-device-main">
            <h3>${escapeHtml(deviceDisplayName(device))}</h3>
            <p>${escapeHtml([device.manufacturer, device.model].filter(Boolean).join(' ') || 'Sin fabricante/modelo')} · ${escapeHtml(device.deviceType)}</p>
            <div class="device-badges">${status.map((label) => `<span class="device-badge ${label.className}">${escapeHtml(label.text)}</span>`).join('')}</div>
          </div>
          <dl class="measurement-device-meta">
            <div><dt>Parametros</dt><dd>${escapeHtml(enabledParameterCodes(device).join(', ') || 'Ninguno')}</dd></div>
            <div><dt>Ultima calibracion</dt><dd>${escapeHtml(lastCalibration ? formatDateTime(lastCalibration) : 'Sin calibrar')}</dd></div>
            <div><dt>Ultima utilizacion</dt><dd>${escapeHtml(usage.lastUsedAt ? formatDateTime(usage.lastUsedAt) : 'Nunca utilizado')}</dd></div>
            <div><dt>Mediciones vinculadas</dt><dd>${usage.measurementCount}</dd></div>
          </dl>
          <div class="measurement-device-actions">
            <button type="button" class="btn-secondary" data-device-action="view" data-device-id="${escapeHtml(device.id)}">Ver</button>
            <a class="btn-secondary" href="/settings/measurement-devices/${encodeURIComponent(device.id)}/edit" data-route-link>Editar</a>
            <button type="button" class="btn-secondary" data-device-action="duplicate" data-device-id="${escapeHtml(device.id)}">Duplicar</button>
            <button type="button" class="btn-secondary" data-device-action="archive" data-device-id="${escapeHtml(device.id)}">Archivar</button>
            <button type="button" class="btn-secondary danger-action" data-device-action="delete" data-device-id="${escapeHtml(device.id)}">Eliminar</button>
          </div>
        </article>
      `;
    }).join('');

    this.content.innerHTML = `
      ${message ? `<div class="status-msg success">${escapeHtml(message)}</div>` : ''}
      <div class="section-block">
        <div class="section-header">
          <h2>Medidores configurados</h2>
          <a class="btn-primary btn-inline" href="/settings/measurement-devices/new/edit" data-route-link>Crear medidor</a>
        </div>
        <div class="measurement-devices-list">${rows}</div>
      </div>
      <div id="measurementDeviceDetails" class="section-block" hidden></div>
    `;
  }

  private renderDeviceDetails(deviceId: string): void {
    const container = document.getElementById('measurementDeviceDetails');
    const device = loadMeasurementDevices().find((candidate) => candidate.id === deviceId);
    if (!container || !device) return;
    const usage = getMeasurementDeviceUsage(device.id);
    container.hidden = false;
    container.innerHTML = `
      <div class="section-header">
        <h2>${escapeHtml(deviceDisplayName(device))}</h2>
        <a class="btn-secondary" href="/settings/measurement-devices/${encodeURIComponent(device.id)}/edit" data-route-link>Editar</a>
      </div>
      <dl class="measurement-device-detail-grid">
        <div><dt>Fabricante y modelo</dt><dd>${escapeHtml([device.manufacturer, device.model].filter(Boolean).join(' ') || 'No indicado')}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(device.deviceType)}</dd></div>
        <div><dt>Estado</dt><dd>${escapeHtml(deviceLifecycleStatus(device))}</dd></div>
        <div><dt>Principal</dt><dd>${device.isPrimary ? 'Si' : 'No'}</dd></div>
        <div><dt>Mediciones vinculadas</dt><dd>${usage.measurementCount}</dd></div>
      </dl>
      <h3 class="settings-subtitle">Parametros</h3>
      <div class="measurement-device-param-summary">
        ${device.parameters.map((parameter) => `<span>${escapeHtml(parameter.parameterCode)} · ${escapeHtml(parameter.capability)} · ${escapeHtml(parameter.unit)}${parameter.enabled && !parameter.archived ? '' : ' · retirado'}</span>`).join('')}
      </div>
      <h3 class="settings-subtitle">Historial de cambios</h3>
      ${renderHistory(device)}
    `;
    container.scrollIntoView({ block: 'nearest' });
  }

  private renderEditor(deviceId: string): void {
    const devices = loadMeasurementDevices();
    const existing = deviceId === 'new' ? null : devices.find((device) => device.id === deviceId) ?? null;
    const device = existing ?? createMeasurementDevice({
      customName: '',
      manufacturer: undefined,
      model: undefined,
      deviceType: 'digital-multiparameter',
      enabled: true,
      isPrimary: devices.length === 0,
      parameters: [],
    });

    this.editingDevice = device;
    const usage = existing ? getMeasurementDeviceUsage(existing.id) : { measurementCount: 0, parameterCounts: {} };
    this.content.innerHTML = `
      <form id="measurementDeviceEditForm" class="measurement-device-form" novalidate>
        <input type="hidden" name="id" value="${escapeHtml(device.id)}" />
        <div class="measurement-device-form-header">
          <div>
            <p class="eyebrow">Configuracion -> Medidores</p>
            <h2>${existing ? 'Editar medidor' : 'Crear medidor'}</h2>
          </div>
          <p id="measurementDeviceDirty" class="status-msg" aria-live="polite"></p>
        </div>
        <div id="measurementDeviceErrors" class="form-errors" aria-live="polite" role="alert"></div>

        <section class="form-section" aria-labelledby="device-identification-heading">
          <h2 id="device-identification-heading">1. Identificacion</h2>
          <div class="field">
            <label for="deviceCustomName">Nombre</label>
            <input id="deviceCustomName" name="customName" type="text" value="${escapeHtml(device.customName)}" required />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="deviceManufacturer">Fabricante</label>
              <input id="deviceManufacturer" name="manufacturer" type="text" value="${escapeHtml(device.manufacturer ?? '')}" />
            </div>
            <div class="field">
              <label for="deviceModel">Modelo</label>
              <input id="deviceModel" name="model" type="text" value="${escapeHtml(device.model ?? '')}" />
            </div>
          </div>
          <div class="field">
            <label for="deviceType">Tipo</label>
            <select id="deviceType" name="deviceType">${DEVICE_TYPES.map((type) => option(type, device.deviceType)).join('')}</select>
          </div>
          <div class="field">
            <label for="deviceNotes">Notas</label>
            <textarea id="deviceNotes" name="notes" rows="3">${escapeHtml(device.notes ?? '')}</textarea>
          </div>
        </section>

        <section class="form-section" aria-labelledby="device-parameters-heading">
          <h2 id="device-parameters-heading">2. Parametros que mide</h2>
          <div class="field-row measurement-device-add-param">
            <div class="field">
              <label for="deviceNewParameter">Parametro</label>
              <select id="deviceNewParameter">${PARAMETERS.map((parameter) => `<option value="${parameter}">${parameterLabel(parameter)}</option>`).join('')}</select>
            </div>
            <button type="button" class="btn-secondary" data-device-action="add-parameter">Anadir parametro</button>
          </div>
          <p class="field-hint">Retirar un parametro usado no borra datos antiguos; deja de aparecer en nuevas mediciones y se conserva su configuracion historica.</p>
        </section>

        <section class="form-section" aria-labelledby="device-parameter-config-heading">
          <h2 id="device-parameter-config-heading">3. Configuracion de cada parametro</h2>
          <div id="measurementDeviceParameterEditors">
            ${device.parameters.map((parameter) => this.renderParameterEditor(parameter, usage.parameterCounts[parameter.parameterCode] ?? 0)).join('')}
          </div>
        </section>

        <section class="form-section" aria-labelledby="device-calibration-heading">
          <h2 id="device-calibration-heading">4. Calibracion</h2>
          <p class="field-hint">Cada parametro conserva su ultima calibracion y estado en el snapshot de cada medicion.</p>
        </section>

        <section class="form-section" aria-labelledby="device-status-heading">
          <h2 id="device-status-heading">5. Estado y uso</h2>
          <div class="field-row">
            <div class="field">
              <label for="deviceStatus">Estado</label>
              <select id="deviceStatus" name="status">
                ${option('active', deviceLifecycleStatus(device), 'Activo')}
                ${option('inactive', deviceLifecycleStatus(device), 'Inactivo')}
                ${option('archived', deviceLifecycleStatus(device), 'Archivado')}
              </select>
            </div>
            <label class="field-inline measurement-device-primary">
              <input type="checkbox" name="isPrimary" ${device.isPrimary ? 'checked' : ''} />
              Dispositivo principal
            </label>
          </div>
          <dl class="measurement-device-detail-grid">
            <div><dt>Mediciones vinculadas</dt><dd>${usage.measurementCount}</dd></div>
            <div><dt>Ultima utilizacion</dt><dd>${escapeHtml(usage.lastUsedAt ? formatDateTime(usage.lastUsedAt) : 'Nunca utilizado')}</dd></div>
          </dl>
        </section>

        <section class="form-section" aria-labelledby="device-summary-heading">
          <h2 id="device-summary-heading">6. Resumen</h2>
          <p class="field-hint">Guardar actualiza el medidor actual sin cambiar IDs ni modificar retroactivamente mediciones antiguas.</p>
          ${existing ? renderHistory(existing) : '<p class="empty-state">El historial aparecera cuando guardes el medidor.</p>'}
        </section>

        <div class="measurement-device-sticky-footer">
          <button type="button" class="btn-secondary" data-device-action="cancel-edit">Cancelar</button>
          <button type="button" class="btn-primary btn-inline" data-device-action="save-edit">Guardar cambios</button>
        </div>
      </form>
    `;

    const form = this.content.querySelector<HTMLFormElement>('#measurementDeviceEditForm')!;
    this.syncAllDerivationVisibility();
    this.initialSnapshot = this.formSnapshot(form);
  }

  private renderParameterEditor(parameter: MeasurementDeviceParameter, linkedMeasurements: number): string {
    const archivedText = linkedMeasurements > 0
      ? `Este parametro aparece en ${linkedMeasurements} mediciones anteriores. Dejara de estar disponible para nuevas mediciones, pero los datos historicos se conservaran.`
      : '';
    return `
      <article class="measurement-device-param-card" data-param-card data-param-code="${escapeHtml(parameter.parameterCode)}" data-linked-measurements="${linkedMeasurements}">
        <div class="section-header">
          <h3>${parameterLabel(parameter.parameterCode)}</h3>
          <button type="button" class="btn-secondary danger-action" data-param-action="remove" data-param-code="${escapeHtml(parameter.parameterCode)}">Retirar</button>
        </div>
        ${archivedText ? `<div class="form-warning">${escapeHtml(archivedText)}</div>` : ''}
        <div class="measurement-device-param-grid">
          <div class="field">
            <label>Codigo</label>
            <select name="${parameter.parameterCode}.parameterCode" data-param-code-select>${PARAMETERS.map((code) => `<option value="${code}" ${code === parameter.parameterCode ? 'selected' : ''}>${parameterLabel(code)}</option>`).join('')}</select>
          </div>
          <label class="field-inline">
            <input type="checkbox" name="${parameter.parameterCode}.enabled" ${parameter.enabled && !parameter.archived ? 'checked' : ''} />
            Activo para nuevas mediciones
          </label>
          <div class="field">
            <label>Capacidad</label>
            <select name="${parameter.parameterCode}.capability">${CAPABILITIES.map((capability) => option(capability, parameter.capability, capabilityLabel(capability))).join('')}</select>
          </div>
          <div class="field">
            <label>Unidad</label>
            <select name="${parameter.parameterCode}.unit">${UNITS.map((unit) => option(unit, parameter.unit, unitLabel(unit))).join('')}</select>
          </div>
          <div class="field"><label>Resolucion</label><input name="${parameter.parameterCode}.resolution" type="number" min="0" step="any" value="${numberValue(parameter.resolution)}" /></div>
          <div class="field"><label>Minimo</label><input name="${parameter.parameterCode}.minimum" type="number" step="any" value="${numberValue(parameter.minimum)}" /></div>
          <div class="field"><label>Maximo</label><input name="${parameter.parameterCode}.maximum" type="number" step="any" value="${numberValue(parameter.maximum)}" /></div>
          <div class="field derivation-field"><label>Fuente derivada</label><select name="${parameter.parameterCode}.sourceParameterCode"><option value="">--</option>${PARAMETERS.map((code) => option(code, parameter.derivation?.sourceParameterCode, parameterLabel(code))).join('')}</select></div>
          <div class="field derivation-field"><label>Formula</label><input name="${parameter.parameterCode}.formulaCode" type="text" value="${escapeHtml(parameter.derivation?.formulaCode ?? '')}" /></div>
          <div class="field derivation-field"><label>Factor de conversion</label><input name="${parameter.parameterCode}.conversionFactor" type="number" min="0" step="any" value="${numberValue(parameter.derivation?.conversionFactor)}" /></div>
          <label class="field-inline"><input type="checkbox" name="${parameter.parameterCode}.temperatureCompensationEnabled" ${parameter.temperatureCompensation?.enabled ? 'checked' : ''} /> Compensacion de temperatura</label>
          <div class="field"><label>Temperatura de referencia (C)</label><input name="${parameter.parameterCode}.referenceTemperatureCelsius" type="number" step="any" value="${numberValue(parameter.temperatureCompensation?.referenceTemperatureCelsius)}" /></div>
          <div class="field"><label>Ultima calibracion</label><input name="${parameter.parameterCode}.lastCalibrationAt" type="datetime-local" value="${toLocalDatetime(parameter.calibration?.lastCalibrationAt)}" /></div>
          <div class="field"><label>Intervalo recomendado (dias)</label><input name="${parameter.parameterCode}.recommendedIntervalDays" type="number" min="1" step="1" value="${numberValue(parameter.calibration?.recommendedIntervalDays)}" /></div>
          <div class="field"><label>Estado de calibracion</label><input name="${parameter.parameterCode}.calibrationStatus" type="text" value="${escapeHtml(parameter.calibration?.status ?? '')}" /></div>
          <div class="field measurement-device-param-notes"><label>Notas</label><textarea name="${parameter.parameterCode}.notes" rows="2">${escapeHtml(parameter.notes ?? '')}</textarea></div>
        </div>
      </article>
    `;
  }

  private addParameterEditor(): void {
    const select = document.getElementById('deviceNewParameter') as HTMLSelectElement | null;
    const container = document.getElementById('measurementDeviceParameterEditors');
    if (!select || !container) return;
    const code = select.value as MeasurementParameterCode;
    if (container.querySelector(`[data-param-code="${cssEscape(code)}"]`)) {
      this.showErrors({ parameters: 'Ese parametro ya existe en el medidor.' });
      return;
    }
    const parameter: MeasurementDeviceParameter = {
      parameterCode: code,
      enabled: true,
      capability: 'direct',
      unit: defaultUnit(code),
      resolution: code === 'ph' || code === 'fac' || code === 'temperature' ? 0.1 : 1,
      calibration: { supported: true },
    };
    container.insertAdjacentHTML('beforeend', this.renderParameterEditor(parameter, 0));
    this.syncAllDerivationVisibility();
    this.updateDirtyState();
  }

  private removeParameterEditor(code: string | undefined): void {
    if (!code) return;
    const card = this.content.querySelector<HTMLElement>(`[data-param-code="${cssEscape(code)}"]`);
    if (!card) return;
    const linked = parseInt(card.dataset.linkedMeasurements ?? '0', 10) || 0;
    if (linked > 0) {
      const enabled = card.querySelector<HTMLInputElement>('[name$=".enabled"]');
      if (enabled) enabled.checked = false;
      card.dataset.archived = 'true';
      card.classList.add('is-archived');
    } else {
      card.remove();
    }
    this.updateDirtyState();
  }

  private saveEdit(form: HTMLFormElement): void {
    const current = this.editingDevice;
    if (!current) return;
    const next = this.readDeviceFromForm(form, current);
    const validation = validateMeasurementDevice(next);
    if (!validation.valid) {
      this.showErrors(validation.errors);
      return;
    }

    const devices = loadMeasurementDevices();
    const exists = devices.some((device) => device.id === current.id);
    let saved = exists ? updateMeasurementDevice(current, next) : createMeasurementDevice({ ...next, id: current.id, createdAt: current.createdAt });
    if (saved.isPrimary) {
      const withoutCurrent = devices.filter((device) => device.id !== saved.id).map((device) => ({ ...device, isPrimary: false }));
      saveMeasurementDevices([...withoutCurrent, saved]);
    } else {
      saveMeasurementDevices(exists ? devices.map((device) => device.id === saved.id ? saved : device) : [...devices, saved]);
    }
    window.dispatchEvent(new StorageEvent('storage', { key: 'pool-maintenance:measurementDevices' }));
    this.navigate('/settings/measurement-devices');
    this.renderList('Medidor guardado.');
  }

  private readDeviceFromForm(form: HTMLFormElement, base: MeasurementDevice): MeasurementDevice {
    const data = new FormData(form);
    const status = String(data.get('status') ?? 'active') as 'active' | 'inactive' | 'archived';
    const parameters = Array.from(this.content.querySelectorAll<HTMLElement>('[data-param-card]')).map((card) => this.readParameterFromCard(card));
    const enabled = status === 'active';
    return {
      ...base,
      customName: String(data.get('customName') ?? '').trim(),
      manufacturer: emptyToUndefined(String(data.get('manufacturer') ?? '').trim()),
      model: emptyToUndefined(String(data.get('model') ?? '').trim()),
      deviceType: String(data.get('deviceType') ?? base.deviceType) as MeasurementDeviceType,
      notes: emptyToUndefined(String(data.get('notes') ?? '').trim()),
      enabled,
      archived: status === 'archived',
      archivedAt: status === 'archived' ? (base.archivedAt ?? new Date().toISOString()) : undefined,
      isPrimary: data.get('isPrimary') === 'on',
      parameters,
    };
  }

  private readParameterFromCard(card: HTMLElement): MeasurementDeviceParameter {
    const originalCode = card.dataset.paramCode as MeasurementParameterCode;
    const value = (suffix: string) => (card.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${cssEscape(originalCode)}.${suffix}"]`)?.value ?? '').trim();
    const checked = (suffix: string) => Boolean(card.querySelector<HTMLInputElement>(`[name="${cssEscape(originalCode)}.${suffix}"]`)?.checked);
    const code = value('parameterCode') as MeasurementParameterCode;
    const capability = value('capability') as MeasurementCapability;
    const sourceParameterCode = value('sourceParameterCode') as MeasurementParameterCode | '';
    const formulaCode = value('formulaCode');
    const conversionFactor = parseOptionalNumber(value('conversionFactor'));
    const temperatureEnabled = checked('temperatureCompensationEnabled');
    const referenceTemperature = parseOptionalNumber(value('referenceTemperatureCelsius'));
    const lastCalibrationAt = fromLocalDatetime(value('lastCalibrationAt'));
    const recommendedIntervalDays = parseOptionalNumber(value('recommendedIntervalDays'));
    const calibrationStatus = value('calibrationStatus');
    const archived = card.dataset.archived === 'true';

    return {
      parameterCode: code,
      enabled: checked('enabled') && !archived,
      archived,
      capability,
      unit: value('unit') as MeasurementUnit,
      resolution: parseOptionalNumber(value('resolution')),
      minimum: parseOptionalNumber(value('minimum')),
      maximum: parseOptionalNumber(value('maximum')),
      notes: emptyToUndefined(value('notes')),
      derivation: sourceParameterCode || formulaCode || conversionFactor !== undefined
        ? {
            sourceParameterCode: sourceParameterCode || code,
            formulaCode,
            conversionFactor,
          }
        : undefined,
      temperatureCompensation: temperatureEnabled || referenceTemperature !== undefined
        ? {
            supported: true,
            enabled: temperatureEnabled,
            referenceTemperatureCelsius: referenceTemperature,
          }
        : undefined,
      calibration: lastCalibrationAt || recommendedIntervalDays !== undefined || calibrationStatus
        ? {
            supported: true,
            lastCalibrationAt,
            recommendedIntervalDays,
            status: emptyToUndefined(calibrationStatus),
          }
        : { supported: true },
    };
  }

  private duplicateDevice(deviceId: string): void {
    const devices = loadMeasurementDevices();
    const device = devices.find((candidate) => candidate.id === deviceId);
    if (!device) return;
    saveMeasurementDevices([...devices, duplicateMeasurementDevice(device)]);
    this.renderList('Medidor duplicado.');
  }

  private archiveDevice(deviceId: string): void {
    const devices = loadMeasurementDevices();
    const device = devices.find((candidate) => candidate.id === deviceId);
    if (!device) return;
    saveMeasurementDevices(devices.map((candidate) => candidate.id === deviceId ? setMeasurementDeviceLifecycle(device, 'archived') : candidate));
    this.renderList('Medidor archivado.');
  }

  private deleteDevice(deviceId: string): void {
    if (!window.confirm('Eliminar solo es posible si no hay mediciones vinculadas. Si existen, el medidor se archivara.')) return;
    const result = deleteMeasurementDeviceSafely(deviceId);
    this.renderList(result.reason ?? (result.deleted ? 'Medidor eliminado.' : 'No se pudo eliminar el medidor.'));
  }

  private cancelEdit(): void {
    if (this.hasPendingChanges() && !window.confirm('Hay cambios sin guardar. Deseas descartarlos?')) return;
    this.navigate('/settings/measurement-devices');
    this.renderList();
  }

  private showErrors(errors: Record<string, string>): void {
    this.content.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
    const errorsEl = document.getElementById('measurementDeviceErrors');
    if (!errorsEl) return;
    errorsEl.innerHTML = Object.values(errors).map((message) => `<div class="form-error">${escapeHtml(message)}</div>`).join('');
    const firstKey = Object.keys(errors)[0];
    const firstInput = inputForError(this.content, firstKey);
    if (firstInput) {
      firstInput.setAttribute('aria-invalid', 'true');
      firstInput.scrollIntoView({ block: 'center' });
      firstInput.focus();
    } else {
      errorsEl.scrollIntoView({ block: 'center' });
    }
  }

  private updateDirtyState(): void {
    const dirty = this.hasPendingChanges();
    const status = document.getElementById('measurementDeviceDirty');
    if (status) {
      status.textContent = dirty ? 'Cambios sin guardar' : '';
      status.className = dirty ? 'status-msg error' : 'status-msg';
    }
  }

  private syncAllDerivationVisibility(): void {
    this.content.querySelectorAll<HTMLElement>('.measurement-device-param-card').forEach((card) => this.syncDerivationVisibility(card));
  }

  private syncDerivationVisibility(card: HTMLElement | null): void {
    if (!card) return;
    const capability = card.querySelector<HTMLSelectElement>('[name$=".capability"]')?.value;
    const show = capability === 'calculated' || capability === 'estimated';
    card.querySelectorAll<HTMLElement>('.derivation-field').forEach((field) => {
      field.hidden = !show;
      field.style.display = show ? '' : 'none';
    });
  }

  private formSnapshot(form: HTMLFormElement): string {
    const data = new FormData(form);
    const values: Record<string, FormDataEntryValue[]> = {};
    for (const [key, value] of data.entries()) {
      values[key] = [...(values[key] ?? []), value];
    }
    return JSON.stringify(values);
  }

  private navigate(route: string): void {
    const pathname = appRouteUrl(route);
    if (window.location.pathname !== pathname) {
      window.history.pushState({}, '', pathname);
    }
  }
}

function editDeviceIdFromRoute(route: AppRoute | string): string | null {
  const match = String(route).match(/^\/settings\/measurement-devices\/([^/]+)\/edit$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function enabledParameterCodes(device: MeasurementDevice): MeasurementParameterCode[] {
  return device.parameters
    .filter((parameter) => parameter.enabled && !parameter.archived && parameter.capability !== 'unsupported')
    .map((parameter) => parameter.parameterCode);
}

function latestCalibration(device: MeasurementDevice): string | undefined {
  return device.parameters
    .map((parameter) => parameter.calibration?.lastCalibrationAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function deviceStatusLabels(device: MeasurementDevice, lastUsedAt: string | undefined, lastCalibrationAt: string | undefined): Array<{ text: string; className: string }> {
  const labels: Array<{ text: string; className: string }> = [{ text: statusLabel(deviceLifecycleStatus(device)), className: deviceLifecycleStatus(device) }];
  if (device.isPrimary) labels.push({ text: 'Principal', className: 'primary' });
  if (!lastCalibrationAt) labels.push({ text: 'Necesita calibracion', className: 'warning' });
  if (!lastUsedAt) labels.push({ text: 'Nunca utilizado', className: 'muted' });
  return labels;
}

function renderHistory(device: MeasurementDevice): string {
  if (!device.history || device.history.length === 0) return '<p class="empty-state">Sin cambios registrados.</p>';
  return `
    <ol class="measurement-device-history">
      ${[...device.history].reverse().map((entry) => `<li><span>${escapeHtml(formatDateTime(entry.changedAt))}</span>${escapeHtml(entry.summary)}</li>`).join('')}
    </ol>
  `;
}

function inputForError(root: HTMLElement, key: string | undefined): HTMLElement | null {
  if (!key) return null;
  if (key === 'customName') return root.querySelector('#deviceCustomName');
  if (key === 'parameters') return root.querySelector('#deviceNewParameter');
  const match = key.match(/^parameters\.(\d+)\.([^.]+)/);
  if (!match) return null;
  const card = root.querySelectorAll<HTMLElement>('[data-param-card]')[Number(match[1])];
  if (!card) return null;
  const field = match[2] === 'range' ? 'minimum' : match[2];
  return card.querySelector(`[name$=".${field}"]`);
}

function option(value: string, current: string | undefined, label = value): string {
  return `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function parameterLabel(code: MeasurementParameterCode): string {
  const labels: Partial<Record<MeasurementParameterCode, string>> = {
    ph: 'pH',
    fac: 'FAC',
    ec: 'CE',
    tds: 'TDS',
    salt: 'Sal',
    orp: 'ORP',
    temperature: 'Temperatura',
    totalChlorine: 'Cloro total',
    alkalinity: 'Alcalinidad',
    calciumHardness: 'Dureza calcica',
    cya: 'CYA',
    bromine: 'Bromo',
  };
  return labels[code] ?? code;
}

function capabilityLabel(capability: MeasurementCapability): string {
  const labels: Record<MeasurementCapability, string> = {
    direct: 'Directo',
    estimated: 'Estimado',
    calculated: 'Calculado',
    'manual-entry': 'Manual',
    unsupported: 'No soportado',
  };
  return labels[capability];
}

function unitLabel(unit: MeasurementUnit): string {
  const labels: Record<MeasurementUnit, string> = {
    ph: 'pH',
    'us-cm': 'uS/cm',
    ppm: 'ppm',
    mv: 'mV',
    celsius: 'Celsius',
    fahrenheit: 'Fahrenheit',
    boolean: 'Si/no',
    custom: 'Personalizada',
  };
  return labels[unit];
}

function statusLabel(status: 'active' | 'inactive' | 'archived'): string {
  const labels = {
    active: 'Activo',
    inactive: 'Inactivo',
    archived: 'Archivado',
  };
  return labels[status];
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}

function toLocalDatetime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fromLocalDatetime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"');
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
