export type UpdateState = 'idle' | 'checking' | 'available' | 'activated' | 'unsupported';

export function canApplyUpdate(hasUnsavedChanges: boolean): boolean {
  return !hasUnsavedChanges;
}

export function isServiceWorkerSupported(input: unknown): boolean {
  return typeof input === 'object' && input !== null && 'register' in input;
}
