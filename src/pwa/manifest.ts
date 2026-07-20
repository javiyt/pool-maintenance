import { normalizeApplicationBasePath, publicAssetUrlFromBaseUrl } from '../applicationBasePath';

interface WebAppManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable';
}

interface WebAppManifestShortcut {
  name: string;
  short_name: string;
  description: string;
  url: string;
  icons: WebAppManifestIcon[];
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  background_color: string;
  theme_color: string;
  categories: string[];
  icons: WebAppManifestIcon[];
  shortcuts: WebAppManifestShortcut[];
}

export function createWebAppManifest(configuredBasePath: string | undefined): WebAppManifest {
  const { baseUrl } = normalizeApplicationBasePath(configuredBasePath);
  const icon = (fileName: string, sizes: string, purpose: 'any' | 'maskable' = 'any'): WebAppManifestIcon => ({
    src: publicAssetUrlFromBaseUrl(`icons/${fileName}`, baseUrl),
    sizes,
    type: 'image/png',
    purpose,
  });

  return {
    id: baseUrl,
    name: 'Pool Maintenance Assistant',
    short_name: 'Pool Assistant',
    description: 'Control y mantenimiento guiado de tu piscina',
    lang: 'es',
    dir: 'ltr',
    start_url: `${baseUrl}?source=pwa`,
    scope: baseUrl,
    display: 'standalone',
    display_override: [
      'standalone',
      'browser',
    ],
    orientation: 'any',
    background_color: '#f5fbfc',
    theme_color: '#087f8c',
    categories: [
      'utilities',
      'lifestyle',
    ],
    icons: [
      icon('icon-32.png', '32x32'),
      icon('icon-48.png', '48x48'),
      icon('icon-96.png', '96x96'),
      icon('icon-144.png', '144x144'),
      icon('icon-180.png', '180x180'),
      icon('icon-192.png', '192x192'),
      icon('icon-256.png', '256x256'),
      icon('icon-384.png', '384x384'),
      icon('icon-512.png', '512x512'),
      icon('icon-maskable-192.png', '192x192', 'maskable'),
      icon('icon-maskable-512.png', '512x512', 'maskable'),
    ],
    shortcuts: [
      {
        name: 'Registrar medicion',
        short_name: 'Medir',
        description: 'Anadir una nueva medicion de la piscina',
        url: `${baseUrl}measurements/new`,
        icons: [icon('icon-192.png', '192x192')],
      },
      {
        name: 'Ver historial',
        short_name: 'Historial',
        description: 'Consultar mediciones y acciones anteriores',
        url: `${baseUrl}history`,
        icons: [icon('icon-192.png', '192x192')],
      },
    ],
  };
}
