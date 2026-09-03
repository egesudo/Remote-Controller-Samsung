/**
 * Modular Application Launcher Capability
 * 
 * Provides an isolated capability layer for launching Smart TV applications (like YouTube)
 * without hardcoding or tightly coupling application behaviors into the raw TV remote controller.
 * Can be cleanly extended by dedicated controllers (e.g. YouTubeController, VoiceIntentRouter).
 */

import { IAppLauncher } from '../types/tv.types.ts';

export const KNOWN_TV_APPS = {
  YOUTUBE: {
    id: '111299001912',
    name: 'YouTube',
    deepLinkSupported: true,
  },
  NETFLIX: {
    id: '3201512006785',
    name: 'Netflix',
    deepLinkSupported: false,
  },
  BROWSER: {
    id: 'org.tizen.browser',
    name: 'Web Browser',
    deepLinkSupported: false,
  },
} as const;

export class ModularAppLauncher implements IAppLauncher {
  private getHost: () => string;
  private emitSocketEvent?: (event: string, data: Record<string, unknown>) => boolean;

  constructor(
    getHostFn: () => string,
    emitSocketFn?: (event: string, data: Record<string, unknown>) => boolean
  ) {
    this.getHost = getHostFn;
    this.emitSocketEvent = emitSocketFn;
  }

  public isAppLaunchSupported(): boolean {
    return Boolean(this.getHost());
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
   * Dispatches application launch request to Tizen REST endpoint or active WebSocket
   * POST http://<TV_IP>:8001/api/v2/applications/<appId>
   */
  public async launchApp(appId: string, actionUrl?: string): Promise<boolean> {
    const host = this.getHost();
    if (!host) {
      return false;
    }

    const targetAppId = appId.trim();
    if (!targetAppId) {
      return false;
    }

    // Attempt 1: Try WebSocket channel emit if socket is connected
    if (this.emitSocketEvent) {
      const wsDispatched = this.emitSocketEvent('ed.apps.launch', {
        appId: targetAppId,
        action_type: actionUrl ? 'DEEP_LINK' : 'NATIVE_LAUNCH',
        metaTag: actionUrl || '',
      });
      if (wsDispatched) {
        return true;
      }
    }

    // Attempt 2: Direct local network REST fetch to TV port 8001
    try {
      const endpoint = `http://${host}:8001/api/v2/applications/${encodeURIComponent(targetAppId)}`;
      const body = actionUrl ? JSON.stringify({ action_data: actionUrl }) : undefined;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (res.ok || res.status === 200 || res.status === 204) {
        return true;
      }
    } catch {
      // Direct LAN fetch might be blocked by browser HTTPS mixed-content. Proceed to Attempt 3.
    }

    // Attempt 3: Server-side relay proxy to avoid browser Mixed Content / CORS restrictions
    try {
      const relayRes = await fetch('/api/tv/launch-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: host,
          appId: targetAppId,
          actionUrl,
        }),
      });
      if (relayRes.ok) {
        const data = await relayRes.json();
        return Boolean(data.success);
      }
    } catch {
      // Server proxy not reachable
    }

    return false;
  }

  /**
   * Dedicated helper for launching YouTube with optional video deep link
   */
  public async launchYouTube(videoIdOrPayload?: string): Promise<boolean> {
    const payload = videoIdOrPayload ? (videoIdOrPayload.startsWith('v=') ? videoIdOrPayload : `v=${videoIdOrPayload}`) : undefined;
    return await this.launchApp(KNOWN_TV_APPS.YOUTUBE.id, payload);
  }
}

