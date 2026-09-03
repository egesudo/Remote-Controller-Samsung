import { ValidRemoteKey } from './tv.types';

export type VoiceActionType =
  | 'SEND_KEY'
  | 'KEY_SEQUENCE'
  | 'LAUNCH_APP'
  | 'YOUTUBE_SEARCH'
  | 'YOUTUBE_PLAY'
  | 'REJECTED';

export interface StructuredVoiceIntent {
  rawTranscript: string;
  actionType: VoiceActionType;
  requestedKeys: ValidRemoteKey[] | string[];
  repeatCount?: number;
  targetAppId?: string;
  targetAppName?: string;
  youtubeQuery?: string;
  youtubeVideoId?: string;
  intentExplanation: string;
  confidence: number;
  source: 'gemini_ai' | 'deterministic_rule';
}

export interface VoiceValidationPipelineResult {
  intent: StructuredVoiceIntent;
  isValid: boolean;
  securityViolation: boolean;
  validatedKeys: ValidRemoteKey[];
  appLaunchPayload?: string;
  rejectionReason?: string;
  executed: boolean;
  executionError?: string;
  timestamp: number;
}
