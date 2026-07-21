// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Measurement } from '../src/domain/measurement';
import { saveMeasurements } from '../src/domain/storage';
import {
  filterMeasurementsByDateRange,
  getMeasurementDateLimits,
  HistoryPanel,
  sortMeasurementsNewestFirst,
  validateMeasurementDateRange,
} from '../src/ui/historyPanel';
import { setLanguage } from '../src/i18n/index';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
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
  document.body.innerHTML = `
    <button id="exportBtn">Export</button>
    <button id="importBtn">Import</button>
    <input id="importFileInput" type="file" />
    <div id="historyContent"></div>
  `;
});

describe('measurement history date helpers', () => {
  it('sorts measurements from newest to oldest', () => {
    const sorted = sortMeasurementsNewestFirst([
      measurement('old', localISO(2026, 1, 10, 8)),
      measurement('new', localISO(2026, 1, 12, 8)),
      measurement('middle', localISO(2026, 1, 11, 8)),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['new', 'middle', 'old']);
  });

  it('calculates selectable limits from real local measurement dates', () => {
    const limits = getMeasurementDateLimits([
      measurement('latest', localISO(2026, 7, 21, 23, 59)),
      measurement('first', localISO(2026, 1, 3, 0, 1)),
    ]);

    expect(limits).toEqual({ min: '2026-01-03', max: '2026-07-21' });
  });

  it('filters inclusively across the full local start and end days', () => {
    const list = [
      measurement('before', localISO(2026, 7, 9, 23, 59)),
      measurement('start', localISO(2026, 7, 10, 0, 0)),
      measurement('middle', localISO(2026, 7, 12, 12, 0)),
      measurement('end', localISO(2026, 7, 15, 23, 59)),
      measurement('after', localISO(2026, 7, 16, 0, 0)),
    ];

    const result = filterMeasurementsByDateRange(list, '2026-07-10', '2026-07-15');

    expect(result.map((item) => item.id)).toEqual(['start', 'middle', 'end']);
  });

  it('rejects ranges outside limits and from dates after to dates', () => {
    const limits = { min: '2026-01-03', max: '2026-07-21' };

    expect(validateMeasurementDateRange('2026-07-15', '2026-07-10', limits)).toEqual({
      valid: false,
      error: 'La fecha inicial no puede ser posterior a la fecha final.',
    });
    expect(validateMeasurementDateRange('2026-01-02', '2026-07-10', limits).valid).toBe(false);
    expect(validateMeasurementDateRange('2026-01-03', '2026-07-21', limits).valid).toBe(true);
  });
});

describe('HistoryPanel', () => {
  it('renders only the 10 most recent measurements on entry', () => {
    saveMeasurements(Array.from({ length: 12 }, (_, index) =>
      measurement(`m${index + 1}`, localISO(2026, 7, index + 1, 9))));

    new HistoryPanel().render();

    expect(document.querySelector('#history-results-heading')?.textContent).toBe('Últimas mediciones');
    expect(document.body.textContent).toContain('Mostrando las 10 mediciones más recientes.');
    expect(document.querySelectorAll('.history-item')).toHaveLength(10);
    expect(document.querySelector('.history-item')?.getAttribute('data-id')).toBe('m12');
    expect(Array.from(document.querySelectorAll('.history-item')).map((item) => item.getAttribute('data-id'))).not.toContain('m1');
  });

  it('keeps search disabled until both dates are valid within the measured bounds', () => {
    saveMeasurements([
      measurement('first', localISO(2026, 1, 3, 12)),
      measurement('last', localISO(2026, 7, 21, 12)),
    ]);

    new HistoryPanel().render();

    const from = document.getElementById('historyDateFrom') as HTMLInputElement;
    const to = document.getElementById('historyDateTo') as HTMLInputElement;
    const submit = document.querySelector<HTMLButtonElement>('#historyDateSearchForm button[type="submit"]')!;

    expect(from.min).toBe('2026-01-03');
    expect(from.max).toBe('2026-07-21');
    expect(to.min).toBe('2026-01-03');
    expect(to.max).toBe('2026-07-21');
    expect(submit.disabled).toBe(true);

    from.value = '2026-07-21';
    from.dispatchEvent(new Event('input', { bubbles: true }));
    to.value = '2026-01-03';
    to.dispatchEvent(new Event('input', { bubbles: true }));

    expect(submit.disabled).toBe(true);
    expect(document.body.textContent).toContain('La fecha inicial no puede ser posterior a la fecha final.');
  });

  it('applies a range search and can clear back to latest measurements', () => {
    saveMeasurements([
      measurement('old', localISO(2026, 7, 9, 9)),
      measurement('inside-a', localISO(2026, 7, 10, 9)),
      measurement('inside-b', localISO(2026, 7, 15, 20)),
      measurement('new', localISO(2026, 7, 16, 9)),
    ]);
    new HistoryPanel().render();

    const from = document.getElementById('historyDateFrom') as HTMLInputElement;
    const to = document.getElementById('historyDateTo') as HTMLInputElement;
    from.value = '2026-07-10';
    from.dispatchEvent(new Event('input', { bubbles: true }));
    to.value = '2026-07-15';
    to.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('historyDateSearchForm')!.dispatchEvent(new Event('submit', { bubbles: true }));

    expect(document.querySelector('#history-results-heading')?.textContent).toContain('Mediciones del');
    expect(document.body.textContent).toContain('2 mediciones encontradas');
    expect(Array.from(document.querySelectorAll('.history-item')).map((item) => item.getAttribute('data-id'))).toEqual(['inside-b', 'inside-a']);

    document.querySelector<HTMLButtonElement>('[data-history-action="clear-filter"]')!.click();

    expect(document.querySelector('#history-results-heading')?.textContent).toBe('Últimas mediciones');
    expect((document.getElementById('historyDateFrom') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('historyDateTo') as HTMLInputElement).value).toBe('');
  });
});

function measurement(id: string, measuredAt: string): Measurement {
  return {
    id,
    measuredAt,
    ph: 7.4,
    ec: 6640,
    tds: 3230,
    salt: 3380,
    orp: 672,
    fac: 0.8,
    temperature: 28,
  };
}

function localISO(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}
