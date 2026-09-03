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

export type SemanticCategory =
  | 'POWER_ON'
  | 'POWER_OFF'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
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
 * e.g.:
 * "10 birim artır" -> { count: 10, unit: 'birim' }
 * "on birim artır" -> { count: 10, unit: 'birim' }
 * "5 kademe kıs"   -> { count: 5,  unit: 'kademe' }
 * "3 kere bas"     -> { count: 3,  unit: 'kere' }
 */
export function extractQuantityAndUnit(text: string): { count: number; unit?: string } {
  const clean = normalizeTranscript(text);

  // 1. Numeric digit with optional unit noun
  // e.g. "10 birim", "10 kademe", "10 kere", "10"
  const digitRegex = new RegExp(`(\\d+)\\s*(${UNIT_NOUNS_PATTERN})?`, 'i');
  const digitMatch = clean.match(digitRegex);
  if (digitMatch && digitMatch[1]) {
    const val = parseInt(digitMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      return {
        count: Math.min(val, 20), // capped safely at 20 commands
        unit: digitMatch[2] || undefined,
      };
    }
  }

  // 2. Word-based number with optional unit noun
  // e.g. "on birim", "beş kademe", "üç kere"
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
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

    // 3. Volume Up Semantics (e.g. "Sesi 10 birim artır", "Sesi 10 birim arttır", "Sesi aç", "Volume up")
    const volUpResult = this.checkVolumeUpSemantics(rawTranscript, normalized);
    if (volUpResult) return volUpResult;

    // 4. Volume Down Semantics (e.g. "Sesi 10 birim azalt", "Sesi 5 birim kıs", "Sesi düşür")
    const volDownResult = this.checkVolumeDownSemantics(rawTranscript, normalized);
    if (volDownResult) return volDownResult;

    // 5. Mute Semantics (e.g. "Sesi kapat", "Sesi kes", "Sessize al", "Mute")
    const muteResult = this.checkMuteSemantics(rawTranscript, normalized);
    if (muteResult) return muteResult;

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
   * Maps Volume Up commands with units/birim
   * Handles:
   * - "Sesi 10 birim artır"
   * - "Sesi 10 birim arttır"
   * - "Sesi 5 kademe artır"
   * - "Sesi aç"
   * - "Sesi yükselt"
   * - "Turn up volume 10 units"
   */
  private static checkVolumeUpSemantics(raw: string, clean: string): SemanticMappingResult | null {
    // Check if sentence conveys volume increase
    const hasSoundWord = clean.includes('ses') || clean.includes('volume') || clean.includes('sound');
    const hasIncreaseAction =
      clean.includes('art') || // artır, arttır, artırsana, artıralım
      clean.includes('yukselt') || // yükselt, yukselt
      clean.includes('yükselt') ||
      clean.includes('ac') || // aç, sesi aç
      clean.includes('aç') ||
      clean.includes('fazlalastir') ||
      clean.includes('turn up') ||
      clean.includes('increase') ||
      clean.includes('louder');

    // Specific match: starts or contains volume increase
    const isVolUp = (hasSoundWord && hasIncreaseAction) || clean.includes('volume up') || clean.includes('louder');

    if (!isVolUp) return null;

    const { count, unit } = extractQuantityAndUnit(clean);
    const keys = Array(count).fill('KEY_VOLUP') as ValidRemoteKey[];
    const unitText = unit ? ` ${unit}` : (count > 1 ? ' adım' : '');

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
   * Maps Volume Down commands with units/birim
   * Handles:
   * - "Sesi 10 birim azalt"
   * - "Sesi 10 birim kıs"
   * - "Sesi 5 kademe kıs"
   * - "Sesi düşür"
   * - "Turn down volume 5 units"
   */
  private static checkVolumeDownSemantics(raw: string, clean: string): SemanticMappingResult | null {
    const hasSoundWord = clean.includes('ses') || clean.includes('volume') || clean.includes('sound');
    const hasDecreaseAction =
      clean.includes('kis') || // kıs, kısar mısın
      clean.includes('kıs') ||
      clean.includes('azalt') ||
      clean.includes('dusur') || // düşür
      clean.includes('düşür') ||
      clean.includes('alcalt') ||
      clean.includes('turn down') ||
      clean.includes('decrease') ||
      clean.includes('quieter') ||
      clean.includes('softer');

    const isVolDown = (hasSoundWord && hasDecreaseAction) || clean.includes('volume down') || clean.includes('quieter');

    if (!isVolDown) return null;

    const { count, unit } = extractQuantityAndUnit(clean);
    const keys = Array(count).fill('KEY_VOLDOWN') as ValidRemoteKey[];
    const unitText = unit ? ` ${unit}` : (count > 1 ? ' adım' : '');

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

    // 3. YouTube Launch
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
        explanation: 'YouTube Uygulamasını Başlat',
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
