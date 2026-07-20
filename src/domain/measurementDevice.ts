import type {
  MeasurementCapability,
  MeasurementMethod,
  MeasurementParameterCode,
  MeasurementSourceSnapshot,
  MeasurementUnit,
  MeasurementValueTrace,
} from './measurement';
import { generateId } from './measurement';

export const MEASUREMENT_DEVICE_SCHEMA_VERSION = '1.1.0';

export type MeasurementDeviceType = MeasurementMethod;
export type MeasurementDeviceLifecycleStatus = 'active' | 'inactive' | 'archived';
export type MeasurementDeviceChangeKind =
  | 'created'
  | 'updated'
  | 'renamed'
  | 'status-changed'
  | 'parameter-added'
  | 'parameter-updated'
  | 'parameter-disabled'
  | 'parameter-archived'
  | 'duplicated'
  | 'archived';

export interface MeasurementDevice {
  id: string;
  manufacturer?: string;
  model?: string;
  customName: string;
  deviceType: MeasurementDeviceType;
  parameters: MeasurementDeviceParameter[];
  enabled: boolean;
  archived?: boolean;
  archivedAt?: string;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: string;
  history?: MeasurementDeviceChange[];
}

export interface MeasurementDeviceChange {
  id: string;
  changedAt: string;
  kind: MeasurementDeviceChangeKind;
  summary: string;
}

export interface MeasurementDeviceParameter {
  parameterCode: MeasurementParameterCode;
  capability: MeasurementCapability;
  enabled: boolean;
  archived?: boolean;
  unit: MeasurementUnit;
  resolution?: number;
  minimum?: number;
  maximum?: number;
  notes?: string;
  temperatureCompensation?: {
    supported: boolean;
    enabled?: boolean;
    referenceTemperatureCelsius?: number;
  };
  derivation?: {
    sourceParameterCode: MeasurementParameterCode;
    formulaCode: string;
    conversionFactor?: number;
  };
  calibration?: {
    supported: boolean;
    lastCalibrationAt?: string;
    recommendedIntervalDays?: number;
    status?: string;
  };
}

export interface MeasurementFormField {
  parameterCode: MeasurementParameterCode;
  required: boolean;
  reason: 'basic' | 'device' | 'periodic' | 'requested' | 'custom';
  devices: Array<{
    deviceId: string;
    deviceName: string;
    deviceType: MeasurementDeviceType;
    manufacturer?: string;
    model?: string;
    capability: Exclude<MeasurementCapability, 'unsupported'>;
    unit: MeasurementUnit;
    resolution?: number;
    calibrationStatus?: string;
    formulaCode?: string;
    conversionFactor?: number;
    sourceParameterCode?: MeasurementParameterCode;
    lastCalibrationAt?: string;
  }>;
  missingBasicMethod: boolean;
  legend: string;
}

export interface MeasurementFormComposition {
  fields: MeasurementFormField[];
  missingBasicParameters: MeasurementParameterCode[];
  canEvaluateCompleteSanitation: boolean;
  blockedConclusions: string[];
}

export interface ComposeMeasurementFormInput {
  devices: MeasurementDevice[];
  poolDisinfection?: 'chlorine' | 'bromine' | 'saltwater';
  periodicParameters?: MeasurementParameterCode[];
  requestedParameters?: MeasurementParameterCode[];
  customParameters?: MeasurementParameterCode[];
}

export interface MeasurementDeviceValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const CHLORINE_BASIC_PARAMETERS: MeasurementParameterCode[] = ['fac', 'ph'];

const PARAMETER_LEGENDS: Partial<Record<MeasurementParameterCode, string>> = {
  ph: 'Mide acidez/basicidad. Determina correcciones de pH y condiciona la eficacia del cloro.',
  fac: 'Mide cloro libre disponible. Determina si la desinfeccion basica puede evaluarse.',
  ec: 'Mide la capacidad del agua para conducir electricidad. Se usa para tendencias, contraste de sal y cambios anomalos; no identifica por si sola que producto necesita el agua.',
  tds: 'Estima o mide sustancias disueltas totales. Se usa como tendencia contextual y no para seleccionar directamente productos quimicos.',
  salt: 'Mide salinidad. Determina ajustes de sal en piscinas salinas y contrasta lecturas de CE/TDS.',
  orp: 'Mide potencial de oxidacion-reduccion. Contextualiza desinfeccion, pero debe contrastarse con FAC.',
  temperature: 'Mide temperatura del agua. Ajusta contexto de consumo, tendencias y calculos.',
  alkalinity: 'Mide alcalinidad total. Ayuda a decidir correcciones avanzadas de pH.',
  calciumHardness: 'Mide dureza calcica. Ayuda a valorar riesgo de incrustacion junto a otras mediciones.',
  cya: 'Mide estabilizante. Condiciona el objetivo de FAC y renovaciones parciales.',
};

export function createMeasurementDevice(
  input: Omit<MeasurementDevice, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    schemaVersion?: string;
  },
  now = new Date(),
): MeasurementDevice {
  const timestamp = now.toISOString();
  return normalizeMeasurementDevice({
    ...input,
    id: input.id ?? generateId(),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    schemaVersion: input.schemaVersion ?? MEASUREMENT_DEVICE_SCHEMA_VERSION,
    history: input.history ?? [buildDeviceChange('created', 'Medidor creado', timestamp)],
  });
}

export function normalizeMeasurementDevice(device: MeasurementDevice): MeasurementDevice {
  return {
    ...device,
    enabled: device.enabled ?? true,
    archived: device.archived ?? false,
    isPrimary: device.isPrimary ?? false,
    parameters: (device.parameters ?? []).map((parameter) => ({
      ...parameter,
      enabled: parameter.enabled ?? true,
      archived: parameter.archived ?? false,
    })),
    history: device.history ?? [],
    schemaVersion: device.schemaVersion ?? MEASUREMENT_DEVICE_SCHEMA_VERSION,
  };
}

export function validateMeasurementDevice(device: MeasurementDevice): MeasurementDeviceValidationResult {
  const errors: Record<string, string> = {};
  if (!device.customName.trim()) errors.customName = 'El nombre del medidor es obligatorio.';
  if (device.parameters.length === 0) errors.parameters = 'Debe configurar al menos un parametro.';

  const seen = new Set<MeasurementParameterCode>();
  for (const [index, parameter] of device.parameters.entries()) {
    const prefix = `parameters.${index}`;
    if (seen.has(parameter.parameterCode)) {
      errors[`${prefix}.parameterCode`] = 'El parametro ya existe en este medidor.';
    }
    seen.add(parameter.parameterCode);

    if (!isUnitCompatible(parameter.parameterCode, parameter.unit)) {
      errors[`${prefix}.unit`] = 'La unidad no es compatible con el parametro.';
    }
    if (parameter.minimum !== undefined && parameter.maximum !== undefined && parameter.minimum > parameter.maximum) {
      errors[`${prefix}.range`] = 'El minimo no puede ser mayor que el maximo.';
    }
    if (parameter.resolution !== undefined && parameter.resolution <= 0) {
      errors[`${prefix}.resolution`] = 'La resolucion debe ser positiva.';
    }

    const derivation = parameter.derivation;
    if ((parameter.capability === 'direct' || parameter.capability === 'manual-entry') && derivation) {
      errors[`${prefix}.derivation`] = 'Los parametros directos o manuales no deben tener derivacion.';
    }
    if (parameter.capability === 'calculated' && (!derivation?.sourceParameterCode || !derivation.formulaCode)) {
      errors[`${prefix}.derivation`] = 'Un parametro calculado necesita fuente y formula.';
    }
    if (derivation) {
      if (derivation.sourceParameterCode === parameter.parameterCode) {
        errors[`${prefix}.derivation`] = 'Un parametro no puede derivar de si mismo.';
      }
      const source = device.parameters.find((candidate) => candidate.parameterCode === derivation.sourceParameterCode);
      if (!source) {
        errors[`${prefix}.derivationSource`] = 'La fuente de derivacion debe existir en el medidor.';
      }
      if (source?.derivation?.sourceParameterCode === parameter.parameterCode) {
        errors[`${prefix}.derivationCircular`] = 'No se permite una derivacion circular.';
      }
      if (hasDerivationCycle(device, parameter.parameterCode)) {
        errors[`${prefix}.derivationCircular`] = 'No se permite una derivacion circular.';
      }
      if (parameter.parameterCode === 'tds' && derivation.sourceParameterCode !== 'ec') {
        errors[`${prefix}.derivationSource`] = 'TDS derivado debe enlazar con CE.';
      }
      if (derivation.conversionFactor !== undefined && derivation.conversionFactor <= 0) {
        errors[`${prefix}.conversionFactor`] = 'El factor de conversion debe ser positivo.';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function updateMeasurementDevice(
  current: MeasurementDevice,
  next: MeasurementDevice,
  now = new Date(),
): MeasurementDevice {
  const timestamp = now.toISOString();
  const normalizedCurrent = normalizeMeasurementDevice(current);
  const normalizedNext = normalizeMeasurementDevice({
    ...next,
    id: normalizedCurrent.id,
    createdAt: normalizedCurrent.createdAt,
    updatedAt: timestamp,
    schemaVersion: MEASUREMENT_DEVICE_SCHEMA_VERSION,
  });
  return normalizeMeasurementDevice({
    ...normalizedNext,
    history: [
      ...(normalizedCurrent.history ?? []),
      ...summarizeDeviceChanges(normalizedCurrent, normalizedNext, timestamp),
    ],
  });
}

export function duplicateMeasurementDevice(
  device: MeasurementDevice,
  now = new Date(),
): MeasurementDevice {
  const timestamp = now.toISOString();
  return normalizeMeasurementDevice({
    ...device,
    id: generateId(),
    customName: `${device.customName} (copia)`,
    isPrimary: false,
    archived: false,
    archivedAt: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    history: [buildDeviceChange('duplicated', `Duplicado desde ${device.customName}`, timestamp)],
    schemaVersion: MEASUREMENT_DEVICE_SCHEMA_VERSION,
  });
}

export function setMeasurementDeviceLifecycle(
  device: MeasurementDevice,
  status: MeasurementDeviceLifecycleStatus,
  now = new Date(),
): MeasurementDevice {
  const timestamp = now.toISOString();
  const enabled = status === 'active';
  const archived = status === 'archived';
  return normalizeMeasurementDevice({
    ...device,
    enabled,
    archived,
    archivedAt: archived ? (device.archivedAt ?? timestamp) : undefined,
    updatedAt: timestamp,
    history: [
      ...(device.history ?? []),
      buildDeviceChange(status === 'archived' ? 'archived' : 'status-changed', `Estado cambiado a ${status}`, timestamp),
    ],
  });
}

export function deviceLifecycleStatus(device: MeasurementDevice): MeasurementDeviceLifecycleStatus {
  if (device.archived) return 'archived';
  return device.enabled ? 'active' : 'inactive';
}

export function composeMeasurementForm(input: ComposeMeasurementFormInput): MeasurementFormComposition {
  const reasons = new Map<MeasurementParameterCode, Set<MeasurementFormField['reason']>>();
  for (const code of basicParametersForPool(input.poolDisinfection)) addReason(reasons, code, 'basic');
  for (const code of input.periodicParameters ?? []) addReason(reasons, code, 'periodic');
  for (const code of input.requestedParameters ?? []) addReason(reasons, code, 'requested');
  for (const code of input.customParameters ?? []) addReason(reasons, code, 'custom');

  const enabledDevices = input.devices.filter((device) => device.enabled && !device.archived);
  for (const device of enabledDevices) {
    for (const parameter of device.parameters) {
      if (parameter.enabled && !parameter.archived && parameter.capability !== 'unsupported') {
        addReason(reasons, parameter.parameterCode, 'device');
      }
    }
  }

  const fields = Array.from(reasons.keys()).map((parameterCode) => {
    const parameterReasons = reasons.get(parameterCode) ?? new Set<MeasurementFormField['reason']>();
    const devices = enabledDevices.flatMap((device) =>
      device.parameters
        .filter((parameter) => parameter.parameterCode === parameterCode && parameter.enabled && !parameter.archived && parameter.capability !== 'unsupported')
        .map((parameter) => ({
          deviceId: device.id,
          deviceName: deviceDisplayName(device),
          deviceType: device.deviceType,
          manufacturer: device.manufacturer,
          model: device.model,
          capability: parameter.capability as Exclude<MeasurementCapability, 'unsupported'>,
          unit: parameter.unit,
          resolution: parameter.resolution,
          calibrationStatus: parameter.calibration?.status,
          formulaCode: parameter.derivation?.formulaCode,
          conversionFactor: parameter.derivation?.conversionFactor,
          sourceParameterCode: parameter.derivation?.sourceParameterCode,
          lastCalibrationAt: parameter.calibration?.lastCalibrationAt,
        })),
    );
    const reason = reasonPriority(parameterReasons);
    return {
      parameterCode,
      required: parameterReasons.has('basic'),
      reason,
      devices,
      missingBasicMethod: parameterReasons.has('basic') && devices.length === 0,
      legend: buildLegend(parameterCode, devices),
    };
  });

  const sortedFields = fields.sort((a, b) => fieldOrder(a.parameterCode) - fieldOrder(b.parameterCode));
  const missingBasicParameters = sortedFields
    .filter((field) => field.required && field.missingBasicMethod)
    .map((field) => field.parameterCode);
  const blockedConclusions = blockedConclusionsForMissing(missingBasicParameters);

  return {
    fields: sortedFields,
    missingBasicParameters,
    canEvaluateCompleteSanitation: missingBasicParameters.length === 0,
    blockedConclusions,
  };
}

export function buildMeasurementValueTrace(input: {
  parameterCode: MeasurementParameterCode;
  field: MeasurementFormField;
  selectedDeviceId?: string;
}): MeasurementValueTrace {
  const capability = input.selectedDeviceId
    ? input.field.devices.find((device) => device.deviceId === input.selectedDeviceId) ?? input.field.devices[0]
    : input.field.devices[0];
  const snapshot: MeasurementSourceSnapshot | undefined = capability
    ? {
        deviceId: capability.deviceId,
        deviceName: capability.deviceName,
        manufacturer: capability.manufacturer,
        model: capability.model,
        deviceType: capability.deviceType,
        parameterCode: input.parameterCode,
        capability: capability.capability,
        unit: capability.unit,
        resolution: capability.resolution,
        calibrationSnapshot: capability.lastCalibrationAt || capability.calibrationStatus
          ? {
              lastCalibrationAt: capability.lastCalibrationAt,
              calibrationStatus: capability.calibrationStatus,
            }
          : undefined,
        derivationSnapshot: capability.sourceParameterCode || capability.formulaCode || capability.conversionFactor !== undefined
          ? {
              sourceParameterCode: capability.sourceParameterCode,
              formulaCode: capability.formulaCode,
              conversionFactor: capability.conversionFactor,
            }
          : undefined,
      }
    : undefined;

  return {
    parameterCode: input.parameterCode,
    deviceId: capability?.deviceId,
    deviceName: capability?.deviceName,
    manufacturer: capability?.manufacturer,
    model: capability?.model,
    deviceType: capability?.deviceType,
    method: capability?.deviceType ?? 'manual',
    capability: capability?.capability ?? 'manual-entry',
    originalUnit: capability?.unit ?? defaultUnit(input.parameterCode),
    precision: capability?.resolution,
    calibrationLastAt: capability?.lastCalibrationAt,
    calibrationStatus: capability?.calibrationStatus,
    conversionFactor: capability?.conversionFactor,
    formulaCode: capability?.formulaCode,
    sourceParameterCode: capability?.sourceParameterCode,
    derived: capability?.capability === 'calculated' || capability?.capability === 'estimated',
    sourceSnapshot: snapshot,
  };
}

export function deriveTdsFromEc(ec: number, conversionFactor = 0.5): number {
  return Math.round(ec * conversionFactor);
}

export function deviceDisplayName(device: Pick<MeasurementDevice, 'customName' | 'manufacturer' | 'model' | 'deviceType'>): string {
  return device.customName || [device.manufacturer, device.model].filter(Boolean).join(' ') || device.deviceType;
}

export function defaultUnit(code: MeasurementParameterCode): MeasurementUnit {
  switch (code) {
    case 'ph':
      return 'ph';
    case 'ec':
      return 'us-cm';
    case 'orp':
      return 'mv';
    case 'temperature':
      return 'celsius';
    default:
      return 'ppm';
  }
}

export function isUnitCompatible(code: MeasurementParameterCode, unit: MeasurementUnit): boolean {
  const compatible: Record<MeasurementParameterCode, MeasurementUnit[]> = {
    ph: ['ph'],
    ec: ['us-cm'],
    tds: ['ppm'],
    salt: ['ppm'],
    orp: ['mv'],
    fac: ['ppm'],
    temperature: ['celsius', 'fahrenheit'],
    totalChlorine: ['ppm'],
    alkalinity: ['ppm'],
    calciumHardness: ['ppm'],
    cya: ['ppm'],
    bromine: ['ppm'],
  };
  return compatible[code]?.includes(unit) ?? unit === 'custom';
}

function basicParametersForPool(poolDisinfection: ComposeMeasurementFormInput['poolDisinfection']): MeasurementParameterCode[] {
  if (poolDisinfection === 'bromine') return ['bromine', 'ph'];
  return CHLORINE_BASIC_PARAMETERS;
}

function addReason(
  reasons: Map<MeasurementParameterCode, Set<MeasurementFormField['reason']>>,
  code: MeasurementParameterCode,
  reason: MeasurementFormField['reason'],
): void {
  const existing = reasons.get(code) ?? new Set<MeasurementFormField['reason']>();
  existing.add(reason);
  reasons.set(code, existing);
}

function reasonPriority(reasons: Set<MeasurementFormField['reason']>): MeasurementFormField['reason'] {
  for (const reason of ['basic', 'requested', 'periodic', 'device', 'custom'] as const) {
    if (reasons.has(reason)) return reason;
  }
  return 'custom';
}

function buildLegend(
  parameterCode: MeasurementParameterCode,
  devices: MeasurementFormField['devices'],
): string {
  const base = PARAMETER_LEGENDS[parameterCode] ?? 'Parametro personalizado configurado por el usuario.';
  if (devices.length === 0) {
    return `${base} No hay dispositivo configurado; puede introducirse manualmente o anadirse un medidor.`;
  }
  const first = devices[0];
  const devicePart = `${first.deviceName} (${first.capability})`;
  if (parameterCode === 'tds' && first.sourceParameterCode === 'ec') {
    return `${base} En este dispositivo se calcula desde la conductividad usando un factor de ${first.conversionFactor ?? 0.5}.`;
  }
  return `${base} Metodo disponible: ${devicePart}.`;
}

function blockedConclusionsForMissing(missing: MeasurementParameterCode[]): string[] {
  const blocked: string[] = [];
  if (missing.includes('fac')) {
    blocked.push('seguridad sanitaria completa');
    blocked.push('necesidad de cloro o ajuste de clorador');
  }
  if (missing.includes('ph')) {
    blocked.push('correccion de pH');
    blocked.push('eficacia completa de la desinfeccion');
  }
  return blocked;
}

function fieldOrder(code: MeasurementParameterCode): number {
  return ['ph', 'fac', 'orp', 'salt', 'ec', 'tds', 'temperature', 'alkalinity', 'calciumHardness', 'cya', 'totalChlorine', 'bromine'].indexOf(code);
}

function summarizeDeviceChanges(
  current: MeasurementDevice,
  next: MeasurementDevice,
  timestamp: string,
): MeasurementDeviceChange[] {
  const changes: MeasurementDeviceChange[] = [];
  if (current.customName !== next.customName) {
    changes.push(buildDeviceChange('renamed', `Nombre cambiado de "${current.customName}" a "${next.customName}"`, timestamp));
  }
  if (current.enabled !== next.enabled || current.archived !== next.archived) {
    changes.push(buildDeviceChange('status-changed', `Estado cambiado a ${deviceLifecycleStatus(next)}`, timestamp));
  }
  if (current.manufacturer !== next.manufacturer || current.model !== next.model || current.deviceType !== next.deviceType || current.notes !== next.notes || current.isPrimary !== next.isPrimary) {
    changes.push(buildDeviceChange('updated', 'Identificacion o uso del medidor actualizado', timestamp));
  }

  const currentParams = new Map(current.parameters.map((parameter) => [parameter.parameterCode, parameter]));
  for (const nextParameter of next.parameters) {
    const currentParameter = currentParams.get(nextParameter.parameterCode);
    if (!currentParameter) {
      changes.push(buildDeviceChange('parameter-added', `Parametro ${nextParameter.parameterCode} anadido`, timestamp));
      continue;
    }
    if (currentParameter.enabled && !nextParameter.enabled) {
      changes.push(buildDeviceChange(nextParameter.archived ? 'parameter-archived' : 'parameter-disabled', `Parametro ${nextParameter.parameterCode} retirado de nuevas mediciones`, timestamp));
    } else if (JSON.stringify(currentParameter) !== JSON.stringify(nextParameter)) {
      changes.push(buildDeviceChange('parameter-updated', `Parametro ${nextParameter.parameterCode} actualizado`, timestamp));
    }
  }
  for (const currentParameter of current.parameters) {
    if (!next.parameters.some((parameter) => parameter.parameterCode === currentParameter.parameterCode)) {
      changes.push(buildDeviceChange('parameter-archived', `Parametro ${currentParameter.parameterCode} archivado`, timestamp));
    }
  }

  return changes.length > 0 ? changes : [buildDeviceChange('updated', 'Medidor guardado sin cambios estructurales', timestamp)];
}

function buildDeviceChange(kind: MeasurementDeviceChangeKind, summary: string, changedAt: string): MeasurementDeviceChange {
  return {
    id: generateId(),
    kind,
    summary,
    changedAt,
  };
}

function hasDerivationCycle(device: MeasurementDevice, start: MeasurementParameterCode): boolean {
  const byCode = new Map(device.parameters.map((parameter) => [parameter.parameterCode, parameter]));
  const visited = new Set<MeasurementParameterCode>();
  let current = byCode.get(start)?.derivation?.sourceParameterCode;
  while (current) {
    if (current === start || visited.has(current)) return true;
    visited.add(current);
    current = byCode.get(current)?.derivation?.sourceParameterCode;
  }
  return false;
}
