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

import { IAppLauncher } from '../types/tv.types.ts';

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

  constructor(
    getHostFn: () => string,
    emitSocketFn?: (event: string, data: Record<string, unknown>) => boolean,
    sendRawPacketFn?: (packet: Record<string, unknown>) => boolean,
    isSocketConnectedFn?: () => boolean,
    logFn?: AppLauncherLogger,
    trackPendingLaunchFn?: (appId: string, appName: string) => void
  ) {
    this.getHost = getHostFn;
    this.emitSocketEvent = emitSocketFn;
    this.sendRawPacketFn = sendRawPacketFn;
    this.isSocketConnectedFn = isSocketConnectedFn;
    this.logFn = logFn;
    this.trackPendingLaunchFn = trackPendingLaunchFn;
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

      if (!response.ok) {
        return null;
      }
      return (await response.json()) as Record<string, unknown>;
    } catch {
      // Endpoint may be restricted or blocked by browser CORS; gracefully handled
      return null;
    }
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

    this.log(
      'info',
      `[AppLauncher] >>> Launch Intent Initiated: App "${intent.appName}" (ID: ${intent.targetAppId}) | Mode: ${intent.actionType}${
        intent.actionUrl ? ` | Data: ${intent.actionUrl}` : ''
      }`
    );

    const isConnected = this.isSocketConnectedFn ? this.isSocketConnectedFn() : true;

    // Track pending app launch to correlate incoming TV WebSocket frames
    if (this.trackPendingLaunchFn) {
      this.trackPendingLaunchFn(intent.targetAppId, intent.appName);
    }

    // Attempt 1: Transmit via Active Authenticated WebSocket (Port 8002 WSS)
    // This is the verified authoritative channel for T-NKLDEUC-2740.1 firmware
    if (this.sendRawPacketFn || this.emitSocketEvent) {
      if (!isConnected) {
        this.log(
          'warn',
          `[AppLauncher] WebSocket is not in CONNECTED state. TV at ${host || 'unknown'} requires an authenticated WSS session on port 8002 to launch apps.`
        );
      } else {
        this.log(
          'info',
          `[AppLauncher:DEBUG] Transmitting verified payload for ${intent.appName} (appId: string = "${intent.targetAppId}", action_type: "${intent.actionType}") via WebSocket...`
        );
        this.log(
          'info',
          `[AppLauncher] Dispatched EDEN launch payload to TV host:`,
          intent.edenPayload
        );

        let edenSent = false;
        if (this.sendRawPacketFn) {
          edenSent = this.sendRawPacketFn(intent.edenPayload);
        } else if (this.emitSocketEvent) {
          edenSent = this.emitSocketEvent('ed.apps.launch', intent.edenPayload.params.data);
        }

        // Also transmit Tizen 5.5+ standard ms.application.start frame for dual-firmware resilience
        if (this.sendRawPacketFn) {
          this.log(
            'info',
            `[AppLauncher] Dispatched Tizen 5.5+ ms.application.start frame to TV:`,
            intent.appStartPayload
          );
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
   * Dedicated helper for launching YouTube with verified ID '111299001912'
   * and optional video deep-linking (v=VIDEO_ID).
   * Also supports trying fallback package IDs if needed.
   */
  public async launchYouTube(videoIdOrPayload?: string): Promise<boolean> {
    const cleanPayload = videoIdOrPayload ? videoIdOrPayload.trim() : '';
    let formattedPayload: string | undefined;

    if (cleanPayload) {
      if (cleanPayload.startsWith('v=') || cleanPayload.startsWith('list=') || cleanPayload.startsWith('q=')) {
        formattedPayload = cleanPayload;
      } else {
        formattedPayload = `v=${cleanPayload}`;
      }
    }

    this.log(
      'info',
      `[AppLauncher:YouTube] Targeting primary YouTube App ID: ${KNOWN_TV_APPS.YOUTUBE.id} [${KNOWN_TV_APPS.YOUTUBE.platformSeries}]`
    );

    // Primary attempt with standard Samsung Smart TV Store App ID
    const success = await this.launchApp(KNOWN_TV_APPS.YOUTUBE.id, formattedPayload);
    if (success) {
      return true;
    }

    // Fallback: If primary ID dispatch returned false and an alternate package ID exists, try once with alternate ID
    if (KNOWN_TV_APPS.YOUTUBE.alternateIds && KNOWN_TV_APPS.YOUTUBE.alternateIds.length > 0) {
      const alternateId = KNOWN_TV_APPS.YOUTUBE.alternateIds[0];
      this.log('info', `[AppLauncher:YouTube] Attempting alternate package ID fallback: ${alternateId}`);
      return await this.launchApp(alternateId, formattedPayload);
    }

    return false;
  }
}
