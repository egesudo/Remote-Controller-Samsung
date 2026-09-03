/**
 * Samsung TV Device Manager
 * 
 * Responsibilities:
 * - Persistent storage & management of multiple Samsung TVs
 * - Active TV selection and switching
 * - Custom device naming / alias assignment
 * - Per-device token association and isolation
 * - Online status pinging via diagnostic endpoint
 */

import { ManagedTVDevice, TVDeviceInfo } from '../types/tv.types.ts';

const STORAGE_KEY_TVS = 'samsung_managed_tvs_v1';
const STORAGE_KEY_ACTIVE_TV = 'samsung_active_tv_id';

export type DeviceManagerListener = (devices: ManagedTVDevice[], activeDevice: ManagedTVDevice | null) => void;

export class TVDeviceManager {
  private devices: ManagedTVDevice[] = [];
  private activeDeviceId: string | null = null;
  private listeners: Set<DeviceManagerListener> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Subscribe to device changes
   */
  public subscribe(listener: DeviceManagerListener): () => void {
    this.listeners.add(listener);
    // Immediate callback with current state
    listener(this.getDevices(), this.getActiveDevice());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const devices = this.getDevices();
    const active = this.getActiveDevice();
    this.listeners.forEach((listener) => {
      try {
        listener(devices, active);
      } catch (err) {
        console.error('Error in TVDeviceManager listener:', err);
      }
    });
  }

  /**
   * Load saved TVs from localStorage
   */
  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TVS);
      if (raw) {
        this.devices = JSON.parse(raw);
      }
    } catch {
      this.devices = [];
    }

    // If no devices exist, bootstrap with the target UE55TU8500UXTK
    if (this.devices.length === 0) {
      const initialIp = localStorage.getItem('samsung_tv_default_ip') || '192.168.1.50';
      const defaultDevice: ManagedTVDevice = {
        id: 'tv_tu8500_default',
        ip: initialIp,
        port: 8002,
        name: 'Living Room TV',
        customName: 'Living Room (TU8500)',
        modelName: 'UE55TU8500UXTK',
        token: localStorage.getItem(`samsung_tv_token_${initialIp.replace(/[^a-zA-Z0-9]/g, '_')}`),
        lastConnected: new Date().toISOString(),
        isCurrent: true,
        onlineStatus: 'unknown',
      };
      this.devices = [defaultDevice];
      this.activeDeviceId = defaultDevice.id;
      this.saveToStorage();
    } else {
      const savedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_TV);
      const matched = this.devices.find((d) => d.id === savedActiveId);
      if (matched) {
        this.activeDeviceId = matched.id;
      } else {
        this.activeDeviceId = this.devices[0].id;
      }
      this.syncCurrentFlags();
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_TVS, JSON.stringify(this.devices));
      if (this.activeDeviceId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TV, this.activeDeviceId);
      }
    } catch {
      // ignore
    }
  }

  private syncCurrentFlags(): void {
    this.devices.forEach((d) => {
      d.isCurrent = d.id === this.activeDeviceId;
    });
  }

  public getDevices(): ManagedTVDevice[] {
    return [...this.devices];
  }

  public getActiveDevice(): ManagedTVDevice | null {
    return this.devices.find((d) => d.id === this.activeDeviceId) || this.devices[0] || null;
  }

  public getDeviceById(id: string): ManagedTVDevice | null {
    return this.devices.find((d) => d.id === id) || null;
  }

  public getDeviceByIp(ip: string): ManagedTVDevice | null {
    const cleanIp = ip.trim();
    return this.devices.find((d) => d.ip.trim() === cleanIp) || null;
  }

  /**
   * Set active TV device by ID
   */
  public setActiveDevice(id: string): ManagedTVDevice | null {
    const target = this.devices.find((d) => d.id === id);
    if (!target) return null;

    this.activeDeviceId = target.id;
    this.syncCurrentFlags();
    this.saveToStorage();
    this.notify();
    return target;
  }

  /**
   * Add a newly discovered or manually configured Samsung TV
   */
  public addDevice(data: {
    ip: string;
    port?: number;
    name?: string;
    customName?: string;
    modelName?: string;
    token?: string | null;
  }): ManagedTVDevice {
    const cleanIp = data.ip.trim();
    const existing = this.getDeviceByIp(cleanIp);
    if (existing) {
      // Update existing
      if (data.name) existing.name = data.name;
      if (data.customName) existing.customName = data.customName;
      if (data.modelName) existing.modelName = data.modelName;
      if (data.port) existing.port = data.port;
      if (data.token !== undefined) existing.token = data.token;
      this.saveToStorage();
      this.notify();
      return existing;
    }

    const newId = `tv_${cleanIp.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    const newDevice: ManagedTVDevice = {
      id: newId,
      ip: cleanIp,
      port: data.port || 8002,
      name: data.name || `Samsung TV (${cleanIp})`,
      customName: data.customName || data.name || `Samsung TV (${cleanIp})`,
      modelName: data.modelName || 'Samsung Smart TV',
      token: data.token || null,
      lastConnected: new Date().toISOString(),
      isCurrent: false,
      onlineStatus: 'unknown',
    };

    this.devices.push(newDevice);
    this.saveToStorage();
    this.notify();
    return newDevice;
  }

  /**
   * Update device information
   */
  public updateDevice(id: string, updates: Partial<ManagedTVDevice>): ManagedTVDevice | null {
    const device = this.devices.find((d) => d.id === id);
    if (!device) return null;

    if (updates.ip !== undefined) device.ip = updates.ip.trim();
    if (updates.port !== undefined) device.port = updates.port;
    if (updates.name !== undefined) device.name = updates.name;
    if (updates.customName !== undefined) device.customName = updates.customName;
    if (updates.modelName !== undefined) device.modelName = updates.modelName;
    if (updates.token !== undefined) device.token = updates.token;
    if (updates.onlineStatus !== undefined) device.onlineStatus = updates.onlineStatus;
    if (updates.lastConnected !== undefined) device.lastConnected = updates.lastConnected;

    this.saveToStorage();
    this.notify();
    return device;
  }

  /**
   * Friendly rename
   */
  public renameDevice(id: string, newCustomName: string): boolean {
    const trimmed = newCustomName.trim();
    if (!trimmed) return false;
    return !!this.updateDevice(id, { customName: trimmed });
  }

  /**
   * Save / associate newly acquired token to a TV device (or clear if empty)
   */
  public associateToken(ip: string, token: string): void {
    const device = this.getDeviceByIp(ip);
    if (device) {
      device.token = token.trim() ? token.trim() : null;
      this.saveToStorage();
      this.notify();
    }
  }

  /**
   * Remove TV device
   */
  public removeDevice(id: string): boolean {
    const index = this.devices.findIndex((d) => d.id === id);
    if (index === -1) return false;

    const removedWasActive = this.devices[index].id === this.activeDeviceId;
    this.devices.splice(index, 1);

    if (this.devices.length === 0) {
      // Re-bootstrap default if all deleted
      const defaultDevice: ManagedTVDevice = {
        id: 'tv_tu8500_default',
        ip: '192.168.1.50',
        port: 8002,
        name: 'Living Room TV',
        customName: 'Living Room (TU8500)',
        modelName: 'UE55TU8500UXTK',
        token: null,
        isCurrent: true,
        onlineStatus: 'unknown',
      };
      this.devices = [defaultDevice];
      this.activeDeviceId = defaultDevice.id;
    } else if (removedWasActive) {
      this.activeDeviceId = this.devices[0].id;
    }

    this.syncCurrentFlags();
    this.saveToStorage();
    this.notify();
    return true;
  }

  /**
   * Ping / check online status of a device via HTTP endpoint /api/v2/
   * Falls back to server relay proxy if browser mixed content blocks direct HTTP.
   */
  public async pingDevice(id: string): Promise<boolean> {
    const device = this.getDeviceById(id);
    if (!device) return false;

    // Attempt 1: Direct LAN ping
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`http://${device.ip}:8001/api/v2/`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        this.updateDevice(id, {
          onlineStatus: 'online',
          lastConnected: new Date().toISOString(),
        });
        return true;
      }
    } catch {
      // Direct LAN fetch might fail in HTTPS browser
    }

    // Attempt 2: Server relay diagnostics probe
    try {
      const relayRes = await fetch(`/api/tv/diagnostics?ip=${encodeURIComponent(device.ip)}`);
      if (relayRes.ok) {
        const data = await relayRes.json();
        if (data.success) {
          this.updateDevice(id, {
            onlineStatus: 'online',
            lastConnected: new Date().toISOString(),
          });
          return true;
        }
      }
    } catch {
      // Server relay unreachable
    }

    this.updateDevice(id, { onlineStatus: 'offline' });
    return false;
  }

  /**
   * Ping all managed devices in parallel
   */
  public async pingAllDevices(): Promise<void> {
    await Promise.allSettled(this.devices.map((d) => this.pingDevice(d.id)));
  }
}

export const tvDeviceManager = new TVDeviceManager();
