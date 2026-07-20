import type { Measurement } from './measurement';
import type { MeasurementDevice } from './measurementDevice';
import { normalizeMeasurementDevice, setMeasurementDeviceLifecycle } from './measurementDevice';
import type { PoolSettings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import {
  CHLORINATOR_CALCULATION_VERSION,
  CHLORINATOR_CATALOG_VERSION,
  CHLORINATOR_SCHEMA_VERSION,
  migrateSaltChlorinatorConfig,
} from './saltChlorinator';
import type {
  ChemicalProductSnapshot,
  MaintenanceAction,
  MaintenanceActionKind,
  UserChemicalProduct,
} from './actions';
import {
  buildPerformedComparison,
  chemicalProductCategoryFromLegacyType,
  determineEvaluationEligibility,
  getActionRecommendationId,
} from './actions';
import type { FollowUp } from './followUp';
import type { DiagnosticExperiment } from './latentStateEstimator';
import { buildExportSnapshots, type ExportSnapshots } from './exportSnapshots';
import {
  buildPortableBackup,
  buildPortableDataset,
  buildPortableBackupJson,
  isPortableBackupObject,
  portableDatasetFromBackupObject,
  portableDatasetToImportObject,
  validatePortableBackupManifest,
  type CompleteExportOptions,
  type PortableBackup,
  type PortableDataset,
} from './portableBackup';
import { storageKey } from './persistenceInventory';
import {
  APPLICATION_VERSION,
  CHEMICAL_CATALOG_VERSION,
  DIAGNOSIS_ENGINE_VERSION,
  OUTCOME_EVALUATOR_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
  STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
} from './recommendation/versions';

function key(name: string): string {
  return storageKey(name);
}

// ── PoolSettings ───────────────────────────────────────────────────

export function loadSettings(): PoolSettings {
  try {
    const raw = localStorage.getItem(key('settings'));
    if (!raw) return { ...DEFAULT_SETTINGS };
    return migrateSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: PoolSettings): void {
  localStorage.setItem(key('settings'), JSON.stringify(migrateSettings(settings)));
}

function migrateSettings(settings: PoolSettings): PoolSettings {
  if (!settings.saltChlorinator) return settings;
  return {
    ...settings,
    saltChlorinator: migrateSaltChlorinatorConfig(settings.saltChlorinator),
  };
}

// ── Measurements ───────────────────────────────────────────────────

/**
 * Migrate an old record to the current PoolMeasurement shape.
 *
 * v1→v2: Records had `date` (YYYY-MM-DD) without `measuredAt`.
 *         Converts date to ISO 8601 measuredAt using local noon.
 *
 * v2→v3: Records may contain fields like freeChlorine, alkalinity,
 *         cyanuricAcid, or a `date` field. Maps freeChlorine → fac
 *         and ensures measuredAt exists.
 */
function migrateMeasurement(raw: Record<string, unknown>): Measurement {
  const r = { ...raw } as Record<string, unknown>;

  // Ensure measuredAt exists (migrate from date-only)
  if (!r.measuredAt && r.date) {
    const localNoon = new Date(`${String(r.date)}T12:00:00`);
    r.measuredAt = localNoon.toISOString();
  }

  // Map old freeChlorine to fac if fac is not already set
  if (r.freeChlorine !== undefined && r.fac === undefined) {
    r.fac = r.freeChlorine;
  }

  // Remove legacy fields that are no longer in the model
  delete r.date;
  delete r.freeChlorine;
  delete r.alkalinity;
  delete r.cyanuricAcid;

  return r as unknown as Measurement;
}

export function loadMeasurements(): Measurement[] {
  try {
    const raw = localStorage.getItem(key('measurements'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateMeasurement);
  } catch {
    return [];
  }
}

export function saveMeasurements(measurements: Measurement[]): void {
  localStorage.setItem(key('measurements'), JSON.stringify(measurements));
}

export function addMeasurement(m: Measurement): Measurement[] {
  const list = loadMeasurements();
  list.push(m);
  saveMeasurements(list);
  return list;
}

export function deleteMeasurement(id: string): Measurement[] {
  const list = loadMeasurements().filter((m) => m.id !== id);
  saveMeasurements(list);
  return list;
}

// ── Measurement Devices ───────────────────────────────────────────

function migrateMeasurementDevice(raw: Record<string, unknown>): MeasurementDevice {
  return normalizeMeasurementDevice(raw as unknown as MeasurementDevice);
}

export function loadMeasurementDevices(): MeasurementDevice[] {
  try {
    const raw = localStorage.getItem(key('measurementDevices'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(migrateMeasurementDevice);
  } catch {
    return [];
  }
}

export function saveMeasurementDevices(devices: MeasurementDevice[]): void {
  localStorage.setItem(key('measurementDevices'), JSON.stringify(devices.map((device) => normalizeMeasurementDevice(device))));
}

export interface MeasurementDeviceUsage {
  measurementCount: number;
  lastUsedAt?: string;
  parameterCounts: Record<string, number>;
}

export interface DeleteMeasurementDeviceResult {
  deleted: boolean;
  archived: boolean;
  reason?: string;
  device?: MeasurementDevice;
}

export function getMeasurementDeviceUsage(deviceId: string, measurements = loadMeasurements()): MeasurementDeviceUsage {
  const linkedMeasurements = measurements.filter((measurement) =>
    Object.values(measurement.values ?? {}).some((trace) => trace?.deviceId === deviceId || trace?.sourceSnapshot?.deviceId === deviceId),
  );
  const parameterCounts: Record<string, number> = {};
  for (const measurement of linkedMeasurements) {
    for (const trace of Object.values(measurement.values ?? {})) {
      if (trace?.deviceId !== deviceId && trace?.sourceSnapshot?.deviceId !== deviceId) continue;
      parameterCounts[trace.parameterCode] = (parameterCounts[trace.parameterCode] ?? 0) + 1;
    }
  }
  return {
    measurementCount: linkedMeasurements.length,
    lastUsedAt: linkedMeasurements
      .map((measurement) => measurement.measuredAt)
      .sort()
      .at(-1),
    parameterCounts,
  };
}

export function deleteMeasurementDeviceSafely(deviceId: string, now = new Date()): DeleteMeasurementDeviceResult {
  const devices = loadMeasurementDevices();
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { deleted: false, archived: false, reason: 'El medidor no existe.' };

  const usage = getMeasurementDeviceUsage(deviceId);
  if (usage.measurementCount > 0) {
    const archivedDevice = setMeasurementDeviceLifecycle(device, 'archived', now);
    saveMeasurementDevices(devices.map((candidate) => candidate.id === deviceId ? archivedDevice : candidate));
    return {
      deleted: false,
      archived: true,
      device: archivedDevice,
      reason: `Este medidor aparece en ${usage.measurementCount} mediciones anteriores. Se ha archivado para conservar el historico.`,
    };
  }

  saveMeasurementDevices(devices.filter((candidate) => candidate.id !== deviceId));
  return { deleted: true, archived: false };
}

// ── Maintenance Actions ────────────────────────────────────────────

const ACTION_SCHEMA_VERSION = 2;

function categoryForKind(kind: MaintenanceActionKind): string {
  switch (kind) {
    case 'chemical':
    case 'chemical-cover':
    case 'algaecide':
    case 'clarifier':
    case 'flocculant':
    case 'stabilizer':
    case 'unknown-product':
      return 'chemical';
    case 'chlorinator':
    case 'equipment-maintenance':
      return 'equipment';
    case 'filtration':
    case 'filter-backwash':
      return 'filtration';
    case 'water-replacement':
    case 'water-top-up':
    case 'partial-drain':
      return 'water';
    case 'cleaning':
      return 'cleaning';
    case 'physical-cover':
      return 'cover';
    case 'manual-test':
      return 'measurement';
    case 'inspection':
      return 'inspection';
    default:
      return 'custom';
  }
}

function buildLegacyProductSnapshot(action: MaintenanceAction): ChemicalProductSnapshot | undefined {
  const chemical = action.chemical;
  if (!chemical) return undefined;
  if (chemical.product?.snapshot) return chemical.product.snapshot;
  if (!chemical.productType && !chemical.mainComponent) return undefined;

  return {
    productId: chemical.productType,
    capturedAt: action.performedAt,
    name: chemical.mainComponent || chemical.productType || 'Producto desconocido',
    category: chemicalProductCategoryFromLegacyType(chemical.productType),
    activeIngredients: chemical.mainComponent
      ? [{ name: chemical.mainComponent, concentrationPercent: chemical.concentrationPercent, userProvided: false }]
      : undefined,
    concentrationPercent: chemical.concentrationPercent,
  };
}

function migrateAction(raw: Record<string, unknown>): MaintenanceAction {
  const action = { ...raw } as unknown as MaintenanceAction;
  const recommendationId = getActionRecommendationId(action);
  const legacyLinkedRecommendation = Boolean(recommendationId || action.recommendationSnapshot);

  action.schemaVersion = action.schemaVersion ?? ACTION_SCHEMA_VERSION;
  action.origin = action.origin ?? (legacyLinkedRecommendation ? 'recommendation' : 'manual');
  action.relatedRecommendationId = action.relatedRecommendationId ?? action.recommendationId;
  action.recommendationId = action.recommendationId ?? action.relatedRecommendationId;
  action.category = action.category ?? categoryForKind(action.kind);
  action.actionType = action.actionType ?? action.kind;
  action.performedValuesProvenance = action.performedValuesProvenance
    ?? (legacyLinkedRecommendation ? 'assumed-from-legacy-recommendation' : 'user-entered');

  const snapshot = buildLegacyProductSnapshot(action);
  if (action.chemical && snapshot && !action.chemical.product) {
    action.chemical = {
      ...action.chemical,
      product: {
        source: action.chemical.productType ? 'system-catalog' : 'unknown',
        productId: action.chemical.productType,
        snapshot,
      },
    };
  }

  if (!action.performedComparison) {
    const amount = action.chemical?.amount;
    const unit = action.chemical?.unit;
    const runtimeHours = action.chlorinator?.additionalHours ?? action.filtration?.newHours;
    const outputPercent = action.chlorinator?.newOutputPercent;
    action.performedComparison = {
      recommendationId,
      recommended: legacyLinkedRecommendation
        ? { amount, unit, runtimeHours, outputPercent }
        : undefined,
      performed: { amount, unit, runtimeHours, outputPercent },
    };
  } else if (!action.performedComparison.deviation) {
    action.performedComparison = buildPerformedComparison({
      recommendationId: action.performedComparison.recommendationId ?? recommendationId,
      recommended: action.performedComparison.recommended,
      performed: action.performedComparison.performed,
    });
  }

  action.evaluationEligibility = action.evaluationEligibility ?? determineEvaluationEligibility(action);
  action.chemicalCatalogVersion = action.chemicalCatalogVersion ?? CHEMICAL_CATALOG_VERSION;

  return action;
}

export function loadActions(): MaintenanceAction[] {
  try {
    const raw = localStorage.getItem(key('actions'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => migrateAction(item as Record<string, unknown>));
  } catch {
    return [];
  }
}

export function saveActions(actions: MaintenanceAction[]): void {
  localStorage.setItem(key('actions'), JSON.stringify(actions.map((action) => migrateAction(action as unknown as Record<string, unknown>))));
}

export function addAction(a: MaintenanceAction): MaintenanceAction[] {
  const list = loadActions();
  list.push(a);
  saveActions(list);
  return loadActions();
}

export function deleteAction(id: string): MaintenanceAction[] {
  const list = loadActions().filter((a) => a.id !== id);
  saveActions(list);
  return list;
}

// ── User Chemical Product Catalog ─────────────────────────────────

export function loadUserChemicalProducts(): UserChemicalProduct[] {
  try {
    const raw = localStorage.getItem(key('userChemicalProducts'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UserChemicalProduct =>
      typeof item === 'object'
      && item !== null
      && typeof (item as UserChemicalProduct).id === 'string'
      && typeof (item as UserChemicalProduct).snapshot?.name === 'string',
    );
  } catch {
    return [];
  }
}

export function saveUserChemicalProducts(products: UserChemicalProduct[]): void {
  localStorage.setItem(key('userChemicalProducts'), JSON.stringify(products));
}

export function addUserChemicalProduct(snapshot: ChemicalProductSnapshot, now = new Date()): UserChemicalProduct {
  const products = loadUserChemicalProducts();
  const capturedAt = snapshot.capturedAt ?? now.toISOString();
  const product: UserChemicalProduct = {
    id: `usr-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    snapshot: {
      ...snapshot,
      capturedAt,
      activeIngredients: snapshot.activeIngredients?.map((ingredient) => ({
        ...ingredient,
        userProvided: ingredient.userProvided ?? true,
      })),
    },
  };
  saveUserChemicalProducts([...products, product]);
  return product;
}

// ── Follow-Up Records ──────────────────────────────────────────────

export function loadFollowUps(): FollowUp[] {
  try {
    const raw = localStorage.getItem(key('followUps'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FollowUp[];
  } catch {
    return [];
  }
}

export function saveFollowUps(followUps: FollowUp[]): void {
  localStorage.setItem(key('followUps'), JSON.stringify(followUps));
}

export function addFollowUp(fu: FollowUp): FollowUp[] {
  const list = loadFollowUps();
  list.push(fu);
  saveFollowUps(list);
  return list;
}

export function updateFollowUp(id: string, updates: Partial<FollowUp>): FollowUp[] {
  const list = loadFollowUps();
  const idx = list.findIndex((fu) => fu.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveFollowUps(list);
  }
  return list;
}

/**
 * Merge imported follow-ups into an existing list, avoiding duplicates by id.
 */
export function mergeFollowUps(
  existing: FollowUp[],
  incoming: FollowUp[],
): FollowUp[] {
  const existingIds = new Set(existing.map((fu) => fu.id));
  const deduped = incoming.filter((fu) => !existingIds.has(fu.id));
  return [...existing, ...deduped];
}

// ── Export / Import ────────────────────────────────────────────────

// ── Diagnostic experiments ─────────────────────────────────────────

export function loadExperiments(): DiagnosticExperiment[] {
  try {
    const raw = localStorage.getItem(key('experiments'));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DiagnosticExperiment[];
  } catch {
    return [];
  }
}

export function saveExperiments(experiments: DiagnosticExperiment[]): void {
  localStorage.setItem(key('experiments'), JSON.stringify(experiments));
}

export function addExperiment(exp: DiagnosticExperiment): DiagnosticExperiment[] {
  const list = loadExperiments();
  list.push(exp);
  saveExperiments(list);
  return list;
}

export function updateExperiment(id: string, updates: Partial<DiagnosticExperiment>): DiagnosticExperiment[] {
  const list = loadExperiments();
  const idx = list.findIndex((e) => e.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveExperiments(list);
  }
  return list;
}

export function mergeExperiments(
  existing: DiagnosticExperiment[],
  incoming: DiagnosticExperiment[],
): DiagnosticExperiment[] {
  const existingIds = new Set(existing.map((e) => e.id));
  const deduped = incoming.filter((e) => !existingIds.has(e.id));
  return [...existing, ...deduped];
}

export const EXPORT_SCHEMA_VERSION = 11;

export interface ExportData extends ExportSnapshots {
  schemaVersion: number;
  applicationVersion: string;
  chlorinatorSchemaVersion: string;
  chlorinatorCatalogVersion: string;
  chlorinatorCalculationVersion: string;
  diagnosisEngineVersion: string;
  recommendationEngineVersion: string;
  structuredRecommendationEngineVersion: string;
  outcomeEvaluatorVersion: string;
  chemicalCatalogVersion: string;
  exportedAt: string;
  poolConfig: PoolSettings;
  measurements: Measurement[];
  measurementDevices: MeasurementDevice[];
  actions: MaintenanceAction[];
  followUps: FollowUp[];
  experiments?: DiagnosticExperiment[];
  userChemicalProducts?: UserChemicalProduct[];
}

export interface ImportResult {
  measurements: Measurement[];
  measurementDevices: MeasurementDevice[];
  actions: MaintenanceAction[];
  followUps: FollowUp[];
  experiments: DiagnosticExperiment[];
  userChemicalProducts: UserChemicalProduct[];
  poolConfig: PoolSettings | null;
  count: number;
}

export interface AppliedImportResult {
  measurements: { discovered: number; created: number; skipped: number };
  measurementDevices: { discovered: number; created: number; skipped: number };
  actions: { discovered: number; created: number; skipped: number; failed: number };
  followUps: { discovered: number; created: number; skipped: number };
  experiments: { discovered: number; created: number; skipped: number };
  userChemicalProducts: { discovered: number; created: number; skipped: number };
  actionExclusionsNormalized: boolean;
  poolConfigUpdated: boolean;
}

export interface ApplyImportOptions {
  mode?: 'merge' | 'replace';
}

/**
 * Build the full export payload including pool configuration,
 * measurement history, schema metadata, and diagnostic experiments.
 *
 * @param now Optional date to use as the export timestamp (for testing).
 */
export function exportData(now?: Date): ExportData {
  const exportedAt = (now ?? new Date()).toISOString();
  const poolConfig = loadSettings();
  const measurements = loadMeasurements();
  const measurementDevices = loadMeasurementDevices();
  const actions = loadActions();
  const followUps = loadFollowUps();
  const experiments = loadExperiments();
  const userChemicalProducts = loadUserChemicalProducts();
  const snapshots = buildExportSnapshots({
    measurements,
    actions,
    followUps,
    settings: poolConfig,
    capturedAt: exportedAt,
    userChemicalProducts,
  });

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    applicationVersion: APPLICATION_VERSION,
    chlorinatorSchemaVersion: CHLORINATOR_SCHEMA_VERSION,
    chlorinatorCatalogVersion: CHLORINATOR_CATALOG_VERSION,
    chlorinatorCalculationVersion: CHLORINATOR_CALCULATION_VERSION,
    diagnosisEngineVersion: DIAGNOSIS_ENGINE_VERSION,
    recommendationEngineVersion: RECOMMENDATION_ENGINE_VERSION,
    structuredRecommendationEngineVersion: STRUCTURED_RECOMMENDATION_ENGINE_VERSION,
    outcomeEvaluatorVersion: OUTCOME_EVALUATOR_VERSION,
    chemicalCatalogVersion: CHEMICAL_CATALOG_VERSION,
    exportedAt,
    poolConfig,
    measurements,
    measurementDevices,
    actions,
    followUps,
    experiments,
    userChemicalProducts,
    ...snapshots,
  };
}

export function exportPortableDataset(now?: Date): PortableDataset {
  return buildPortableDataset(exportData(now));
}

export function exportPortableBackup(options?: CompleteExportOptions & { now?: Date }): Promise<PortableBackup> {
  return buildPortableBackup(exportData(options?.now), options);
}

export function exportPortableBackupJson(options?: CompleteExportOptions & { now?: Date }): Promise<string> {
  return buildPortableBackupJson(exportData(options?.now), options);
}

/**
 * Parse and validate an import JSON string.
 *
 * Supports:
 * - v11: v10 plus configured measurement devices, capabilities, derivations, and calibration metadata
 * - v10: v9 plus independent manual maintenance actions, performed/recommended comparison, and user chemical products
 * - v9: v8 plus structured versioned snapshots for export auditability
 * - v8: `{ schemaVersion: 8, applicationVersion, recommendationEngineVersion, outcomeEvaluatorVersion, chemicalCatalogVersion, poolConfig, measurements, actions, followUps, experiments }`
 * - v7: `{ schemaVersion: 7, poolConfig, measurements, actions, followUps, experiments }` — adds diagnostic experiments
 * - v6: `{ schemaVersion: 6, poolConfig, measurements, actions, followUps }` — adds follow-ups
 * - v5: `{ schemaVersion: 5, poolConfig, measurements, actions }` — adds historicalLearning config to poolConfig
 * - v4: `{ schemaVersion: 4, poolConfig, measurements, actions }` — current format before v5
 * - v3: `{ schemaVersion: 3, poolConfig, measurements }` — no actions array
 * - v2: `{ schemaVersion: 2, poolConfig, measurements }` — old measurement shape
 * - v1 (legacy): a plain `Measurement[]` array
 *
 * All formats are migrated through `migrateMeasurement` for backward compat.
 *
 * @throws If the JSON is invalid or the shape is unrecognized.
 */
export function parseImportData(jsonString: string): ImportResult {
  let data: unknown;

  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error(
      'The file does not contain valid JSON. Please check the file and try again.',
    );
  }

  // ── Legacy format: plain array of measurements ────────────────
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { measurements: [], measurementDevices: [], actions: [], followUps: [], experiments: [], userChemicalProducts: [], poolConfig: null, count: 0 };
    }

    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(
          'Invalid JSON format: expected an array of measurement objects.',
        );
      }
      if (!item.id || (!item.measuredAt && !item.date)) {
        throw new Error(
          'Invalid measurement: each entry must have an id and a date or measuredAt field.',
        );
      }
    }

    const measurements = data.map(migrateMeasurement);
    return { measurements, measurementDevices: [], actions: [], followUps: [], experiments: [], userChemicalProducts: [], poolConfig: null, count: measurements.length };
  }

  // ── Versioned format: { schemaVersion, measurements, poolConfig? } ──
  if (typeof data === 'object' && data !== null) {
    if (isPortableBackupObject(data)) {
      validatePortableBackupManifest(data);
      data = portableDatasetToImportObject(portableDatasetFromBackupObject(data));
    }

    const obj = data as Record<string, unknown>;

    // Heuristic: if it looks like a single measurement object, reject with a helpful message
    if (typeof obj.id === 'string' && obj.measuredAt) {
      throw new Error(
        'This file contains a single measurement, not an export file. ' +
          'Use "Export JSON" from the app to create a valid export.',
      );
    }

    const rawMeasurements = Array.isArray(obj.measurements) ? obj.measurements : [];

    for (const item of rawMeasurements) {
      if (typeof item !== 'object' || item === null) {
        throw new Error(
          'Invalid JSON format: measurements must be an array of objects.',
        );
      }
    }

    const measurements = rawMeasurements.map(migrateMeasurement);

    let measurementDevices: MeasurementDevice[] = [];
    if (Array.isArray(obj.measurementDevices)) {
      for (const item of obj.measurementDevices) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: measurementDevices must be an array of objects.',
          );
        }
      }
      measurementDevices = obj.measurementDevices.map((device) => migrateMeasurementDevice(device as Record<string, unknown>));
    }

    // Parse actions (v4+); v3 and older exports won't have this field
    let actions: MaintenanceAction[] = [];
    if (Array.isArray(obj.actions)) {
      for (const item of obj.actions) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: actions must be an array of objects.',
          );
        }
      }
      actions = obj.actions.map((action) => migrateAction(action as Record<string, unknown>));
    }

    // Parse follow-ups (v6+); v5 and older exports won't have this field
    let followUps: FollowUp[] = [];
    if (Array.isArray(obj.followUps)) {
      for (const item of obj.followUps) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: followUps must be an array of objects.',
          );
        }
      }
      followUps = obj.followUps as FollowUp[];
    }

    // Parse experiments (v7+); v6 and older exports won't have this field
    let experiments: DiagnosticExperiment[] = [];
    if (Array.isArray(obj.experiments)) {
      for (const item of obj.experiments) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: experiments must be an array of objects.',
          );
        }
      }
      experiments = obj.experiments as DiagnosticExperiment[];
    }

    let userChemicalProducts: UserChemicalProduct[] = [];
    if (Array.isArray(obj.userChemicalProducts)) {
      for (const item of obj.userChemicalProducts) {
        if (typeof item !== 'object' || item === null) {
          throw new Error(
            'Invalid JSON format: userChemicalProducts must be an array of objects.',
          );
        }
      }
      userChemicalProducts = obj.userChemicalProducts as UserChemicalProduct[];
    }

    let poolConfig: PoolSettings | null = null;
    if (obj.poolConfig && typeof obj.poolConfig === 'object') {
      poolConfig = migrateSettings({ ...DEFAULT_SETTINGS, ...(obj.poolConfig as Record<string, unknown>) } as PoolSettings);
    }

    return { measurements, measurementDevices, actions, followUps, experiments, userChemicalProducts, poolConfig, count: measurements.length };
  }

  throw new Error(
    'Unrecognized JSON format. Expected a measurement array or a versioned export object.',
  );
}

export function applyImportResult(result: ImportResult, options: ApplyImportOptions = {}): AppliedImportResult {
  const mode = options.mode ?? 'merge';
  const persistentKeys = [
    key('settings'),
    key('measurements'),
    key('measurementDevices'),
    key('actions'),
    key('followUps'),
    key('experiments'),
    key('userChemicalProducts'),
  ];
  const before = new Map(persistentKeys.map((storageKeyName) => [storageKeyName, localStorage.getItem(storageKeyName)]));

  const existingMeasurements = loadMeasurements();
  const existingMeasurementDevices = loadMeasurementDevices();
  const existingActions = loadActions();
  const existingFollowUps = loadFollowUps();
  const existingExperiments = loadExperiments();
  const existingUserChemicalProducts = loadUserChemicalProducts();

  const mergedMeasurements = mode === 'replace' ? result.measurements : mergeMeasurements(existingMeasurements, result.measurements);
  const mergedMeasurementDevices = mode === 'replace' ? result.measurementDevices : mergeMeasurementDevices(existingMeasurementDevices, result.measurementDevices);
  const mergedActions = mode === 'replace' ? result.actions : mergeActions(existingActions, result.actions);
  const mergedFollowUps = mode === 'replace' ? result.followUps : mergeFollowUps(existingFollowUps, result.followUps);
  const mergedExperiments = mode === 'replace' ? result.experiments : mergeExperiments(existingExperiments, result.experiments);
  const mergedUserChemicalProducts = mode === 'replace' ? result.userChemicalProducts : mergeUserChemicalProducts(existingUserChemicalProducts, result.userChemicalProducts);
  const normalizedActions = normalizeActionExclusionFlags(mergedActions, mergedFollowUps);
  const actionExclusionsNormalized = normalizedActions !== mergedActions;

  try {
    if (result.poolConfig) {
      saveSettings(result.poolConfig);
    }
    saveUserChemicalProducts(mergedUserChemicalProducts);
    saveMeasurementDevices(mergedMeasurementDevices);
    saveMeasurements(mergedMeasurements);
    saveActions(normalizedActions);
    verifyPersistedActions(normalizedActions, result.actions);
    saveFollowUps(mergedFollowUps);
    saveExperiments(mergedExperiments);

    return {
      measurements: countApplied(mode, existingMeasurements, result.measurements),
      measurementDevices: countApplied(mode, existingMeasurementDevices, result.measurementDevices),
      actions: {
        ...countApplied(mode, existingActions, result.actions),
        failed: 0,
      },
      followUps: countApplied(mode, existingFollowUps, result.followUps),
      experiments: countApplied(mode, existingExperiments, result.experiments),
      userChemicalProducts: countApplied(mode, existingUserChemicalProducts, result.userChemicalProducts),
      actionExclusionsNormalized,
      poolConfigUpdated: Boolean(result.poolConfig),
    };
  } catch (error) {
    for (const [storageKeyName, value] of before) {
      if (value === null) {
        localStorage.removeItem(storageKeyName);
      } else {
        localStorage.setItem(storageKeyName, value);
      }
    }
    throw error;
  }
}

/**
 * Merge imported measurements into an existing list, avoiding
 * duplicates by measurement id.
 */
export function mergeMeasurements(
  existing: Measurement[],
  incoming: Measurement[],
): Measurement[] {
  const existingIds = new Set(existing.map((m) => m.id));
  const deduped = incoming.filter((m) => !existingIds.has(m.id));
  return [...existing, ...deduped];
}

export function mergeMeasurementDevices(
  existing: MeasurementDevice[],
  incoming: MeasurementDevice[],
): MeasurementDevice[] {
  const existingIds = new Set(existing.map((device) => device.id));
  const deduped = incoming.filter((device) => !existingIds.has(device.id));
  return [...existing, ...deduped];
}

export function mergeUserChemicalProducts(
  existing: UserChemicalProduct[],
  incoming: UserChemicalProduct[],
): UserChemicalProduct[] {
  const existingIds = new Set(existing.map((product) => product.id));
  const deduped = incoming.filter((product) => !existingIds.has(product.id));
  return [...existing, ...deduped];
}

/**
 * Merge imported actions into an existing list, avoiding duplicates by id.
 */
export function mergeActions(
  existing: MaintenanceAction[],
  incoming: MaintenanceAction[],
): MaintenanceAction[] {
  const existingIds = new Set(existing.map((a) => a.id));
  const deduped = incoming.filter((a) => !existingIds.has(a.id));
  return [...existing, ...deduped];
}

/**
 * Normalize action exclusion flags from follow-up records.
 *
 * For any follow-up with `excludedFromLearning: true`, propagates
 * this flag to the linked action's `exclusionFlags.excludedFromLearning`.
 *
 * This ensures that imported exclusion state takes effect immediately
 * without requiring UI interaction. The learning system checks the
 * action flag, so the two sources must agree.
 *
 * Rules:
 * - Preserves existing action exclusion flags (atypical, incorrectlyRecorded)
 * - Never changes `true` back to `false` (monotonic union)
 * - If either linked record excludes, exclusion wins
 * - Missing linked action is silently skipped
 * - Multiple follow-ups for one action: any `true` → exclusion
 * - Idempotent: second call does not change already-normalized data
 */
export function normalizeActionExclusionFlags(
  actions: MaintenanceAction[],
  followUps: FollowUp[],
): MaintenanceAction[] {
  // Build set of action IDs that ANY follow-up marks as excluded
  const excludedActionIds = new Set<string>();
  for (const fu of followUps) {
    if (fu.excludedFromLearning && fu.actionId) {
      excludedActionIds.add(fu.actionId);
    }
  }

  if (excludedActionIds.size === 0) return actions;

  let changed = false;
  const result = actions.map((action) => {
    if (!excludedActionIds.has(action.id)) return action;
    if (action.exclusionFlags?.excludedFromLearning) return action; // already excluded
    changed = true;
    return {
      ...action,
      exclusionFlags: {
        atypical: action.exclusionFlags?.atypical ?? false,
        incorrectlyRecorded: action.exclusionFlags?.incorrectlyRecorded ?? false,
        excludedFromLearning: true,
      },
    };
  });

  return changed ? result : actions;
}

function countApplied<T extends { id: string }>(
  mode: 'merge' | 'replace',
  existing: T[],
  incoming: T[],
): { discovered: number; created: number; skipped: number } {
  if (mode === 'replace') {
    return {
      discovered: incoming.length,
      created: incoming.length,
      skipped: 0,
    };
  }
  const existingIds = new Set(existing.map((item) => item.id));
  const created = incoming.filter((item) => !existingIds.has(item.id)).length;
  return {
    discovered: incoming.length,
    created,
    skipped: incoming.length - created,
  };
}

function verifyPersistedActions(expectedMergedActions: MaintenanceAction[], importedActions: MaintenanceAction[]): void {
  if (importedActions.length === 0) return;
  const savedById = new Map(loadActions().map((action) => [action.id, action]));
  for (const action of expectedMergedActions) {
    if (!savedById.has(action.id)) {
      throw new Error(`Import failed: maintenance action ${action.id} was not persisted.`);
    }
  }
}
