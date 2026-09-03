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

/**
 * Deterministic fast parser for common voice patterns in English and Turkish
 */
export function parseVoiceIntentLocally(transcript: string): StructuredVoiceIntent {
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
  if (
    clean.includes('volume up') ||
    clean.includes('turn up') ||
    clean.includes('louder') ||
    clean.includes('increase volume') ||
    clean.includes('sesi aç') ||
    clean.includes('ses aç') ||
    clean.includes('sesi yükselt') ||
    clean.includes('ses yükselt') ||
    clean.includes('ses artır') ||
    clean.includes('sesi artır')
  ) {
    // Check for repeat counts, e.g. "turn volume up 3 times" or "sesi 3 kere artır"
    const matchCount = clean.match(/(\d+)\s*(times|kere|defa)/);
    const count = matchCount ? Math.min(parseInt(matchCount[1], 10), 10) : 1;
    const keys = Array(count).fill('KEY_VOLUP');

    return {
      rawTranscript: transcript,
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      requestedKeys: keys,
      repeatCount: count,
      intentExplanation: `Increase TV volume (${count} step${count > 1 ? 's' : ''})`,
      confidence: 0.98,
      source: 'deterministic_rule',
    };
  }

  // 3. Volume Down
  if (
    clean.includes('volume down') ||
    clean.includes('turn down') ||
    clean.includes('quieter') ||
    clean.includes('decrease volume') ||
    clean.includes('softer') ||
    clean.includes('sesi kıs') ||
    clean.includes('ses kıs') ||
    clean.includes('sesi azalt') ||
    clean.includes('ses azalt')
  ) {
    const matchCount = clean.match(/(\d+)\s*(times|kere|defa)/);
    const count = matchCount ? Math.min(parseInt(matchCount[1], 10), 10) : 1;
    const keys = Array(count).fill('KEY_VOLDOWN');

    return {
      rawTranscript: transcript,
      actionType: count > 1 ? 'KEY_SEQUENCE' : 'SEND_KEY',
      requestedKeys: keys,
      repeatCount: count,
      intentExplanation: `Decrease TV volume (${count} step${count > 1 ? 's' : ''})`,
      confidence: 0.98,
      source: 'deterministic_rule',
    };
  }

  // 4. Mute / Unmute
  if (
    clean === 'mute' ||
    clean.includes('mute') ||
    clean.includes('unmute') ||
    clean.includes('silence') ||
    clean.includes('sessize al') ||
    clean.includes('sessiz') ||
    clean.includes('sesi kapat') ||
    clean.includes('sesi kes')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_MUTE'],
      intentExplanation: 'Toggle audio mute',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 5. Channel Up / Next Channel
  if (
    clean.includes('channel up') ||
    clean.includes('next channel') ||
    clean.includes('kanal yukarı') ||
    clean.includes('sonraki kanal') ||
    clean.includes('kanalı artır') ||
    clean.includes('ileri kanal')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_CHUP'],
      intentExplanation: 'Switch to next TV channel',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 6. Channel Down / Previous Channel
  if (
    clean.includes('channel down') ||
    clean.includes('previous channel') ||
    clean.includes('kanal aşağı') ||
    clean.includes('önceki kanal') ||
    clean.includes('kanalı azalt') ||
    clean.includes('geri kanal')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_CHDOWN'],
      intentExplanation: 'Switch to previous TV channel',
      confidence: 0.95,
      source: 'deterministic_rule',
    };
  }

  // 7. Power Off / On
  if (
    clean.includes('turn off') ||
    clean.includes('power off') ||
    clean.includes('switch off') ||
    clean.includes('shut down') ||
    clean.includes('kapat') ||
    clean.includes('televizyonu kapat') ||
    clean.includes('tv kapat')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_POWER'],
      intentExplanation: 'Toggle TV power state (Power)',
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
      intentExplanation: 'Open Smart Hub home screen',
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
    clean === 'geri' ||
    clean === 'back'
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_RETURN'],
      intentExplanation: 'Return to previous screen / Back',
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
      intentExplanation: 'Navigate up',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'down' || clean.includes('move down') || clean.includes('aşağı')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_DOWN'],
      intentExplanation: 'Navigate down',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'left' || clean.includes('move left') || clean.includes('sola')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_LEFT'],
      intentExplanation: 'Navigate left',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }
  if (clean === 'right' || clean.includes('move right') || clean.includes('sağa')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_RIGHT'],
      intentExplanation: 'Navigate right',
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
    clean.includes('seç')
  ) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_ENTER'],
      intentExplanation: 'Press Enter / Confirm selection',
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
      intentExplanation: 'Resume media playback',
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
      intentExplanation: 'Pause media playback',
      confidence: 0.92,
      source: 'deterministic_rule',
    };
  }
  if (clean.includes('stop') || clean.includes('tamamen durdur')) {
    return {
      rawTranscript: transcript,
      actionType: 'SEND_KEY',
      requestedKeys: ['KEY_STOP'],
      intentExplanation: 'Stop media playback',
      confidence: 0.9,
      source: 'deterministic_rule',
    };
  }

  // Fallback: Command not recognized by local rules
  return {
    rawTranscript: transcript,
    actionType: 'REJECTED',
    requestedKeys: [],
    intentExplanation: `Command '${transcript}' was not recognized as a valid TV control action.`,
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
      intentExplanation: 'Empty voice input received.',
      confidence: 0,
      source: 'deterministic_rule',
    };
  }

  // Fast check: If deterministic parser finds high confidence, we can use it directly
  // or use it as fallback if AI is disabled or fails
  const localMatch = parseVoiceIntentLocally(trimmed);

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
