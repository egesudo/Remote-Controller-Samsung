import { ValidRemoteKey } from '../types/tv.types';

export const WHITELISTED_TV_KEYS: ReadonlySet<string> = new Set<ValidRemoteKey>([
  'KEY_POWER',
  'KEY_UP',
  'KEY_DOWN',
  'KEY_LEFT',
  'KEY_RIGHT',
  'KEY_ENTER',
  'KEY_RETURN',
  'KEY_HOME',
  'KEY_VOLUP',
  'KEY_VOLDOWN',
  'KEY_MUTE',
  'KEY_CHUP',
  'KEY_CHDOWN',
  'KEY_PLAY',
  'KEY_PAUSE',
  'KEY_STOP',
]);

export class MobileCommandValidator {
  public validateKey(candidateKey: string): { valid: boolean; key?: ValidRemoteKey; error?: string } {
    if (!candidateKey || typeof candidateKey !== 'string') {
      return { valid: false, error: 'Command payload must be a non-empty string' };
    }
    const cleanKey = candidateKey.trim().toUpperCase();
    if (WHITELISTED_TV_KEYS.has(cleanKey)) {
      return { valid: true, key: cleanKey as ValidRemoteKey };
    }
    return {
      valid: false,
      error: `Command rejected by Security Whitelist: "${candidateKey}" is not an authorized TV key.`,
    };
  }
}

export const mobileValidator = new MobileCommandValidator();
