/**
 * High-Level Samsung TV Controller
 * 
 * Orchestrates:
 * - Connection lifecycle management
 * - Security gating via CommandValidator
 * - Protected token storage (sanitized and abstracted)
 * - Diagnostics and device probing
 * - Modular capability delegates (AppLauncher)
 */

import {
  ConnectionState,
  IAppLauncher,
  ICommandValidator,
  ITVController,
  SamsungTVConfig,
  TVDeviceInfo,
  TVLogEntry,
  ValidRemoteKey,
} from '../types/tv.types.ts';
import { defaultValidator } from './commandValidator.ts';
import { ModularAppLauncher } from './modularAppLauncher.ts';
import { SamsungWebSocket } from './samsungWebSocket.ts';

const TOKEN_STORAGE_KEY_PREFIX = 'samsung_tv_token_';

export interface TVControllerListener {
  onStateChange?: (state: ConnectionState) => void;
  onTokenChange?: (tokenMasked: string | null) => void;
  onLog?: (entry: TVLogEntry) => void;
  onError?: (error: string) => void;
}

export class SamsungTVController implements ITVController {
  private socket: SamsungWebSocket;
  private validator: ICommandValidator;
  public appLauncher: IAppLauncher;
  private currentConfig: SamsungTVConfig | null = null;
  private listeners = new Set<TVControllerListener>();
  private logHistory: TVLogEntry[] = [];

  constructor(validator: ICommandValidator = defaultValidator) {
    this.validator = validator;
    this.socket = new SamsungWebSocket({
      onStateChange: (state) => this.handleStateChange(state),
      onTokenReceived: (token) => this.handleTokenReceived(token),
      onTokenInvalidated: () => this.handleTokenInvalidated(),
      onMessage: (event, data) => this.log('info', `Socket event: ${event}`, data),
      onError: (err) => this.handleError(err),
      onLog: (level, msg, data) => this.log(level, msg, data),
    });

    this.appLauncher = new ModularAppLauncher(
      () => this.currentConfig?.host || '',
      (event, data) => this.socket.emitEvent(event, data)
    );
  }

  public addListener(listener: TVControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getConnectionState(): ConnectionState {
    return this.socket.getState();
  }

  public getConfig(): SamsungTVConfig | null {
    return this.currentConfig;
  }

  public emitSocketEvent(event: string, data?: Record<string, unknown>): boolean {
    return this.socket.emitEvent(event, data);
  }

  /**
   * Generates a unique local storage key based on the host IP
   */
  private getStorageKey(host: string): string {
    return `${TOKEN_STORAGE_KEY_PREFIX}${host.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /**
   * Retrieves stored auth token from secure local storage
   */
  public getStoredToken(host?: string): string | null {
    const targetHost = host || this.currentConfig?.host;
    if (!targetHost) {
      return null;
    }
    try {
      return localStorage.getItem(this.getStorageKey(targetHost));
    } catch {
      return null;
    }
  }

  /**
   * Safely stores acquired authentication token
   */
  private setStoredToken(host: string, token: string) {
    try {
      localStorage.setItem(this.getStorageKey(host), token);
    } catch {
      // ignore
    }
  }

  /**
   * Removes saved token for the current or specified host
   */
  public clearStoredToken(host?: string) {
    const targetHost = host || this.currentConfig?.host;
    if (targetHost) {
      try {
        localStorage.removeItem(this.getStorageKey(targetHost));
      } catch {
        // ignore
      }
    }
    this.notifyTokenChange(null);
    this.log('info', 'Auth token cleared. Next connection will require TV pairing approval.');
  }

  /**
   * Returns a masked representation of the token for secure UI display
   */
  public getMaskedToken(token: string | null): string | null {
    if (!token) return null;
    if (token.length <= 4) return '••••';
    return `••••••••${token.slice(-4)}`;
  }

  /**
   * Initiates TV connection using the provided configuration
   */
  public async connect(config: SamsungTVConfig): Promise<boolean> {
    const host = config.host.trim();
    if (!host) {
      this.handleError('TV Host IP is required.');
      return false;
    }

    // Auto-populate token from local storage if not explicitly provided
    const token = config.token !== undefined ? config.token : this.getStoredToken(host);

    this.currentConfig = {
      ...config,
      host,
      port: config.port || 8002,
      appName: config.appName || 'SamsungRemoteApp',
      token,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
    };

    this.notifyTokenChange(this.getMaskedToken(token));
    return this.socket.connect(this.currentConfig);
  }

  /**
   * Disconnects the TV WebSocket session
   */
  public disconnect() {
    this.socket.disconnect();
  }

  /**
   * Sends a key command to the TV after passing through the Security Command Validator.
   * Rejects any unvalidated, unauthorized, or malformed commands.
   */
  public async sendKey(rawKey: ValidRemoteKey | string): Promise<boolean> {
    const validation = this.validator.validateKey(rawKey);

    if (!validation.isValid || !validation.sanitizedKey) {
      const errorMsg = validation.error || `Command validation failed for '${rawKey}'`;
      this.log('error', `BLOCKED: ${errorMsg}`);
      this.handleError(errorMsg);
      return false;
    }

    const key = validation.sanitizedKey;

    if (this.getConnectionState() !== 'CONNECTED') {
      const err = `Cannot dispatch '${key}': TV is not in CONNECTED state (Current: ${this.getConnectionState()}).`;
      this.log('warn', err);
      this.handleError(err);
      return false;
    }

    const success = this.socket.sendRemoteKey(key);
    if (success) {
      this.log('success', `Executed verified command: ${key}`);
    }
    return success;
  }

  /**
   * Probes diagnostic device information via HTTP GET http://<host>:8001/api/v2/
   * Falls back to server-side relay proxy (/api/tv/diagnostics) if browser Mixed Content blocks direct LAN HTTP.
   */
  public async probeDeviceInfo(host: string): Promise<TVDeviceInfo | null> {
    const trimmedHost = host.trim();
    if (!trimmedHost) return null;

    // Attempt 1: Direct LAN fetch (works on native/Capacitor or non-HTTPS origins)
    try {
      this.log('info', `Probing device diagnostics on http://${trimmedHost}:8001/api/v2/...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`http://${trimmedHost}:8001/api/v2/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const device = json.device || {};

        // Privacy defense: sanitize raw object to guarantee NO serial numbers
        const sanitizedRaw = { ...json };
        delete sanitizedRaw.device?.serialNumber;
        delete sanitizedRaw.device?.duid;
        delete sanitizedRaw.serialNumber;
        delete sanitizedRaw.duid;

        const info: TVDeviceInfo = {
          name: device.name,
          modelName: device.modelName,
          deviceType: device.type,
          mac: device.mac,
          wifiMac: device.wifiMac,
          networkType: device.networkType,
          tokenAuthSupport: device.TokenAuthSupport === 'true' || device.TokenAuthSupport === true,
          powerState: device.PowerState,
          raw: sanitizedRaw,
        };

        this.log('success', `Diagnostic probe confirmed TV: ${info.modelName || 'Samsung Smart TV'}`);
        return info;
      }
    } catch {
      // Direct LAN fetch might fail due to HTTPS mixed-content. Fall back to relay.
    }

    // Attempt 2: Server-side relay probe
    try {
      this.log('info', `Probing via server relay for ${trimmedHost}...`);
      const relayRes = await fetch(`/api/tv/diagnostics?ip=${encodeURIComponent(trimmedHost)}`);
      if (relayRes.ok) {
        const data = await relayRes.json();
        if (data.success && data.device) {
          const dev = data.device;
          const info: TVDeviceInfo = {
            name: dev.name,
            modelName: dev.modelName,
            deviceType: dev.deviceType,
            networkType: dev.networkType,
            tokenAuthSupport: dev.tokenAuthSupport,
            powerState: dev.powerState,
            raw: dev,
          };
          this.log('success', `Relay probe confirmed TV: ${info.modelName || 'Samsung Smart TV'}`);
          return info;
        }
      }
    } catch {
      // Server relay unreachable
    }

    this.log('warn', `Diagnostic probe to ${trimmedHost} was not reachable.`);
    return null;
  }

  private handleStateChange(state: ConnectionState) {
    this.listeners.forEach((l) => l.onStateChange?.(state));
  }

  private handleTokenInvalidated() {
    if (this.currentConfig?.host) {
      this.clearStoredToken(this.currentConfig.host);
      this.currentConfig.token = null;
    }
    this.notifyTokenChange(null);
    this.log('warn', 'Security notice: Stored authorization token was invalidated by the TV and cleared from local cache.');
  }

  private handleTokenReceived(token: string) {
    if (this.currentConfig?.host) {
      this.setStoredToken(this.currentConfig.host, token);
      this.currentConfig.token = token;
    }
    this.notifyTokenChange(this.getMaskedToken(token));
  }

  private notifyTokenChange(maskedToken: string | null) {
    this.listeners.forEach((l) => l.onTokenChange?.(maskedToken));
  }

  private handleError(error: string) {
    this.listeners.forEach((l) => l.onError?.(error));
  }

  public log(level: 'info' | 'warn' | 'error' | 'success', message: string, data?: unknown) {
    const entry: TVLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      data,
    };
    this.logHistory.unshift(entry);
    if (this.logHistory.length > 100) {
      this.logHistory.pop();
    }
    this.listeners.forEach((l) => l.onLog?.(entry));
  }

  public getLogs(): TVLogEntry[] {
    return [...this.logHistory];
  }
}

export const tvController = new SamsungTVController();
