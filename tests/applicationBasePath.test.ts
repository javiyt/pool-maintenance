import { describe, expect, it } from 'vitest';
import {
  applicationPathForRoute,
  normalizeApplicationBasePath,
  publicAssetUrlFromBaseUrl,
  stripRouterBasename,
} from '../src/applicationBasePath';

describe('application base path normalization', () => {
  it.each([
    [undefined, '/', '/'],
    ['', '/', '/'],
    ['/', '/', '/'],
    ['pool-maintenance', '/pool-maintenance/', '/pool-maintenance'],
    ['/pool-maintenance', '/pool-maintenance/', '/pool-maintenance'],
    ['/pool-maintenance/', '/pool-maintenance/', '/pool-maintenance'],
    ['apps/pool/', '/apps/pool/', '/apps/pool'],
  ])('normalizes %s', (configuredValue, baseUrl, routerBasename) => {
    expect(normalizeApplicationBasePath(configuredValue)).toEqual({ baseUrl, routerBasename });
  });

  it('deduplicates slashes and rejects unsafe values to the root default', () => {
    expect(normalizeApplicationBasePath('/apps//pool///')).toEqual({
      baseUrl: '/apps/pool/',
      routerBasename: '/apps/pool',
    });
    expect(normalizeApplicationBasePath('/pool?x=1')).toEqual({ baseUrl: '/', routerBasename: '/' });
    expect(normalizeApplicationBasePath('/pool#section')).toEqual({ baseUrl: '/', routerBasename: '/' });
    expect(normalizeApplicationBasePath('https://example.com/pool')).toEqual({ baseUrl: '/', routerBasename: '/' });
    expect(normalizeApplicationBasePath('/apps/../pool')).toEqual({ baseUrl: '/', routerBasename: '/' });
    expect(normalizeApplicationBasePath('/apps/./pool')).toEqual({ baseUrl: '/', routerBasename: '/' });
  });

  it('strips and reapplies the router basename at application boundaries', () => {
    expect(stripRouterBasename('/pool-maintenance/history', '/pool-maintenance')).toBe('/history');
    expect(stripRouterBasename('/pool-maintenance', '/pool-maintenance')).toBe('/');
    expect(applicationPathForRoute('/history', '/pool-maintenance/')).toBe('/pool-maintenance/history');
    expect(applicationPathForRoute('/', '/pool-maintenance/')).toBe('/pool-maintenance/');
    expect(publicAssetUrlFromBaseUrl('icons/icon-192.png', '/pool-maintenance/')).toBe('/pool-maintenance/icons/icon-192.png');
  });
});
