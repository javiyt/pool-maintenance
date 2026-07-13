import { t } from '../i18n/index';
import type { TranslationKey } from '../i18n/types';
import type { Measurement, MeasurementContext } from '../domain/measurement';
import { generateId, validateMeasurement } from '../domain/measurement';

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
  }

  onSubmit(cb: (m: Measurement) => void): void {
    this.onSubmitCb = cb;
  }

  private handleSubmit(e: Event): void {
    e.preventDefault();

    const dateTimeLocal = this.dateTimeInput.value;
    const measuredAt = dateTimeLocal ? localDatetimeToISO(dateTimeLocal) : '';
    const notes = (document.getElementById('mNotes') as HTMLTextAreaElement).value;

    // Read context
    const context = readContext();

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
function readContext(): MeasurementContext | undefined {
  const sunlight = (document.getElementById('ctxSunlight') as HTMLSelectElement).value;
  const poolCoveredRaw = (document.getElementById('ctxPoolCovered') as HTMLSelectElement).value;
  const batherLoad = (document.getElementById('ctxBatherLoad') as HTMLSelectElement).value;
  const rain = (document.getElementById('ctxRain') as HTMLInputElement).checked;
  const waterAddedRaw = (document.getElementById('ctxWaterAdded') as HTMLInputElement).value;
  const backwash = (document.getElementById('ctxBackwash') as HTMLInputElement).checked;
  const chlorOutputRaw = (document.getElementById('ctxChlorOutput') as HTMLInputElement).value;
  const chlorHoursRaw = (document.getElementById('ctxChlorHours') as HTMLInputElement).value;
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
  if (filtHoursRaw) ctx.filtrationHoursSincePreviousMeasurement = parseFloat(filtHoursRaw);
  if (algae) ctx.visibleAlgae = true;
  if (clarity === 'clear' || clarity === 'slightly-cloudy' || clarity === 'cloudy') {
    ctx.waterClarity = clarity;
  }

  if (Object.keys(ctx).length === 0) return undefined;
  return ctx;
}
