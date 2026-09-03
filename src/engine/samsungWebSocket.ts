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

export class SamsungWebSocket {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private isManuallyClosed = false;
  private currentHost = '';
  private currentPort = 8002;
  private currentAppName = 'SamsungRemoteApp';
  private currentToken: string | null = null;
  private autoReconnect = false;
  private maxReconnectAttempts = 5;

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
        this.events.onError?.('TV IP address / host cannot be empty.');
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
        `Initiating socket connection to ${protocol}${this.currentHost}:${this.currentPort} (Token: ${this.currentToken ? 'Provided' : 'None - Pairing Required'})`
      );

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.setState('ERROR');
        this.events.onError?.(`Failed to construct WebSocket: ${errorMsg}`);
        resolve(false);
        return;
      }

      let connectionResolved = false;

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.events.onLog?.('info', 'WebSocket transport opened with TV endpoint.');
        
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
            'No token provided: Check TV screen now and click "Allow" on the prompt.'
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
          this.events.onLog?.('warn', 'Received non-JSON message frame from TV', messageEvent.data);
        }
      };

      this.ws.onerror = () => {
        this.stopHeartbeat();
        this.events.onLog?.(
          'error',
          `WebSocket connection error. If using port 8002 in browser, ensure TV self-signed certificate is accepted or TV is on and reachable at ${this.currentHost}.`
        );
        this.events.onError?.(
          `Unable to connect to Samsung TV at ${this.currentHost}:${this.currentPort}. Verify LAN IP, TV power state, and WSS SSL acceptance.`
        );
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
          `WebSocket closed with code ${closeEvent.code}: ${closeEvent.reason || 'Normal/Clean close'}`
        );
        this.ws = null;

        if (!this.isManuallyClosed && this.autoReconnect && this.state !== 'PAIRING' && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setState('DISCONNECTED');
        }

        if (!connectionResolved) {
          connectionResolved = true;
          resolve(false);
        }
      };
    });
  }

  /**
   * Processes inbound frames from the Samsung Remote Channel
   */
  private handleIncomingMessage(msg: Record<string, unknown>) {
    const event = typeof msg.event === 'string' ? msg.event : '';
    const data = (msg.data as Record<string, unknown>) || {};

    this.events.onMessage?.(event, msg);

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
        this.events.onLog?.('error', 'TV error event received', msg);
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
   * Closes the active connection and cancels any pending reconnects
   */
  public disconnect() {
    this.isManuallyClosed = true;
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
