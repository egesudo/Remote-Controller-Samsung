/**
 * Security Command Validator
 * 
 * Enforces strict command whitelisting. No arbitrary commands, malformed payloads,
 * or unverified remote keys are permitted to reach the TV socket or transport layer.
 * Future AI and Voice interpretation layers MUST pass all extracted intents through this gate.
 */

import {
  CommandValidationResult,
  ICommandValidator,
  VALID_REMOTE_KEYS,
  ValidRemoteKey,
} from '../types/tv.types.ts';

export class CommandValidator implements ICommandValidator {
  private readonly whitelist = new Set<string>(VALID_REMOTE_KEYS);

  /**
   * Checks whether a raw key string exists in the verified whitelist
   */
  public isKeyWhitelisted(key: string): key is ValidRemoteKey {
    if (!key || typeof key !== 'string') {
      return false;
    }
    return this.whitelist.has(key.trim());
  }

  /**
   * Validates and sanitizes a requested key.
   * Returns a structured validation result.
   */
  public validateKey(rawKey: string): CommandValidationResult {
    if (!rawKey || typeof rawKey !== 'string') {
      return {
        isValid: false,
        error: 'Command key must be a non-empty string.',
      };
    }

    const trimmed = rawKey.trim();

    // Prevent command injection attempts or excessive length
    if (trimmed.length > 50 || /[^A-Z0-9_]/.test(trimmed)) {
      return {
        isValid: false,
        error: `Command '${trimmed}' contains invalid characters or exceeds maximum length.`,
      };
    }

    if (!this.isKeyWhitelisted(trimmed)) {
      return {
        isValid: false,
        error: `Security Violation: '${trimmed}' is not an authorized TV key in the whitelist.`,
      };
    }

    return {
      isValid: true,
      sanitizedKey: trimmed,
    };
  }
}

export const defaultValidator = new CommandValidator();
