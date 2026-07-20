import { t } from '../i18n/index';

export type AppRoute =
  | '/'
  | '/measurements/new'
  | '/actions'
  | '/history'
  | '/products'
  | '/equipment'
  | '/settings'
  | '/settings/install'
  | '/settings/backup';

const ROUTE_FALLBACK: AppRoute = '/';

const routeAliases: Record<string, AppRoute> = {
  '/measure': '/measurements/new',
  '/more': '/settings',
};

export function normalizeRoute(pathname: string): AppRoute {
  const clean = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`;
  const aliased = routeAliases[withLeadingSlash] ?? withLeadingSlash;
  const routes: AppRoute[] = [
    '/',
    '/measurements/new',
    '/actions',
    '/history',
    '/products',
    '/equipment',
    '/settings',
    '/settings/install',
    '/settings/backup',
  ];
  return routes.includes(aliased as AppRoute) ? aliased as AppRoute : ROUTE_FALLBACK;
}

export class AppShell {
  private readonly sections: HTMLElement[];
  private readonly routeButtons: HTMLAnchorElement[];
  private readonly onSettingsRoute: (route: AppRoute) => void;

  constructor(onSettingsRoute: (route: AppRoute) => void) {
    this.sections = Array.from(document.querySelectorAll<HTMLElement>('[data-route-section]'));
    this.routeButtons = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-route-link]'));
    this.onSettingsRoute = onSettingsRoute;

    window.addEventListener('popstate', () => this.syncFromLocation());
    this.routeButtons.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        this.navigate(normalizeRoute(link.getAttribute('href') ?? '/'));
      });
    });
  }

  start(): void {
    this.syncFromLocation();
  }

  navigate(route: AppRoute): void {
    if (window.location.pathname !== route) {
      window.history.pushState({}, '', route);
    }
    this.render(route);
  }

  currentRoute(): AppRoute {
    return normalizeRoute(window.location.pathname);
  }

  private syncFromLocation(): void {
    this.render(this.currentRoute());
  }

  private render(route: AppRoute): void {
    const primaryRoute = primarySectionRoute(route);
    this.sections.forEach((section) => {
      section.dataset.routeHidden = section.dataset.routeSection === primaryRoute ? 'false' : 'true';
    });

    this.routeButtons.forEach((link) => {
      const linkRoute = normalizeRoute(link.getAttribute('href') ?? '/');
      const active = primarySectionRoute(linkRoute) === primaryRoute;
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });

    document.title = routeTitle(route);

    if (route.startsWith('/settings')) {
      this.onSettingsRoute(route);
    }
  }
}

function primarySectionRoute(route: AppRoute): AppRoute {
  if (route === '/settings/install' || route === '/settings/backup') return '/settings';
  if (route === '/equipment') return '/products';
  return route;
}

function routeTitle(route: AppRoute): string {
  const titles: Record<AppRoute, string> = {
    '/': t('nav.home'),
    '/measurements/new': t('nav.measure'),
    '/actions': t('nav.actions'),
    '/history': t('nav.history'),
    '/products': t('nav.productsEquipment'),
    '/equipment': t('nav.productsEquipment'),
    '/settings': t('settings.title'),
    '/settings/install': t('pwa.install.title'),
    '/settings/backup': t('history.export'),
  };
  return `${titles[route]} - ${t('app.title')}`;
}
