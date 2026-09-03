/**
 * Samsung TV Mobile Types (React Native / Expo)
 */

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'PAIRING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export type ValidRemoteKey =
  | 'KEY_POWER'
  | 'KEY_UP'
  | 'KEY_DOWN'
  | 'KEY_LEFT'
  | 'KEY_RIGHT'
  | 'KEY_ENTER'
  | 'KEY_RETURN'
  | 'KEY_HOME'
  | 'KEY_VOLUP'
  | 'KEY_VOLDOWN'
  | 'KEY_MUTE'
  | 'KEY_CHUP'
  | 'KEY_CHDOWN'
  | 'KEY_PLAY'
  | 'KEY_PAUSE'
  | 'KEY_STOP';

export interface TVDeviceInfo {
  id: string;
  name: string;
  modelName: string;
  version: string;
  networkType?: string;
  ip?: string;
}

export interface ManagedTVDevice {
  id: string;
  ip: string;
  port: number;
  name: string;
  customName?: string;
  modelName?: string;
  token?: string | null;
  isCurrent?: boolean;
}

export interface DiscoveredTVDevice {
  id: string;
  ip: string;
  port: number;
  name: string;
  modelName: string;
}


export interface SamsungTVConfig {
  host: string;
  port?: number;
  appName?: string;
  token?: string | null;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}
