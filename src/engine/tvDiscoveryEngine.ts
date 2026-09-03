/**
 * Samsung TV Local Network Discovery Engine
 * 
 * Capabilities:
 * - Subnet IP scanning across configurable ranges (e.g. 192.168.1.1 - 254)
 * - Fast non-blocking HTTP probe targeting Samsung Smart TV Tizen diagnostic port (8001 /api/v2/)
 * - Extraction of TV metadata: Device Name, Model Code, Tizen Version, Network Type
 * - Progress tracking & device event streaming
 * - Cancellation support via AbortController
 */

import { DiscoveredTVDevice, DiscoveryProgress, DiscoveryState } from '../types/tv.types.ts';

export interface TVDiscoveryListener {
  onStateChange?: (state: DiscoveryState) => void;
  onProgress?: (progress: DiscoveryProgress) => void;
  onDeviceFound?: (device: DiscoveredTVDevice) => void;
  onComplete?: (devices: DiscoveredTVDevice[]) => void;
  onError?: (error: string) => void;
}

export class TVDiscoveryEngine {
  private state: DiscoveryState = 'IDLE';
  private abortController: AbortController | null = null;
  private listeners: Set<TVDiscoveryListener> = new Set();
  private discoveredDevices: DiscoveredTVDevice[] = [];

  public subscribe(listener: TVDiscoveryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): DiscoveryState {
    return this.state;
  }

  public getDiscoveredDevices(): DiscoveredTVDevice[] {
    return [...this.discoveredDevices];
  }

  private setState(newState: DiscoveryState): void {
    this.state = newState;
    this.listeners.forEach((l) => l.onStateChange?.(newState));
  }

  /**
   * Probe a single IP address directly for Samsung Smart TV service
   */
  public async probeIp(ip: string, timeoutMs = 1500, signal?: AbortSignal): Promise<DiscoveredTVDevice | null> {
    const cleanIp = ip.trim();
    if (!cleanIp) return null;

    const startTime = performance.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Merge internal timeout with external abort signal if provided
    if (signal) {
      signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    // Attempt 1: Direct LAN fetch
    try {
      const response = await fetch(`http://${cleanIp}:8001/api/v2/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: timeoutController.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const responseTimeMs = Math.round(performance.now() - startTime);

        const dev = data.device || data;
        const name = dev.name || data.name || `Samsung TV (${cleanIp})`;
        const modelName = dev.modelName || data.modelName || 'Samsung Smart TV';
        const id = dev.id || dev.wifiMac || dev.mac || `samsung_${cleanIp.replace(/\./g, '_')}`;

        return {
          id,
          ip: cleanIp,
          port: 8002, // Default remote WebSocket port
          name,
          modelName,
          networkType: dev.networkType,
          responseTimeMs,
          discoveredVia: 'http_probe',
        };
      }
    } catch {
      // Direct LAN fetch might fail in HTTPS web context
    }

    // Attempt 2: Server relay fallback
    try {
      const relayRes = await fetch(`/api/tv/diagnostics?ip=${encodeURIComponent(cleanIp)}`, {
        signal: timeoutController.signal,
      });
      clearTimeout(timeoutId);

      if (relayRes.ok) {
        const data = await relayRes.json();
        if (data.success && data.device) {
          const responseTimeMs = Math.round(performance.now() - startTime);
          const dev = data.device;
          return {
            id: `samsung_${cleanIp.replace(/\./g, '_')}`,
            ip: cleanIp,
            port: 8002,
            name: dev.name || `Samsung TV (${cleanIp})`,
            modelName: dev.modelName || 'Samsung Smart TV',
            networkType: dev.networkType,
            responseTimeMs,
            discoveredVia: 'http_probe',
          };
        }
      }
    } catch {
      // Ignore
    }

    clearTimeout(timeoutId);
    return null;
  }

  /**
   * Scan a subnet for active Samsung Smart TVs
   * @param subnetPrefix Subnet string, e.g. "192.168.1"
   * @param startHost Starting IP octet (default 1)
   * @param endHost Ending IP octet (default 254)
   * @param concurrency Maximum concurrent requests (default 10)
   */
  public async startScan(options?: {
    subnetPrefix?: string;
    startHost?: number;
    endHost?: number;
    concurrency?: number;
    timeoutMs?: number;
  }): Promise<DiscoveredTVDevice[]> {
    if (this.state === 'SCANNING') {
      this.cancelScan();
    }

    const subnet = (options?.subnetPrefix || '192.168.1').replace(/\.$/, '');
    const start = Math.max(1, Math.min(254, options?.startHost ?? 1));
    const end = Math.max(start, Math.min(254, options?.endHost ?? 254));
    const concurrency = Math.max(1, Math.min(25, options?.concurrency ?? 10));
    const timeoutMs = options?.timeoutMs ?? 1200;

    this.abortController = new AbortController();
    this.discoveredDevices = [];
    this.setState('SCANNING');

    const totalToScan = end - start + 1;
    let scannedCount = 0;
    const ipList: string[] = [];

    for (let i = start; i <= end; i++) {
      ipList.push(`${subnet}.${i}`);
    }

    // Worker pool execution
    const runWorker = async () => {
      while (ipList.length > 0) {
        if (this.abortController?.signal.aborted) break;

        const currentIp = ipList.shift();
        if (!currentIp) break;

        // Progress notification
        scannedCount++;
        const progress: DiscoveryProgress = {
          currentIp,
          scannedCount,
          totalToScan,
          progressPercent: Math.round((scannedCount / totalToScan) * 100),
          foundCount: this.discoveredDevices.length,
        };
        this.listeners.forEach((l) => l.onProgress?.(progress));

        try {
          const found = await this.probeIp(currentIp, timeoutMs, this.abortController?.signal);
          if (found) {
            found.discoveredVia = 'subnet_scan';
            // Prevent duplicates
            if (!this.discoveredDevices.some((d) => d.ip === found.ip)) {
              this.discoveredDevices.push(found);
              this.listeners.forEach((l) => l.onDeviceFound?.(found));
            }
          }
        } catch {
          // host skipped or unreachable
        }
      }
    };

    try {
      const workers = Array.from({ length: concurrency }, () => runWorker());
      await Promise.all(workers);

      if (!this.abortController.signal.aborted) {
        this.setState('COMPLETED');
        this.listeners.forEach((l) => l.onComplete?.(this.discoveredDevices));
      }
    } catch (err: any) {
      if (!this.abortController.signal.aborted) {
        this.setState('ERROR');
        this.listeners.forEach((l) => l.onError?.(err?.message || 'Subnet scan encountered an error'));
      }
    } finally {
      this.abortController = null;
    }

    return this.discoveredDevices;
  }

  /**
   * Cancel an ongoing discovery scan
   */
  public cancelScan(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setState('IDLE');
  }
}

export const tvDiscoveryEngine = new TVDiscoveryEngine();
