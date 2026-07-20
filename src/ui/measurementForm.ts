import { t } from '../i18n/index';
import type { TranslationKey } from '../i18n/types';
import type { Measurement, MeasurementContext, MeasurementContextFieldOrigin } from '../domain/measurement';
import { generateId, validateMeasurement } from '../domain/measurement';
import { loadSettings } from '../domain/storage';
import { getChlorinatorModeDefinitions, getChlorinatorOutputControl } from '../domain/saltChlorinator';

/**
 * Convert a datetime-local value (YYYY-MM-DDTHH:MM) to an ISO 8601
 * UTC string by treating the input as local time.
 */
function localDatetimeToISO(localValue: string): string {
  return new Date(localValue).toISOString();
}

/**
 * Format a Date to a datetime-local-compatible string (YYYY-MM-DDTHH:MM)
 * in the local timezone.
 */
function dateToLocalDatetime(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function getNum(id: string): number {
  return parseFloat((document.getElementById(id) as HTMLInputElement).value);
}

/**
 * Map of English validation error strings (from validateMeasurement) to
 * their corresponding translation keys. Unknown strings pass through
 * untranslated.
 */
const errorKeyMap: Record<string, TranslationKey> = {
  'pH must be between 0 and 14.': 'validation.ph.range',
  'EC must be a positive number.': 'validation.ec.positive',
  'TDS must be a positive number.': 'validation.tds.positive',
  'Salt must be a positive number.': 'validation.salt.positive',
  'ORP must be a positive number.': 'validation.orp.positive',
  'FAC must be zero or a positive number.': 'validation.fac.positive',
  'Temperature must be between -10 and 60 °C.': 'validation.temperature.range',
  'Date and time is required.': 'validation.datetime.required',
};

function translateError(msg: string): string {
  const key = errorKeyMap[msg];
  return key ? t(key) : msg;
}

export class MeasurementForm {
  private form: HTMLFormElement;
  private errorsEl: HTMLElement;
  private dateTimeInput: HTMLInputElement;
  private onSubmitCb: ((m: Measurement) => void) | null = null;

  constructor() {
    this.form = document.getElementById('measurementForm') as HTMLFormElement;
    this.errorsEl = document.getElementById('formErrors') as HTMLElement;
    this.dateTimeInput = document.getElementById('mDateTime') as HTMLInputElement;

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    this.refreshChlorinatorContextFields();
    window.addEventListener('storage', () => this.refreshChlorinatorContextFields());
  }

  onSubmit(cb: (m: Measurement) => void): void {
    this.onSubmitCb = cb;
  }

  hasUnsavedChanges(): boolean {
    return Array.from(this.form.elements).some((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
        return false;
      }
      if (element === this.dateTimeInput) return false;
      if (element.type === 'checkbox') return (element as HTMLInputElement).checked;
      return element.value.trim().length > 0;
    });
  }

  refreshChlorinatorContextFields(): void {
    const settings = loadSettings();
    const chlorinator = settings.saltChlorinator;
    const enabled = settings.poolType === 'saltwater' && Boolean(chlorinator?.enabled);
    const outputControl = chlorinator ? getChlorinatorOutputControl(chlorinator) : { kind: 'unknown' as const };
    const showPercent = enabled && outputControl.kind === 'continuous-percentage';
    const showRuntime = enabled && (outputControl.kind === 'fixed' || outputControl.kind === 'runtime-only' || outputControl.kind === 'continuous-percentage' || outputControl.kind === 'discrete-levels' || outputControl.kind === 'automatic' || outputControl.kind === 'externally-controlled');
    const showBoost = enabled && chlorinator !== undefined && getChlorinatorModeDefinitions(chlorinator).some((mode) => mode.code === 'boost' && mode.supported);

    this.form.querySelectorAll<HTMLElement>('.ctx-chlorinator-percent-field').forEach((el) => {
      el.hidden = !showPercent;
      el.style.display = showPercent ? '' : 'none';
    });
    this.form.querySelectorAll<HTMLElement>('.ctx-chlorinator-runtime-field').forEach((el) => {
      el.hidden = !showRuntime;
      el.style.display = showRuntime ? '' : 'none';
    });
    this.form.querySelectorAll<HTMLElement>('.ctx-chlorinator-boost-field').forEach((el) => {
      el.hidden = !showBoost;
      el.style.display = showBoost ? '' : 'none';
    });
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();
    this.refreshChlorinatorContextFields();

    const dateTimeLocal = this.dateTimeInput.value;
    const measuredAt = dateTimeLocal ? localDatetimeToISO(dateTimeLocal) : '';
    const notes = (document.getElementById('mNotes') as HTMLTextAreaElement).value;

    // Read context
    const context = readContext(measuredAt);

    const partial: Partial<Measurement> = {
      measuredAt,
      ph: getNum('mPh'),
      ec: getNum('mEc'),
      tds: getNum('mTds'),
      salt: getNum('mSalt'),
      orp: getNum('mOrp'),
      fac: getNum('mFac'),
      temperature: getNum('mTemperature'),
      notes: notes || undefined,
      context: context || undefined,
    };

    const validation = validateMeasurement(partial);
    this.clearErrors();

    if (!validation.valid) {
      this.showErrors(validation.errors);
      return;
    }

    const measurement: Measurement = {
      id: generateId(),
      measuredAt,
      ph: partial.ph!,
      ec: partial.ec!,
      tds: partial.tds!,
      salt: partial.salt!,
      orp: partial.orp!,
      fac: partial.fac!,
      temperature: partial.temperature!,
      notes: partial.notes,
      context: partial.context,
    };

    this.form.reset();
    // Reset to current date-time
    this.dateTimeInput.value = dateToLocalDatetime(new Date());
    this.onSubmitCb?.(measurement);
  }

  private showErrors(errors: Record<string, string>): void {
    this.errorsEl.innerHTML = Object.values(errors)
      .map((msg) => `<div class="form-error">${escapeHtml(translateError(msg))}</div>`)
      .join('');

    // Mark invalid fields
    for (const key of Object.keys(errors)) {
      const el = document.getElementById(`m${key.charAt(0).toUpperCase() + key.slice(1)}`);
      el?.classList.add('error');
    }
  }

  private clearErrors(): void {
    this.errorsEl.innerHTML = '';
    this.form.querySelectorAll('.error').forEach((el) => el.classList.remove('error'));
  }

}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Read measurement context fields from the form.
 * Returns undefined if all fields are empty/default.
 */
function readContext(measuredAt: string): MeasurementContext | undefined {
  const sunlight = (document.getElementById('ctxSunlight') as HTMLSelectElement).value;
  const poolCoveredRaw = (document.getElementById('ctxPoolCovered') as HTMLSelectElement).value;
  const batherLoad = (document.getElementById('ctxBatherLoad') as HTMLSelectElement).value;
  const rain = (document.getElementById('ctxRain') as HTMLInputElement).checked;
  const waterAddedRaw = (document.getElementById('ctxWaterAdded') as HTMLInputElement).value;
  const backwash = (document.getElementById('ctxBackwash') as HTMLInputElement).checked;
  const chlorOutputRaw = (document.getElementById('ctxChlorOutput') as HTMLInputElement).value;
  const chlorHoursRaw = (document.getElementById('ctxChlorHours') as HTMLInputElement).value;
  const chlorConfiguredHoursRaw = (document.getElementById('ctxChlorConfiguredHours') as HTMLInputElement).value;
  const chlorCompletedRaw = (document.getElementById('ctxChlorCompleted') as HTMLSelectElement).value;
  const chlorBoostStatusRaw = (document.getElementById('ctxChlorBoostStatus') as HTMLSelectElement).value;
  const chlorBoostHoursRaw = (document.getElementById('ctxChlorBoostHours') as HTMLInputElement).value;
  const chlorFlowConfirmedRaw = (document.getElementById('ctxChlorFlowConfirmed') as HTMLSelectElement).value;
  const chlorPumpActiveRaw = (document.getElementById('ctxChlorPumpActive') as HTMLSelectElement).value;
  const chlorAlarmsRaw = (document.getElementById('ctxChlorAlarms') as HTMLInputElement).value;
  const chlorInterruptionsRaw = (document.getElementById('ctxChlorInterruptions') as HTMLInputElement).value;
  const filtHoursRaw = (document.getElementById('ctxFiltHours') as HTMLInputElement).value;
  const algae = (document.getElementById('ctxAlgae') as HTMLInputElement).checked;
  const clarity = (document.getElementById('ctxClarity') as HTMLSelectElement).value;

  const ctx: MeasurementContext = {};

  if (sunlight === 'none' || sunlight === 'low' || sunlight === 'medium' || sunlight === 'high') {
    ctx.sunlight = sunlight;
  }
  if (poolCoveredRaw === 'true' || poolCoveredRaw === 'false') {
    ctx.poolCovered = poolCoveredRaw === 'true';
  }
  if (batherLoad === 'none' || batherLoad === 'low' || batherLoad === 'medium' || batherLoad === 'high') {
    ctx.batherLoad = batherLoad;
  }
  if (rain) ctx.rainSincePreviousMeasurement = true;
  if (waterAddedRaw) ctx.waterAddedLiters = parseFloat(waterAddedRaw);
  if (backwash) ctx.backwashPerformed = true;
  if (chlorOutputRaw) ctx.chlorinatorOutputPercent = parseFloat(chlorOutputRaw);
  if (chlorHoursRaw) ctx.chlorinatorHoursSincePreviousMeasurement = parseFloat(chlorHoursRaw);
  const chlorinatorOperation = buildChlorinatorOperation({
    measuredAt,
    outputPercent: chlorOutputRaw ? parseFloat(chlorOutputRaw) : undefined,
    runtimeHours: chlorHoursRaw ? parseFloat(chlorHoursRaw) : undefined,
    configuredRuntimeHours: chlorConfiguredHoursRaw ? parseFloat(chlorConfiguredHoursRaw) : undefined,
    completionStatus: completionStatusFromSelect(chlorCompletedRaw),
    boostStatus: boostStatusFromSelect(chlorBoostStatusRaw),
    boostRuntimeHours: chlorBoostHoursRaw ? parseFloat(chlorBoostHoursRaw) : undefined,
    flowStatus: flowStatusFromSelect(chlorFlowConfirmedRaw),
    pumpActive: parseBooleanSelect(chlorPumpActiveRaw),
    filtrationRuntimeHours: filtHoursRaw ? parseFloat(filtHoursRaw) : undefined,
    alarms: parseAlarmList(chlorAlarmsRaw),
    interruptions: parseInterruptionList(chlorInterruptionsRaw),
  });
  if (chlorinatorOperation) ctx.chlorinatorOperation = chlorinatorOperation;
  if (filtHoursRaw) ctx.filtrationHoursSincePreviousMeasurement = parseFloat(filtHoursRaw);
  if (algae) ctx.visibleAlgae = true;
  if (clarity === 'clear' || clarity === 'slightly-cloudy' || clarity === 'cloudy') {
    ctx.waterClarity = clarity;
  }

  if (Object.keys(ctx).length === 0) return undefined;
  ctx.intervalEnd = measuredAt;
  ctx.source = 'user';
  ctx.fieldOrigins = Object.keys(ctx)
    .filter((field) => field !== 'fieldOrigins' && field !== 'source')
    .map((field) => ({
      field: field as MeasurementContextFieldOrigin['field'],
      origin: 'user',
    }));
  return ctx;
}

function buildChlorinatorOperation(input: {
  measuredAt: string;
  outputPercent?: number;
  runtimeHours?: number;
  configuredRuntimeHours?: number;
  completionStatus: 'completed' | 'interrupted' | 'unknown';
  boostStatus: 'not-used' | 'used' | 'unknown';
  boostRuntimeHours?: number;
  flowStatus: 'confirmed' | 'not-confirmed' | 'unknown';
  pumpActive?: boolean;
  filtrationRuntimeHours?: number;
  alarms: Array<{ message: string; severity: 'unknown' }>;
  interruptions: Array<{ reason: 'unknown'; notes: string }>;
}): MeasurementContext['chlorinatorOperation'] | undefined {
  const settings = loadSettings();
  const chlorinator = settings.saltChlorinator;
  if (!chlorinator?.enabled) return undefined;

  const hasNormalData = input.outputPercent !== undefined ||
    input.runtimeHours !== undefined ||
    input.configuredRuntimeHours !== undefined ||
    input.completionStatus !== 'unknown';
  const hasBoostData = input.boostStatus !== 'unknown' || input.boostRuntimeHours !== undefined;
  const hasSupportData = input.flowStatus !== 'unknown' ||
    input.pumpActive !== undefined ||
    input.filtrationRuntimeHours !== undefined ||
    input.alarms.length > 0 ||
    input.interruptions.length > 0;
  if (!hasNormalData && !hasBoostData && !hasSupportData) return undefined;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chlorinatorId: chlorinator.equipment?.id ?? chlorinator.presetId ?? 'configured-chlorinator',
    intervalStartAt: input.measuredAt,
    intervalEndAt: input.measuredAt,
    source: 'user-reported',
    normalOperation: hasNormalData
      ? {
          configuredRuntimeMinutes: hoursToMinutes(input.configuredRuntimeHours),
          actualRuntimeMinutes: hoursToMinutes(input.runtimeHours),
          averageOutputPercent: input.outputPercent,
          completionStatus: input.completionStatus,
          runtimeHours: input.runtimeHours,
          configuredRuntimeHours: input.configuredRuntimeHours,
          outputPercent: input.outputPercent,
          expectedCompleted: input.completionStatus === 'completed',
          actuallyCompleted: input.completionStatus === 'completed',
        }
      : undefined,
    boostOperation: hasBoostData
      ? {
          status: input.boostStatus,
          configuredRuntimeMinutes: hoursToMinutes(input.boostRuntimeHours),
          actualRuntimeMinutes: hoursToMinutes(input.boostRuntimeHours),
          outputKnowledge: 'unknown',
          activated: input.boostStatus === 'used',
          runtimeHours: input.boostRuntimeHours,
          configuredRuntimeHours: input.boostRuntimeHours,
          productionKnown: false,
        }
      : undefined,
    filtrationRuntimeMinutes: hoursToMinutes(input.filtrationRuntimeHours),
    flowStatus: input.flowStatus,
    filtrationRuntimeHours: input.filtrationRuntimeHours,
    flowConfirmed: input.flowStatus === 'confirmed',
    alarms: input.alarms,
    interruptions: input.interruptions,
    notes: input.pumpActive === undefined ? undefined : `pump-active:${input.pumpActive}`,
  };
}

function parseBooleanSelect(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function completionStatusFromSelect(value: string): 'completed' | 'interrupted' | 'unknown' {
  if (value === 'true') return 'completed';
  if (value === 'false') return 'interrupted';
  return 'unknown';
}

function boostStatusFromSelect(value: string): 'not-used' | 'used' | 'unknown' {
  if (value === 'used' || value === 'not-used') return value;
  return 'unknown';
}

function flowStatusFromSelect(value: string): 'confirmed' | 'not-confirmed' | 'unknown' {
  if (value === 'true') return 'confirmed';
  if (value === 'false') return 'not-confirmed';
  return 'unknown';
}

function hoursToMinutes(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? Math.round(value * 60) : undefined;
}

function parseAlarmList(value: string): Array<{ message: string; severity: 'unknown' }> {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((message) => ({ message, severity: 'unknown' }));
}

function parseInterruptionList(value: string): Array<{ reason: 'unknown'; notes: string }> {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((notes) => ({ reason: 'unknown', notes }));
}
