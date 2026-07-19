export interface LegacyExportMarker {
  migratedFromSchemaVersion?: number;
  snapshotAvailability: 'available' | 'legacy-unavailable';
}

export function legacySnapshotMarker(schemaVersion: unknown): LegacyExportMarker {
  return {
    migratedFromSchemaVersion: typeof schemaVersion === 'number' ? schemaVersion : undefined,
    snapshotAvailability: 'legacy-unavailable',
  };
}

