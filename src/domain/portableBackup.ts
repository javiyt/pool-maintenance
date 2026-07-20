import type { MaintenanceAction, UserChemicalProduct } from './actions';
import type { ActionOutcomeSnapshot, ExportSnapshots, LearningStateSnapshot, ProductSnapshot, UnusualEventSnapshot } from './exportSnapshots';
import type { DiagnosticExperiment } from './latentStateEstimator';
import type { Measurement } from './measurement';
import type { PoolSettings } from './settings';
import { PERSISTENCE_INVENTORY } from './persistenceInventory';

export const PORTABLE_BACKUP_FORMAT = 'pool-maintenance-portable-backup';
export const PORTABLE_BACKUP_FORMAT_VERSION = '1.0.0';

interface ExportLike extends ExportSnapshots {
  schemaVersion: number;
  applicationVersion: string;
  chlorinatorSchemaVersion: string;
  exportedAt: string;
  poolConfig: PoolSettings;
  measurements: Measurement[];
  actions: MaintenanceAction[];
  followUps: unknown[];
  experiments?: DiagnosticExperiment[];
  userChemicalProducts?: UserChemicalProduct[];
}

export interface BackupManifest {
  backupFormat: typeof PORTABLE_BACKUP_FORMAT;
  backupFormatVersion: string;
  backupId: string;
  exportBatchId: string;
  createdAt: string;
  createdByApplicationVersion: string;
  sourceInstallationId?: string;
  locale: string;
  timezone: string;
  schemaVersions: Record<string, string>;
  content: Array<{
    path: string;
    entityType: string;
    recordCount: number;
    checksum: string;
    required: boolean;
  }>;
  integrity: {
    algorithm: 'sha-256';
    checksumsFile: string;
  };
  exportOptions: {
    mode: 'complete' | 'selective';
    includesAttachments: boolean;
    includesAuditHistory: boolean;
    includesLearningState: boolean;
  };
}

export interface PortableDatasetMetadata {
  backupFormat: typeof PORTABLE_BACKUP_FORMAT;
  backupFormatVersion: string;
  backupId: string;
  exportBatchId: string;
  createdAt: string;
  schemaVersion: number;
  sourceInstallationId?: string;
  originalExportSchemaVersion: number;
}

export interface PortableSnapshot<T> {
  schemaVersion: number;
  capturedAt: string;
  originalEntityId?: string;
  exportBatchId: string;
  data: T;
}

export interface ApplicationSnapshot {
  schemaVersion: number;
  applicationVersion: string;
  locale: string;
  timezone: string;
  experiments: PortableSnapshot<DiagnosticExperiment>[];
  excludedData: Array<{
    entity: string;
    category: string;
    reason: string;
  }>;
}

export interface PoolSnapshot extends PortableSnapshot<PoolSettings> {
  poolId: string;
}

export interface AttachmentManifestEntry {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt?: string;
  description?: string;
  origin?: string;
}

export interface AuditSnapshot {
  schemaVersion: number;
  capturedAt: string;
  persistenceInventory: typeof PERSISTENCE_INVENTORY;
  importHistory: unknown[];
  warnings: string[];
}

export interface PortableDataset {
  metadata: PortableDatasetMetadata;
  application: ApplicationSnapshot;
  pools: PoolSnapshot[];
  equipment: Array<PortableSnapshot<unknown>>;
  chlorinators: Array<PortableSnapshot<unknown>>;
  measurements: Array<PortableSnapshot<Measurement>>;
  diagnoses: Array<PortableSnapshot<unknown>>;
  recommendations: Array<PortableSnapshot<unknown>>;
  recommendationPlans: Array<PortableSnapshot<unknown>>;
  maintenanceActions: Array<PortableSnapshot<MaintenanceAction>>;
  products: Array<PortableSnapshot<ProductSnapshot | UserChemicalProduct>>;
  followUps: Array<PortableSnapshot<unknown>>;
  outcomes: Array<PortableSnapshot<ActionOutcomeSnapshot>>;
  unusualEvents: Array<PortableSnapshot<UnusualEventSnapshot>>;
  learningState: LearningStateSnapshot;
  userPreferences: PortableSnapshot<{
    language?: string;
    unitSystem: PoolSettings['unitSystem'];
  }>;
  customCatalogs: {
    schemaVersion: number;
    capturedAt: string;
    userChemicalProducts: Array<PortableSnapshot<UserChemicalProduct>>;
  };
  attachments: AttachmentManifestEntry[];
  audit: AuditSnapshot;
}

export interface PortableBackup {
  manifest: BackupManifest;
  dataset: PortableDataset;
  checksums: Record<string, string>;
}

export interface CompleteExportOptions {
  mode?: 'complete' | 'selective';
  sourceInstallationId?: string;
  locale?: string;
  timezone?: string;
  includesAttachments?: boolean;
}

export type BackupInput = string | PortableBackup | PortableDataset;
export type ImportMode = 'replace' | 'merge' | 'new-profile';

export interface RestoreOptions {
  createRecoveryPoint: boolean;
}

export interface MergeOptions {
  conflictPolicy: 'keep-current' | 'use-imported' | 'keep-both' | 'review';
}

export interface NewProfileImportOptions {
  profileName?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportAnalysis {
  mode: ImportMode;
  valid: boolean;
  entityCounts: Record<string, number>;
  warnings: string[];
  conflicts: string[];
  migrations: string[];
}

export interface ImportReport {
  mode: ImportMode;
  created: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  duplicates: Record<string, number>;
  conflicts: string[];
  warnings: string[];
  errors: string[];
  remappedIds: Record<string, string>;
  preservedUnknownData: string[];
  deliberatelyExcludedData: string[];
}

export interface MigrationResult {
  dataset: PortableDataset;
  appliedMigrations: string[];
  warnings: string[];
}

export interface CompleteExportService {
  exportComplete(options: CompleteExportOptions): Promise<PortableBackup>;
}

export interface ImportAnalysisService {
  analyze(input: BackupInput): Promise<ImportAnalysis>;
}

export interface PortableImportService {
  restore(input: BackupInput, options: RestoreOptions): Promise<ImportReport>;
  merge(input: BackupInput, options: MergeOptions): Promise<ImportReport>;
  importAsNewProfile(input: BackupInput, options: NewProfileImportOptions): Promise<ImportReport>;
}

export interface BackupValidator {
  validateStructure(input: BackupInput): Promise<ValidationResult>;
  validateIntegrity(input: BackupInput): Promise<ValidationResult>;
  validateReferences(dataset: PortableDataset): ValidationResult;
}

export interface BackupMigrationRunner {
  migrate(dataset: unknown, fromVersion: string, toVersion: string): MigrationResult;
}

const DATA_PATHS = {
  application: 'data/application.json',
  pools: 'data/pools.json',
  equipment: 'data/equipment.json',
  chlorinators: 'data/chlorinators.json',
  measurements: 'data/measurements.json',
  diagnoses: 'data/diagnoses.json',
  recommendations: 'data/recommendations.json',
  recommendationPlans: 'data/recommendation-plans.json',
  maintenanceActions: 'data/maintenance-actions.json',
  products: 'data/products.json',
  followUps: 'data/follow-ups.json',
  outcomes: 'data/outcomes.json',
  unusualEvents: 'data/unusual-events.json',
  learningState: 'data/learning-state.json',
  userPreferences: 'data/user-preferences.json',
  customCatalogs: 'data/custom-catalogs.json',
  audit: 'data/audit-log.json',
} as const;

export function buildPortableDataset(data: ExportLike, options: CompleteExportOptions = {}): PortableDataset {
  const backupId = `backup-${data.exportedAt}`;
  const exportBatchId = `batch-${data.exportedAt}`;
  const locale = options.locale ?? data.poolConfig.language ?? 'en';
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const userProducts = data.userChemicalProducts ?? [];

  return {
    metadata: {
      backupFormat: PORTABLE_BACKUP_FORMAT,
      backupFormatVersion: PORTABLE_BACKUP_FORMAT_VERSION,
      backupId,
      exportBatchId,
      createdAt: data.exportedAt,
      schemaVersion: data.schemaVersion,
      sourceInstallationId: options.sourceInstallationId,
      originalExportSchemaVersion: data.schemaVersion,
    },
    application: {
      schemaVersion: 1,
      applicationVersion: data.applicationVersion,
      locale,
      timezone,
      experiments: wrapList(data.experiments ?? [], data.exportedAt, exportBatchId, (experiment) => experiment.id),
      excludedData: PERSISTENCE_INVENTORY
        .filter((entry) => !entry.exported)
        .map((entry) => ({
          entity: entry.entity,
          category: entry.category,
          reason: entry.exclusionReason ?? 'Deliberately excluded by persistence policy.',
        })),
    },
    pools: [{
      schemaVersion: 1,
      capturedAt: data.exportedAt,
      originalEntityId: 'default-pool',
      exportBatchId,
      poolId: 'default-pool',
      data: data.poolConfig,
    }],
    equipment: [],
    chlorinators: data.poolConfig.saltChlorinator
      ? [{
          schemaVersion: 1,
          capturedAt: data.exportedAt,
          originalEntityId: 'default-pool-salt-chlorinator',
          exportBatchId,
          data: data.poolConfig.saltChlorinator,
        }]
      : [],
    measurements: wrapList(data.measurements, data.exportedAt, exportBatchId, (measurement) => measurement.id),
    diagnoses: wrapList(data.diagnoses, data.exportedAt, exportBatchId, (diagnosis) => diagnosis.id),
    recommendations: wrapList(data.recommendations, data.exportedAt, exportBatchId, (recommendation) => recommendation.id),
    recommendationPlans: wrapList(data.recommendationPlans, data.exportedAt, exportBatchId, (plan) => plan.id),
    maintenanceActions: wrapList(data.actions, data.exportedAt, exportBatchId, (action) => action.id),
    products: [
      ...wrapList(data.productSnapshots, data.exportedAt, exportBatchId, (product) => product.productId),
      ...wrapList(userProducts, data.exportedAt, exportBatchId, (product) => product.id),
    ],
    followUps: wrapList(data.followUps, data.exportedAt, exportBatchId, (followUp) => entityId(followUp)),
    outcomes: wrapList(data.actionOutcomeSnapshots, data.exportedAt, exportBatchId, (outcome) => outcome.outcome.actionId),
    unusualEvents: wrapList(data.unusualEvents, data.exportedAt, exportBatchId, (event) => event.eventId),
    learningState: data.historicalLearningState,
    userPreferences: {
      schemaVersion: 1,
      capturedAt: data.exportedAt,
      originalEntityId: 'default-user-preferences',
      exportBatchId,
      data: {
        language: data.poolConfig.language,
        unitSystem: data.poolConfig.unitSystem,
      },
    },
    customCatalogs: {
      schemaVersion: 1,
      capturedAt: data.exportedAt,
      userChemicalProducts: wrapList(userProducts, data.exportedAt, exportBatchId, (product) => product.id),
    },
    attachments: [],
    audit: {
      schemaVersion: 1,
      capturedAt: data.exportedAt,
      persistenceInventory: PERSISTENCE_INVENTORY,
      importHistory: [],
      warnings: [],
    },
  };
}

export async function buildPortableBackup(data: ExportLike, options: CompleteExportOptions = {}): Promise<PortableBackup> {
  const dataset = buildPortableDataset(data, options);
  const sections = portableSections(dataset);
  const checksums = await buildChecksums(sections);
  const content = Object.entries(sections).map(([path, value]) => ({
    path,
    entityType: entityTypeForPath(path),
    recordCount: recordCount(value),
    checksum: checksums[path],
    required: path !== DATA_PATHS.equipment && path !== DATA_PATHS.chlorinators,
  }));

  return {
    manifest: {
      backupFormat: PORTABLE_BACKUP_FORMAT,
      backupFormatVersion: PORTABLE_BACKUP_FORMAT_VERSION,
      backupId: dataset.metadata.backupId,
      exportBatchId: dataset.metadata.exportBatchId,
      createdAt: dataset.metadata.createdAt,
      createdByApplicationVersion: data.applicationVersion,
      sourceInstallationId: options.sourceInstallationId,
      locale: dataset.application.locale,
      timezone: dataset.application.timezone,
      schemaVersions: Object.fromEntries(PERSISTENCE_INVENTORY.map((entry) => [entry.entity, entry.schemaVersion])),
      content,
      integrity: {
        algorithm: 'sha-256',
        checksumsFile: 'checksums.json',
      },
      exportOptions: {
        mode: options.mode ?? 'complete',
        includesAttachments: options.includesAttachments ?? false,
        includesAuditHistory: true,
        includesLearningState: true,
      },
    },
    dataset,
    checksums,
  };
}

export async function buildPortableBackupJson(data: ExportLike, options: CompleteExportOptions = {}): Promise<string> {
  return JSON.stringify(await buildPortableBackup(data, options), null, 2);
}

export function isPortableBackupObject(value: unknown): value is PortableBackup | PortableDataset {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (obj.metadata && typeof obj.metadata === 'object') {
    return (obj.metadata as Record<string, unknown>).backupFormat === PORTABLE_BACKUP_FORMAT;
  }
  if (obj.manifest && typeof obj.manifest === 'object') {
    return (obj.manifest as Record<string, unknown>).backupFormat === PORTABLE_BACKUP_FORMAT;
  }
  return false;
}

export function portableDatasetFromBackupObject(value: PortableBackup | PortableDataset): PortableDataset {
  if ('dataset' in value) return value.dataset;
  return value;
}

export function portableDatasetToImportObject(dataset: PortableDataset): {
  schemaVersion: number;
  exportedAt: string;
  poolConfig?: PoolSettings;
  measurements: Measurement[];
  actions: MaintenanceAction[];
  followUps: unknown[];
  experiments: DiagnosticExperiment[];
  userChemicalProducts: UserChemicalProduct[];
} {
  return {
    schemaVersion: dataset.metadata.originalExportSchemaVersion,
    exportedAt: dataset.metadata.createdAt,
    poolConfig: dataset.pools[0]?.data,
    measurements: dataset.measurements.map((snapshot) => snapshot.data),
    actions: dataset.maintenanceActions.map((snapshot) => snapshot.data),
    followUps: dataset.followUps.map((snapshot) => snapshot.data),
    experiments: dataset.application.experiments.map((snapshot) => snapshot.data),
    userChemicalProducts: dataset.customCatalogs.userChemicalProducts.map((snapshot) => snapshot.data),
  };
}

function wrapList<T>(
  items: T[],
  capturedAt: string,
  exportBatchId: string,
  getId: (item: T) => string | undefined,
): Array<PortableSnapshot<T>> {
  return items.map((item) => ({
    schemaVersion: 1,
    capturedAt,
    originalEntityId: getId(item),
    exportBatchId,
    data: item,
  }));
}

function entityId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
}

function portableSections(dataset: PortableDataset): Record<string, unknown> {
  return {
    [DATA_PATHS.application]: dataset.application,
    [DATA_PATHS.pools]: dataset.pools,
    [DATA_PATHS.equipment]: dataset.equipment,
    [DATA_PATHS.chlorinators]: dataset.chlorinators,
    [DATA_PATHS.measurements]: dataset.measurements,
    [DATA_PATHS.diagnoses]: dataset.diagnoses,
    [DATA_PATHS.recommendations]: dataset.recommendations,
    [DATA_PATHS.recommendationPlans]: dataset.recommendationPlans,
    [DATA_PATHS.maintenanceActions]: dataset.maintenanceActions,
    [DATA_PATHS.products]: dataset.products,
    [DATA_PATHS.followUps]: dataset.followUps,
    [DATA_PATHS.outcomes]: dataset.outcomes,
    [DATA_PATHS.unusualEvents]: dataset.unusualEvents,
    [DATA_PATHS.learningState]: dataset.learningState,
    [DATA_PATHS.userPreferences]: dataset.userPreferences,
    [DATA_PATHS.customCatalogs]: dataset.customCatalogs,
    [DATA_PATHS.audit]: dataset.audit,
  };
}

async function buildChecksums(sections: Record<string, unknown>): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};
  for (const [path, value] of Object.entries(sections)) {
    checksums[path] = await sha256(JSON.stringify(value));
  }
  return checksums;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto sha-256 support is required to create portable backups.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function entityTypeForPath(path: string): string {
  const match = Object.entries(DATA_PATHS).find(([, sectionPath]) => sectionPath === path);
  return match?.[0] ?? path;
}

function recordCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    if ('userChemicalProducts' in value && Array.isArray((value as { userChemicalProducts?: unknown }).userChemicalProducts)) {
      return (value as { userChemicalProducts: unknown[] }).userChemicalProducts.length;
    }
    if ('experiments' in value && Array.isArray((value as { experiments?: unknown }).experiments)) {
      return (value as { experiments: unknown[] }).experiments.length;
    }
  }
  return 1;
}
