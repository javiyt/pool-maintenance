import type {
  MeasurementCapability,
  MeasurementMethod,
  MeasurementParameterCode,
  MeasurementUnit,
  MeasurementValueTrace,
} from './measurement';
import { generateId } from './measurement';

export const MEASUREMENT_DEVICE_SCHEMA_VERSION = '1.0.0';

export type MeasurementDeviceType = MeasurementMethod;

export interface MeasurementDevice {
  id: string;
  manufacturer?: string;
  model?: string;
  customName: string;
  deviceType: MeasurementDeviceType;
  parameters: MeasurementDeviceParameter[];
  enabled: boolean;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: string;
}

export interface MeasurementDeviceParameter {
  parameterCode: MeasurementParameterCode;
  capability: MeasurementCapability;
  enabled: boolean;
  unit: MeasurementUnit;
  resolution?: number;
  minimum?: number;
  maximum?: number;
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
    capability: Exclude<MeasurementCapability, 'unsupported'>;
    unit: MeasurementUnit;
    resolution?: number;
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
  });
}

export function normalizeMeasurementDevice(device: MeasurementDevice): MeasurementDevice {
  return {
    ...device,
    enabled: device.enabled ?? true,
    isPrimary: device.isPrimary ?? false,
    parameters: (device.parameters ?? []).map((parameter) => ({
      ...parameter,
      enabled: parameter.enabled ?? true,
    })),
    schemaVersion: device.schemaVersion ?? MEASUREMENT_DEVICE_SCHEMA_VERSION,
  };
}

export function composeMeasurementForm(input: ComposeMeasurementFormInput): MeasurementFormComposition {
  const reasons = new Map<MeasurementParameterCode, Set<MeasurementFormField['reason']>>();
  for (const code of basicParametersForPool(input.poolDisinfection)) addReason(reasons, code, 'basic');
  for (const code of input.periodicParameters ?? []) addReason(reasons, code, 'periodic');
  for (const code of input.requestedParameters ?? []) addReason(reasons, code, 'requested');
  for (const code of input.customParameters ?? []) addReason(reasons, code, 'custom');

  const enabledDevices = input.devices.filter((device) => device.enabled);
  for (const device of enabledDevices) {
    for (const parameter of device.parameters) {
      if (parameter.enabled && parameter.capability !== 'unsupported') {
        addReason(reasons, parameter.parameterCode, 'device');
      }
    }
  }

  const fields = Array.from(reasons.keys()).map((parameterCode) => {
    const parameterReasons = reasons.get(parameterCode) ?? new Set<MeasurementFormField['reason']>();
    const devices = enabledDevices.flatMap((device) =>
      device.parameters
        .filter((parameter) => parameter.parameterCode === parameterCode && parameter.enabled && parameter.capability !== 'unsupported')
        .map((parameter) => ({
          deviceId: device.id,
          deviceName: device.customName || [device.manufacturer, device.model].filter(Boolean).join(' ') || device.deviceType,
          deviceType: device.deviceType,
          capability: parameter.capability as Exclude<MeasurementCapability, 'unsupported'>,
          unit: parameter.unit,
          resolution: parameter.resolution,
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

  return {
    parameterCode: input.parameterCode,
    deviceId: capability?.deviceId,
    deviceName: capability?.deviceName,
    method: capability?.deviceType ?? 'manual',
    capability: capability?.capability ?? 'manual-entry',
    originalUnit: capability?.unit ?? defaultUnit(input.parameterCode),
    precision: capability?.resolution,
    calibrationLastAt: capability?.lastCalibrationAt,
    conversionFactor: capability?.conversionFactor,
    sourceParameterCode: capability?.sourceParameterCode,
    derived: capability?.capability === 'calculated' || capability?.capability === 'estimated',
  };
}

export function deriveTdsFromEc(ec: number, conversionFactor = 0.5): number {
  return Math.round(ec * conversionFactor);
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

function defaultUnit(code: MeasurementParameterCode): MeasurementUnit {
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
