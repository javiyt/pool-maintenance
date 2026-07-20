export type PersistenceCategory =
  | 'exportable-importable'
  | 'deterministically-regenerable'
  | 'ephemeral-excluded'
  | 'sensitive-excluded';

export type PersistenceStorage = 'localStorage' | 'derived' | 'not-yet-persisted';

export interface PersistenceInventoryEntry {
  entity: string;
  storage: PersistenceStorage;
  storageKey?: string;
  exported: boolean;
  imported: boolean;
  migrationStrategy: string;
  conflictStrategy: string;
  containsSensitiveData: boolean;
  regenerable: boolean;
  schemaVersion: string;
  category: PersistenceCategory;
  portablePath?: string;
  exclusionReason?: string;
}

const KEY_PREFIX = 'pool-maintenance:';

export const PERSISTENCE_INVENTORY = [
  {
    entity: 'pool-settings',
    storage: 'localStorage',
    storageKey: 'settings',
    exported: true,
    imported: true,
    migrationStrategy: 'Merge with DEFAULT_SETTINGS, then migrate nested salt chlorinator config.',
    conflictStrategy: 'Replace mode overwrites. Merge mode keeps current settings unless user explicitly accepts imported settings.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'data/pools.json',
  },
  {
    entity: 'measurements',
    storage: 'localStorage',
    storageKey: 'measurements',
    exported: true,
    imported: true,
    migrationStrategy: 'Migrate legacy date/freeChlorine fields into measuredAt/fac.',
    conflictStrategy: 'Deduplicate by stable measurement id. Same id with different content requires conflict review.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '3',
    category: 'exportable-importable',
    portablePath: 'data/measurements.json',
  },
  {
    entity: 'maintenance-actions',
    storage: 'localStorage',
    storageKey: 'actions',
    exported: true,
    imported: true,
    migrationStrategy: 'Migrate action category, provenance, product snapshots, and evaluation eligibility.',
    conflictStrategy: 'Deduplicate by stable action id. Do not merge by date or description.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '2',
    category: 'exportable-importable',
    portablePath: 'data/maintenance-actions.json',
  },
  {
    entity: 'user-chemical-products',
    storage: 'localStorage',
    storageKey: 'userChemicalProducts',
    exported: true,
    imported: true,
    migrationStrategy: 'Preserve user snapshots and explicit unknown fields.',
    conflictStrategy: 'Deduplicate by product id. Do not merge by product name alone.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'data/products.json',
  },
  {
    entity: 'follow-ups',
    storage: 'localStorage',
    storageKey: 'followUps',
    exported: true,
    imported: true,
    migrationStrategy: 'Preserve lifecycle state and normalize linked action exclusion flags after import.',
    conflictStrategy: 'Deduplicate by stable follow-up id. Preserve orphan warnings for missing linked actions.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'data/follow-ups.json',
  },
  {
    entity: 'diagnostic-experiments',
    storage: 'localStorage',
    storageKey: 'experiments',
    exported: true,
    imported: true,
    migrationStrategy: 'Preserve steps, status, notes, and related measurement ids.',
    conflictStrategy: 'Deduplicate by stable experiment id.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'data/application.json',
  },
  {
    entity: 'diagnoses',
    storage: 'derived',
    exported: true,
    imported: false,
    migrationStrategy: 'Regenerate from imported measurements, actions, outcomes, and settings; exported snapshots are audit evidence.',
    conflictStrategy: 'Not merged as live state. Imported snapshots remain audit-only.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '1',
    category: 'deterministically-regenerable',
    portablePath: 'data/diagnoses.json',
  },
  {
    entity: 'recommendations',
    storage: 'derived',
    exported: true,
    imported: false,
    migrationStrategy: 'Regenerate from diagnosis/recommendation engines; exported snapshots are audit evidence.',
    conflictStrategy: 'Not merged as live state. Imported snapshots remain audit-only.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '2',
    category: 'deterministically-regenerable',
    portablePath: 'data/recommendations.json',
  },
  {
    entity: 'recommendation-plans',
    storage: 'derived',
    exported: true,
    imported: false,
    migrationStrategy: 'Regenerate from structured recommendation engine; exported snapshots are audit evidence.',
    conflictStrategy: 'Not merged as live state. Imported snapshots remain audit-only.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '1',
    category: 'deterministically-regenerable',
    portablePath: 'data/recommendation-plans.json',
  },
  {
    entity: 'action-outcomes',
    storage: 'derived',
    exported: true,
    imported: false,
    migrationStrategy: 'Regenerate from measurement/action history; exported snapshots are audit evidence.',
    conflictStrategy: 'Not merged as live state. Imported snapshots remain audit-only.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '1',
    category: 'deterministically-regenerable',
    portablePath: 'data/outcomes.json',
  },
  {
    entity: 'historical-learning-state',
    storage: 'derived',
    exported: true,
    imported: false,
    migrationStrategy: 'Regenerate from measurements, actions, and historical learning settings; exported evidence records inputs.',
    conflictStrategy: 'Not merged as live state. Imported snapshots remain audit-only.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '1',
    category: 'deterministically-regenerable',
    portablePath: 'data/learning-state.json',
  },
  {
    entity: 'unusual-events',
    storage: 'derived',
    exported: true,
    imported: true,
    migrationStrategy: 'Persisted through maintenance action and follow-up notes; portable export also flattens audit snapshots.',
    conflictStrategy: 'Conflict policy follows the owning action or follow-up.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'data/unusual-events.json',
  },
  {
    entity: 'attachments',
    storage: 'not-yet-persisted',
    exported: true,
    imported: true,
    migrationStrategy: 'No current attachment store. Portable manifest keeps an empty attachment list for forward compatibility.',
    conflictStrategy: 'Future imports must match by attachment id and checksum, never filename alone.',
    containsSensitiveData: false,
    regenerable: false,
    schemaVersion: '1',
    category: 'exportable-importable',
    portablePath: 'attachments/',
  },
  {
    entity: 'runtime-ui-state',
    storage: 'not-yet-persisted',
    exported: false,
    imported: false,
    migrationStrategy: 'No migration. Drawer, focus, hover, scroll, and animation state are deliberately runtime-only.',
    conflictStrategy: 'Excluded.',
    containsSensitiveData: false,
    regenerable: true,
    schemaVersion: '1',
    category: 'ephemeral-excluded',
    exclusionReason: 'Ephemeral UI state has no functional backup value.',
  },
  {
    entity: 'technical-secrets',
    storage: 'not-yet-persisted',
    exported: false,
    imported: false,
    migrationStrategy: 'No migration. Future integrations must reconnect instead of restoring credentials.',
    conflictStrategy: 'Excluded.',
    containsSensitiveData: true,
    regenerable: false,
    schemaVersion: '1',
    category: 'sensitive-excluded',
    exclusionReason: 'Tokens, credentials, cookies, sessions, and API secrets must not be exported by default.',
  },
] as const satisfies readonly PersistenceInventoryEntry[];

export const PERSISTENT_LOCAL_STORAGE_KEYS = PERSISTENCE_INVENTORY
  .filter((entry) => entry.storage === 'localStorage')
  .map((entry) => entry.storageKey);

export function storageKey(name: string): string {
  const declared = PERSISTENCE_INVENTORY.some((entry) => entry.storage === 'localStorage' && entry.storageKey === name);
  if (!declared) {
    throw new Error(`Undeclared persistent storage key: ${name}`);
  }
  return `${KEY_PREFIX}${name}`;
}
