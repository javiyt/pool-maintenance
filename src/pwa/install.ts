export type InstallPlatform = 'android' | 'ios' | 'desktop' | 'unknown';
export type InstallStatus =
  | 'installed'
  | 'available'
  | 'manual-ios'
  | 'unsupported'
  | 'dismissed'
  | 'unknown';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const INSTALL_DISMISSED_KEY = 'poolMaintenance:pwaInstallDismissedAt';
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function isStandalone(
  matchDisplayMode: boolean,
  navigatorStandalone: unknown,
): boolean {
  return matchDisplayMode || navigatorStandalone === true;
}

export function detectInstallPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipod/.test(ua)) return 'ios';
  if (/ipad/.test(ua) || (ua.includes('macintosh') && maxTouchPoints > 1)) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) return 'desktop';
  return 'unknown';
}

export function shouldShowInstallPrompt(input: {
  status: InstallStatus;
  hasMeaningfulAction: boolean;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (input.status === 'installed' || input.status === 'unsupported') return false;
  if (!input.hasMeaningfulAction && input.status !== 'manual-ios') return false;
  if (!input.dismissedAt) return true;
  return input.now - input.dismissedAt > INSTALL_DISMISS_MS;
}

export function resolveInstallStatus(input: {
  standalone: boolean;
  platform: InstallPlatform;
  promptAvailable: boolean;
  dismissed: boolean;
}): InstallStatus {
  if (input.standalone) return 'installed';
  if (input.dismissed) return 'dismissed';
  if (input.promptAvailable) return 'available';
  if (input.platform === 'ios') return 'manual-ios';
  if (input.platform === 'desktop') return 'unknown';
  return 'unsupported';
}

export function readInstallDismissedAt(storage: Pick<Storage, 'getItem'>): number | null {
  const raw = storage.getItem(INSTALL_DISMISSED_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
