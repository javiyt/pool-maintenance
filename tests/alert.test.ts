// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderAlert, type AlertSeverity } from '../src/ui/alert';

const severities: AlertSeverity[] = ['info', 'success', 'warning', 'danger', 'neutral'];

describe('Alert component', () => {
  it.each(severities)('renders the %s variant with semantic structure', (severity) => {
    document.body.innerHTML = renderAlert({
      severity,
      title: `${severity} title`,
      description: `${severity} body`,
      bodyHtml: '<a href="/details">Details</a>',
      interactive: true,
    });

    const alert = document.querySelector<HTMLElement>('.alert');
    expect(alert).not.toBeNull();
    expect(alert?.dataset.severity).toBe(severity);
    expect(alert?.classList.contains(`alert-${severity}`)).toBe(true);
    expect(alert?.querySelector('.alert-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(alert?.querySelector('.alert-title')?.textContent).toBe(`${severity} title`);
    expect(alert?.querySelector('.alert-description')?.textContent).toBe(`${severity} body`);
    expect(alert?.querySelector('a')?.textContent).toBe('Details');
    expect(alert?.getAttribute('tabindex')).toBe('0');
  });

  it('uses alert role for danger and status role for non-danger messages by default', () => {
    document.body.innerHTML = [
      renderAlert({ severity: 'danger', description: 'Error' }),
      renderAlert({ severity: 'warning', description: 'Warning' }),
    ].join('');

    const alerts = document.querySelectorAll<HTMLElement>('.alert');
    expect(alerts[0]?.getAttribute('role')).toBe('alert');
    expect(alerts[1]?.getAttribute('role')).toBe('status');
  });

  it('renders the estimated-parameters warning as a readable dark-mode fixture', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.innerHTML = renderAlert({
      severity: 'warning',
      title: 'Parámetros no medidos estimados',
      description: 'Estas son estimaciones cualitativas basadas en el comportamiento observado, no mediciones directas. No las uses para dosificación química precisa.',
      className: 'estimate-disclaimer',
    });

    const warning = document.querySelector<HTMLElement>('.alert-warning.estimate-disclaimer');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('Parámetros no medidos estimados');
    expect(warning?.textContent).toContain('No las uses para dosificación química precisa.');
    expect(warning?.querySelector('.alert-title')?.textContent).toBe('Parámetros no medidos estimados');
  });

  it('escapes title and description text', () => {
    document.body.innerHTML = renderAlert({
      severity: 'info',
      title: '<script>alert(1)</script>',
      description: '<img src=x onerror=alert(1)>',
    });

    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.alert-title')?.textContent).toBe('<script>alert(1)</script>');
    expect(document.querySelector('.alert-description')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
