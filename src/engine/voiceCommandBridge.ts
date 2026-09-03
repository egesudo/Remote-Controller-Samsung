/**
 * Voice Command Security & Validation Bridge
 * 
 * Strict Gatekeeper connecting Voice & AI Intent Layer directly to CommandValidator.
 * 
 * CORE SECURITY RULE:
 * Speech/AI input MUST NEVER bypass command validation. Every key extracted
 * from spoken input is validated against the strict whitelist before being
 * sent to the TV controller or transport layer.
 */

import { defaultValidator } from './commandValidator.ts';
import { tvController, SamsungTVController } from './samsungTvController.ts';
import { KNOWN_TV_APPS, ModularAppLauncher } from './modularAppLauncher.ts';
import { youTubeService } from './youtube/youtubeService.ts';
import { ICommandValidator, ValidRemoteKey } from '../types/tv.types.ts';
import { StructuredVoiceIntent, VoiceValidationPipelineResult } from '../types/voice.types.ts';

export class VoiceCommandBridge {
  private validator: ICommandValidator;
  private controller: SamsungTVController;
  private appLauncher: ModularAppLauncher;

  constructor(
    validator: ICommandValidator = defaultValidator,
    controller: SamsungTVController = tvController
  ) {
    this.validator = validator;
    this.controller = controller;
    this.appLauncher = new ModularAppLauncher(
      () => this.controller.getConfig()?.host || '',
      (event, data) => this.controller.emitSocketEvent(event, data)
    );
  }

  /**
   * Processes a structured voice intent through the strict command validation pipeline
   * and executes it on the TV only if 100% validated.
   */
  public async processAndExecute(
    intent: StructuredVoiceIntent
  ): Promise<VoiceValidationPipelineResult> {
    const timestamp = Date.now();

    // 1. Check if intent was explicitly rejected or unmapped
    if (intent.actionType === 'REJECTED') {
      this.controller.log(
        'warn',
        `[VOICE GATE] Spoken input '${intent.rawTranscript}' rejected: ${intent.intentExplanation}`
      );
      return {
        intent,
        isValid: false,
        securityViolation: false,
        validatedKeys: [],
        rejectionReason: intent.intentExplanation,
        executed: false,
        timestamp,
      };
    }

    // 2. Handle YouTube Playback (e.g. "play lofi hip hop on YouTube", "watch Bohemian Rhapsody")
    if (intent.actionType === 'YOUTUBE_PLAY') {
      const targetAppId = (intent.targetAppId || KNOWN_TV_APPS.YOUTUBE.id).trim();

      // Strict check: Only authorized YouTube application ID permitted
      if (targetAppId !== KNOWN_TV_APPS.YOUTUBE.id) {
        const errorMsg = `Security Violation: App ID '${targetAppId}' is not authorized for YouTube playback.`;
        this.controller.log('error', `[VOICE GATE] ${errorMsg}`);
        return {
          intent,
          isValid: false,
          securityViolation: true,
          rejectionReason: errorMsg,
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      // Resolve video ID or search payload
      let resolvedVideoId: string | null = null;
      const explicitVideoId = intent.youtubeVideoId ? youTubeService.extractVideoId(intent.youtubeVideoId) : null;

      if (explicitVideoId) {
        resolvedVideoId = explicitVideoId;
      } else if (intent.youtubeQuery) {
        // Match against curated videos first for instant accurate playback
        const searchMatches = await youTubeService.searchVideos(intent.youtubeQuery);
        if (searchMatches.length > 0) {
          resolvedVideoId = searchMatches[0].id;
        }
      }

      // Formulate launch payload
      let payload = '';
      if (resolvedVideoId) {
        payload = `v=${encodeURIComponent(resolvedVideoId)}`;
      } else if (intent.youtubeQuery) {
        payload = `q=${encodeURIComponent(intent.youtubeQuery.trim())}`;
      }

      // Security sanitization on payload
      if (/[<>"'`\\$]/.test(payload)) {
        const errorMsg = 'Security Violation: YouTube payload contains illegal or unsafe characters.';
        this.controller.log('error', `[VOICE GATE] ${errorMsg}`);
        return {
          intent,
          isValid: false,
          securityViolation: true,
          rejectionReason: errorMsg,
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      this.controller.log(
        'info',
        `[VOICE GATE PASSED] Verified authorized YouTube action with payload "${payload || 'Default Launch'}" for "${intent.rawTranscript}"`
      );

      let executed = false;
      let executionError: string | undefined;

      try {
        executed = await this.appLauncher.launchYouTube(payload || undefined);
        if (executed) {
          this.controller.log(
            'info',
            `[VOICE GATE] Successfully launched YouTube (${payload ? payload : 'Home'}) on TV.`
          );
        } else {
          executionError = 'TV did not acknowledge YouTube launch request. Check LAN connection or TV power.';
          this.controller.log('warn', `[VOICE GATE] ${executionError}`);
        }
      } catch (err) {
        executionError = err instanceof Error ? err.message : String(err);
        this.controller.log('error', `[VOICE GATE] Error executing voice YouTube launch: ${executionError}`);
      }

      return {
        intent,
        isValid: true,
        securityViolation: false,
        validatedKeys: [],
        appLaunchPayload: payload,
        executed,
        executionError,
        timestamp,
      };
    }

    // 3. Handle YouTube Search (e.g. "search YouTube for 4k nature", "find jazz on YouTube")
    if (intent.actionType === 'YOUTUBE_SEARCH') {
      const targetAppId = (intent.targetAppId || KNOWN_TV_APPS.YOUTUBE.id).trim();

      if (targetAppId !== KNOWN_TV_APPS.YOUTUBE.id) {
        const errorMsg = `Security Violation: App ID '${targetAppId}' is not authorized for YouTube search.`;
        this.controller.log('error', `[VOICE GATE] ${errorMsg}`);
        return {
          intent,
          isValid: false,
          securityViolation: true,
          rejectionReason: errorMsg,
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      const cleanQuery = (intent.youtubeQuery || '').trim();
      if (!cleanQuery) {
        return {
          intent,
          isValid: false,
          securityViolation: false,
          rejectionReason: 'Search query is empty.',
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      // Security check for query sanitization
      if (/[<>"'`\\$]/.test(cleanQuery)) {
        const errorMsg = 'Security Violation: YouTube search query contains forbidden characters.';
        this.controller.log('error', `[VOICE GATE] ${errorMsg}`);
        return {
          intent,
          isValid: false,
          securityViolation: true,
          rejectionReason: errorMsg,
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      const payload = `q=${encodeURIComponent(cleanQuery)}`;
      this.controller.log(
        'info',
        `[VOICE GATE PASSED] Verified authorized YouTube search for "${cleanQuery}" (payload: ${payload})`
      );

      let executed = false;
      let executionError: string | undefined;

      try {
        executed = await this.appLauncher.launchYouTube(payload);
        if (executed) {
          this.controller.log('info', `[VOICE GATE] Dispatched YouTube search for "${cleanQuery}" to TV.`);
        } else {
          executionError = 'TV did not acknowledge YouTube search launch request.';
          this.controller.log('warn', `[VOICE GATE] ${executionError}`);
        }
      } catch (err) {
        executionError = err instanceof Error ? err.message : String(err);
        this.controller.log('error', `[VOICE GATE] Error executing voice YouTube search: ${executionError}`);
      }

      return {
        intent,
        isValid: true,
        securityViolation: false,
        validatedKeys: [],
        appLaunchPayload: payload,
        executed,
        executionError,
        timestamp,
      };
    }

    // 4. Handle General Application Launch (e.g. YouTube general open)
    if (intent.actionType === 'LAUNCH_APP') {
      const targetAppId = (intent.targetAppId || '').trim();

      // Validate that the requested App ID is in the approved KNOWN_TV_APPS registry
      const approvedApp = Object.values(KNOWN_TV_APPS).find(
        (app) => app.id === targetAppId
      );

      if (!approvedApp) {
        const errorMsg = `Security Violation: App ID '${targetAppId}' is not authorized in KNOWN_TV_APPS whitelist.`;
        this.controller.log('error', `[VOICE GATE] ${errorMsg}`);
        return {
          intent,
          isValid: false,
          securityViolation: true,
          rejectionReason: errorMsg,
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      this.controller.log(
        'info',
        `[VOICE GATE] Validation PASSED for authorized app launch: ${approvedApp.name} (${approvedApp.id})`
      );

      let executed = false;
      let executionError: string | undefined;

      try {
        executed = await this.appLauncher.launchApp(approvedApp.id);
        if (executed) {
          this.controller.log(
            'info',
            `[VOICE GATE] Successfully launched ${approvedApp.name} via voice action.`
          );
        } else {
          executionError = `TV did not acknowledge app launch request for ${approvedApp.name}.`;
          this.controller.log('warn', `[VOICE GATE] ${executionError}`);
        }
      } catch (err) {
        executionError = err instanceof Error ? err.message : String(err);
        this.controller.log(
          'error',
          `[VOICE GATE] Error executing voice app launch: ${executionError}`
        );
      }

      return {
        intent,
        isValid: true,
        securityViolation: false,
        validatedKeys: [],
        executed,
        executionError,
        timestamp,
      };
    }

    // 5. Handle Single Key or Key Sequences (e.g. Volume Up, Mute, Channel Down)
    if (intent.actionType === 'SEND_KEY' || intent.actionType === 'KEY_SEQUENCE') {
      let requestedKeys = intent.requestedKeys || [];

      // Expand single key with repeatCount into sequence (e.g. "sesi 10 kademe arttır" -> 10 x KEY_VOLUP)
      if (intent.repeatCount && intent.repeatCount > 1 && requestedKeys.length === 1) {
        const count = Math.min(intent.repeatCount, 15);
        requestedKeys = Array(count).fill(requestedKeys[0]);
      }

      if (requestedKeys.length === 0) {
        return {
          intent,
          isValid: false,
          securityViolation: false,
          rejectionReason: 'Niyet herhangi bir hedef tuş içermiyor.',
          validatedKeys: [],
          executed: false,
          timestamp,
        };
      }

      // CRITICAL GATE: Validate EVERY SINGLE KEY against the command whitelist
      const validatedKeys: ValidRemoteKey[] = [];

      for (const key of requestedKeys) {
        const validation = this.validator.validateKey(key);

        if (!validation.isValid || !validation.sanitizedKey) {
          const violationMsg =
            validation.error ||
            `Güvenlik Engeli: '${key}' tuşu izinli TV kumanda listesinde yer almıyor.`;

          this.controller.log(
            'error',
            `[SESLİ GEÇİT ENGELLENDİ] ${violationMsg} (Söylenen: "${intent.rawTranscript}")`
          );

          return {
            intent,
            isValid: false,
            securityViolation: true,
            rejectionReason: violationMsg,
            validatedKeys: [],
            executed: false,
            timestamp,
          };
        }

        validatedKeys.push(validation.sanitizedKey);
      }

      // If we got here, every requested key has passed whitelist validation!
      this.controller.log(
        'info',
        `[SESLİ GEÇİT ONAYLANDI] ${validatedKeys.length} tuş [${validatedKeys[0]}${
          validatedKeys.length > 1 ? ` x${validatedKeys.length}` : ''
        }] beyaz listeden geçti. (Söylenen: "${intent.rawTranscript}")`
      );

      // Check if TV is connected. If KEY_POWER requested and disconnected, attempt auto-connect
      let connectionState = this.controller.getConnectionState();
      if (connectionState !== 'CONNECTED' && validatedKeys.includes('KEY_POWER')) {
        const config = this.controller.getConfig();
        if (config?.host) {
          this.controller.log(
            'info',
            `[SESLİ GEÇİT] TV kapalı/bağlantısız (${connectionState}). 'KEY_POWER' için soket bağlantısı deneniyor...`
          );
          try {
            await Promise.race([
              this.controller.connect(config),
              new Promise((r) => setTimeout(r, 1200)),
            ]);
            connectionState = this.controller.getConnectionState();
          } catch {
            // will handle below
          }
        }
      }

      if (connectionState !== 'CONNECTED') {
        const connMsg = validatedKeys.includes('KEY_POWER')
          ? `TV şu anda bağlı değil (Durum: ${connectionState}). TV bekleme (standby) modunda olduğunda yerel ağ soketi kapalı olabilir. Lütfen TV'nin açık olduğundan emin olun veya 'Bağlan' butonunu kullanın.`
          : `TV bağlantısı aktif değil (Durum: ${connectionState}). Komutun TV'ye iletilebilmesi için lütfen önce 'Bağlan' butonuna basın.`;
        
        this.controller.log('warn', `[SESLİ GEÇİT] ${connMsg}`);

        return {
          intent,
          isValid: true,
          securityViolation: false,
          validatedKeys,
          executed: false,
          executionError: connMsg,
          timestamp,
        };
      }

      // Execute verified keys sequentially with safe spacing
      let allSucceeded = true;
      let executionError: string | undefined;

      try {
        for (let i = 0; i < validatedKeys.length; i++) {
          const key = validatedKeys[i];
          const success = await this.controller.sendKey(key);
          if (!success) {
            allSucceeded = false;
            executionError = `${key} komutu TV soketine iletilemedi.`;
            break;
          }

          // Small inter-key delay for sequences (e.g. volume + 10 times)
          if (i < validatedKeys.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        }
      } catch (err) {
        allSucceeded = false;
        executionError = err instanceof Error ? err.message : String(err);
      }

      return {
        intent,
        isValid: true,
        securityViolation: false,
        validatedKeys,
        executed: allSucceeded,
        executionError,
        timestamp,
      };
    }

    // Default catch-all
    return {
      intent,
      isValid: false,
      securityViolation: false,
      rejectionReason: 'Unhandled voice action type.',
      validatedKeys: [],
      executed: false,
      timestamp,
    };
  }
}

export const voiceCommandBridge = new VoiceCommandBridge();
