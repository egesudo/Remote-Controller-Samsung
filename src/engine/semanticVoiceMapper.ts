/**
 * Semantic Voice Mapping Engine
 * 
 * Provides an intelligent semantic interpretation layer that maps unstructured,
 * natural language voice inputs (Turkish and English) to validated TV actions.
 * 
 * Specifically addresses natural language inputs such as:
 * - "Televizyonu aç" -> Semantic Category 'POWER_ON' -> 'KEY_POWER'
 * - "Sesi 10 birim artır" -> Semantic Category 'VOLUME_UP' -> 'KEY_VOLUP' (10 units / repeatCount: 10)
 * - "Sesi 5 birim kıs" -> Semantic Category 'VOLUME_DOWN' -> 'KEY_VOLDOWN' (5 units / repeatCount: 5)
 * - "Kanalı değiştir" -> Semantic Category 'CHANNEL_UP' -> 'KEY_CHUP'
 * - "YouTube'u aç" -> Semantic Category 'YOUTUBE_LAUNCH' -> LAUNCH_APP (YouTube ID)
 * 
 * SECURITY MANDATE:
 * All mapped keys produced by this semantic layer MUST be validated against
 * the CommandValidator whitelist before dispatch to the Samsung TV WebSocket.
 */

import { ValidRemoteKey } from '../types/tv.types.ts';
import { StructuredVoiceIntent, VoiceActionType } from '../types/voice.types.ts';
import { KNOWN_TV_APPS } from './modularAppLauncher.ts';
import { volumeManager } from './volumeManager.ts';

export type SemanticCategory =
  | 'POWER_ON'
  | 'POWER_OFF'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'VOLUME_SET'
  | 'MUTE'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'HOME'
  | 'BACK'
  | 'CONFIRM'
  | 'NAV_UP'
  | 'NAV_DOWN'
  | 'NAV_LEFT'
  | 'NAV_RIGHT'
  | 'MEDIA_PLAY'
  | 'MEDIA_PAUSE'
  | 'MEDIA_STOP'
  | 'YOUTUBE_LAUNCH'
  | 'YOUTUBE_SEARCH'
  | 'YOUTUBE_PLAY'
  | 'SECURITY_REJECTION'
  | 'UNKNOWN';

export interface SemanticMappingResult {
  matched: boolean;
  category: SemanticCategory;
  actionType: VoiceActionType;
  targetKey?: ValidRemoteKey;
  targetKeys: ValidRemoteKey[];
  repeatCount: number;
  extractedUnits?: number;
  unitLabel?: string;
  explanation: string;
  confidence: number;
  rawTranscript: string;
  normalizedTranscript: string;
  metadata?: {
    appId?: string;
    appName?: string;
    query?: string;
    videoId?: string;
    isTurningOn?: boolean;
  };
}

// Word numbers mapping in Turkish & English
const WORD_NUMBERS: Record<string, number> = {
  'bir': 1, 'one': 1,
  'iki': 2, 'two': 2,
  'üç': 3, 'three': 3,
  'dört': 4, 'four': 4,
  'beş': 5, 'five': 5,
  'altı': 6, 'six': 6,
  'yedi': 7, 'seven': 7,
  'sekiz': 8, 'eight': 8,
  'dokuz': 9, 'nine': 9,
  'on': 10, 'ten': 10,
  'on bir': 11, 'onbir': 11, 'eleven': 11,
  'on iki': 12, 'oniki': 12, 'twelve': 12,
  'on üç': 13, 'onüç': 13, 'thirteen': 13,
  'on dört': 14, 'ondört': 14, 'fourteen': 14,
  'on beş': 15, 'onbeş': 15, 'fifteen': 15,
  'on altı': 16, 'onaltı': 16, 'sixteen': 16,
  'on yedi': 17, 'onyedi': 17, 'seventeen': 17,
  'on sekiz': 18, 'onsekiz': 18, 'eighteen': 18,
  'on dokuz': 19, 'ondokuz': 19, 'nineteen': 19,
  'yirmi': 20, 'twenty': 20,
  'yirmi bir': 21, 'yirmibir': 21,
  'yirmi iki': 22, 'yirmiiki': 22,
  'yirmi üç': 23, 'yirmiüç': 23,
  'yirmi dört': 24, 'yirmidört': 24,
  'yirmi beş': 25, 'yirmibeş': 25,
  'otuz': 30, 'thirty': 30,
  'kırk': 40, 'forty': 40,
  'elli': 50, 'fifty': 50,
};

// Recognized unit nouns in speech
const UNIT_NOUNS_PATTERN = '(?:birim|kademe|seviye|basamak|tık|adım|puan|derece|kere|defa|kez|units|unit|steps|step|levels|level|clicks|times)';

/**
 * Normalizes input speech text for semantic analysis
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/['’`"]/g, '') // remove apostrophes e.g. tv'yi -> tvyi
    .replace(/\s+/g, ' '); // collapse extra spaces
}

/**
 * Extracts numeric quantity or word quantity accompanied by a unit
 * Handles broad, natural phrasing:
 * - "sesi 2 artır" -> { count: 2 }
 * - "sesi 5 azalt" -> { count: 5 }
 * - "10 birim artır" -> { count: 10, unit: 'birim' }
 * - "on birim artır" -> { count: 10, unit: 'birim' }
 * - "sesi biraz artır" -> { count: 2, unit: 'biraz' }
 * - "sesi çok artır" -> { count: 5, unit: 'çok' }
 */
export function extractQuantityAndUnit(text: string): { count: number; unit?: string } {
  const clean = normalizeTranscript(text);

  // Check for qualitative quantities
  if (clean.includes('biraz')) {
    return { count: 2, unit: 'biraz' };
  }
  if (clean.includes('cok') || clean.includes('çok') || clean.includes('fazla')) {
    return { count: 5, unit: 'çok' };
  }

  // 1. Numeric digit with optional unit noun or verb
  // e.g. "2 artır", "5 azalt", "10 birim", "10 kademe", "10 kere", "10"
  const digitRegex = new RegExp(`(\\d+)\\s*(${UNIT_NOUNS_PATTERN})?`, 'i');
  const digitMatch = clean.match(digitRegex);
  if (digitMatch && digitMatch[1]) {
    const val = parseInt(digitMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      return {
        count: Math.min(val, 25), // capped safely at 25 commands
        unit: digitMatch[2] || undefined,
      };
    }
  }

  // 2. Word-based number with optional unit noun
  // Sort descending by string length so multi-word numbers like "on beş" match before "on"
  const sortedWords = Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sortedWords) {
    const wordRegex = new RegExp(`\\b${word}\\s*(${UNIT_NOUNS_PATTERN})?\\b`, 'i');
    const wordMatch = clean.match(wordRegex);
    if (wordMatch) {
      return {
        count: num,
        unit: wordMatch[1] || undefined,
      };
    }
  }

  return { count: 1, unit: undefined };
}

export class SemanticVoiceMapper {
  /**
   * Main semantic parser: Evaluates input transcript against structured semantic patterns
   */
  public static map(rawTranscript: string): SemanticMappingResult {
    const normalized = normalizeTranscript(rawTranscript);

    // Default unmapped template
    const defaultResult: SemanticMappingResult = {
      matched: false,
      category: 'UNKNOWN',
      actionType: 'REJECTED',
      targetKeys: [],
      repeatCount: 1,
      explanation: `Komut anlaşılamadı: '${rawTranscript}' geçerli bir TV kontrol eylemine eşlenemedi.`,
      confidence: 0,
      rawTranscript,
      normalizedTranscript: normalized,
    };

    if (!normalized) {
      return {
        ...defaultResult,
        explanation: 'Boş ses girdisi alındı.',
      };
    }

    // 0. Security Rejection Gate: Destructive or Malicious commands
    if (this.isSecurityViolation(normalized)) {
      return {
        matched: true,
        category: 'SECURITY_REJECTION',
        actionType: 'REJECTED',
        targetKeys: [],
        repeatCount: 0,
        explanation: 'Güvenlik Geçidi Engeli: İzin verilmeyen, yetkisiz veya TV dışı komut engellendi.',
        confidence: 1.0,
        rawTranscript,
        normalizedTranscript: normalized,
      };
    }

    // 1. YouTube Specialized Queries & Commands
    const ytResult = this.checkYouTubeSemantics(rawTranscript, normalized);
    if (ytResult) return ytResult;

    // 2. Power Semantics (e.g. "Televizyonu aç", "Televizyonu kapat", "TV aç")
    const powerResult = this.checkPowerSemantics(rawTranscript, normalized);
    if (powerResult) return powerResult;

    // 3. Target Volume Semantics (e.g. "Sesi 20 seviyesine getir", "Sesi 15 yap", "Sesi 20 yap", "Set volume to 20")
    const targetVolResult = this.checkTargetVolumeSemantics(rawTranscript, normalized);
    if (targetVolResult) return targetVolResult;

    // 4. Mute Semantics (e.g. "Sesi kapat", "Sesi kes", "Sessize al", "Mute")
    const muteResult = this.checkMuteSemantics(rawTranscript, normalized);
    if (muteResult) return muteResult;

    // 5. Volume Up Semantics (e.g. "Sesi 2 artır", "2 artır", "Sesi 10 birim artır", "Sesi aç", "Volume up")
    const volUpResult = this.checkVolumeUpSemantics(rawTranscript, normalized);
    if (volUpResult) return volUpResult;

    // 6. Volume Down Semantics (e.g. "Sesi 5 azalt", "5 azalt", "Sesi 5 birim kıs", "Sesi düşür")
    const volDownResult = this.checkVolumeDownSemantics(rawTranscript, normalized);
    if (volDownResult) return volDownResult;

    // 6. Channel Navigation Semantics (e.g. "Kanalı değiştir", "Sonraki kanal", "Önceki kanal")
    const channelResult = this.checkChannelSemantics(rawTranscript, normalized);
    if (channelResult) return channelResult;

    // 7. System Navigation Semantics (Home, Back, OK/Enter, Directional Arrows)
    const navResult = this.checkNavigationSemantics(rawTranscript, normalized);
    if (navResult) return navResult;

    // 8. Media Playback Semantics (Play, Pause, Stop)
    const mediaResult = this.checkMediaSemantics(rawTranscript, normalized);
    if (mediaResult) return mediaResult;

    return defaultResult;
  }

  /**
   * Evaluates security violations
   */
  private static isSecurityViolation(clean: string): boolean {
    const dangerousPatterns = [
      'format',
      'wipe',
      'rm -rf',
      'factory_reset',
      'hack',
      'malware',
      'exploit',
      'bash',
      'sudo',
      'sh ',
      'curl ',
      'wget ',
    ];
    return dangerousPatterns.some((pattern) => clean.includes(pattern));
  }

  /**
   * Maps Power commands
   * Handles: "Televizyonu aç", "TV aç", "TV'yi aç", "ekranı aç", "cihazı aç", "turn on", "turn on the TV", "power on"
   * And: "Televizyonu kapat", "TV kapat", "TV'yi kapat", "kapat", "turn off", "power off"
   */
  private static checkPowerSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // Power On variants
    const isPowerOn =
      clean.includes('televizyonu ac') ||
      clean.includes('televizyon ac') ||
      clean.includes('televizyonu aç') ||
      clean.includes('televizyon aç') ||
      clean.includes('tvyi ac') ||
      clean.includes('tvyi aç') ||
      clean.includes('tv ac') ||
      clean.includes('tv aç') ||
      clean.includes('ekrani ac') ||
      clean.includes('ekranı aç') ||
      clean.includes('cihazi ac') ||
      clean.includes('cihazı aç') ||
      clean.includes('tv calistir') ||
      clean.includes('tv çalıştır') ||
      clean.includes('televizyonu calistir') ||
      clean.includes('televizyonu çalıştır') ||
      clean.includes('turn on tv') ||
      clean.includes('turn on the tv') ||
      clean.includes('turn on') ||
      clean.includes('power on') ||
      clean === 'ac' ||
      clean === 'aç';

    // Power Off variants
    const isPowerOff =
      clean.includes('televizyonu kapat') ||
      clean.includes('televizyon kapat') ||
      clean.includes('tvyi kapat') ||
      clean.includes('tv kapat') ||
      clean.includes('ekrani kapat') ||
      clean.includes('ekranı kapat') ||
      clean.includes('cihazi kapat') ||
      clean.includes('cihazı kapat') ||
      clean.includes('turn off tv') ||
      clean.includes('turn off the tv') ||
      clean.includes('turn off') ||
      clean.includes('power off') ||
      clean.includes('shut down tv') ||
      clean === 'kapat' ||
      clean === 'kapa' ||
      clean === 'power';

    if (isPowerOn) {
      return {
        matched: true,
        category: 'POWER_ON',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_POWER',
        targetKeys: ['KEY_POWER'],
        repeatCount: 1,
        explanation: 'Televizyonu Aç (KEY_POWER)',
        confidence: 0.99,
        rawTranscript: raw,
        normalizedTranscript: clean,
        metadata: { isTurningOn: true },
      };
    }

    if (isPowerOff) {
      return {
        matched: true,
        category: 'POWER_OFF',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_POWER',
        targetKeys: ['KEY_POWER'],
        repeatCount: 1,
        explanation: 'Televizyonu Kapat (KEY_POWER)',
        confidence: 0.99,
        rawTranscript: raw,
        normalizedTranscript: clean,
        metadata: { isTurningOn: false },
      };
    }

    return null;
  }

  /**
   * Maps Target / Absolute Volume Level commands
   * Handles broad, natural phrasing:
   * - "sesi 20 seviyesine getir"
   * - "sesi 15 yap"
   * - "sesi 20 yap"
   * - "sesi 15 seviyesine ayarla"
   * - "ses seviyesini 20 yap"
   * - "ses seviyesi 15 olsun"
   * - "sesi 25'e getir"
   * - "sesi 10'a çek"
   * - "sesi 30 yap"
   * - "sesi yirmi yap", "sesi on beş yap"
   * - "set volume to 20", "make volume 15", "volume 20"
   */
  private static checkTargetVolumeSemantics(raw: string, clean: string): SemanticMappingResult | null {
    const hasSound = clean.includes('ses') || clean.includes('volume') || clean.includes('sound');
    const hasTargetVerb =
      clean.includes('yap') ||
      clean.includes('getir') ||
      clean.includes('ayarla') ||
      clean.includes('olsun') ||
      clean.includes('cek') ||
      clean.includes('çek') ||
      clean.includes('seviye') ||
      clean.includes('kademe') ||
      clean.includes('derece') ||
      clean.includes('set') ||
      clean.includes('make');

    // If it's pure relative increase/decrease without target words, let relative handlers take it
    const isExplicitRelative =
      (clean.includes('art') || clean.includes('yukselt') || clean.includes('yükselt') || clean.includes('azalt') || clean.includes('kis') || clean.includes('kıs') || clean.includes('dusur') || clean.includes('düşür')) &&
      !clean.includes('seviye') &&
      !clean.includes('getir') &&
      !clean.includes('yap') &&
      !clean.includes('ayarla');

    if (isExplicitRelative) return null;
    if (!hasSound && !clean.match(/^\d+\s*(?:seviyesine|yap|getir|ayarla)/)) return null;
    if (!hasTargetVerb && !clean.includes('to')) return null;

    let target: number | undefined;

    // 1. Digits match:
    // e.g. "sesi 20 seviyesine getir", "sesi 15 yap", "sesi 20 yap", "ses 25 olsun", "sesi 10'a çek"
    const digitMatch =
      clean.match(/(?:ses(?:i|ini| seviyesini| seviyesi)?|volume)\s*(?:seviyesini|seviyesi)?\s*(\d+)/i) ||
      clean.match(/(\d+)\s*(?:'?[ye|ya|e|a])?\s*(?:seviyesine|derecesine|kademesine)?\s*(?:getir|yap|ayarla|cek|çek|olsun)/i) ||
      clean.match(/(?:set|make|turn|change)\s*(?:the\s*)?volume\s*(?:to\s*)?(\d+)/i) ||
      clean.match(/(?:volume|ses)\s*(?:to\s*)?(\d+)/i) ||
      clean.match(/(\d+)\s*(?:yap|ayarla|getir)/i);

    if (digitMatch && digitMatch[1]) {
      const parsed = parseInt(digitMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        target = parsed;
      }
    }

    // 2. Word-based numbers match:
    // e.g. "sesi yirmi yap", "sesi on beş yap", "sesi yirmi seviyesine getir"
    if (target === undefined) {
      const sortedWords = Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length);
      for (const [word, num] of sortedWords) {
        if (
          clean.includes(word) &&
          (clean.includes('yap') ||
            clean.includes('getir') ||
            clean.includes('ayarla') ||
            clean.includes('olsun') ||
            clean.includes('seviye') ||
            clean.includes('set') ||
            clean.includes('make'))
        ) {
          target = num;
          break;
        }
      }
    }

    if (target === undefined) return null;

    // Calculate transition sequence and update estimated volume
    const { keys, delta, currentLevel, targetLevel } = volumeManager.calculateKeysForTargetVolume(target);
    volumeManager.setEstimatedVolume(targetLevel);

    const explanation =
      delta === 0
        ? `TV Ses Seviyesi Zaten ${targetLevel} Seviyesinde (Tahmini: ${currentLevel})`
        : delta > 0
          ? `TV Ses Seviyesini ${targetLevel} Seviyesine Getir (+${delta} Adım / ${delta}x KEY_VOLUP) [Tahmini: ${currentLevel} -> ${targetLevel}]`
          : `TV Ses Seviyesini ${targetLevel} Seviyesine Getir (-${Math.abs(delta)} Adım / ${Math.abs(delta)}x KEY_VOLDOWN) [Tahmini: ${currentLevel} -> ${targetLevel}]`;

    return {
      matched: true,
      category: 'VOLUME_SET',
      actionType: keys.length > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      targetKey: keys[0] || 'KEY_VOLUP',
      targetKeys: keys,
      repeatCount: keys.length,
      extractedUnits: targetLevel,
      unitLabel: 'seviye',
      explanation,
      confidence: 0.99,
      rawTranscript: raw,
      normalizedTranscript: clean,
    };
  }

  /**
   * Maps Volume Up commands broadly without requiring rigid phrasing
   * Handles:
   * - "Sesi 2 artır" / "Sesi 2 arttır"
   * - "2 artır" / "2 arttır"
   * - "Sesi 10 birim artır" / "Sesi 5 kademe artır"
   * - "Sesi aç" / "Sesi yükselt" / "Sesi biraz artır" / "Sesi çok artır"
   * - "Biraz aç" / "Ses 3 artsın" / "Volume up" / "Turn up"
   */
  private static checkVolumeUpSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // Exclude channel navigation
    if (clean.includes('kanal') || clean.includes('channel')) return null;

    const hasSoundWord = clean.includes('ses') || clean.includes('volume') || clean.includes('sound');
    const hasIncreaseAction =
      clean.includes('art') || // artır, arttır, artsın, artıralım
      clean.includes('yukselt') ||
      clean.includes('yükselt') ||
      clean.includes('turn up') ||
      clean.includes('increase') ||
      clean.includes('louder');

    // Direct standalone volume up phrases
    const isDirectVolUp =
      (hasSoundWord && hasIncreaseAction) ||
      clean.includes('volume up') ||
      clean.includes('louder') ||
      clean.includes('turn up') ||
      clean === 'ses aç' ||
      clean === 'sesi aç' ||
      clean === 'biraz aç' ||
      clean.includes('sesi biraz artır') ||
      clean.includes('sesi çok artır') ||
      /^\d+\s*(?:art|yükselt|yukselt)/i.test(clean) ||
      clean.includes('artır') ||
      clean.includes('arttır') ||
      clean.includes('yükselt') ||
      clean.includes('yukselt');

    if (!isDirectVolUp) return null;

    const { count, unit } = extractQuantityAndUnit(clean);
    const keys = Array(count).fill('KEY_VOLUP') as ValidRemoteKey[];
    const unitText = unit ? ` ${unit}` : (count > 1 ? ' adım' : '');

    // Synchronize volume manager state
    volumeManager.adjustVolume(count);

    return {
      matched: true,
      category: 'VOLUME_UP',
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      targetKey: 'KEY_VOLUP',
      targetKeys: keys,
      repeatCount: count,
      extractedUnits: count,
      unitLabel: unit || 'birim',
      explanation: count > 1
        ? `TV Sesini Yükselt (+${count}${unitText} / ${count}x KEY_VOLUP)`
        : 'TV Sesini Yükselt (+1 / KEY_VOLUP)',
      confidence: 0.99,
      rawTranscript: raw,
      normalizedTranscript: clean,
    };
  }

  /**
   * Maps Volume Down commands broadly without requiring rigid phrasing
   * Handles:
   * - "Sesi 5 azalt"
   * - "5 azalt" / "5 kıs"
   * - "Sesi 2 kıs" / "2 kıs"
   * - "Sesi 10 birim azalt" / "Sesi 5 kademe kıs"
   * - "Sesi kıs" / "Sesi düşür" / "Sesi alçalt"
   * - "Biraz kıs" / "Sesi biraz kıs" / "Turn down volume"
   */
  private static checkVolumeDownSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // Exclude channel navigation
    if (clean.includes('kanal') || clean.includes('channel')) return null;

    const hasSoundWord = clean.includes('ses') || clean.includes('volume') || clean.includes('sound');
    const hasDecreaseAction =
      clean.includes('kis') || // kıs, kısar mısın, kısın
      clean.includes('kıs') ||
      clean.includes('azalt') ||
      clean.includes('azalsın') ||
      clean.includes('dusur') ||
      clean.includes('düşür') ||
      clean.includes('alcalt') ||
      clean.includes('alçalt') ||
      clean.includes('turn down') ||
      clean.includes('decrease') ||
      clean.includes('quieter') ||
      clean.includes('softer');

    // Direct standalone volume down phrases
    const isDirectVolDown =
      (hasSoundWord && hasDecreaseAction) ||
      clean.includes('volume down') ||
      clean.includes('quieter') ||
      clean.includes('turn down') ||
      clean === 'biraz kıs' ||
      clean === 'biraz azalt' ||
      clean === 'sesi kıs' ||
      clean === 'ses kıs' ||
      clean.includes('sesi biraz kıs') ||
      /^\d+\s*(?:azalt|kıs|kis|düşür|dusur)/i.test(clean) ||
      clean.includes('azalt') ||
      clean.includes('düşür') ||
      clean.includes('alçalt');

    if (!isDirectVolDown) return null;

    const { count, unit } = extractQuantityAndUnit(clean);
    const keys = Array(count).fill('KEY_VOLDOWN') as ValidRemoteKey[];
    const unitText = unit ? ` ${unit}` : (count > 1 ? ' adım' : '');

    // Synchronize volume manager state
    volumeManager.adjustVolume(-count);

    return {
      matched: true,
      category: 'VOLUME_DOWN',
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      targetKey: 'KEY_VOLDOWN',
      targetKeys: keys,
      repeatCount: count,
      extractedUnits: count,
      unitLabel: unit || 'birim',
      explanation: count > 1
        ? `TV Sesini Azalt (-${count}${unitText} / ${count}x KEY_VOLDOWN)`
        : 'TV Sesini Azalt (-1 / KEY_VOLDOWN)',
      confidence: 0.99,
      rawTranscript: raw,
      normalizedTranscript: clean,
    };
  }

  /**
   * Maps Mute commands
   */
  private static checkMuteSemantics(raw: string, clean: string): SemanticMappingResult | null {
    const isMute =
      clean === 'mute' ||
      clean.includes('mute') ||
      clean.includes('unmute') ||
      clean.includes('sessize al') ||
      clean.includes('sessiz') ||
      clean.includes('sustur') ||
      clean.includes('sesi kapat') ||
      clean.includes('ses kapat') ||
      clean.includes('sesi kapa') ||
      clean.includes('sesi kes') ||
      clean.includes('ses kes') ||
      clean.includes('silence');

    if (!isMute) return null;

    return {
      matched: true,
      category: 'MUTE',
      actionType: 'SEND_KEY',
      targetKey: 'KEY_MUTE',
      targetKeys: ['KEY_MUTE'],
      repeatCount: 1,
      explanation: 'Sesi Aç/Kapat (Mute / KEY_MUTE)',
      confidence: 0.98,
      rawTranscript: raw,
      normalizedTranscript: clean,
    };
  }

  /**
   * Maps Channel Up / Down commands
   * Handles: "Kanalı değiştir", "Sonraki kanal", "Önceki kanal", "Kanal yukarı", etc.
   */
  private static checkChannelSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // Channel Next / Up
    const isChannelUp =
      clean.includes('channel up') ||
      clean.includes('next channel') ||
      clean.includes('kanal yukari') ||
      clean.includes('kanal yukarı') ||
      clean.includes('sonraki kanal') ||
      clean.includes('kanali artir') ||
      clean.includes('kanalı artır') ||
      clean.includes('kanali arttir') ||
      clean.includes('kanalı arttır') ||
      clean.includes('ileri kanal') ||
      clean.includes('kanal ileri') ||
      clean.includes('kanal degistir') ||
      clean.includes('kanal değiştir') ||
      clean.includes('kanali degistir') ||
      clean.includes('kanalı değiştir') ||
      clean.includes('sonraki kanala gec') ||
      clean.includes('sonraki kanala geç') ||
      clean.includes('kanal atla');

    if (isChannelUp) {
      return {
        matched: true,
        category: 'CHANNEL_UP',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_CHUP',
        targetKeys: ['KEY_CHUP'],
        repeatCount: 1,
        explanation: 'Sonraki Kanala Geç (KEY_CHUP)',
        confidence: 0.98,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    // Channel Previous / Down
    const isChannelDown =
      clean.includes('channel down') ||
      clean.includes('previous channel') ||
      clean.includes('kanal asagi') ||
      clean.includes('kanal aşağı') ||
      clean.includes('onceki kanal') ||
      clean.includes('önceki kanal') ||
      clean.includes('kanali azalt') ||
      clean.includes('kanalı azalt') ||
      clean.includes('kanali dusur') ||
      clean.includes('kanalı düşür') ||
      clean.includes('geri kanal') ||
      clean.includes('kanal geri') ||
      clean.includes('onceki kanala gec') ||
      clean.includes('önceki kanala geç');

    if (isChannelDown) {
      return {
        matched: true,
        category: 'CHANNEL_DOWN',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_CHDOWN',
        targetKeys: ['KEY_CHDOWN'],
        repeatCount: 1,
        explanation: 'Önceki Kanala Geç (KEY_CHDOWN)',
        confidence: 0.98,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    return null;
  }

  /**
   * Maps Navigation, Directional, and Home/Back semantics
   */
  private static checkNavigationSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // 1. Home / Smart Hub
    if (
      clean.includes('home') ||
      clean.includes('smart hub') ||
      clean.includes('main menu') ||
      clean.includes('ana sayfa') ||
      clean.includes('ana menu') ||
      clean.includes('ana menü') ||
      clean === 'menu' ||
      clean === 'menü'
    ) {
      return {
        matched: true,
        category: 'HOME',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_HOME',
        targetKeys: ['KEY_HOME'],
        repeatCount: 1,
        explanation: 'Akıllı Ana Menüyü Aç (Smart Hub / KEY_HOME)',
        confidence: 0.97,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    // 2. Return / Back
    if (
      clean.includes('go back') ||
      clean.includes('return') ||
      clean.includes('cancel') ||
      clean.includes('geri git') ||
      clean.includes('geri don') ||
      clean.includes('geri dön') ||
      clean.includes('cik') ||
      clean.includes('çık') ||
      clean.includes('cikis') ||
      clean.includes('çıkış') ||
      clean === 'geri' ||
      clean === 'back'
    ) {
      return {
        matched: true,
        category: 'BACK',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_RETURN',
        targetKeys: ['KEY_RETURN'],
        repeatCount: 1,
        explanation: 'Önceki Ekrana Dön / Geri (KEY_RETURN)',
        confidence: 0.97,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    // 3. Enter / Select
    if (
      clean === 'ok' ||
      clean === 'enter' ||
      clean.includes('select') ||
      clean.includes('tamam') ||
      clean.includes('onayla') ||
      clean.includes('sec') ||
      clean.includes('seç')
    ) {
      return {
        matched: true,
        category: 'CONFIRM',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_ENTER',
        targetKeys: ['KEY_ENTER'],
        repeatCount: 1,
        explanation: 'Seçimi Onayla / Tamam (KEY_ENTER)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    // 4. Directional D-Pad
    if (clean === 'up' || clean.includes('move up') || clean.includes('yukari') || clean.includes('yukarı')) {
      return {
        matched: true,
        category: 'NAV_UP',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_UP',
        targetKeys: ['KEY_UP'],
        repeatCount: 1,
        explanation: 'Yukarı Yön (KEY_UP)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    if (clean === 'down' || clean.includes('move down') || clean.includes('asagi') || clean.includes('aşağı')) {
      return {
        matched: true,
        category: 'NAV_DOWN',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_DOWN',
        targetKeys: ['KEY_DOWN'],
        repeatCount: 1,
        explanation: 'Aşağı Yön (KEY_DOWN)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    if (clean === 'left' || clean.includes('move left') || clean.includes('sola') || clean === 'sol') {
      return {
        matched: true,
        category: 'NAV_LEFT',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_LEFT',
        targetKeys: ['KEY_LEFT'],
        repeatCount: 1,
        explanation: 'Sol Yön (KEY_LEFT)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    if (clean === 'right' || clean.includes('move right') || clean.includes('saga') || clean.includes('sağa') || clean === 'sag' || clean === 'sağ') {
      return {
        matched: true,
        category: 'NAV_RIGHT',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_RIGHT',
        targetKeys: ['KEY_RIGHT'],
        repeatCount: 1,
        explanation: 'Sağ Yön (KEY_RIGHT)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    return null;
  }

  /**
   * Maps Media playback semantics
   */
  private static checkMediaSemantics(raw: string, clean: string): SemanticMappingResult | null {
    if (
      clean.includes('play') ||
      clean.includes('resume') ||
      clean.includes('oynat') ||
      clean.includes('baslat') ||
      clean.includes('başlat') ||
      clean.includes('devam et')
    ) {
      return {
        matched: true,
        category: 'MEDIA_PLAY',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_PLAY',
        targetKeys: ['KEY_PLAY'],
        repeatCount: 1,
        explanation: 'Medyayı Oynat (KEY_PLAY)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    if (
      clean.includes('pause') ||
      clean.includes('hold on') ||
      clean.includes('durdur') ||
      clean.includes('beklet') ||
      clean.includes('duraklat')
    ) {
      return {
        matched: true,
        category: 'MEDIA_PAUSE',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_PAUSE',
        targetKeys: ['KEY_PAUSE'],
        repeatCount: 1,
        explanation: 'Medyayı Duraklat (KEY_PAUSE)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    if (clean.includes('stop') || clean.includes('tamamen durdur')) {
      return {
        matched: true,
        category: 'MEDIA_STOP',
        actionType: 'SEND_KEY',
        targetKey: 'KEY_STOP',
        targetKeys: ['KEY_STOP'],
        repeatCount: 1,
        explanation: 'Medyayı Durdur (KEY_STOP)',
        confidence: 0.95,
        rawTranscript: raw,
        normalizedTranscript: clean,
      };
    }

    return null;
  }

  /**
   * Maps YouTube search, playback, and app launching
   */
  private static checkYouTubeSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // 1. YouTube Search
    const searchMatchEn =
      clean.match(/(?:search(?: for)?|find)\s+(.+?)\s+on\s+you\s*tube/i) ||
      clean.match(/you\s*tube(?:\s+search|\s+find)\s+(?:for\s+)?(.+)/i);
    const searchMatchTr = clean.match(/you\s*tube(?:da|de)?\s+(.+?)\s*(?:ara|bul)/i);

    if (searchMatchEn || searchMatchTr) {
      const rawQuery = searchMatchEn ? searchMatchEn[1] : searchMatchTr![1];
      const query = rawQuery.replace(/video(s|su|ları)?/gi, '').trim();
      return {
        matched: true,
        category: 'YOUTUBE_SEARCH',
        actionType: 'YOUTUBE_SEARCH',
        targetKeys: [],
        repeatCount: 0,
        explanation: `YouTube'da "${query}" ara`,
        confidence: 0.97,
        rawTranscript: raw,
        normalizedTranscript: clean,
        metadata: {
          appId: KNOWN_TV_APPS.YOUTUBE.id,
          appName: KNOWN_TV_APPS.YOUTUBE.name,
          query,
        },
      };
    }

    // 2. YouTube Playback
    const playMatchEn = clean.match(/(?:play|watch|put on|listen to)\s+(.+?)\s+on\s+you\s*tube/i);
    const playMatchTr = clean.match(/you\s*tube(?:da|de)?\s+(.+?)\s*(?:ac|aç|cal|çal|oynat|izle)/i);

    if (playMatchEn || playMatchTr) {
      const rawQuery = playMatchEn ? playMatchEn[1] : playMatchTr![1];
      const query = rawQuery.replace(/video(s|su|ları)?/gi, '').trim();
      return {
        matched: true,
        category: 'YOUTUBE_PLAY',
        actionType: 'YOUTUBE_PLAY',
        targetKeys: [],
        repeatCount: 0,
        explanation: `YouTube üzerinde "${query}" oynat`,
        confidence: 0.97,
        rawTranscript: raw,
        normalizedTranscript: clean,
        metadata: {
          appId: KNOWN_TV_APPS.YOUTUBE.id,
          appName: KNOWN_TV_APPS.YOUTUBE.name,
          query,
        },
      };
    }

    // 3. YouTube Launch & Broadcast
    if (
      clean === 'youtube' ||
      clean === 'you tube' ||
      clean.includes('open youtube') ||
      clean.includes('launch youtube') ||
      clean.includes('start youtube') ||
      clean.includes('youtube ac') ||
      clean.includes('youtube aç') ||
      clean.includes('youtubeyi ac') ||
      clean.includes('youtubeyi aç') ||
      clean.includes('youtubeu ac') ||
      clean.includes('youtubeu aç') ||
      clean.includes('youtube baslat') ||
      clean.includes('youtube başlat') ||
      clean.includes('youtubea gir') ||
      clean.includes('youtubea baglan') ||
      clean.includes('youtube yayini') ||
      clean.includes('youtube yayını') ||
      clean.includes('televizyonda youtube') ||
      clean.includes('tvde youtube') ||
      clean.includes('youtube uygulamasini') ||
      clean.includes('youtube uygulamasını') ||
      clean.includes('video ac') ||
      clean.includes('video aç') ||
      clean.includes('video izle')
    ) {
      return {
        matched: true,
        category: 'YOUTUBE_LAUNCH',
        actionType: 'LAUNCH_APP',
        targetKeys: [],
        repeatCount: 0,
        explanation: 'YouTube TV Uygulamasını Başlat',
        confidence: 0.98,
        rawTranscript: raw,
        normalizedTranscript: clean,
        metadata: {
          appId: KNOWN_TV_APPS.YOUTUBE.id,
          appName: KNOWN_TV_APPS.YOUTUBE.name,
        },
      };
    }

    return null;
  }

  /**
   * Converts a SemanticMappingResult directly into a StructuredVoiceIntent
   */
  public static toStructuredVoiceIntent(mapping: SemanticMappingResult): StructuredVoiceIntent {
    return {
      rawTranscript: mapping.rawTranscript,
      actionType: mapping.actionType,
      requestedKeys: mapping.targetKeys,
      repeatCount: mapping.repeatCount,
      targetAppId: mapping.metadata?.appId,
      targetAppName: mapping.metadata?.appName,
      youtubeQuery: mapping.metadata?.query,
      youtubeVideoId: mapping.metadata?.videoId,
      intentExplanation: mapping.explanation,
      confidence: mapping.confidence,
      source: 'semantic_mapping',
      semanticCategory: mapping.category,
      unitCount: mapping.extractedUnits,
    };
  }
}
