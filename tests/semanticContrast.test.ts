import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ThemeName = 'light' | 'dark';
type Severity = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const severities: Severity[] = ['info', 'success', 'warning', 'danger', 'neutral'];
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

describe('semantic alert color tokens', () => {
  it.each(['light', 'dark'] as ThemeName[])('meets WCAG AA contrast in %s theme', (theme) => {
    const tokens = themeTokens(theme);

    for (const severity of severities) {
      const surface = token(tokens, `--color-${severity}-surface`);
      const border = token(tokens, `--color-${severity}-border`);

      expectRatio(theme, severity, `--color-${severity}-text`, surface, 4.5, tokens);
      expectRatio(theme, severity, `--alert-${severity}-title`, surface, 4.5, tokens);
      expectRatio(theme, severity, `--alert-${severity}-body`, surface, 4.5, tokens);
      expectRatio(theme, severity, `--alert-${severity}-link`, surface, 4.5, tokens);
      expectRatio(theme, severity, `--color-${severity}-icon`, surface, 3, tokens);
      expect(contrastRatio(border, surface), `${theme} ${severity} border/surface`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the dark warning estimate text highly legible', () => {
    const tokens = themeTokens('dark');
    const ratio = contrastRatio(token(tokens, '--alert-warning-body'), token(tokens, '--color-warning-surface'));
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it.each(['light', 'dark'] as ThemeName[])('has a visible focus ring in %s theme', (theme) => {
    const tokens = themeTokens(theme);
    expect(contrastRatio(token(tokens, '--color-focus'), token(tokens, '--color-background'))).toBeGreaterThanOrEqual(3);
  });
});

function expectRatio(
  theme: ThemeName,
  severity: Severity,
  foregroundToken: string,
  surface: string,
  minimum: number,
  tokens: Record<string, string>,
): void {
  const foreground = token(tokens, foregroundToken);
  expect(contrastRatio(foreground, surface), `${theme} ${severity} ${foregroundToken}/surface`).toBeGreaterThanOrEqual(minimum);
}

function themeTokens(theme: ThemeName): Record<string, string> {
  const base = collectDeclarations(':root');
  if (theme === 'light') return base;
  return { ...base, ...collectDeclarations(':root\\[data-theme="dark"\\]') };
}

function collectDeclarations(selectorPattern: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  const blockPattern = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 'g');
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(css)) !== null) {
    const body = match[1] ?? '';
    for (const declaration of body.split(';')) {
      const [name, value] = declaration.split(':').map((part) => part.trim());
      if (name?.startsWith('--') && value) declarations[name] = value;
    }
  }
  return declarations;
}

function token(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`Missing token ${name}`);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Token ${name} must be a hex color, got ${value}`);
  return value;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((component) => {
    const channel = component / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}
