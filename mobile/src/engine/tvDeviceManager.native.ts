/**
 * Native Samsung TV Device Manager (React Native / Expo)
 * 
 * Uses @react-native-async-storage/async-storage for offline persistence
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ManagedTVDevice, DiscoveredTVDevice } from '../types/tv.types';

const STORAGE_KEY = '@samsung_remote_managed_tvs_v1';
const ACTIVE_ID_KEY = '@samsung_remote_active_tv_id';

export class NativeTVDeviceManager {
  private devices: ManagedTVDevice[] = [];
  private activeId: string | null = null;

  public async init(): Promise<{ devices: ManagedTVDevice[]; active: ManagedTVDevice | null }> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.devices = JSON.parse(raw);
      }
    } catch {
      this.devices = [];
    }

    if (this.devices.length === 0) {
      const defaultDevice: ManagedTVDevice = {
        id: 'tv_tu8500_native_default',
        ip: '192.168.1.50',
        port: 8002,
        name: 'Living Room TV',
        customName: 'Living Room (TU8500)',
        modelName: 'UE55TU8500',
        isCurrent: true,
      };
      this.devices = [defaultDevice];
      this.activeId = defaultDevice.id;
      await this.persist();
    } else {
      const savedActive = await AsyncStorage.getItem(ACTIVE_ID_KEY);
      this.activeId = savedActive || this.devices[0].id;
    }

    return {
      devices: this.getDevices(),
      active: this.getActiveDevice(),
    };
  }

  public getDevices(): ManagedTVDevice[] {
    return [...this.devices];
  }

  public getActiveDevice(): ManagedTVDevice | null {
    return this.devices.find((d) => d.id === this.activeId) || this.devices[0] || null;
  }

  public async setActive(id: string): Promise<ManagedTVDevice | null> {
    const matched = this.devices.find((d) => d.id === id);
    if (!matched) return null;
    this.activeId = matched.id;
    this.devices.forEach((d) => (d.isCurrent = d.id === id));
    await AsyncStorage.setItem(ACTIVE_ID_KEY, id);
    await this.persist();
    return matched;
  }

  public async addDevice(data: {
    ip: string;
    port?: number;
    name?: string;
    customName?: string;
    modelName?: string;
    token?: string | null;
  }): Promise<ManagedTVDevice> {
    const cleanIp = data.ip.trim();
    const existing = this.devices.find((d) => d.ip.trim() === cleanIp);
    if (existing) {
      if (data.name) existing.name = data.name;
      if (data.customName) existing.customName = data.customName;
      await this.persist();
      return existing;
    }

    const newDevice: ManagedTVDevice = {
      id: `tv_${cleanIp.replace(/\./g, '_')}_${Date.now()}`,
      ip: cleanIp,
      port: data.port || 8002,
      name: data.name || `Samsung TV (${cleanIp})`,
      customName: data.customName || data.name || `Samsung TV (${cleanIp})`,
      modelName: data.modelName || 'UE55TU8500',
      token: data.token || null,
      isCurrent: false,
    };

    this.devices.push(newDevice);
    await this.persist();
    return newDevice;
  }

  public async renameDevice(id: string, newName: string): Promise<void> {
    const dev = this.devices.find((d) => d.id === id);
    if (dev && newName.trim()) {
      dev.customName = newName.trim();
      await this.persist();
    }
  }

  public async removeDevice(id: string): Promise<void> {
    const idx = this.devices.findIndex((d) => d.id === id);
    if (idx !== -1) {
      this.devices.splice(idx, 1);
      if (this.devices.length === 0) {
        await this.init();
      } else {
        if (this.activeId === id) {
          this.activeId = this.devices[0].id;
        }
        await this.persist();
      }
    }
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.devices));
    } catch {}
  }

  /**
   * Fast subnet HTTP probe for React Native
   */
  public async scanSubnet(
    subnetPrefix = '192.168.1',
    start = 50,
    end = 120,
    onProgress?: (scanned: number, total: number, currentIp: string) => void
  ): Promise<DiscoveredTVDevice[]> {
    const discovered: DiscoveredTVDevice[] = [];
    const total = end - start + 1;
    let count = 0;

    for (let i = start; i <= end; i++) {
      const curIp = `${subnetPrefix}.${i}`;
      count++;
      onProgress?.(count, total, curIp);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(`http://${curIp}:8001/api/v2/`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const dev = data.device || data;
          discovered.push({
            id: dev.id || `tv_${curIp}`,
            ip: curIp,
            port: 8002,
            name: dev.name || data.name || `Samsung TV (${curIp})`,
            modelName: dev.modelName || 'Samsung Smart TV',
          });
        }
      } catch {}
    }

    return discovered;
  }
}

export const nativeTvDeviceManager = new NativeTVDeviceManager();
