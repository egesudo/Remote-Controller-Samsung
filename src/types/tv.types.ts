/**
 * Core Types and Interfaces for Samsung Smart TV Remote Controller
 * Strictly tailored for Tizen 5.5+ (TU8500 Series) LAN WebSocket protocol
 */

export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'PAIRING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

/**
 * Whitelist of validated remote control keycodes supported by the TV model.
 * Arbitrary or unlisted strings are strictly rejected by the validator.
 */
export const VALID_REMOTE_KEYS = [
  // Navigation & System
  'KEY_UP',
  'KEY_DOWN',
  'KEY_LEFT',
  'KEY_RIGHT',
  'KEY_ENTER',
  'KEY_RETURN',
  'KEY_HOME',
  
  // Volume & Audio
  'KEY_VOLUP',
  'KEY_VOLDOWN',
  'KEY_MUTE',
  
  // Channels
  'KEY_CHUP',
  'KEY_CHDOWN',
  
  // Playback / Media
  'KEY_PLAY',
  'KEY_PAUSE',
  'KEY_STOP',
  
  // Power
  'KEY_POWER',
] as const;

export type ValidRemoteKey = (typeof VALID_REMOTE_KEYS)[number];

export interface SamsungTVConfig {
  host: string;
  port?: number; // Defaults to 8002 (WSS)
  appName?: string; // Defaults to 'SamsungRemoteApp'
  token?: string | null;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface SamsungRemotePacket {
  method: 'ms.remote.control';
  params: {
    Cmd: 'Click';
    DataOfCmd: ValidRemoteKey;
    Option: 'false';
    TypeOfRemote: 'SendRemoteKey';
  };
}

export interface TVDeviceInfo {
  id?: string;
  name?: string;
  modelName?: string;
  deviceType?: string;
  mac?: string;
  wifiMac?: string;
  networkType?: string;
  tokenAuthSupport?: boolean;
  powerState?: string;
  raw?: Record<string, unknown>;
}

export interface ManagedTVDevice {
  id: string; // Unique identifier (e.g. mac, deviceId, or generated key)
  ip: string;
  port: number;
  name: string;
  customName?: string;
  modelName?: string;
  token?: string | null;
  lastConnected?: string;
  isCurrent?: boolean;
  onlineStatus?: 'online' | 'offline' | 'unknown';
}

export interface DiscoveredTVDevice {
  id: string;
  ip: string;
  port: number;
  name: string;
  modelName: string;
  networkType?: string;
  responseTimeMs?: number;
  discoveredVia: 'ssdp' | 'http_probe' | 'subnet_scan' | 'manual';
}

export type DiscoveryState = 'IDLE' | 'SCANNING' | 'COMPLETED' | 'ERROR';

export interface DiscoveryProgress {
  currentIp: string;
  scannedCount: number;
  totalToScan: number;
  progressPercent: number;
  foundCount: number;
}


export interface TVLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: unknown;
}

/**
 * Validation result interface for security gating
 */
export interface CommandValidationResult {
  isValid: boolean;
  sanitizedKey?: ValidRemoteKey;
  error?: string;
}

/**
 * Security Command Validator Contract
 * All command sources (UI, future Voice, future AI) must pass through this contract.
 */
export interface ICommandValidator {
  validateKey(key: string): CommandValidationResult;
  isKeyWhitelisted(key: string): key is ValidRemoteKey;
}

/**
 * Discovered Smart TV Application Metadata
 */
export interface DiscoveredAppInfo {
  appId: string;
  name: string;
  appType?: number | string;
  icon?: string;
  version?: string;
  isRunning?: boolean;
  source: 'websocket_eden' | 'rest_api' | 'registry_verified';
}

/**
 * Telemetry record detailing outbound payload and inbound TV response/error
 */
export interface AppLaunchTelemetryRecord {
  id: string;
  timestamp: string;
  appId: string;
  appName: string;
  actionType: 'NATIVE_LAUNCH' | 'DEEP_LINK';
  actionUrl?: string;
  targetHost: string;
  outboundEdenJson: string;
  outboundAppStartJson?: string;
  responseStatus: 'PENDING' | 'SUCCESS_200' | 'ERROR_404' | 'PERMISSION_DENIED_AUTH' | 'ERROR_PAYLOAD' | 'ERROR_TV' | 'TIMEOUT_SILENT';
  responseEvent?: string;
  rawResponseJson?: string;
  statusCode?: number | null;
  diagnosis: string;
}

/**
 * Modular Application Launcher Capability
 * Decouples app launching (such as YouTube) from the raw remote key channel
 */
export interface IAppLauncher {
  isAppLaunchSupported(): boolean;
  launchApp(appId: string, actionUrl?: string): Promise<boolean>;
  launchYouTube?(videoIdOrPayload?: string): Promise<boolean>;
  getAppStatus(appId: string): Promise<Record<string, unknown> | null>;
  // Runtime discovery methods
  discoverInstalledApps?(options?: { forceRefresh?: boolean; timeoutMs?: number }): Promise<DiscoveredAppInfo[]>;
  getInstalledApps?(): DiscoveredAppInfo[];
  resolveYouTubeAppId?(forceRefresh?: boolean): Promise<string>;
  getResolvedYouTubeAppId?(): string | null;
  // Granular Event Logging & Telemetry
  getLastLaunchTelemetry?(): AppLaunchTelemetryRecord | null;
  getLaunchTelemetryHistory?(): AppLaunchTelemetryRecord[];
  addTelemetryListener?(listener: (record: AppLaunchTelemetryRecord) => void): () => void;
}

/**
 * Core TV Controller Contract
 */
export interface ITVController {
  connect(config: SamsungTVConfig): Promise<boolean>;
  disconnect(): void;
  sendKey(key: ValidRemoteKey | string): Promise<boolean>;
  getConnectionState(): ConnectionState;
  getStoredToken(): string | null;
  clearStoredToken(): void;
  appLauncher: IAppLauncher;
}
