/**
 * Voice & Natural Language Intent Parser
 * 
 * Converts spoken voice transcripts into structured TV actions.
 * Supports:
 * 1. Fast deterministic rule-based natural language parsing (English & Turkish)
 * 2. Server-side Gemini AI Intent parsing via /api/voice/interpret-intent
 * 
 * CRITICAL ARCHITECTURAL DIRECTIVE:
 * Output from this parser is NOT trusted automatically. Every requested key
 * MUST pass through the CommandValidator whitelist before dispatch to the TV.
 */

import { StructuredVoiceIntent, VoiceActionType } from '../types/voice.types.ts';
import { KNOWN_TV_APPS } from './modularAppLauncher.ts';
import { SemanticVoiceMapper } from './semanticVoiceMapper.ts';

export { SemanticVoiceMapper } from './semanticVoiceMapper.ts';

/**
 * Helper to extract step count from spoken Turkish or English phrases
 * e.g. "sesi 10 kademe arttır" -> 10
 *      "sesi on kademe arttır" -> 10
 *      "sesi 3 kere artır" -> 3
 *      "turn up 5 times" -> 5
 */
function extractStepCount(text: string): number {
  const clean = text.toLowerCase();

  // 1. Digits match: "10 birim", "10 kademe", "10 defa", "10 kere", "10 arttır", "10"
  const digitMatch = clean.match(/(\d+)\s*(?:birim|kademe|seviye|basamak|tık|adım|kere|defa|kez|derece|puan|times|steps|levels|clicks)?/i);
  if (digitMatch && digitMatch[1]) {
    const val = parseInt(digitMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      return Math.min(val, 15); // Capped at 15 for safe execution
    }
  }

  // 2. Turkish & English Word Numbers
  const wordNumbers: Record<string, number> = {
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
    'on bir': 11, 'onbir': 11,
    'on iki': 12, 'oniki': 12,
    'on üç': 13, 'onüç': 13,
    'on dört': 14, 'ondört': 14,
    'on beş': 15, 'onbeş': 15,
  };

  for (const [word, num] of Object.entries(wordNumbers)) {
    const regex = new RegExp(`\\b${word}\\s*(?:birim|kademe|seviye|basamak|tık|adım|kere|defa|kez|times|steps|levels)?\\b`, 'i');
    if (regex.test(clean)) {
      return num;
    }
  }

  return 1;
}

/**
 * Deterministic fast parser for common voice patterns in English and Turkish
 * Employs SemanticVoiceMapper as its core semantic layer.
 */
export function parseVoiceIntentLocally(transcript: string): StructuredVoiceIntent {
  // 1. Primary Semantic Mapping Layer (high-accuracy Turkish & English natural language mapping)
  const semanticMapping = SemanticVoiceMapper.map(transcript);
  if (semanticMapping.matched) {
    return SemanticVoiceMapper.toStructuredVoiceIntent(semanticMapping);
  }

  const clean = transcript.trim().toLowerCase();

  // 0. Security Block for Dangerous or Malicious Commands
  if (
    clean.includes('format') ||
    clean.includes('wipe') ||
    clean.includes('rm -rf') ||
    clean.includes('factory_reset') ||
    clean.includes('hack') ||
    clean.includes('malware') ||
    clean.includes('exploit') ||
    clean.includes('bash') ||
    clean.includes('sudo')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'REJECTED',
      requestedKeys: [],
      intentExplanation: 'Blocked by Security Gate: Unrestricted, destructive, or malicious operations are strictly prohibited.',
      confidence: 1.0,
      source: 'deterministic_rule',
    };
  }

  // 1. YouTube Specific Search & Playback Patterns
  // 1a. Search on YouTube
  const ytSearchMatchEn = clean.match(/(?:search(?: for)?|find)\s+(.+?)\s+on\s+you\s*tube/i) ||
                          clean.match(/you\s*tube(?:\s+search|\s+find)\s+(?:for\s+)?(.+)/i);
  const ytSearchMatchTr = clean.match(/you\s*tube['’]?da\s+(.+?)\s*(?:ara|bul)/i);

  if (ytSearchMatchEn || ytSearchMatchTr) {
    const rawQuery = ytSearchMatchEn ? ytSearchMatchEn[1] : ytSearchMatchTr![1];
    const query = rawQuery.replace(/video(s|su|ları)?/gi, '').trim();
    return {
      rawTranscript: transcript,
      actionType: 'YOUTUBE_SEARCH',
      requestedKeys: [],
      targetAppId: KNOWN_TV_APPS.YOUTUBE.id,
      targetAppName: KNOWN_TV_APPS.YOUTUBE.name,
      youtubeQuery: query,
      intentExplanation: `Search YouTube for "${query}"`,
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 1b. Play specific content on YouTube
  const ytPlayMatchEn = clean.match(/(?:play|watch|put on|listen to)\s+(.+?)\s+on\s+you\s*tube/i);
  const ytPlayMatchTr = clean.match(/you\s*tube['’]?da\s+(.+?)\s*(?:aç|çal|oynat|izle)/i);

  if (ytPlayMatchEn || ytPlayMatchTr) {
    const rawQuery = ytPlayMatchEn ? ytPlayMatchEn[1] : ytPlayMatchTr![1];
    const query = rawQuery.replace(/video(s|su|ları)?/gi, '').trim();
    return {
      rawTranscript: transcript,
      actionType: 'YOUTUBE_PLAY',
      requestedKeys: [],
      targetAppId: KNOWN_TV_APPS.YOUTUBE.id,
      targetAppName: KNOWN_TV_APPS.YOUTUBE.name,
      youtubeQuery: query,
      intentExplanation: `Play "${query}" on YouTube`,
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 1c. General YouTube App Launch Patterns
  if (
    clean === 'youtube' ||
    clean === 'you tube' ||
    clean.includes('open youtube') ||
    clean.includes('launch youtube') ||
    clean.includes('start youtube') ||
    clean.includes('youtube aç') ||
    clean.includes("youtube'u aç") ||
    clean.includes('youtube başlat') ||
    clean.includes('video aç') ||
    clean.includes('video izle')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'LAUNCH_APP',
      requestedKeys: [],
      targetAppId: KNOWN_TV_APPS.YOUTUBE.id,
      targetAppName: KNOWN_TV_APPS.YOUTUBE.name,
      intentExplanation: 'Launch Tizen YouTube application',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 2. Volume Up
  // Matches "sesi 10 kademe arttır", "sesi artır", "sesi arttır", "ses aç", "sesi aç", "sesi yükselt", "volume up", etc.
  const isVolumeUp =
    clean.includes('volume up') ||
    clean.includes('turn up') ||
    clean.includes('louder') ||
    clean.includes('increase volume') ||
    (clean.includes('ses') && (
      clean.includes('art') || // matches artır, arttır, arttırır mısın, artıralım
      clean.includes('yükselt') ||
      clean.includes('aç') ||
      clean.includes('fazlalaştır')
    ));

  if (isVolumeUp) {
    const count = extractStepCount(clean);
    const keys = Array(count).fill('KEY_VOLUP');

    return {
      rawTranscript: transcript,
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      requestedKeys: keys,
      repeatCount: count,
      intentExplanation: `TV Sesini Yükselt (+${count} Kademe / KEY_VOLUP)`,
      confidence: 0.98,
      source: 'deterministic_rule',
    };
  }

  // 3. Volume Down
  // Matches "sesi 10 kademe azalt", "sesi kıs", "ses kıs", "sesi düşür", "volume down", etc.
  const isVolumeDown =
    clean.includes('volume down') ||
    clean.includes('turn down') ||
    clean.includes('quieter') ||
    clean.includes('decrease volume') ||
    clean.includes('softer') ||
    (clean.includes('ses') && (
      clean.includes('kıs') ||
      clean.includes('azalt') ||
      clean.includes('düşür')
    ));

  if (isVolumeDown) {
    const count = extractStepCount(clean);
    const keys = Array(count).fill('KEY_VOLDOWN');

    return {
      rawTranscript: transcript,
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      requestedKeys: keys,
      repeatCount: count,
      intentExplanation: `TV Sesini Azalt (-${count} Kademe / KEY_VOLDOWN)`,
      confidence: 0.98,
      source: 'deterministic_rule',
    };
  }

  // 4. Mute / Unmute
  const isMute =
    clean === 'mute' ||
    clean.includes('mute') ||
    clean.includes('unmute') ||
    clean.includes('silence') ||
    clean.includes('sessize al') ||
    clean.includes('sessiz') ||
    clean.includes('sustur') ||
    clean.includes('sesi kapat') ||
    clean.includes('ses kapat') ||
    clean.includes('sesi kapa') ||
    clean.includes('sesi kes') ||
    clean.includes('ses kes');

  if (isMute) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_MUTE'],
      intentExplanation: 'Sesi Aç/Kapat (Mute / KEY_MUTE)',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 5. Channel Up / Next Channel
  const isChannelUp =
    clean.includes('channel up') ||
    clean.includes('next channel') ||
    clean.includes('kanal yukarı') ||
    clean.includes('sonraki kanal') ||
    clean.includes('kanalı artır') ||
    clean.includes('kanalı arttır') ||
    clean.includes('ileri kanal') ||
    clean.includes('kanal ileri') ||
    clean.includes('kanal değiştir') ||
    clean.includes('kanalı değiştir') ||
    clean.includes('sonraki kanala geç') ||
    clean.includes('kanal atla');

  if (isChannelUp) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_CHUP'],
      intentExplanation: 'Sonraki Kanala Geç (KEY_CHUP)',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 6. Channel Down / Previous Channel
  const isChannelDown =
    clean.includes('channel down') ||
    clean.includes('previous channel') ||
    clean.includes('kanal aşağı') ||
    clean.includes('önceki kanal') ||
    clean.includes('kanalı azalt') ||
    clean.includes('kanalı düşür') ||
    clean.includes('geri kanal') ||
    clean.includes('kanal geri') ||
    clean.includes('önceki kanala geç');

  if (isChannelDown) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_CHDOWN'],
      intentExplanation: 'Önceki Kanala Geç (KEY_CHDOWN)',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 7. Power On / Power Off
  // Handles "Televizyonu aç", "TV aç", "TV'yi aç", "Televizyonu kapat", "turn on", "turn off", etc.
  const isPower =
    // Power On variants:
    clean.includes('televizyonu aç') ||
    clean.includes('televizyon aç') ||
    clean.includes('tv aç') ||
    clean.includes("tv'yi aç") ||
    clean.includes('tv yi aç') ||
    clean.includes('ekranı aç') ||
    clean.includes('cihazı aç') ||
    clean.includes('tv çalıştır') ||
    clean.includes('turn on tv') ||
    clean.includes('turn on the tv') ||
    clean.includes('turn on') ||
    clean.includes('power on') ||
    // Power Off variants:
    clean.includes('televizyonu kapat') ||
    clean.includes('televizyon kapat') ||
    clean.includes('tv kapat') ||
    clean.includes("tv'yi kapat") ||
    clean.includes('tv yi kapat') ||
    clean.includes('ekranı kapat') ||
    clean.includes('cihazı kapat') ||
    clean.includes('turn off') ||
    clean.includes('power off') ||
    clean.includes('switch off') ||
    clean.includes('shut down') ||
    clean === 'kapat' ||
    clean === 'kapa' ||
    clean === 'tv' ||
    clean === 'power' ||
    clean === 'aç';

  if (isPower) {
    const isTurningOn = clean.includes('aç') || clean.includes('turn on') || clean.includes('power on');
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_POWER'],
      intentExplanation: isTurningOn
        ? 'Televizyonu Aç (KEY_POWER)'
        : 'Televizyonu Kapat (KEY_POWER)',
      confidence: 0.98,
      source: 'deterministic_rule',
    };
  }

  // 8. Home / Smart Hub
  if (
    clean.includes('home') ||
    clean.includes('smart hub') ||
    clean.includes('main menu') ||
    clean.includes('ana sayfa') ||
    clean.includes('ana menü') ||
    clean.includes('menü')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_HOME'],
      intentExplanation: 'Akıllı Ana Menüyü Aç (Smart Hub / KEY_HOME)',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 9. Back / Return
  if (
    clean.includes('go back') ||
    clean.includes('return') ||
    clean.includes('cancel') ||
    clean.includes('geri git') ||
    clean.includes('geri dön') ||
    clean.includes('çık') ||
    clean.includes('çıkış') ||
    clean === 'geri' ||
    clean === 'back'
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_RETURN'],
      intentExplanation: 'Önceki Ekrana Dön / Geri (KEY_RETURN)',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 10. Navigation: Up / Down / Left / Right
  if (clean === 'up' || clean.includes('move up') || clean.includes('yukarı')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_UP'],
      intentExplanation: 'Yukarı Yön (KEY_UP)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'down' || clean.includes('move down') || clean.includes('aşağı')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_DOWN'],
      intentExplanation: 'Aşağı Yön (KEY_DOWN)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'left' || clean.includes('move left') || clean.includes('sola') || clean === 'sol') {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_LEFT'],
      intentExplanation: 'Sol Yön (KEY_LEFT)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'right' || clean.includes('move right') || clean.includes('sağa') || clean === 'sağ') {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_RIGHT'],
      intentExplanation: 'Sağ Yön (KEY_RIGHT)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }

  // 11. Enter / Select / OK
  if (
    clean === 'ok' ||
    clean === 'enter' ||
    clean.includes('select') ||
    clean.includes('tamam') ||
    clean.includes('onayla') ||
    clean.includes('seç')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_ENTER'],
      intentExplanation: 'Seçimi Onayla / Tamam (KEY_ENTER)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }

  // 12. Media Playback: Play / Pause / Stop
  if (
    clean.includes('play') ||
    clean.includes('resume') ||
    clean.includes('oynat') ||
    clean.includes('başlat') ||
    clean.includes('devam et')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_PLAY'],
      intentExplanation: 'Medyayı Oynat (KEY_PLAY)',
      confidence: 0.92,
      source: 'deterministic_rule',
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
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_PAUSE'],
      intentExplanation: 'Medyayı Duraklat (KEY_PAUSE)',
      confidence: 0.92,
      source: 'deterministic_rule',
    };
  }
  if (clean.includes('stop') || clean.includes('tamamen durdur')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_STOP'],
      intentExplanation: 'Medyayı Durdur (KEY_STOP)',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }

  // Fallback: Command not recognized by local rules
  return {
    rawTranscript: transcript,
    actionType: 'REJECTED',
    requestedKeys: [],
    intentExplanation: `Komut tanınamadı: '${transcript}' geçerli bir TV kontrol eylemi (Ses, Kanal, Güç, YouTube veya Gezinme) olarak algılanamadı.`,
    confidence: 0.0,
    source: 'deterministic_rule',
  };
}

/**
 * Interprets a voice transcript using Server-side Gemini AI with local fallback
 */
export async function interpretVoiceIntentWithAI(
  transcript: string,
  preferGeminiAI: boolean = true
): Promise<StructuredVoiceIntent> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      rawTranscript: '',
      actionType: 'REJECTED',
      requestedKeys: [],
      intentExplanation: 'Boş ses girdisi alındı.',
      confidence: 0,
      source: 'deterministic_rule',
    };
  }

  // Fast check: If deterministic parser finds high confidence, we can use it directly
  const localMatch = parseVoiceIntentLocally(trimmed);

  // If local match succeeded with high confidence (>= 0.9), return it immediately for instant responsiveness
  if (localMatch.actionType !== 'REJECTED' && localMatch.confidence >= 0.9) {
    return localMatch;
  }

  if (!preferGeminiAI) {
    return localMatch;
  }

  try {
    const response = await fetch('/api/voice/interpret-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: trimmed }),
    });

    if (!response.ok) {
      // Fallback to local rule if server endpoint fails
      console.warn('AI intent server returned non-200, falling back to local intent parser');
      return localMatch;
    }

    const data = await response.json();
    if (data && data.intent) {
      return {
        ...data.intent,
        source: 'gemini_ai',
      };
    }

    return localMatch;
  } catch (err) {
    console.warn('Failed to contact AI intent server, using deterministic fallback:', err);
    return localMatch;
  }
}

