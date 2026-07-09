import type { Measurement } from '../domain/measurement';
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
    };

    this.form.reset();
    // Reset to current date-time
    this.dateTimeInput.value = dateToLocalDatetime(new Date());
    this.onSubmitCb?.(measurement);
  }

  private showErrors(errors: Record<string, string>): void {
    this.errorsEl.innerHTML = Object.values(errors)
      .map((msg) => `<div class="form-error">${escapeHtml(msg)}</div>`)
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
