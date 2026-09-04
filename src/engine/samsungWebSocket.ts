/**
 * Samsung TV Low-Level WebSocket Transport Engine
 * 
 * Handles:
 * - WSS (port 8002) / WS (port 8001) connection lifecycle
 * - Base64 client name encoding
 * - Interactive token handshake and extraction
 * - Automatic reconnection with backoff
 * - Socket heartbeat & error handling
 */

import { ConnectionState, SamsungRemotePacket, ValidRemoteKey } from '../types/tv.types.ts';

export interface SamsungWebSocketEvents {
  onStateChange: (state: ConnectionState) => void;
  onTokenReceived: (token: string) => void;
  onTokenInvalidated?: () => void;
  onMessage: (event: string, data: unknown) => void;
  onError: (error: string) => void;
  onLog: (level: 'info' | 'warn' | 'error' | 'success', message: string, data?: unknown) => void;
}

/**
 * Client-side probe to test if TV's SSL certificate on port 8002 is trusted in the browser
 */
export async function checkTvSslCertificate(host: string, port = 8002, timeoutMs = 2500): Promise<boolean> {
  const cleanHost = (host || '').trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!cleanHost) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // mode: 'no-cors' allows pinging the TV over HTTPS.
    // If the TV is reachable and certificate is accepted, it succeeds (returns opaque response).
    // If the certificate is rejected or host unreachable, it throws a TypeError.
    await fetch(`https://${cleanHost}:${port}/api/v2/`, {
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export class SamsungWebSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private isManuallyClosed = false;
  private hasSuccessfullyConnected = false;
  private currentHost = '';
  private currentPort = 8002;
  private currentAppName = 'SamsungRemoteApp';
  private currentToken: string | null = null;
  private autoReconnect = false;
  private maxReconnectAttempts = 5;
  private pendingAppLaunch: {
    appId: string;
    appName: string;
    dispatchedAt: number;
  } | null = null;

  constructor(private events: Partial<SamsungWebSocketEvents> = {}) {}

  public getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.events.onStateChange?.(newState);
      this.events.onLog?.('info', `Connection state changed to: ${newState}`);
    }
  }

  /**
   * Encodes the application name to standard Base64 for TV handshake
   */
  private encodeAppName(name: string): string {
    try {
      return btoa(name);
    } catch {
      // Fallback if btoa fails on non-latin
      return btoa(encodeURIComponent(name));
    }
  }

  /**
   * Connects to the Samsung TV WebSocket service
   */
  public connect(params: {
    host: string;
    port?: number;
    appName?: string;
    token?: string | null;
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      this.clearReconnectTimer();
      this.stopHeartbeat();
      this.isManuallyClosed = false;
      if (this.reconnectAttempts === 0) {
        this.hasSuccessfullyConnected = false;
      }

      const rawHost = params.host.trim();
      // Sanitize host IP (strip protocols, paths, and ports)
      this.currentHost = rawHost.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
      this.currentPort = params.port || 8002;
      this.currentAppName = params.appName || 'SamsungRemoteApp';
      this.currentToken = params.token || null;
      this.autoReconnect = params.autoReconnect ?? false;
      this.maxReconnectAttempts = params.maxReconnectAttempts ?? 5;

      if (!this.currentHost) {
        this.setState('ERROR');
        this.events.onError?.('TV IP adresi / ana bilgisayar boş bırakılamaz.');
        resolve(false);
        return;
      }

      // If already connected, close first
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore
        }
        this.ws = null;
      }

      const isSecure = this.currentPort === 8002;
      const protocol = isSecure ? 'wss://' : 'ws://';
      const encodedName = this.encodeAppName(this.currentAppName);

      let url = `${protocol}${this.currentHost}:${this.currentPort}/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(encodedName)}`;
      if (this.currentToken) {
        url += `&token=${encodeURIComponent(this.currentToken)}`;
      }

      this.setState(this.currentToken ? 'CONNECTING' : 'PAIRING');
      this.events.onLog?.(
        'info',
        `TV WebSocket soket bağlantısı başlatılıyor: ${protocol}${this.currentHost}:${this.currentPort} (Jeton: ${this.currentToken ? 'Mevcut' : 'Yok - Eşleştirme Gerekli'})`
      );

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.setState('ERROR');
        this.events.onError?.(`WebSocket oluşturulamadı: ${errorMsg}`);
        resolve(false);
        return;
      }

      let connectionResolved = false;

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.hasSuccessfullyConnected = true;
        this.startHeartbeat();
        this.events.onLog?.('info', 'WebSocket kanalı TV uç noktası ile başarıyla açıldı.');
        
        // If we connected with token, we are active. If not, TV displays permission prompt.
        if (this.currentToken) {
          this.setState('CONNECTED');
          if (!connectionResolved) {
            connectionResolved = true;
            resolve(true);
          }
        } else {
          this.setState('PAIRING');
          this.events.onLog?.(
            'warn',
            'Jeton henüz onaylanmadı: TV ekranındaki "İzin Ver" (Allow) uyarısını kumandanızla onaylayın.'
          );
        }
      };

      this.ws.onmessage = (messageEvent) => {
        try {
          const payload = JSON.parse(messageEvent.data as string);
          this.handleIncomingMessage(payload);

          if (!connectionResolved && this.state === 'CONNECTED') {
            connectionResolved = true;
            resolve(true);
          }
        } catch (err) {
          this.events.onLog?.('warn', 'TV uç noktasından JSON olmayan mesaj alındı', messageEvent.data);
        }
      };

      this.ws.onerror = () => {
        this.stopHeartbeat();
        const isPort8002 = this.currentPort === 8002;
        const certUrl = `https://${this.currentHost}:8002/api/v2/`;
        const logMsg = isPort8002
          ? `WebSocket bağlantı hatası. Port 8002 (WSS) için TV'nin kendinden imzalı SSL sertifikasını tarayıcınızda onaylayın (${certUrl}) veya TV'nin açık ve ${this.currentHost} adresinde yerel ağda erişilebilir olduğunu kontrol edin.`
          : `WebSocket bağlantı hatası. TV'nin açık ve ${this.currentHost}:${this.currentPort} adresinde yerel ağda erişilebilir olduğundan emin olun.`;

        const userErrMsg = isPort8002
          ? `Samsung TV'ye (${this.currentHost}:${this.currentPort}) bağlanılamadı. Tarayıcınız TV'nin SSL sertifikasını engelliyor olabilir. Lütfen SSL onay linkine tıklayın ve TV'nin açık olduğundan emin olun.`
          : `Samsung TV'ye (${this.currentHost}:${this.currentPort}) bağlanılamadı. TV'nin açık ve aynı yerel ağda (Wi-Fi) olduğunu doğrulayın.`;

        this.events.onLog?.('error', logMsg);
        this.events.onError?.(userErrMsg);
        this.setState('ERROR');
        if (!connectionResolved) {
          connectionResolved = true;
          resolve(false);
        }
      };

      this.ws.onclose = (closeEvent) => {
        this.stopHeartbeat();
        this.events.onLog?.(
          'info',
          `WebSocket kapandı (kod ${closeEvent.code}): ${closeEvent.reason || 'Bağlantı kesildi / temiz kapanış'}`
        );
        this.ws = null;

        // Only auto-reconnect if the socket was PREVIOUSLY connected and open, NOT on initial handshake failure
        if (
          !this.isManuallyClosed &&
          this.autoReconnect &&
          this.hasSuccessfullyConnected &&
          this.state !== 'PAIRING' &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        } else {
          this.clearReconnectTimer();
          if (this.state !== 'ERROR') {
            this.setState('DISCONNECTED');
          }
        }

        if (!connectionResolved) {
          connectionResolved = true;
          resolve(false);
        }
      };
    });
  }

  /**
   * Tracks an outgoing app launch intent to correlate asynchronous TV responses
   */
  public trackPendingAppLaunch(appId: string, appName = 'YouTube'): void {
    const cleanAppId = String(appId).trim();
    this.pendingAppLaunch = {
      appId: cleanAppId,
      appName,
      dispatchedAt: Date.now(),
    };
    this.events.onLog?.(
      'info',
      `[WebSocket:AppLaunch:TRACK] Awaiting TV status confirmation for ${appName} (ID: "${cleanAppId}", Type: string)...`
    );
  }

  /**
   * Processes inbound frames from the Samsung Remote Channel
   */
  private handleIncomingMessage(msg: Record<string, unknown>) {
    const event = typeof msg.event === 'string' ? msg.event : '';
    const data = (msg.data as Record<string, unknown>) || {};

    this.events.onMessage?.(event, msg);

    // Provide low-level frame telemetry for live debugging
    const rawFrameStr = JSON.stringify(msg.data !== undefined ? msg.data : msg);
    this.events.onLog?.('info', `[WebSocket:DEBUG:FRAME] Event="${event || 'unnamed'}" | Data: ${rawFrameStr.slice(0, 240)}`);

    switch (event) {
      case 'ms.channel.connect': {
        this.events.onLog?.('success', 'Samsung TV accepted connection.');
        
        // Check if TV returned a token
        const receivedToken = typeof data.token === 'string' ? data.token : null;
        if (receivedToken) {
          this.currentToken = receivedToken;
          this.events.onTokenReceived?.(receivedToken);
          this.events.onLog?.(
            'success',
            `Auth token received and secured (length: ${receivedToken.length})`
          );
        }
        
        this.setState('CONNECTED');
        break;
      }

      case 'ms.channel.unauthorized': {
        this.clearReconnectTimer();
        this.stopHeartbeat();
        this.currentToken = null;
        this.events.onTokenInvalidated?.();
        this.setState('PAIRING');
        this.events.onError?.(
          'Connection unauthorized: The TV rejected or revoked the previous authorization token. Stored token cleared. Please click Connect to re-authorize.'
        );
        this.events.onLog?.('error', 'TV responded with ms.channel.unauthorized. Invalidated stored token and reset to PAIRING.');
        break;
      }

      case 'ms.channel.ready': {
        this.events.onLog?.('info', 'TV remote channel is ready.');
        if (this.state !== 'CONNECTED') {
          this.setState('CONNECTED');
        }
        break;
      }

      case 'ms.error': {
        const isRecentLaunch = Boolean(
          this.pendingAppLaunch && Date.now() - this.pendingAppLaunch.dispatchedAt < 10000
        );
        const appLabel = isRecentLaunch
          ? ` [During launch of ${this.pendingAppLaunch?.appName} (ID: ${this.pendingAppLaunch?.appId})]`
          : '';

        const errCode = (data as Record<string, unknown>).code ?? (msg as Record<string, unknown>).code ?? 'UNKNOWN';
        const errMsg = (data as Record<string, unknown>).message ?? (msg as Record<string, unknown>).message ?? JSON.stringify(msg);

        this.events.onLog?.(
          'error',
          `[WebSocket:AppLaunch:ERROR] ✗ Samsung TV returned error${appLabel}: Code=${errCode} - ${errMsg}`,
          msg
        );
        break;
      }

      case 'ed.apps.launch': {
        // Evaluate raw return value from Samsung Tizen firmware
        let statusCode: number | null = null;
        let statusString: string | null = null;

        if (typeof msg.data === 'number') {
          statusCode = msg.data;
        } else if (typeof msg.data === 'string') {
          const parsed = parseInt(msg.data, 10);
          if (!isNaN(parsed)) statusCode = parsed;
          else statusString = msg.data;
        } else if (typeof data === 'object' && data !== null) {
          const candidate = (data as Record<string, unknown>).data ??
                            (data as Record<string, unknown>).code ??
                            (data as Record<string, unknown>).status;
          if (typeof candidate === 'number') statusCode = candidate;
          else if (typeof candidate === 'string') {
            const parsed = parseInt(candidate, 10);
            if (!isNaN(parsed)) statusCode = parsed;
            else statusString = candidate;
          }
        }

        const isRecentLaunch = Boolean(
          this.pendingAppLaunch && Date.now() - this.pendingAppLaunch.dispatchedAt < 15000
        );
        const appLabel = isRecentLaunch && this.pendingAppLaunch
          ? `[Target: ${this.pendingAppLaunch.appName} | ID: "${this.pendingAppLaunch.appId}"]`
          : '[App Launch]';

        if (statusCode === 200 || statusString === 'success' || msg.data === true) {
          this.events.onLog?.(
            'success',
            `[WebSocket:AppLaunch:SUCCESS] ✓ Samsung TV confirmed app launch ${appLabel}: Status Code 200 OK via ed.apps.launch`,
            msg
          );
        } else if (statusCode === 404) {
          this.events.onLog?.(
            'error',
            `[WebSocket:AppLaunch:ERROR] ✗ Samsung TV returned Error Code 404 ${appLabel}: App ID not recognized or not installed on T-NKLDEUC firmware. Check Smart Hub installed apps.`,
            msg
          );
        } else if (statusCode === 401 || statusCode === 403) {
          this.events.onLog?.(
            'error',
            `[WebSocket:AppLaunch:ERROR] ✗ Samsung TV returned Permission Denied (HTTP ${statusCode}) ${appLabel}: WebSocket client lacks token authorization for app execution.`,
            msg
          );
        } else if (statusCode !== null) {
          this.events.onLog?.(
            'warn',
            `[WebSocket:AppLaunch:CODE] Samsung TV ed.apps.launch returned status code: ${statusCode} ${appLabel}`,
            msg
          );
        } else {
          this.events.onLog?.(
            'info',
            `[WebSocket:AppLaunch:DATA] Samsung TV ed.apps.launch received frame ${appLabel}: ${JSON.stringify(msg)}`,
            msg
          );
        }
        break;
      }

      case 'ms.application.start': {
        const isRecentLaunch = Boolean(
          this.pendingAppLaunch && Date.now() - this.pendingAppLaunch.dispatchedAt < 15000
        );
        const appLabel = isRecentLaunch && this.pendingAppLaunch
          ? `[Target: ${this.pendingAppLaunch.appName} | ID: "${this.pendingAppLaunch.appId}"]`
          : '[App Launch]';

        this.events.onLog?.(
          'success',
          `[WebSocket:AppLaunch:SUCCESS] ✓ Samsung TV confirmed application start (ms.application.start) ${appLabel}`,
          msg
        );
        break;
      }

      case 'ms.channel.emit': {
        const innerEvent = typeof (data as Record<string, unknown>).event === 'string' ? (data as Record<string, unknown>).event : '';
        if (innerEvent === 'ed.apps.launch') {
          this.events.onLog?.(
            'info',
            `[WebSocket:AppLaunch:DEBUG] TV relayed ms.channel.emit with inner event ed.apps.launch: ${JSON.stringify(msg)}`,
            msg
          );
        } else {
          this.events.onLog?.('info', `TV channel emit event: ${innerEvent || 'unnamed'}`, data);
        }
        break;
      }

      default: {
        this.events.onLog?.('info', `TV Event [${event || 'unknown'}] received`, data);
        break;
      }
    }
  }

  /**
   * Transmits a validated remote key packet to the TV
   */
  public sendRemoteKey(key: ValidRemoteKey): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.events.onLog?.('warn', `Cannot send ${key}: WebSocket is not in OPEN state.`);
      return false;
    }

    const packet: SamsungRemotePacket = {
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: key,
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey',
      },
    };

    try {
      this.ws.send(JSON.stringify(packet));
      this.events.onLog?.('success', `Dispatched key: ${key}`);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.events.onLog?.('error', `Failed to send key ${key}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Emits a modular channel event (e.g. ed.apps.launch) to the TV
   */
  public emitEvent(event: string, data: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.events.onLog?.('warn', `Cannot emit event ${event}: WebSocket is not in OPEN state.`);
      return false;
    }

    const packet = {
      method: 'ms.channel.emit',
      params: {
        event,
        to: 'host',
        data,
      },
    };

    try {
      this.ws.send(JSON.stringify(packet));
      this.events.onLog?.('success', `Emitted channel event: ${event}`);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.events.onLog?.('error', `Failed to emit event ${event}: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Transmits an arbitrary structured JSON packet across the authenticated WebSocket connection
   */
  public sendRawPacket(packet: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.events.onLog?.('warn', 'Cannot send packet: WebSocket is not in OPEN state.');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(packet));
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.events.onLog?.('error', `Failed to transmit packet: ${errorMsg}`);
      return false;
    }
  }

  public isOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  /**
   * Closes the active connection and cancels any pending reconnects
   */
  public disconnect() {
    this.isManuallyClosed = true;
    this.hasSuccessfullyConnected = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.reconnectAttempts = 0;

    if (this.ws) {
      try {
        this.ws.close(1000, 'User initiated disconnect');
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.setState('DISCONNECTED');
    this.events.onLog?.('info', 'Disconnected from TV.');
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.reconnectAttempts++;
    this.setState('RECONNECTING');

    // Exponential backoff with jitter: 2s, 4s, 8s, 16s...
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 20000);
    this.events.onLog?.(
      'warn',
      `Connection lost. Reconnecting in ${(delay / 1000).toFixed(1)}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    this.reconnectTimer = window.setTimeout(() => {
      this.connect({
        host: this.currentHost,
        port: this.currentPort,
        appName: this.currentAppName,
        token: this.currentToken,
        autoReconnect: this.autoReconnect,
        maxReconnectAttempts: this.maxReconnectAttempts,
      });
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Heartbeat to detect silent socket drops (e.g. TV standby or LAN routing changes)
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws) {
        if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
          this.events.onLog?.('warn', 'Heartbeat detected dead socket transport. Triggering reconnect...');
          this.stopHeartbeat();
          if (!this.isManuallyClosed && this.autoReconnect && this.state !== 'PAIRING') {
            this.scheduleReconnect();
          } else {
            this.setState('DISCONNECTED');
          }
        }
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
