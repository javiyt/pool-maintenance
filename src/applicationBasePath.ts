export interface ApplicationBasePaths {
  baseUrl: string;
  routerBasename: string;
}

const ROOT_BASE_PATHS: ApplicationBasePaths = {
  baseUrl: '/',
  routerBasename: '/',
};

export function normalizeApplicationBasePath(
  configuredValue: string | undefined,
): ApplicationBasePaths {
  const value = configuredValue?.trim() ?? '';

  if (!value || value === '/') {
    return ROOT_BASE_PATHS;
  }

  if (/[?#]/.test(value) || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    return ROOT_BASE_PATHS;
  }

  const segments = value.split('/').filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    return ROOT_BASE_PATHS;
  }

  const normalizedPath = `/${segments.join('/')}`;

  return {
    baseUrl: `${normalizedPath}/`,
    routerBasename: normalizedPath,
  };
}

export function routerBasenameFromBaseUrl(baseUrl: string): string {
  return normalizeApplicationBasePath(baseUrl).routerBasename;
}

export function stripRouterBasename(pathname: string, routerBasename: string): string {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const normalizedBasename = normalizeApplicationBasePath(routerBasename).routerBasename;

  if (normalizedBasename === '/') {
    return normalizedPathname;
  }

  if (normalizedPathname === normalizedBasename) {
    return '/';
  }

  if (normalizedPathname.startsWith(`${normalizedBasename}/`)) {
    return normalizedPathname.slice(normalizedBasename.length) || '/';
  }

  return normalizedPathname;
}

export function applicationPathForRoute(route: string, baseUrl: string): string {
  const normalizedBaseUrl = normalizeApplicationBasePath(baseUrl).baseUrl;
  const internalRoute = route.startsWith('/') ? route : `/${route}`;

  if (normalizedBaseUrl === '/') {
    return internalRoute;
  }

  if (internalRoute === '/') {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl.replace(/\/+$/, '')}${internalRoute}`;
}

export function publicAssetUrlFromBaseUrl(path: string, baseUrl: string): string {
  const relativePath = path.replace(/^\/+/, '');
  return `${normalizeApplicationBasePath(baseUrl).baseUrl}${relativePath}`;
}
