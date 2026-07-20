export type ConnectionStatus = 'online' | 'offline';

export function getConnectionStatus(navigatorOnline: boolean): ConnectionStatus {
  return navigatorOnline ? 'online' : 'offline';
}
