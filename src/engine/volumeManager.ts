/**
 * Estimated Volume State Manager for Samsung TV
 * 
 * Samsung Smart TVs over WebSocket do not provide an absolute volume query or set endpoint
 * (only relative KEY_VOLUP, KEY_VOLDOWN, and KEY_MUTE).
 * 
 * This manager maintains an estimated volume level (default: 15 on a 0-100 scale,
 * typical comfortable Samsung TV volume), persisted in localStorage, to enable
 * absolute target volume voice commands such as:
 * - "sesi 20 seviyesine getir"
 * - "sesi 15 yap"
 * - "sesi 20 yap"
 * - "ses seviyesini 25 yap"
 */

import { ValidRemoteKey } from '../types/tv.types.ts';

const VOLUME_STORAGE_KEY = 'samsung_tv_est_volume';
const DEFAULT_ESTIMATED_VOLUME = 15;
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

type VolumeListener = (level: number) => void;

class VolumeManager {
  private currentVolume: number;
  private listeners: Set<VolumeListener> = new Set();

  constructor() {
    this.currentVolume = this.loadStoredVolume();
  }

  private loadStoredVolume(): number {
    try {
      const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_VOLUME && parsed <= MAX_VOLUME) {
          return parsed;
        }
      }
    } catch {
      // Fall back to default
    }
    return DEFAULT_ESTIMATED_VOLUME;
  }

  public getEstimatedVolume(): number {
    return this.currentVolume;
  }

  public setEstimatedVolume(level: number): void {
    const clamped = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(level)));
    this.currentVolume = clamped;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, clamped.toString());
    } catch {
      // Ignore localStorage errors
    }
    this.notifyListeners();
  }

  public adjustVolume(delta: number): number {
    const newLevel = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, this.currentVolume + delta));
    this.setEstimatedVolume(newLevel);
    return newLevel;
  }

  public onKeyDispatched(key: ValidRemoteKey): void {
    if (key === 'KEY_VOLUP') {
      this.adjustVolume(1);
    } else if (key === 'KEY_VOLDOWN') {
      this.adjustVolume(-1);
    }
  }

  /**
   * Calculates the exact sequence of KEY_VOLUP or KEY_VOLDOWN needed
   * to transition from the current estimated volume to a spoken target volume.
   * e.g. Current: 15, Target: 20 -> Delta: +5 (5x KEY_VOLUP)
   */
  public calculateKeysForTargetVolume(targetLevel: number): {
    keys: ValidRemoteKey[];
    delta: number;
    currentLevel: number;
    targetLevel: number;
  } {
    const clampedTarget = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.round(targetLevel)));
    const current = this.currentVolume;
    const delta = clampedTarget - current;

    const keys: ValidRemoteKey[] = [];
    if (delta > 0) {
      const steps = Math.min(delta, 25); // Cap safe burst at 25 steps
      for (let i = 0; i < steps; i++) {
        keys.push('KEY_VOLUP');
      }
    } else if (delta < 0) {
      const steps = Math.min(Math.abs(delta), 25); // Cap safe burst at 25 steps
      for (let i = 0; i < steps; i++) {
        keys.push('KEY_VOLDOWN');
      }
    }

    return {
      keys,
      delta,
      currentLevel: current,
      targetLevel: clampedTarget,
    };
  }

  public subscribe(listener: VolumeListener): () => void {
    this.listeners.add(listener);
    listener(this.currentVolume);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => {
      try {
        l(this.currentVolume);
      } catch {
        // Ignore listener error
      }
    });
  }
}

export const volumeManager = new VolumeManager();
