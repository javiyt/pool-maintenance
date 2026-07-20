export type AlertSeverity = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface AlertOptions {
  severity: AlertSeverity;
  title?: string;
  description?: string;
  bodyHtml?: string;
  actionHtml?: string;
  className?: string;
  id?: string;
  interactive?: boolean;
  role?: 'alert' | 'status' | 'note';
}

const severityIcon: Record<AlertSeverity, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '!',
  neutral: '•',
};

export function renderAlert(options: AlertOptions): string {
  const role = options.role ?? (options.severity === 'danger' ? 'alert' : 'status');
  const className = ['alert', `alert-${options.severity}`, options.className].filter(Boolean).join(' ');
  const id = options.id ? ` id="${escapeHtmlAttr(options.id)}"` : '';
  const tabIndex = options.interactive ? ' tabindex="0"' : '';
  const titleHtml = options.title
    ? `<div class="alert-title">${escapeHtml(options.title)}</div>`
    : '';
  const descriptionHtml = options.description
    ? `<div class="alert-description">${escapeHtml(options.description)}</div>`
    : '';
  const bodyHtml = options.bodyHtml ? `<div class="alert-body">${options.bodyHtml}</div>` : '';
  const actionHtml = options.actionHtml ? `<div class="alert-actions">${options.actionHtml}</div>` : '';

  return `
    <div${id} class="${className}" data-severity="${options.severity}" role="${role}"${tabIndex}>
      <span class="alert-icon" aria-hidden="true">${severityIcon[options.severity]}</span>
      <div class="alert-content">
        ${titleHtml}
        ${descriptionHtml}
        ${bodyHtml}
        ${actionHtml}
      </div>
    </div>
  `;
}

export function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
