import { useState, useEffect, useRef, useCallback } from 'react';
import { VoiceRecognitionState } from '../types/voice.types.ts';

// Web Speech API interface declarations for TypeScript
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionConstructor {
  new (): IWindowSpeechRecognition;
}

export function useVoiceRecognition(language: string = 'en-US') {
  const [state, setState] = useState<VoiceRecognitionState>({
    isSupported: false,
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
  });

  const recognitionRef = useRef<IWindowSpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI: SpeechRecognitionConstructor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setState((prev) => ({ ...prev, isSupported: false }));
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setState((prev) => ({
          ...prev,
          isListening: true,
          error: null,
          interimTranscript: '',
        }));
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        setState((prev) => ({
          ...prev,
          transcript: finalTranscript || prev.transcript,
          interimTranscript: interim,
        }));
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error event:', event.error);
        setState((prev) => ({
          ...prev,
          isListening: false,
          error: `Speech error: ${event.error}`,
        }));
      };

      recognition.onend = () => {
        setState((prev) => ({
          ...prev,
          isListening: false,
        }));
      };

      recognitionRef.current = recognition;
      setState((prev) => ({ ...prev, isSupported: true }));
    } catch (err) {
      console.warn('Could not initialize SpeechRecognition:', err);
      setState((prev) => ({ ...prev, isSupported: false }));
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((prev) => ({
        ...prev,
        error: 'Speech recognition is not supported in this browser.',
      }));
      return;
    }

    try {
      setState((prev) => ({ ...prev, error: null, transcript: '', interimTranscript: '' }));
      recognitionRef.current.start();
    } catch (err) {
      // Often thrown if recognition is already active
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setState((prev) => ({ ...prev, isListening: false }));
  }, []);

  const setManualTranscript = useCallback((text: string) => {
    setState((prev) => ({
      ...prev,
      transcript: text,
      interimTranscript: '',
      error: null,
    }));
  }, []);

  const resetTranscript = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
      error: null,
    }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    setManualTranscript,
    resetTranscript,
  };
}
