import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionState, SamsungTVConfig, TVDeviceInfo, ValidRemoteKey } from '../types/tv.types';
import { mobileValidator } from './commandValidator';

export type { ConnectionState, ValidRemoteKey };

const TOKEN_STORAGE_KEY_PREFIX = '@samsung_tv_token_';

export interface MobileTVControllerListener {
  onStateChange?: (state: ConnectionState) => void;
  onTokenChange?: (tokenMasked: string | null) => void;
  onError?: (error: string) => void;
}

export class SamsungTVControllerNative {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private currentHost = '';
  private currentPort = 8002;
  private currentToken: string | null = null;
  private currentAppName = 'SamsungMobileRemote';
  private autoReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: any = null;
  private listeners = new Set<MobileTVControllerListener>();

  public addListener(listener: MobileTVControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.listeners.forEach((l) => l.onStateChange?.(newState));
  }

  private notifyError(err: string): void {
    this.listeners.forEach((l) => l.onError?.(err));
  }

  private getStorageKey(host: string): string {
    return `${TOKEN_STORAGE_KEY_PREFIX}${host.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  public getMaskedToken(token: string | null): string | null {
    if (!token) return null;
    const len = token.length;
    if (len <= 4) return '••••';
    return `••••••••${token.slice(-4)}`;
  }

  public async getStoredToken(host: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.getStorageKey(host));
    } catch {
      return null;
    }
  }

  public async saveToken(host: string, token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getStorageKey(host), token);
      this.currentToken = token;
      this.listeners.forEach((l) => l.onTokenChange?.(this.getMaskedToken(token)));
    } catch (e) {
      console.warn('Failed to persist token:', e);
    }
  }

  public async clearStoredToken(host: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.getStorageKey(host));
      if (this.currentHost === host) {
        this.currentToken = null;
        this.listeners.forEach((l) => l.onTokenChange?.(null));
      }
    } catch (e) {
      console.warn('Failed to clear token:', e);
    }
  }

  public async connect(config: SamsungTVConfig): Promise<boolean> {
    this.currentHost = config.host.trim();
    this.currentPort = config.port || 8002;
    this.currentAppName = config.appName || 'SamsungMobileRemote';
    this.autoReconnect = config.autoReconnect ?? true;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;

    if (!this.currentHost) {
      this.setState('ERROR');
      this.notifyError('TV IP address cannot be empty.');
      return false;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    // Load stored token if not provided
    if (!this.currentToken) {
      this.currentToken = await this.getStoredToken(this.currentHost);
    }

    const protocol = this.currentPort === 8002 ? 'wss://' : 'ws://';
    const encodedName = Buffer
      ? Buffer.from(this.currentAppName).toString('base64')
      : btoa(this.currentAppName);

    let url = `${protocol}${this.currentHost}:${this.currentPort}/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(encodedName)}`;
    if (this.currentToken) {
      url += `&token=${encodeURIComponent(this.currentToken)}`;
    }

    this.setState(this.currentToken ? 'CONNECTING' : 'PAIRING');

    return new Promise<boolean>((resolve) => {
      try {
        this.ws = new WebSocket(url);
      } catch (err: any) {
        this.setState('ERROR');
        this.notifyError(`Failed to create WebSocket: ${err?.message || err}`);
        resolve(false);
        return;
      }

      let resolved = false;

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        if (this.currentToken) {
          this.setState('CONNECTED');
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        } else {
          this.setState('PAIRING');
        }
      };

      this.ws.onmessage = async (event: any) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'ms.channel.connect') {
            if (data.data?.token) {
              await this.saveToken(this.currentHost, data.data.token);
              this.setState('CONNECTED');
              if (!resolved) {
                resolved = true;
                resolve(true);
              }
            } else if (data.data?.clients) {
              this.setState('CONNECTED');
              if (!resolved) {
                resolved = true;
                resolve(true);
              }
            }
          } else if (data.event === 'ms.channel.unauthorized') {
            this.setState('ERROR');
            this.notifyError('TV authorization denied or token invalid. Please clear token and re-pair.');
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }
        } catch {
          // non-json or ping
        }
      };

      this.ws.onerror = (err: any) => {
        const msg = err?.message || 'WebSocket error. Ensure TV is on and connected to same Wi-Fi.';
        this.notifyError(msg);
      };

      this.ws.onclose = () => {
        const wasConnected = this.state === 'CONNECTED';
        this.ws = null;
        if (wasConnected && this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.setState('RECONNECTING');
          this.reconnectAttempts++;
          this.reconnectTimer = setTimeout(() => {
            this.connect({
              host: this.currentHost,
              port: this.currentPort,
              appName: this.currentAppName,
            });
          }, 3000);
        } else if (this.state !== 'ERROR') {
          this.setState('DISCONNECTED');
        }
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };
    });
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.autoReconnect = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setState('DISCONNECTED');
  }

  public async sendKey(rawKey: string): Promise<boolean> {
    const validation = mobileValidator.validateKey(rawKey);
    if (!validation.valid || !validation.key) {
      this.notifyError(validation.error || 'Command rejected by whitelist');
      return false;
    }

    if (!this.ws || this.state !== 'CONNECTED') {
      this.notifyError('Cannot send key: Remote is not connected to Samsung TV.');
      return false;
    }

    const payload = {
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: validation.key,
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey',
      },
    };

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (e: any) {
      this.notifyError(`Failed to send key: ${e?.message || e}`);
      return false;
    }
  }

  public async probeDeviceInfo(host: string): Promise<TVDeviceInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://${host}:8001/api/v2/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        id: data.device?.id || data.id || 'samsung_tv',
        name: data.device?.name || data.name || 'Samsung Smart TV',
        modelName: data.device?.modelName || data.modelName || 'UE55TU8500',
        version: data.device?.version || data.version || 'Tizen',
        ip: host,
      };
    } catch {
      return null;
    }
  }
}

export const mobileTvController = new SamsungTVControllerNative();
