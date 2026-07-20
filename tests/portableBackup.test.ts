import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Measurement } from '../src/domain/measurement';
import type { PoolSettings } from '../src/domain/settings';
import {
  exportPortableBackup,
  exportPortableBackupJson,
  parseImportData,
  saveActions,
  saveMeasurements,
  saveSettings,
  saveUserChemicalProducts,
} from '../src/domain/storage';
import { PERSISTENCE_INVENTORY, PERSISTENT_LOCAL_STORAGE_KEYS } from '../src/domain/persistenceInventory';

const store = new Map<string, string>();
const FIXED_NOW = new Date('2026-07-09T10:35:00.000Z');

const SAMPLE_POOL_CONFIG: PoolSettings = {
  volume: 50000,
  volumeUnit: 'liters',
  poolType: 'saltwater',
  unitSystem: 'metric',
  language: 'es',
  saltChlorinator: {
    enabled: true,
    productionGramsPerHour: 20,
    currentOutputPercent: 60,
    filtrationHoursPerDay: 6,
    maxRecommendedOutputPercent: 100,
    maxRecommendedHoursPerDay: 12,
  },
};

const SAMPLE_MEASUREMENT: Measurement = {
  id: 'm1',
  measuredAt: '2026-07-09T10:35:00.000Z',
  ph: 7.4,
  ec: 6640,
  tds: 3230,
  salt: 3380,
  orp: 672,
  fac: 0.8,
  temperature: 31.0,
};

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
});

describe('portable complete backup', () => {
  it('exports a manifest, inventory-backed dataset, checksums, and portable sections', async () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    saveActions([{
      id: 'act-1',
      performedAt: '2026-07-09T11:00:00.000Z',
      kind: 'chemical',
      description: 'Added chlorine',
      chemical: {
        amount: 250,
        unit: 'g',
        product: {
          source: 'user-catalog',
          productId: 'usr-prod-1',
          snapshot: {
            productId: 'usr-prod-1',
            name: 'Custom chlorine',
            category: 'fast-chlorine',
          },
        },
      },
    }]);
    saveUserChemicalProducts([{
      id: 'usr-prod-1',
      createdAt: '2026-07-09T09:00:00.000Z',
      updatedAt: '2026-07-09T09:00:00.000Z',
      snapshot: {
        productId: 'usr-prod-1',
        name: 'Custom chlorine',
        category: 'fast-chlorine',
      },
    }]);

    const backup = await exportPortableBackup({
      now: FIXED_NOW,
      sourceInstallationId: 'install-1',
      timezone: 'Europe/Madrid',
    });

    expect(backup.manifest.backupFormat).toBe('pool-maintenance-portable-backup');
    expect(backup.manifest.integrity.algorithm).toBe('sha-256');
    expect(backup.manifest.counts.maintenanceActions).toBe(1);
    expect(backup.manifest.content.find((entry) => entry.path === 'data/measurements.json')?.recordCount).toBe(1);
    expect(backup.manifest.content.find((entry) => entry.path === 'data/maintenance-actions.json')?.recordCount).toBe(1);
    expect(backup.checksums['data/measurements.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.checksums['data/maintenance-actions.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.dataset.metadata.sourceInstallationId).toBe('install-1');
    expect(backup.dataset.pools[0].data.volume).toBe(50000);
    expect(backup.dataset.chlorinators).toHaveLength(1);
    expect(backup.dataset.measurements[0].originalEntityId).toBe('m1');
    expect(backup.dataset.maintenanceActions[0].originalEntityId).toBe('act-1');
    expect(backup.dataset.customCatalogs.userChemicalProducts[0].originalEntityId).toBe('usr-prod-1');
    expect(backup.dataset.attachments).toEqual([]);
    expect(backup.dataset.audit.persistenceInventory).toBe(PERSISTENCE_INVENTORY);
  });

  it('imports the portable JSON form through the existing import parser', async () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);

    const json = await exportPortableBackupJson({ now: FIXED_NOW });
    const result = parseImportData(json);

    expect(result.poolConfig?.poolType).toBe('saltwater');
    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].id).toBe('m1');
  });

  it('rejects portable backups whose manifest action count does not match the dataset', async () => {
    saveSettings(SAMPLE_POOL_CONFIG);
    saveMeasurements([SAMPLE_MEASUREMENT]);
    saveActions([{
      id: 'act-1',
      performedAt: '2026-07-09T11:00:00.000Z',
      kind: 'cleaning',
      description: 'Brush walls',
    }]);

    const backup = await exportPortableBackup({ now: FIXED_NOW });
    backup.dataset.maintenanceActions = [];

    expect(() => parseImportData(JSON.stringify(backup))).toThrow(
      'manifest declares 1 maintenanceActions records but dataset contains 0',
    );
  });
});

describe('persistence inventory contract', () => {
  it('declares every localStorage-backed persistence key used by storage.ts', () => {
    const source = readFileSync(join(process.cwd(), 'src/domain/storage.ts'), 'utf8');
    const usedKeys = [...new Set([...source.matchAll(/\bkey\('([^']+)'\)/g)].map((match) => match[1]))].sort();
    const declaredKeys = [...PERSISTENT_LOCAL_STORAGE_KEYS].sort();

    expect(usedKeys).toEqual(declaredKeys);
  });

  it('classifies every persistent entity into an explicit backup policy category', () => {
    expect(PERSISTENCE_INVENTORY.every((entry) => entry.category)).toBe(true);
    expect(PERSISTENCE_INVENTORY.filter((entry) => entry.storage === 'localStorage').every((entry) => entry.exported && entry.imported)).toBe(true);
    expect(PERSISTENCE_INVENTORY.filter((entry) => !entry.exported).every((entry) => entry.exclusionReason)).toBe(true);
  });
});
