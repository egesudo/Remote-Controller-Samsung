import { ValidRemoteKey } from './tv.types.ts';

export type VoiceActionType =
  | 'SEND_KEY'
  | 'KEY_SEQUENCE'
  | 'LAUNCH_APP'
  | 'YOUTUBE_SEARCH'
  | 'YOUTUBE_PLAY'
  | 'REJECTED';

export type VoiceIntentSource = 'gemini_ai' | 'deterministic_rule' | 'semantic_mapping' | 'manual_test';

export interface StructuredVoiceIntent {
  rawTranscript: string;
  actionType: VoiceActionType;
  requestedKeys: string[];
  repeatCount?: number;
  targetAppId?: string;
  targetAppName?: string;
  youtubeQuery?: string;
  youtubeVideoId?: string;
  intentExplanation: string;
  confidence: number;
  source: VoiceIntentSource;
  semanticCategory?: string;
  unitCount?: number;
}

export interface VoiceValidationPipelineResult {
  intent: StructuredVoiceIntent;
  isValid: boolean;
  validatedKeys: ValidRemoteKey[];
  appLaunchPayload?: string;
  rejectionReason?: string;
  securityViolation: boolean;
  executed: boolean;
  executionError?: string;
  timestamp: number;
}

export interface VoiceRecognitionState {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}
