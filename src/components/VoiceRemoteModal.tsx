import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  X,
  ShieldCheck,
  ShieldAlert,
  Tv,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Send,
  Volume2,
  Tv2,
  Youtube,
  Radio,
  Power,
  Globe,
} from 'lucide-react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition.ts';
import { interpretVoiceIntentWithAI, parseVoiceIntentLocally } from '../engine/voiceIntentParser.ts';
import { voiceCommandBridge } from '../engine/voiceCommandBridge.ts';
import { StructuredVoiceIntent, VoiceValidationPipelineResult } from '../types/voice.types.ts';
import { ConnectionState } from '../types/tv.types.ts';

interface VoiceRemoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionState: ConnectionState;
  activeTvName: string;
}

export const VoiceRemoteModal: React.FC<VoiceRemoteModalProps> = ({
  isOpen,
  onClose,
  connectionState,
  activeTvName,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<'en-US' | 'tr-TR'>('en-US');
  const [useAI, setUseAI] = useState<boolean>(true);
  const [customText, setCustomText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pipelineStep, setPipelineStep] = useState<
    'IDLE' | 'LISTENING' | 'INTERPRETING' | 'VALIDATING' | 'DISPATCHED' | 'BLOCKED' | 'ERROR'
  >('IDLE');

  const [currentResult, setCurrentResult] = useState<VoiceValidationPipelineResult | null>(null);
  const [recentHistory, setRecentHistory] = useState<VoiceValidationPipelineResult[]>([]);

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceRecognition(selectedLanguage);

  const isConnected = connectionState === 'CONNECTED';

  // Handle when speech transcript completes
  useEffect(() => {
    if (transcript && !isListening && pipelineStep === 'LISTENING') {
      handleProcessTranscript(transcript);
    }
  }, [transcript, isListening, pipelineStep]);

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setCurrentResult(null);
      setPipelineStep('LISTENING');
      startListening();
    }
  };

  const handleProcessTranscript = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;

    setIsProcessing(true);
    setPipelineStep('INTERPRETING');

    try {
      // Step 1 & 2: Natural Speech -> AI / Rule Intent Parser
      let intent: StructuredVoiceIntent;
      if (useAI) {
        intent = await interpretVoiceIntentWithAI(clean, true);
      } else {
        intent = parseVoiceIntentLocally(clean);
      }

      setPipelineStep('VALIDATING');
      await new Promise((r) => setTimeout(r, 250)); // Visual clarity for pipeline progression

      // Step 3 & 4: Intent -> CommandValidator Gate -> TV Dispatch
      const result = await voiceCommandBridge.processAndExecute(intent);

      setCurrentResult(result);
      setRecentHistory((prev) => [result, ...prev.slice(0, 9)]);

      if (result.securityViolation || !result.isValid) {
        setPipelineStep('BLOCKED');
      } else if (result.executed) {
        setPipelineStep('DISPATCHED');
      } else {
        setPipelineStep('ERROR');
      }
    } catch (err) {
      console.error('Voice processing pipeline failure:', err);
      setPipelineStep('ERROR');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickCommand = (sample: string) => {
    resetTranscript();
    setCustomText(sample);
    handleProcessTranscript(sample);
  };

  if (!isOpen) return null;

  return (
    <div
      id="voice-remote-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  AI Voice Remote & Whitelist Gate
                </h2>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-mono bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  Tizen 5.5+
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Speech → AI Intent → Strict Whitelist Validation → TV Dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          
          {/* Target TV & Status Alert */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-xs">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">Target TV:</span>
              <strong className="text-white">{activeTvName}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                }`}
              />
              <span className={isConnected ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                {isConnected ? 'TV Connected (Ready)' : 'TV Disconnected'}
              </span>
            </div>
          </div>

          {/* Core Interactive Mic Stage */}
          <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-800 relative overflow-hidden">
            
            {/* Background Ambient Glow */}
            <div
              className={`absolute w-44 h-44 rounded-full filter blur-3xl opacity-20 pointer-events-none transition-colors duration-500 ${
                isListening
                  ? 'bg-rose-500 animate-pulse'
                  : pipelineStep === 'VALIDATING'
                  ? 'bg-indigo-500'
                  : pipelineStep === 'BLOCKED'
                  ? 'bg-red-600'
                  : pipelineStep === 'DISPATCHED'
                  ? 'bg-emerald-500'
                  : 'bg-indigo-500'
              }`}
            />

            {/* Mic Push-to-Talk Button */}
            <button
              id="btn-voice-mic-main"
              onClick={handleMicToggle}
              disabled={isProcessing}
              className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center cursor-pointer shadow-2xl transition-all duration-300 ${
                isListening
                  ? 'bg-rose-600 text-white shadow-rose-600/50 scale-105 animate-bounce'
                  : isProcessing
                  ? 'bg-indigo-700 text-indigo-200 animate-spin'
                  : 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white hover:scale-105 active:scale-95 shadow-indigo-600/30'
              }`}
            >
              {isListening ? (
                <Mic className="w-10 h-10 animate-pulse" />
              ) : (
                <Mic className="w-10 h-10" />
              )}
            </button>

            {/* Status Feedback Text */}
            <div className="mt-4 text-center">
              <span className="text-sm font-semibold text-white">
                {isListening
                  ? 'Listening to speech... Speak now!'
                  : isProcessing
                  ? 'Analyzing Intent & Validating Whitelist...'
                  : 'Tap Microphone to Speak'}
              </span>
              <p className="text-xs text-slate-400 mt-1">
                {isListening
                  ? interimTranscript || transcript || 'Listening for TV commands...'
                  : 'Or type a command below to test the validation pipeline'}
              </p>
            </div>

            {/* Language & Engine Controls */}
            <div className="mt-4 flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <button
                  onClick={() => setSelectedLanguage('en-US')}
                  className={`px-1.5 py-0.5 rounded font-medium ${
                    selectedLanguage === 'en-US' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  English
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => setSelectedLanguage('tr-TR')}
                  className={`px-1.5 py-0.5 rounded font-medium ${
                    selectedLanguage === 'tr-TR' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Türkçe
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <button
                  onClick={() => setUseAI(!useAI)}
                  className={`font-medium ${useAI ? 'text-indigo-300' : 'text-slate-400'}`}
                >
                  {useAI ? 'Gemini AI: ON' : 'Local Parser Only'}
                </button>
              </div>
            </div>

            {!isSupported && (
              <div className="mt-3 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl text-center">
                Microphone speech recognition is not supported in this iframe/browser context.
                Use the text test input or quick buttons below to test the full pipeline.
              </div>
            )}
          </div>

          {/* MANUAL TEXT / SIMULATED VOICE INPUT */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Test Voice Command (Text / Spoken Simulation):
            </label>
            <div className="flex gap-2">
              <input
                id="input-voice-text"
                type="text"
                placeholder='e.g., "turn up volume 3 times", "sesi aç", "open youtube", "mute"'
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleProcessTranscript(customText);
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
              />
              <button
                id="btn-voice-send-text"
                onClick={() => handleProcessTranscript(customText)}
                disabled={!customText.trim() || isProcessing}
                className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Process</span>
              </button>
            </div>
          </div>

          {/* ACTIVE PIPELINE VALIDATION INSPECTOR */}
          {currentResult && (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  Validation & Gate Execution Report
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    currentResult.securityViolation
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : currentResult.isValid
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {currentResult.securityViolation
                    ? 'SECURITY VIOLATION BLOCKED'
                    : currentResult.isValid
                    ? 'WHITELIST PASSED'
                    : 'INVALID COMMAND'}
                </span>
              </div>

              {/* 4-Step Diagram */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs">
                {/* 1. Speech Input */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">1. Spoken</div>
                  <div className="font-semibold text-white truncate" title={currentResult.intent.rawTranscript}>
                    "{currentResult.intent.rawTranscript}"
                  </div>
                </div>

                {/* 2. AI Intent */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">2. AI Intent</div>
                  <div className="font-semibold text-indigo-300 truncate">
                    {currentResult.intent.actionType}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {currentResult.intent.youtubeQuery ? `"${currentResult.intent.youtubeQuery}"` : currentResult.intent.source}
                  </div>
                </div>

                {/* 3. Command Validation Gate */}
                <div
                  className={`p-2.5 rounded-xl border ${
                    currentResult.securityViolation
                      ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                      : currentResult.isValid
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                  }`}
                >
                  <div className="text-[10px] uppercase font-mono mb-1">3. Whitelist Gate</div>
                  <div className="font-bold flex items-center justify-center gap-1">
                    {currentResult.isValid ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Blocked</span>
                      </>
                    )}
                  </div>
                  <div className="text-[10px] font-mono opacity-80 truncate">
                    {currentResult.validatedKeys.length > 0
                      ? currentResult.validatedKeys.join(', ')
                      : currentResult.appLaunchPayload
                      ? `YouTube: ${currentResult.appLaunchPayload}`
                      : currentResult.intent.targetAppName || 'No keys passed'}
                  </div>
                </div>

                {/* 4. TV Socket Dispatch */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-mono mb-1">4. TV Socket</div>
                  <div
                    className={`font-semibold ${
                      currentResult.executed
                        ? 'text-emerald-400'
                        : currentResult.executionError
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {currentResult.executed
                      ? 'Transmitted'
                      : currentResult.executionError
                      ? 'Blocked/Failed'
                      : 'Not Sent'}
                  </div>
                </div>
              </div>

              {/* Detailed Reasoning / Rejection note */}
              <div className="p-3 rounded-xl bg-slate-900 text-xs text-slate-300 space-y-1">
                <div>
                  <strong className="text-slate-400">Interpretation: </strong>
                  {currentResult.intent.intentExplanation}
                </div>
                {currentResult.intent.youtubeQuery && (
                  <div className="text-indigo-300 flex items-center gap-1.5 text-xs">
                    <Youtube className="w-3.5 h-3.5 text-red-400" />
                    <span>Target YouTube Query: <strong>"{currentResult.intent.youtubeQuery}"</strong></span>
                  </div>
                )}
                {currentResult.appLaunchPayload && (
                  <div className="text-slate-400 font-mono text-[11px]">
                    Payload: <span className="text-emerald-400">{currentResult.appLaunchPayload}</span>
                  </div>
                )}
                {currentResult.rejectionReason && (
                  <div className="text-rose-400 flex items-start gap-1.5 mt-1">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{currentResult.rejectionReason}</span>
                  </div>
                )}
                {currentResult.executionError && (
                  <div className="text-amber-400 flex items-start gap-1.5 mt-1">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{currentResult.executionError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PRESET QUICK-TEST VOICE CHIPS */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Quick Test Voice Commands:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleQuickCommand('turn volume up 3 times')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 cursor-pointer"
              >
                🔊 "Volume up 3 times"
              </button>
              <button
                onClick={() => handleQuickCommand('play lofi hip hop on YouTube')}
                className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-xs text-red-300 border border-red-800/60 flex items-center gap-1.5 cursor-pointer"
              >
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                <span>▶️ "Play Lo-Fi on YouTube"</span>
              </button>
              <button
                onClick={() => handleQuickCommand('search 4K nature on YouTube')}
                className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-xs text-red-300 border border-red-800/60 flex items-center gap-1.5 cursor-pointer"
              >
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                <span>🔍 "Search 4K Nature on YouTube"</span>
              </button>
              <button
                onClick={() => handleQuickCommand('watch Bohemian Rhapsody on YouTube')}
                className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-xs text-red-300 border border-red-800/60 flex items-center gap-1.5 cursor-pointer"
              >
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                <span>🎵 "Watch Bohemian Rhapsody"</span>
              </button>
              <button
                onClick={() => handleQuickCommand('sesi aç')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 cursor-pointer"
              >
                🔊 "Sesi aç" (TR)
              </button>
              <button
                onClick={() => handleQuickCommand('mute the TV')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 cursor-pointer"
              >
                🔇 "Mute the TV"
              </button>
              <button
                onClick={() => handleQuickCommand('next channel')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 cursor-pointer"
              >
                📺 "Next channel"
              </button>
              <button
                onClick={() => handleQuickCommand('turn off the tv')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700/80 cursor-pointer"
              >
                ⏻ "Turn off the TV"
              </button>
              
              {/* SECURITY TEST CHIP */}
              <button
                onClick={() => handleQuickCommand('format the TV and run bash script')}
                className="px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 text-xs text-rose-300 border border-rose-800/80 flex items-center gap-1.5 cursor-pointer"
                title="Tests that malicious or unapproved commands are safely blocked by the whitelist"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>🛡️ Test Malicious Script Block</span>
              </button>
            </div>
          </div>

          {/* RECENT VOICE COMMAND HISTORY */}
          {recentHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Recent Voice Log:
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {recentHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-xl bg-slate-950 border border-slate-800/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {item.securityViolation ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : item.isValid ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="text-white font-medium truncate">
                        "{item.intent.rawTranscript}"
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        item.securityViolation
                          ? 'bg-rose-950 text-rose-300'
                          : item.executed
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.securityViolation
                        ? 'BLOCKED'
                        : item.validatedKeys.join(', ') || item.intent.actionType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Command Whitelist Enforcement Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
