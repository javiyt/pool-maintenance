import { t } from '../i18n/index';
import {
  INSTALL_DISMISSED_KEY,
  type BeforeInstallPromptEvent,
  detectInstallPlatform,
  isStandalone,
  readInstallDismissedAt,
  resolveInstallStatus,
  shouldShowInstallPrompt,
  type InstallStatus,
} from '../pwa/install';
import { getConnectionStatus } from '../pwa/offline';
import { canApplyUpdate, isServiceWorkerSupported, type UpdateState } from '../pwa/update';

export class PwaController {
  private installEvent: BeforeInstallPromptEvent | null = null;
  private hasMeaningfulAction = false;
  private updateRegistration: ServiceWorkerRegistration | null = null;
  private updateState: UpdateState = 'idle';
  private readonly installCard: HTMLElement;
  private readonly installStatus: HTMLElement;
  private readonly installAction: HTMLButtonElement;
  private readonly installDismiss: HTMLButtonElement;
  private readonly installInstructions: HTMLElement;
  private readonly offlineIndicator: HTMLElement;
  private readonly updateBanner: HTMLElement;
  private readonly updateAction: HTMLButtonElement;
  private readonly updateDismiss: HTMLButtonElement;
  private readonly unsavedChanges: () => boolean;

  constructor(options: { unsavedChanges: () => boolean }) {
    this.unsavedChanges = options.unsavedChanges;
    this.installCard = requiredElement('installAppCard');
    this.installStatus = requiredElement('installStatusText');
    this.installAction = requiredElement<HTMLButtonElement>('installActionBtn');
    this.installDismiss = requiredElement<HTMLButtonElement>('installDismissBtn');
    this.installInstructions = requiredElement('installInstructions');
    this.offlineIndicator = requiredElement('offlineIndicator');
    this.updateBanner = requiredElement('updateBanner');
    this.updateAction = requiredElement<HTMLButtonElement>('updateNowBtn');
    this.updateDismiss = requiredElement<HTMLButtonElement>('updateLaterBtn');

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as BeforeInstallPromptEvent;
      this.renderInstall();
    });
    window.addEventListener('appinstalled', () => {
      this.installEvent = null;
      window.localStorage.removeItem(INSTALL_DISMISSED_KEY);
      this.renderInstall();
    });
    window.addEventListener('online', () => this.renderConnection());
    window.addEventListener('offline', () => this.renderConnection());

    this.installAction.addEventListener('click', () => void this.promptInstall());
    this.installDismiss.addEventListener('click', () => this.dismissInstall());
    this.updateAction.addEventListener('click', () => this.activateUpdate());
    this.updateDismiss.addEventListener('click', () => this.hideUpdateBanner());
  }

  start(): void {
    this.renderConnection();
    this.renderInstall();
    this.registerServiceWorker();
  }

  noteMeaningfulAction(): void {
    this.hasMeaningfulAction = true;
    this.renderInstall();
  }

  renderInstall(): void {
    const status = this.currentInstallStatus();
    const shouldShow = shouldShowInstallPrompt({
      status,
      hasMeaningfulAction: this.hasMeaningfulAction,
      dismissedAt: readInstallDismissedAt(window.localStorage),
      now: Date.now(),
    });

    this.installCard.hidden = !shouldShow && status !== 'installed';
    this.installStatus.textContent = installStatusText(status);
    this.installAction.hidden = status !== 'available';
    this.installDismiss.hidden = status === 'installed';
    this.installInstructions.hidden = status !== 'manual-ios';
  }

  currentInstallStatus(): InstallStatus {
    return resolveInstallStatus({
      standalone: isStandalone(
        window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        (window.navigator as Navigator & { standalone?: boolean }).standalone,
      ),
      platform: detectInstallPlatform(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0),
      promptAvailable: this.installEvent !== null,
      dismissed: readInstallDismissedAt(window.localStorage) !== null,
    });
  }

  private async promptInstall(): Promise<void> {
    if (!this.installEvent) return;
    const event = this.installEvent;
    await event.prompt();
    const choice = await event.userChoice;
    this.installEvent = null;
    if (choice.outcome === 'dismissed') {
      this.dismissInstall();
    } else {
      this.renderInstall();
    }
  }

  private dismissInstall(): void {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    this.renderInstall();
  }

  private renderConnection(): void {
    const status = getConnectionStatus(window.navigator.onLine);
    this.offlineIndicator.hidden = status !== 'offline';
    this.offlineIndicator.textContent = t('pwa.offline');
  }

  private registerServiceWorker(): void {
    if (!isServiceWorkerSupported(window.navigator.serviceWorker)) {
      this.updateState = 'unsupported';
      return;
    }
    if (!import.meta.env.PROD) return;

    const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
    void window.navigator.serviceWorker.register(swUrl).then((registration) => {
      this.updateRegistration = registration;
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        this.updateState = 'checking';
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && window.navigator.serviceWorker.controller) {
            this.updateState = 'available';
            this.showUpdateBanner();
          }
        });
      });
    });

    window.navigator.serviceWorker.addEventListener('controllerchange', () => {
      this.updateState = 'activated';
      window.location.reload();
    });
  }

  private showUpdateBanner(): void {
    this.updateBanner.hidden = this.updateState !== 'available';
  }

  private hideUpdateBanner(): void {
    this.updateBanner.hidden = true;
  }

  private activateUpdate(): void {
    if (!canApplyUpdate(this.unsavedChanges())) {
      this.updateBanner.querySelector<HTMLElement>('[data-update-detail]')!.textContent = t('pwa.update.unsaved');
      return;
    }

    const waiting = this.updateRegistration?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

function installStatusText(status: InstallStatus): string {
  const key: Record<InstallStatus, Parameters<typeof t>[0]> = {
    installed: 'pwa.install.status.installed',
    available: 'pwa.install.status.available',
    'manual-ios': 'pwa.install.status.manualIos',
    unsupported: 'pwa.install.status.unsupported',
    dismissed: 'pwa.install.status.dismissed',
    unknown: 'pwa.install.status.unknown',
  };
  return t(key[status]);
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}
