import {
  applicationPathForRoute,
  normalizeApplicationBasePath,
  publicAssetUrlFromBaseUrl,
  stripRouterBasename,
} from './applicationBasePath';

export const applicationBasePaths = normalizeApplicationBasePath(import.meta.env.BASE_URL);

export const appBaseUrl = applicationBasePaths.baseUrl;

export const routerBasename = applicationBasePaths.routerBasename;

export function publicAssetUrl(path: string): string {
  return publicAssetUrlFromBaseUrl(path, appBaseUrl);
}

export function appRouteUrl(route: string): string {
  return applicationPathForRoute(route, appBaseUrl);
}

export function currentApplicationPathname(): string {
  return stripRouterBasename(window.location.pathname, routerBasename);
}
