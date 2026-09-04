/**
 * Modular Application Launcher Capability
 * 
 * Provides an isolated capability layer for launching Smart TV applications (like YouTube)
 * without hardcoding or tightly coupling application behaviors into the raw TV remote controller.
 * Can be cleanly extended by dedicated controllers (e.g. YouTubeController, VoiceIntentRouter).
 * 
 * Target Device: Samsung TU8500 Series (UE55TU8500UXTK)
 * Firmware Series: T-NKLDEUC (Tizen 5.5+)
 */

import { AppLaunchTelemetryRecord, DiscoveredAppInfo, IAppLauncher } from '../types/tv.types.ts';

export interface TvAppDefinition {
  readonly id: string;
  readonly name: string;
  readonly deepLinkSupported: boolean;
  readonly platformSeries: string;
  readonly alternateIds?: readonly string[];
}

/**
 * Verified Samsung Smart TV Application Registry
 * Standardized for T-NKLDEUC (Tizen 5.5+ 2020 Crystal UHD TU8000/TU8500 series)
 */
export const KNOWN_TV_APPS = {
  YOUTUBE: {
    id: '111299001912',
    name: 'YouTube',
    deepLinkSupported: true,
    platformSeries: 'T-NKLDEUC (Tizen 5.5+ / 2020 Crystal UHD TU8000/TU8500)',
    // Common package name aliases used internally across varying regional firmware revisions
    alternateIds: ['9Ur5IzDKqV.TizenYouTube', 'org.tizen.youtube'] as const,
  },
  NETFLIX: {
    id: '3201512006785',
    name: 'Netflix',
    deepLinkSupported: false,
    platformSeries: 'Universal Tizen',
    alternateIds: ['org.tizen.netflix-app'] as const,
  },
  BROWSER: {
    id: 'org.tizen.browser',
    name: 'Web Browser',
    deepLinkSupported: true,
    platformSeries: 'Universal Tizen',
  },
} as const;

export interface AppLaunchIntentDetails {
  targetAppId: string;
  appName: string;
  actionType: 'NATIVE_LAUNCH' | 'DEEP_LINK';
  actionUrl?: string;
  edenPayload: {
    method: 'ms.channel.emit';
    params: {
      event: 'ed.apps.launch';
      to: 'host';
      data: {
        appId: string;
        action_type: 'NATIVE_LAUNCH' | 'DEEP_LINK';
        metaTag?: string;
      };
    };
  };
  appStartPayload: {
    method: 'ms.application.start';
    params: {
      id: string;
      url?: string;
    };
  };
}

export type AppLauncherLogger = (
  level: 'info' | 'warn' | 'error' | 'success',
  message: string,
  data?: unknown
) => void;

export class ModularAppLauncher implements IAppLauncher {
  private getHost: () => string;
  private emitSocketEvent?: (event: string, data: Record<string, unknown>) => boolean;
  private sendRawPacketFn?: (packet: Record<string, unknown>) => boolean;
  private isSocketConnectedFn?: () => boolean;
  private logFn?: AppLauncherLogger;
  private trackPendingLaunchFn?: (appId: string, appName: string) => void;
  private requestInstalledAppsFn?: () => boolean;

  // Runtime dynamic application discovery state
  private discoveredApps: DiscoveredAppInfo[] = [];
  private resolvedYouTubeAppId: string | null = null;
  private isDiscovering = false;
  private discoveryWaiters: Array<(apps: DiscoveredAppInfo[]) => void> = [];

  // Granular Event Logging & Telemetry Tracking
  private telemetryHistory: AppLaunchTelemetryRecord[] = [];
  private telemetryListeners: Array<(record: AppLaunchTelemetryRecord) => void> = [];
  private activePendingLaunch: {
    telemetryId: string;
    appId: string;
    appName: string;
    dispatchedAt: number;
    timeoutTimer?: number;
  } | null = null;

  constructor(
    getHostFn: () => string,
    emitSocketFn?: (event: string, data: Record<string, unknown>) => boolean,
    sendRawPacketFn?: (packet: Record<string, unknown>) => boolean,
    isSocketConnectedFn?: () => boolean,
    logFn?: AppLauncherLogger,
    trackPendingLaunchFn?: (appId: string, appName: string) => void,
    requestInstalledAppsFn?: () => boolean
  ) {
    this.getHost = getHostFn;
    this.emitSocketEvent = emitSocketFn;
    this.sendRawPacketFn = sendRawPacketFn;
    this.isSocketConnectedFn = isSocketConnectedFn;
    this.logFn = logFn;
    this.trackPendingLaunchFn = trackPendingLaunchFn;
    this.requestInstalledAppsFn = requestInstalledAppsFn;
  }

  private notifyTelemetryListeners(record: AppLaunchTelemetryRecord) {
    for (const listener of this.telemetryListeners) {
      try {
        listener(record);
      } catch (err) {
        console.error('[AppLauncher:TelemetryListener] Error:', err);
      }
    }
  }

  public getLastLaunchTelemetry(): AppLaunchTelemetryRecord | null {
    return this.telemetryHistory[0] || null;
  }

  public getLaunchTelemetryHistory(): AppLaunchTelemetryRecord[] {
    return [...this.telemetryHistory];
  }

  public addTelemetryListener(listener: (record: AppLaunchTelemetryRecord) => void): () => void {
    this.telemetryListeners.push(listener);
    return () => {
      const idx = this.telemetryListeners.indexOf(listener);
      if (idx !== -1) {
        this.telemetryListeners.splice(idx, 1);
      }
    };
  }

  private log(level: 'info' | 'warn' | 'error' | 'success', message: string, data?: unknown) {
    if (this.logFn) {
      this.logFn(level, message, data);
    } else {
      const prefix = `[AppLauncher:${level.toUpperCase()}]`;
      if (level === 'error') console.error(prefix, message, data || '');
      else if (level === 'warn') console.warn(prefix, message, data || '');
      else console.log(prefix, message, data || '');
    }
  }

  public isAppLaunchSupported(): boolean {
    return Boolean(this.getHost());
  }

  /**
   * Constructs and verifies the exact command payload structure required
   * for launching native applications or deep-linking via the Samsung WebSocket API.
   * 
   * Strict Rules for T-NKLDEUC (Tizen 5.5):
   * - 'appId' MUST strictly be of type 'string' (e.g. "111299001912"). Numeric types fail Tizen schema validation.
   * - Both 'appId' and 'app_id' are included to guarantee cross-revision compatibility on T-NKLDEUC.
   * - When action_type === 'NATIVE_LAUNCH', 'metaTag' MUST NOT be included (empty strings cause parser rejection).
   * - When action_type === 'DEEP_LINK', 'metaTag' must contain the video query/URL.
   */
  public buildLaunchIntent(appId: string, actionUrl?: string): AppLaunchIntentDetails {
    // Strict T-NKLDEUC type validation:
    // Ensure cleanAppId is strictly a string (not a number or undefined)
    const rawType = typeof appId;
    const cleanAppId: string = String(appId ?? '').trim();

    if (rawType !== 'string') {
      this.log(
        'warn',
        `[AppLauncher:TYPE_GUARD] Non-string appId detected (type: ${rawType}). Coerced to strict string for T-NKLDEUC firmware: "${cleanAppId}"`
      );
    }

    this.log(
      'info',
      `[AppLauncher:DEBUG] Validating payload appId for T-NKLDEUC: typeof cleanAppId="${typeof cleanAppId}", value="${cleanAppId}", length=${cleanAppId.length}`
    );

    const hasDeepLink = Boolean(actionUrl && actionUrl.trim());
    const cleanActionUrl = hasDeepLink ? actionUrl!.trim() : undefined;
    const actionType: 'NATIVE_LAUNCH' | 'DEEP_LINK' = hasDeepLink ? 'DEEP_LINK' : 'NATIVE_LAUNCH';

    // Find human readable app name if known
    const knownApp = Object.values(KNOWN_TV_APPS).find(
      (app) => app.id === cleanAppId || (app as TvAppDefinition).alternateIds?.includes(cleanAppId)
    );
    const appName = knownApp ? knownApp.name : cleanAppId;

    // 1. EDEN Event Bus Payload: method="ms.channel.emit", event="ed.apps.launch"
    // On T-NKLDEUC (Tizen 5.5), appId must be a strict string.
    // We include both 'appId' and 'app_id' (string) to ensure compatibility across sub-revisions.
    const edenData: {
      appId: string;
      app_id: string;
      action_type: 'NATIVE_LAUNCH' | 'DEEP_LINK';
      metaTag?: string;
    } = {
      appId: cleanAppId,
      app_id: cleanAppId,
      action_type: actionType,
    };

    // ONLY add metaTag if deep-linking to prevent Samsung Tizen firmware parser rejection
    if (hasDeepLink && cleanActionUrl) {
      edenData.metaTag = cleanActionUrl;
    }

    const edenPayload = {
      method: 'ms.channel.emit' as const,
      params: {
        event: 'ed.apps.launch' as const,
        to: 'host' as const,
        data: edenData,
      },
    };

    // 2. Tizen 5.5+ Standard App Control Payload: method="ms.application.start"
    // Provide both 'id' and 'appId' as strict strings
    const appStartParams: { id: string; appId: string; url?: string } = {
      id: cleanAppId,
      appId: cleanAppId,
    };
    if (hasDeepLink && cleanActionUrl) {
      appStartParams.url = cleanActionUrl;
    }

    const appStartPayload = {
      method: 'ms.application.start' as const,
      params: appStartParams,
    };

    return {
      targetAppId: cleanAppId,
      appName,
      actionType,
      actionUrl: cleanActionUrl,
      edenPayload,
      appStartPayload,
    };
  }

  /**
   * Queries application metadata / running status from Tizen REST endpoint
   * GET http://<TV_IP>:8001/api/v2/applications/<appId>
   * Falls back to server relay proxy if direct browser fetch is blocked by CORS/Mixed-Content.
   */
  public async getAppStatus(appId: string): Promise<Record<string, unknown> | null> {
    const host = this.getHost();
    if (!host) {
      return null;
    }

    try {
      const url = `http://${host}:8001/api/v2/applications/${encodeURIComponent(appId)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        return (await response.json()) as Record<string, unknown>;
      }
    } catch {
      // Direct LAN fetch might be blocked by browser HTTPS Mixed Content or CORS
    }

    // Fallback: Server relay proxy
    try {
      const proxyUrl = `/api/tv/applications?ip=${encodeURIComponent(host)}&appId=${encodeURIComponent(appId)}`;
      const proxyRes = await fetch(proxyUrl);
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.success && proxyData.data) {
          return proxyData.data as Record<string, unknown>;
        }
      }
    } catch {
      // Proxy unavailable
    }

    return null;
  }

  /**
   * Dispatches application launch request to the TV.
   * 
   * Architecture Flow:
   * 1. Constructs validated intent & exact payload structures.
   * 2. Logs full intent details and payload data.
   * 3. Dispatches via authenticated WSS WebSocket (port 8002):
   *    - Transmits Primary EDEN event ("ed.apps.launch")
   *    - Transmits Tizen 5.5+ standard frame ("ms.application.start")
   * 4. If WebSocket is not connected, logs clear diagnosis and attempts fallback.
   */
  public async launchApp(appId: string, actionUrl?: string): Promise<boolean> {
    const host = this.getHost();
    const cleanAppId = (appId || '').trim();

    if (!cleanAppId) {
      this.log('error', '[AppLauncher] Launch rejected: Empty application ID provided.');
      return false;
    }

    // Build verified intent and payloads
    const intent = this.buildLaunchIntent(cleanAppId, actionUrl);

    // Exact JSON strings sent to TV
    const edenJson = JSON.stringify(intent.edenPayload, null, 2);
    const appStartJson = JSON.stringify(intent.appStartPayload, null, 2);
    const telemetryId = `launch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toLocaleTimeString();

    // Initialize telemetry record
    const telemetryRecord: AppLaunchTelemetryRecord = {
      id: telemetryId,
      timestamp,
      appId: intent.targetAppId,
      appName: intent.appName,
      actionType: intent.actionType,
      actionUrl: intent.actionUrl,
      targetHost: host ? `${host}:8002` : 'Unknown Host',
      outboundEdenJson: edenJson,
      outboundAppStartJson: appStartJson,
      responseStatus: 'PENDING',
      diagnosis: `Dispatched to TV (${host || 'Unknown'}:8002 WSS). Awaiting T-NKLDEUC WebSocket response frame...`,
    };

    this.telemetryHistory.unshift(telemetryRecord);
    if (this.telemetryHistory.length > 20) this.telemetryHistory.pop();
    this.notifyTelemetryListeners(telemetryRecord);

    // 1. Granular Logging: Exact Outbound JSON Payloads
    this.log(
      'info',
      `[AppLauncher:DISPATCH] >>> OUTBOUND APPLICATION LAUNCH REQUEST: App "${intent.appName}" (ID: "${intent.targetAppId}") | Mode: ${intent.actionType} | Target: ${host}:8002 (WSS)`
    );
    this.log(
      'info',
      `[AppLauncher:PAYLOAD:OUT:EDEN] Exact Outbound WebSocket JSON Frame (ed.apps.launch):\n${edenJson}`,
      intent.edenPayload
    );
    this.log(
      'info',
      `[AppLauncher:PAYLOAD:OUT:TIZEN] Exact Outbound Companion JSON Frame (ms.application.start):\n${appStartJson}`,
      intent.appStartPayload
    );
    this.log(
      'info',
      `[AppLauncher:PAYLOAD:STRUCTURE] T-NKLDEUC Schema Verification:\n  • appId: "${intent.targetAppId}" (type: ${typeof intent.targetAppId}, length: ${intent.targetAppId.length})\n  • app_id: "${intent.targetAppId}" (type: string)\n  • action_type: "${intent.actionType}"\n  • metaTag: ${intent.actionUrl ? `"${intent.actionUrl}"` : 'OMITTED (Prevents syntax rejection on Tizen 5.5)'}`
    );

    const isConnected = this.isSocketConnectedFn ? this.isSocketConnectedFn() : true;

    // Track pending app launch to correlate incoming TV WebSocket frames
    if (this.trackPendingLaunchFn) {
      this.trackPendingLaunchFn(intent.targetAppId, intent.appName);
    }

    // Configure timeout monitor for response tracking
    if (this.activePendingLaunch?.timeoutTimer) {
      window.clearTimeout(this.activePendingLaunch.timeoutTimer);
    }

    const timeoutTimer = window.setTimeout(() => {
      if (this.activePendingLaunch?.telemetryId === telemetryId) {
        const record = this.telemetryHistory.find((r) => r.id === telemetryId);
        if (record && record.responseStatus === 'PENDING') {
          record.responseStatus = 'TIMEOUT_SILENT';
          record.diagnosis = `TV did not return an explicit confirmation frame within 5000ms. On Samsung TU8500 (T-NKLDEUC), some apps launch without an ed.apps.launch response frame. If the app did not open, check TV power, local Wi-Fi, or click "Refresh App Discovery".`;
          this.notifyTelemetryListeners(record);
          this.log(
            'warn',
            `[AppLauncher:STATUS:TIMEOUT] TV did not return an explicit confirmation frame within 5000ms for "${intent.appName}" (ID: "${intent.targetAppId}").`
          );
        }
      }
    }, 5000);

    this.activePendingLaunch = {
      telemetryId,
      appId: intent.targetAppId,
      appName: intent.appName,
      dispatchedAt: Date.now(),
      timeoutTimer,
    };

    // If WebSocket is not in CONNECTED state, we cannot transmit via WSS
    if (!isConnected) {
      telemetryRecord.responseStatus = 'PERMISSION_DENIED_AUTH';
      telemetryRecord.diagnosis = `WebSocket not connected. TV (${host || 'Unknown'}) must be powered on and Port 8002 (WSS) connected before launching applications.`;
      this.notifyTelemetryListeners(telemetryRecord);
      this.log(
        'warn',
        `[AppLauncher:BLOCKED] TV ile aktif WebSocket bağlantısı bulunmuyor (TV: ${host || 'Bilinmiyor'}). ${intent.appName} (ID: ${intent.targetAppId}) uygulamasını açabilmek için TV'nin açık ve Port 8002 (WSS) üzerinden bağlı olması gerekir. Lütfen önce TV'ye bağlanın.`
      );
      return false;
    }

    // Attempt 1: Transmit via Active Authenticated WebSocket (Port 8002 WSS)
    // This is the verified authoritative channel for T-NKLDEUC-2740.1 firmware
    if (this.sendRawPacketFn || this.emitSocketEvent) {
      this.log(
        'info',
        `[AppLauncher:DEBUG] Transmitting verified payload for ${intent.appName} (appId: string = "${intent.targetAppId}", action_type: "${intent.actionType}") via WebSocket...`
      );

      let edenSent = false;
      if (this.sendRawPacketFn) {
        edenSent = this.sendRawPacketFn(intent.edenPayload);
      } else if (this.emitSocketEvent) {
        edenSent = this.emitSocketEvent('ed.apps.launch', intent.edenPayload.params.data);
      }

      // Also transmit Tizen 5.5+ standard ms.application.start frame for dual-firmware resilience
      if (this.sendRawPacketFn) {
        this.sendRawPacketFn(intent.appStartPayload);
      }

      if (edenSent) {
        this.log(
          'success',
          `[AppLauncher] ✓ Application launch command transmitted successfully to TV (${host}:8002). Awaiting TV confirmation...`
        );
        return true;
      }
    }

    // Attempt 2: Direct local network REST fetch to TV port 8001
    // (Note: Blocked by browser Mixed-Content if in HTTPS origin, or restricted by recent T-NKLDEUC firmware updates)
    if (host) {
      try {
        this.log(
          'info',
          `[AppLauncher] Attempting secondary REST POST http://${host}:8001/api/v2/applications/${intent.targetAppId}...`
        );
        const endpoint = `http://${host}:8001/api/v2/applications/${encodeURIComponent(intent.targetAppId)}`;
        const body = intent.actionUrl ? JSON.stringify({ action_data: intent.actionUrl }) : undefined;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (res.ok || res.status === 200 || res.status === 204) {
          this.log('success', `[AppLauncher] REST launch endpoint acknowledged request (Status ${res.status}).`);
          return true;
        } else {
          this.log('warn', `[AppLauncher] REST launch returned status ${res.status}: ${res.statusText}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log(
          'warn',
          `[AppLauncher] Direct REST fetch to TV port 8001 unavailable (${errorMsg}). Browser Mixed-Content restrictions or modern T-NKLDEUC security rules restrict unauthenticated HTTP.`
        );
      }
    }

    // Attempt 3: Server-side relay proxy
    if (host) {
      try {
        this.log('info', `[AppLauncher] Attempting server relay fallback (/api/tv/launch-app)...`);
        const relayRes = await fetch('/api/tv/launch-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: host,
            appId: intent.targetAppId,
            actionUrl: intent.actionUrl,
          }),
        });

        if (relayRes.ok) {
          const data = await relayRes.json();
          if (data.success) {
            this.log('success', `[AppLauncher] Server relay successfully contacted TV.`);
            return true;
          } else {
            this.log('warn', `[AppLauncher] Server relay reported: ${data.message || data.error}`);
          }
        }
      } catch {
        // Server proxy not reachable or network error
      }
    }

    this.log(
      'error',
      `[AppLauncher] ✗ App launch failed for "${intent.appName}" (${intent.targetAppId}). To launch apps on Samsung TU8500 (T-NKLDEUC), please ensure the TV is ON, connected to the local Wi-Fi, and the WebSocket status is CONNECTED with an authorized token.`
    );
    return false;
  }

  /**
   * Processes inbound WebSocket frames and errors related to application launching.
   * Logs exact JSON response payloads and provides granular diagnosis for T-NKLDEUC firmware.
   */
  public handleWebSocketResponse(event: string, rawMsg: unknown): void {
    const rawJson = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg, null, 2);
    const msgObj = (rawMsg && typeof rawMsg === 'object' ? rawMsg : {}) as Record<string, unknown>;
    const msgData = msgObj.data;

    // Filter events relevant to application launching or session authorization
    const isLaunchEvent =
      event === 'ed.apps.launch' ||
      event === 'ms.application.start' ||
      event === 'ms.error' ||
      event === 'ms.channel.unauthorized' ||
      (event === 'ms.channel.emit' &&
        ((msgData as Record<string, unknown>)?.event === 'ed.apps.launch' ||
         (msgData as Record<string, unknown>)?.event === 'ms.application.start'));

    if (!isLaunchEvent && !this.activePendingLaunch) {
      return;
    }

    const active = this.activePendingLaunch;
    const targetRecord = active
      ? this.telemetryHistory.find((r) => r.id === active.telemetryId)
      : this.telemetryHistory[0];

    // Clear timeout if a response arrived
    if (
      active?.timeoutTimer &&
      (event === 'ed.apps.launch' ||
        event === 'ms.application.start' ||
        event === 'ms.error' ||
        event === 'ms.channel.unauthorized')
    ) {
      window.clearTimeout(active.timeoutTimer);
      active.timeoutTimer = undefined;
    }

    // 2. Granular Logging: Exact Inbound WebSocket Response Payload
    this.log(
      'info',
      `[AppLauncher:RESPONSE:IN] <<< INBOUND TV WEBSOCKET EVENT: "${event}"\n[AppLauncher:RESPONSE:EXACT_JSON]\n${rawJson}`,
      rawMsg
    );

    if (
      event === 'ed.apps.launch' ||
      (event === 'ms.channel.emit' && (msgData as Record<string, unknown>)?.event === 'ed.apps.launch')
    ) {
      let statusCode: number | null = null;
      let statusString: string | null = null;

      const evalData =
        event === 'ms.channel.emit' ? (msgData as Record<string, unknown>)?.data : msgData;

      if (typeof evalData === 'number') {
        statusCode = evalData;
      } else if (typeof evalData === 'string') {
        const parsed = parseInt(evalData, 10);
        if (!isNaN(parsed)) statusCode = parsed;
        else statusString = evalData;
      } else if (typeof evalData === 'object' && evalData !== null) {
        const candidate =
          (evalData as Record<string, unknown>).data ??
          (evalData as Record<string, unknown>).code ??
          (evalData as Record<string, unknown>).status;
        if (typeof candidate === 'number') statusCode = candidate;
        else if (typeof candidate === 'string') {
          const parsed = parseInt(candidate, 10);
          if (!isNaN(parsed)) statusCode = parsed;
          else statusString = candidate;
        }
      }

      if (targetRecord) {
        targetRecord.responseEvent = event;
        targetRecord.rawResponseJson = rawJson;
        targetRecord.statusCode = statusCode;
      }

      // Granular Error/Success Diagnosis for T-NKLDEUC
      if (statusCode === 200 || statusString === 'success' || evalData === true) {
        if (targetRecord) {
          targetRecord.responseStatus = 'SUCCESS_200';
          targetRecord.diagnosis = `✓ HTTP 200 OK: Samsung TV confirmed launch of "${active?.appName || targetRecord.appName}" (App ID: "${active?.appId || targetRecord.appId}"). Payload structure and App ID mapping validated successfully for T-NKLDEUC firmware.`;
          this.notifyTelemetryListeners(targetRecord);
        }
        this.log(
          'success',
          `[AppLauncher:DIAGNOSIS:SUCCESS] ✓ HTTP 200 OK: Samsung TV confirmed app launch. Payload structure and App ID are verified on T-NKLDEUC.`
        );
      } else if (statusCode === 404) {
        if (targetRecord) {
          targetRecord.responseStatus = 'ERROR_404';
          targetRecord.diagnosis = `✗ HTTP 404 (App Not Found): The App ID "${active?.appId || targetRecord.appId}" is NOT registered or installed on this Samsung TU8500 (T-NKLDEUC) firmware. Diagnosis: App ID mismatch. Action: Use "Refresh App Discovery" or switch to alternative package IDs (e.g. 9Ur5IzDKqV.TizenYouTube).`;
          this.notifyTelemetryListeners(targetRecord);
        }
        this.log(
          'error',
          `[AppLauncher:DIAGNOSIS:APP_ID_MAPPING] ✗ HTTP 404 (Not Found): App ID "${active?.appId || targetRecord?.appId}" is not recognized by T-NKLDEUC firmware. Please verify the installed YouTube package ID via "Refresh App Discovery".`
        );
      } else if (statusCode === 401 || statusCode === 403) {
        if (targetRecord) {
          targetRecord.responseStatus = 'PERMISSION_DENIED_AUTH';
          targetRecord.diagnosis = `✗ HTTP ${statusCode} (Permission Denied): The Samsung TV rejected the app launch request due to missing or ungranted WebSocket token permissions on T-NKLDEUC. Action: Click Connect to re-authorize the pairing dialog on the TV screen.`;
          this.notifyTelemetryListeners(targetRecord);
        }
        this.log(
          'error',
          `[AppLauncher:DIAGNOSIS:PERMISSIONS] ✗ HTTP ${statusCode} (Permission Denied): WebSocket lacks authorization token permissions for app execution on T-NKLDEUC.`
        );
      } else if (statusCode === 400) {
        if (targetRecord) {
          targetRecord.responseStatus = 'ERROR_PAYLOAD';
          targetRecord.diagnosis = `✗ HTTP 400 (Bad Request): T-NKLDEUC Tizen 5.5 JSON parser rejected the payload structure. Action: Verify that 'appId' is a strict string and 'metaTag' is not an empty string.`;
          this.notifyTelemetryListeners(targetRecord);
        }
        this.log(
          'error',
          `[AppLauncher:DIAGNOSIS:PAYLOAD_STRUCTURE] ✗ HTTP 400 (Bad Request): T-NKLDEUC firmware rejected the payload structure. Check parameter formatting and types.`
        );
      } else {
        if (targetRecord) {
          targetRecord.responseStatus = 'ERROR_TV';
          targetRecord.diagnosis = `TV returned status code ${statusCode ?? 'UNKNOWN'} (${statusString || 'no message'}): ${rawJson.slice(0, 120)}`;
          this.notifyTelemetryListeners(targetRecord);
        }
        this.log(
          'warn',
          `[AppLauncher:DIAGNOSIS:STATUS_CODE] Samsung TV returned unexpected status: ${statusCode ?? statusString}`
        );
      }
    } else if (event === 'ms.application.start') {
      if (targetRecord) {
        targetRecord.responseEvent = event;
        targetRecord.rawResponseJson = rawJson;
        targetRecord.responseStatus = 'SUCCESS_200';
        targetRecord.diagnosis = `✓ TV acknowledged companion start command (ms.application.start) for App ID "${active?.appId || targetRecord.appId}".`;
        this.notifyTelemetryListeners(targetRecord);
      }
      this.log(
        'success',
        `[AppLauncher:DIAGNOSIS:SUCCESS] ✓ Samsung TV acknowledged ms.application.start for App ID "${active?.appId || targetRecord?.appId}".`
      );
    } else if (event === 'ms.error') {
      const errCode = (msgObj.code as string | number) ?? (msgData as Record<string, unknown>)?.code ?? 'UNKNOWN';
      const errMsg = (msgObj.message as string) ?? (msgData as Record<string, unknown>)?.message ?? rawJson;
      if (targetRecord) {
        targetRecord.responseEvent = event;
        targetRecord.rawResponseJson = rawJson;
        targetRecord.responseStatus = 'ERROR_TV';
        targetRecord.diagnosis = `✗ TV WebSocket ms.error: Code=${errCode} Message=${errMsg}. Check T-NKLDEUC local network security and SSL certificate acceptance.`;
        this.notifyTelemetryListeners(targetRecord);
      }
      this.log(
        'error',
        `[AppLauncher:DIAGNOSIS:TV_ERROR] ✗ Samsung TV reported error (ms.error): Code=${errCode}, Message=${errMsg}`
      );
    } else if (event === 'ms.channel.unauthorized') {
      if (targetRecord) {
        targetRecord.responseEvent = event;
        targetRecord.rawResponseJson = rawJson;
        targetRecord.responseStatus = 'PERMISSION_DENIED_AUTH';
        targetRecord.diagnosis = `✗ ms.channel.unauthorized: TV rejected or revoked the stored session token. Re-authorization required.`;
        this.notifyTelemetryListeners(targetRecord);
      }
      this.log(
        'error',
        `[AppLauncher:DIAGNOSIS:PERMISSIONS] TV revoked or rejected token authorization during app launch (ms.channel.unauthorized).`
      );
    }
  }

  /**
   * Handles transport-level errors during app launch
   */
  public handleWebSocketError(errorStr: string): void {
    if (this.activePendingLaunch) {
      const record = this.telemetryHistory.find((r) => r.id === this.activePendingLaunch?.telemetryId);
      if (record && record.responseStatus === 'PENDING') {
        record.responseStatus = 'ERROR_TV';
        record.diagnosis = `✗ Transport error: ${errorStr}`;
        this.notifyTelemetryListeners(record);
      }
    }
    this.log(
      'error',
      `[AppLauncher:STATUS:TRANSPORT_ERROR] Transport error during app launch: ${errorStr}`
    );
  }

  /**
   * Identifies any YouTube application instance from a list of discovered apps
   */
  private findYouTubeInList(apps: DiscoveredAppInfo[]): DiscoveredAppInfo | null {
    // 1. Check for explicit name match (case-insensitive)
    const nameMatch = apps.find((app) => {
      const lower = (app.name || '').toLowerCase();
      return lower === 'youtube' || lower.includes('youtube');
    });
    if (nameMatch) return nameMatch;

    // 2. Check for standard Tizen Store ID
    const storeMatch = apps.find((app) => app.appId === KNOWN_TV_APPS.YOUTUBE.id);
    if (storeMatch) return storeMatch;

    // 3. Check for known package alternate IDs (e.g. 9Ur5IzDKqV.TizenYouTube, org.tizen.youtube)
    const altMatch = apps.find((app) =>
      KNOWN_TV_APPS.YOUTUBE.alternateIds?.includes(app.appId as any)
    );
    return altMatch || null;
  }

  /**
   * Ingests and normalizes application list received asynchronously from the TV
   * (e.g. via WebSocket EDEN event 'ed.installedApp.get' or 'ed.apps.list')
   */
  public receiveInstalledApps(rawApps: unknown[]): void {
    if (!Array.isArray(rawApps) || rawApps.length === 0) return;

    const parsed: DiscoveredAppInfo[] = [];
    for (const raw of rawApps) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const appId = String(item.appId || item.id || item.app_id || '').trim();
      if (!appId) continue;

      const name = String(item.name || item.appName || item.title || appId).trim();
      parsed.push({
        appId,
        name,
        appType:
          typeof item.app_type === 'number' || typeof item.app_type === 'string'
            ? item.app_type
            : undefined,
        icon: typeof item.icon === 'string' ? item.icon : undefined,
        version: typeof item.version === 'string' ? item.version : undefined,
        isRunning: Boolean(item.running || item.visible),
        source: 'websocket_eden',
      });
    }

    if (parsed.length > 0) {
      // Merge into discoveredApps without duplicates
      const map = new Map<string, DiscoveredAppInfo>();
      for (const existing of this.discoveredApps) {
        map.set(existing.appId, existing);
      }
      for (const app of parsed) {
        map.set(app.appId, app);
      }
      this.discoveredApps = Array.from(map.values());

      // Try to dynamically resolve YouTube App ID
      const ytMatch = this.findYouTubeInList(this.discoveredApps);
      if (ytMatch) {
        this.resolvedYouTubeAppId = ytMatch.appId;
        this.log(
          'success',
          `[AppLauncher:DISCOVERY] ✓ Dynamically identified YouTube App ID "${ytMatch.appId}" (${ytMatch.name}) from TV active application list`
        );
      }

      // Notify and resolve any awaiting discovery callers
      const waiters = [...this.discoveryWaiters];
      this.discoveryWaiters = [];
      for (const resolve of waiters) {
        resolve(this.discoveredApps);
      }
    }
  }

  /**
   * Queries the Samsung TV for its active/installed application list at runtime.
   * Employs a tiered discovery protocol:
   * 1. Real-time WebSocket EDEN query (ed.installedApp.get / ed.apps.list)
   * 2. Candidate REST Probe across known YouTube App IDs on TV port 8001/8002
   * 3. Registry fallback validation for T-NKLDEUC (Tizen 5.5+)
   */
  public async discoverInstalledApps(options?: {
    forceRefresh?: boolean;
    timeoutMs?: number;
  }): Promise<DiscoveredAppInfo[]> {
    const force = Boolean(options?.forceRefresh);
    const timeoutMs = options?.timeoutMs || 3000;

    if (!force && this.discoveredApps.length > 0) {
      return this.discoveredApps;
    }

    this.log(
      'info',
      `[AppLauncher:DISCOVERY] Initiating runtime TV application discovery (host: ${this.getHost() || 'not set'})...`
    );
    this.isDiscovering = true;

    // 1. Attempt WebSocket query via EDEN Event Bus (if connected)
    const isConnected = this.isSocketConnectedFn ? this.isSocketConnectedFn() : false;
    let socketRequested = false;

    if (isConnected) {
      if (this.requestInstalledAppsFn) {
        socketRequested = this.requestInstalledAppsFn();
      } else if (this.emitSocketEvent) {
        socketRequested = this.emitSocketEvent('ed.installedApp.get', {});
        this.emitSocketEvent('ed.apps.list', {});
      } else if (this.sendRawPacketFn) {
        socketRequested = this.sendRawPacketFn({
          method: 'ms.channel.emit',
          params: {
            event: 'ed.installedApp.get',
            to: 'host',
            data: {},
          },
        });
      }
    }

    if (socketRequested) {
      this.log(
        'info',
        '[AppLauncher:DISCOVERY] Dispatched ed.installedApp.get via WebSocket. Awaiting TV application list frame...'
      );
      const socketPromise = new Promise<DiscoveredAppInfo[]>((resolve) => {
        const timer = window.setTimeout(() => {
          const idx = this.discoveryWaiters.indexOf(resolve);
          if (idx !== -1) this.discoveryWaiters.splice(idx, 1);
          resolve(this.discoveredApps);
        }, timeoutMs);

        this.discoveryWaiters.push((apps) => {
          clearTimeout(timer);
          resolve(apps);
        });
      });

      const appsFromSocket = await socketPromise;
      if (appsFromSocket.length > 0) {
        this.isDiscovering = false;
        return appsFromSocket;
      }
    }

    // 2. Candidate REST Probe: Probe known YouTube candidate IDs on TV REST API
    const host = this.getHost();
    if (host) {
      this.log(
        'info',
        `[AppLauncher:DISCOVERY] Probing TV REST endpoints for candidate YouTube application IDs...`
      );
      const candidates = [
        KNOWN_TV_APPS.YOUTUBE.id,
        ...(KNOWN_TV_APPS.YOUTUBE.alternateIds || []),
        'kzcgf0cM50.YouTube',
        '11101200001',
      ];

      for (const candidateId of candidates) {
        try {
          const status = await this.getAppStatus(candidateId);
          if (status && (status.id || status.name)) {
            const verifiedId = String(status.id || candidateId);
            const appName = String(status.name || 'YouTube');
            const info: DiscoveredAppInfo = {
              appId: verifiedId,
              name: appName,
              version: typeof status.version === 'string' ? status.version : undefined,
              isRunning: Boolean(status.running),
              source: 'rest_api',
            };

            const existingIdx = this.discoveredApps.findIndex((a) => a.appId === verifiedId);
            if (existingIdx !== -1) {
              this.discoveredApps[existingIdx] = info;
            } else {
              this.discoveredApps.push(info);
            }

            if (
              appName.toLowerCase().includes('youtube') ||
              verifiedId === KNOWN_TV_APPS.YOUTUBE.id
            ) {
              this.resolvedYouTubeAppId = verifiedId;
              this.log(
                'success',
                `[AppLauncher:DISCOVERY] ✓ Verified active YouTube App ID "${verifiedId}" via TV REST API (Running: ${
                  info.isRunning ? 'Yes' : 'No'
                })`
              );
            }
          }
        } catch {
          // Candidate not reachable; continue
        }
      }
    }

    // 3. Fallback: Initialize known registry apps if none discovered
    if (this.discoveredApps.length === 0) {
      for (const [, def] of Object.entries(KNOWN_TV_APPS)) {
        this.discoveredApps.push({
          appId: def.id,
          name: def.name,
          source: 'registry_verified',
        });
      }
      this.resolvedYouTubeAppId = KNOWN_TV_APPS.YOUTUBE.id;
      this.log(
        'info',
        `[AppLauncher:DISCOVERY] Initialized known registry apps (YouTube ID: "${KNOWN_TV_APPS.YOUTUBE.id}" for ${KNOWN_TV_APPS.YOUTUBE.platformSeries})`
      );
    } else if (!this.resolvedYouTubeAppId) {
      const match = this.findYouTubeInList(this.discoveredApps);
      this.resolvedYouTubeAppId = match ? match.appId : KNOWN_TV_APPS.YOUTUBE.id;
    }

    this.isDiscovering = false;
    return this.discoveredApps;
  }

  /**
   * Dynamically resolves the accurate YouTube App ID for the connected TV firmware.
   * Returns the discovered ID (e.g. '111299001912' or alternate package ID).
   */
  public async resolveYouTubeAppId(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.resolvedYouTubeAppId) {
      return this.resolvedYouTubeAppId;
    }
    await this.discoverInstalledApps({ forceRefresh, timeoutMs: 2500 });
    return this.resolvedYouTubeAppId || KNOWN_TV_APPS.YOUTUBE.id;
  }

  /**
   * Returns currently discovered applications
   */
  public getInstalledApps(): DiscoveredAppInfo[] {
    return [...this.discoveredApps];
  }

  /**
   * Returns the currently resolved YouTube App ID, if determined
   */
  public getResolvedYouTubeAppId(): string | null {
    return this.resolvedYouTubeAppId;
  }

  /**
   * Dedicated helper for launching YouTube.
   * Dynamically queries the TV for active application identifiers
   * instead of relying solely on hardcoded values.
   */
  public async launchYouTube(videoIdOrPayload?: string): Promise<boolean> {
    const cleanPayload = videoIdOrPayload ? videoIdOrPayload.trim() : '';
    let formattedPayload: string | undefined;

    if (cleanPayload) {
      if (
        cleanPayload.startsWith('v=') ||
        cleanPayload.startsWith('list=') ||
        cleanPayload.startsWith('q=')
      ) {
        formattedPayload = cleanPayload;
      } else {
        formattedPayload = `v=${cleanPayload}`;
      }
    }

    // Step 1: Runtime discovery of the accurate YouTube App ID for this TV
    const targetYouTubeId = await this.resolveYouTubeAppId();

    this.log(
      'info',
      `[AppLauncher:YouTube] Targeting runtime-resolved YouTube App ID: "${targetYouTubeId}"`
    );

    // Step 2: Primary attempt with runtime-resolved App ID
    const success = await this.launchApp(targetYouTubeId, formattedPayload);
    if (success) {
      return true;
    }

    // Step 3: Fallback if resolved ID differs from standard store ID
    if (targetYouTubeId !== KNOWN_TV_APPS.YOUTUBE.id) {
      this.log(
        'info',
        `[AppLauncher:YouTube] Runtime-resolved ID failed; attempting fallback to Store ID: ${KNOWN_TV_APPS.YOUTUBE.id}`
      );
      const storeSuccess = await this.launchApp(KNOWN_TV_APPS.YOUTUBE.id, formattedPayload);
      if (storeSuccess) {
        this.resolvedYouTubeAppId = KNOWN_TV_APPS.YOUTUBE.id;
        return true;
      }
    }

    // Step 4: Secondary fallback to alternate package IDs if known
    if (KNOWN_TV_APPS.YOUTUBE.alternateIds && KNOWN_TV_APPS.YOUTUBE.alternateIds.length > 0) {
      for (const alternateId of KNOWN_TV_APPS.YOUTUBE.alternateIds) {
        if (alternateId !== targetYouTubeId) {
          this.log(
            'info',
            `[AppLauncher:YouTube] Attempting alternate package ID fallback: ${alternateId}`
          );
          const altSuccess = await this.launchApp(alternateId, formattedPayload);
          if (altSuccess) {
            this.resolvedYouTubeAppId = alternateId;
            return true;
          }
        }
      }
    }

    return false;
  }
}
