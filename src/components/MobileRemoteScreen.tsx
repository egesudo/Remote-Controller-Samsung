import React, { useState } from 'react';
import {
  Power,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  Play,
  Pause,
  Square,
  Settings,
  Tv,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Radio,
  Youtube,
  Mic,
  Sparkles,
} from 'lucide-react';
import { ConnectionState, ValidRemoteKey, ManagedTVDevice } from '../types/tv.types.ts';
import { RefreshCw } from 'lucide-react';

interface MobileRemoteScreenProps {
  connectionState: ConnectionState;
  targetModel: string;
  ip: string;
  tokenMasked: string | null;
  onSendKey: (key: ValidRemoteKey) => Promise<boolean>;
  onOpenSettings: () => void;
  lastDispatchedKey: string | null;
  activeTv?: ManagedTVDevice | null;
  allTvs?: ManagedTVDevice[];
  onSelectTv?: (tv: ManagedTVDevice) => void;
  onOpenYouTubeHub?: () => void;
  onOpenVoiceAssistant?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const MobileRemoteScreen: React.FC<MobileRemoteScreenProps> = ({
  connectionState,
  targetModel,
  ip,
  tokenMasked,
  onSendKey,
  onOpenSettings,
  lastDispatchedKey,
  activeTv,
  allTvs = [],
  onSelectTv,
  onOpenYouTubeHub,
  onOpenVoiceAssistant,
  onConnect,
  onDisconnect,
}) => {
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [showTvDropdown, setShowTvDropdown] = useState<boolean>(false);

  const isConnected = connectionState === 'CONNECTED';
  const isPairing = connectionState === 'PAIRING';

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(35);
      } catch {
        // ignore
      }
    }
  };

  const handlePress = async (key: ValidRemoteKey) => {
    triggerHaptic();
    setActiveButton(key);
    try {
      await onSendKey(key);
    } finally {
      setTimeout(() => setActiveButton(null), 200);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-4">
      {/* Smartphone Chassis Mockup */}
      <div className="w-full max-w-[380px] bg-slate-950 rounded-[44px] p-4 shadow-2xl border-[6px] border-slate-800 relative flex flex-col justify-between text-slate-100 select-none">
        
        {/* Dynamic Island / Speaker Notch */}
        <div className="flex items-center justify-center mb-2">
          <div className="w-20 h-4 bg-slate-900 rounded-full flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-800"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-950"></div>
          </div>
        </div>

        {/* Top Status Header */}
        <div className="relative px-3 pt-1 pb-3 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowTvDropdown(!showTvDropdown)}>
            <div className={`p-1.5 rounded-lg ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight text-white truncate max-w-[140px]">
                  {activeTv?.customName || activeTv?.name || 'Samsung TV'}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400 animate-pulse'
                      : isPairing
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-400'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {targetModel.replace('UXTK', '')} • {ip}
              </p>
            </div>
          </div>

          {/* Quick TV Switcher Popover */}
          {showTvDropdown && allTvs.length > 0 && (
            <div className="absolute top-12 left-2 z-40 w-56 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl animate-fade-in text-xs">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                Select Active TV:
              </div>
              <div className="space-y-1">
                {allTvs.map((tv) => (
                  <button
                    key={tv.id}
                    onClick={() => {
                      onSelectTv?.(tv);
                      setShowTvDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between transition-colors ${
                      tv.id === activeTv?.id
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{tv.customName || tv.name}</span>
                    <span className="text-[9px] font-mono opacity-75">{tv.ip.split('.').slice(2).join('.')}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-800 text-center">
                <button
                  onClick={() => {
                    setShowTvDropdown(false);
                    onOpenSettings();
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Manage & Discover TVs...
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {/* Voice Assistant Trigger */}
            <button
              id="btn-mobile-top-voice"
              onClick={onOpenVoiceAssistant}
              title="AI Voice Assistant & Whitelist Gate"
              className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-xl transition-colors cursor-pointer relative"
            >
              <Mic className="w-4 h-4" />
              <span className="absolute 1 top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            </button>

            {/* Settings trigger */}
            <button
              id="btn-mobile-settings"
              onClick={onOpenSettings}
              title="Connection Settings"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>


            {/* Power button */}
            <button
              id="btn-mobile-power"
              onClick={() => {
                if (isConnected) {
                  handlePress('KEY_POWER');
                } else if (onConnect) {
                  onConnect();
                }
              }}
              title={isConnected ? 'KEY_POWER' : 'TV Disconnected - Tap to Connect'}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                activeButton === 'KEY_POWER'
                  ? 'bg-rose-600 text-white scale-95'
                  : isConnected
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95'
                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
              }`}
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* State Banner: Pairing */}
        {isPairing && (
          <div className="mt-2 mx-1 p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-start gap-2 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">Pairing in progress</p>
              <p className="text-[11px] text-amber-200/90 leading-tight mt-0.5">
                Look at your TV screen and select <strong>"Allow"</strong> using the physical remote.
              </p>
            </div>
          </div>
        )}

        {/* State Banner: Reconnecting */}
        {connectionState === 'RECONNECTING' && (
          <div className="mt-2 mx-1 p-2 bg-indigo-950/80 border border-indigo-500/40 rounded-2xl flex items-center justify-between text-xs text-indigo-300">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              Auto-reconnecting to TV...
            </span>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* State Banner: Connecting */}
        {connectionState === 'CONNECTING' && (
          <div className="mt-2 mx-1 p-2 bg-slate-900 border border-slate-700 rounded-2xl flex items-center gap-1.5 text-xs text-indigo-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Establishing secure WSS connection...</span>
          </div>
        )}

        {/* State Banner: Disconnected / Error Quick Connect Bar */}
        {(connectionState === 'DISCONNECTED' || connectionState === 'ERROR') && (
          <div className="mt-2 mx-1 p-2 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>TV Disconnected</span>
            </div>
            {onConnect && (
              <button
                id="btn-mobile-quick-connect"
                onClick={onConnect}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl text-[11px] transition-colors cursor-pointer"
              >
                Connect
              </button>
            )}
          </div>
        )}

        {/* Key Dispatched Feedback Toast */}
        {lastDispatchedKey && (
          <div className="mt-1.5 mx-auto px-3 py-1 bg-indigo-950/80 border border-indigo-500/30 rounded-full flex items-center gap-1.5 text-[10px] font-mono text-indigo-300 animate-fade-in">
            <Radio className="w-3 h-3 text-indigo-400 animate-pulse" />
            <span>Sent: {lastDispatchedKey}</span>
          </div>
        )}

        {/* Remote Control Main Body */}
        <div className="py-4 px-2 space-y-6">

          {/* D-PAD NAVIGATION */}
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48 rounded-full bg-slate-900 border-2 border-slate-800 shadow-xl flex items-center justify-center">
              
              {/* UP */}
              <button
                id="btn-mobile-up"
                onClick={() => handlePress('KEY_UP')}
                disabled={!isConnected}
                aria-label="Up"
                title="KEY_UP"
                className={`absolute top-1.5 w-14 h-12 flex items-center justify-center text-slate-300 hover:text-white rounded-t-full transition-colors cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_UP' ? 'text-indigo-400 bg-slate-800/80' : ''
                }`}
              >
                <ChevronUp className="w-6 h-6" />
              </button>

              {/* DOWN */}
              <button
                id="btn-mobile-down"
                onClick={() => handlePress('KEY_DOWN')}
                disabled={!isConnected}
                aria-label="Down"
                title="KEY_DOWN"
                className={`absolute bottom-1.5 w-14 h-12 flex items-center justify-center text-slate-300 hover:text-white rounded-b-full transition-colors cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_DOWN' ? 'text-indigo-400 bg-slate-800/80' : ''
                }`}
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              {/* LEFT */}
              <button
                id="btn-mobile-left"
                onClick={() => handlePress('KEY_LEFT')}
                disabled={!isConnected}
                aria-label="Left"
                title="KEY_LEFT"
                className={`absolute left-1.5 w-12 h-14 flex items-center justify-center text-slate-300 hover:text-white rounded-l-full transition-colors cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_LEFT' ? 'text-indigo-400 bg-slate-800/80' : ''
                }`}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* RIGHT */}
              <button
                id="btn-mobile-right"
                onClick={() => handlePress('KEY_RIGHT')}
                disabled={!isConnected}
                aria-label="Right"
                title="KEY_RIGHT"
                className={`absolute right-1.5 w-12 h-14 flex items-center justify-center text-slate-300 hover:text-white rounded-r-full transition-colors cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_RIGHT' ? 'text-indigo-400 bg-slate-800/80' : ''
                }`}
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* CENTER OK / ENTER */}
              <button
                id="btn-mobile-enter"
                onClick={() => handlePress('KEY_ENTER')}
                disabled={!isConnected}
                title="KEY_ENTER"
                className={`w-16 h-16 rounded-full bg-slate-800 border border-slate-700 font-bold text-xs text-white shadow-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_ENTER'
                    ? 'bg-indigo-600 scale-95 border-indigo-500'
                    : 'hover:bg-slate-700 active:scale-95'
                }`}
              >
                OK
              </button>
            </div>
          </div>

          {/* SYSTEM QUICK KEYS: BACK, VOICE & HOME */}
          <div className="flex items-center justify-between gap-3 px-3">
            <button
              id="btn-mobile-return"
              onClick={() => handlePress('KEY_RETURN')}
              disabled={!isConnected}
              title="KEY_RETURN (Back)"
              className={`flex-1 py-3 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_RETURN' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Back</span>
            </button>

            {/* Central Mic Button */}
            <button
              id="btn-mobile-mic-center"
              onClick={() => onOpenVoiceAssistant?.()}
              title="AI Voice Remote & Whitelist Gate"
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 border border-indigo-400/40"
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              id="btn-mobile-home"
              onClick={() => handlePress('KEY_HOME')}
              disabled={!isConnected}
              title="KEY_HOME (Smart Hub)"
              className={`flex-1 py-3 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_HOME' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
          </div>

          {/* DEDICATED APP LAUNCHER BAR: YOUTUBE */}
          <div className="px-4">
            <button
              id="btn-mobile-youtube"
              onClick={() => onOpenYouTubeHub?.()}
              title="Open YouTube TV Hub & Cast"
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-red-700/80 via-red-600/90 to-red-700/80 hover:from-red-600 hover:to-red-600 border border-red-500/40 text-white flex items-center justify-center gap-2 text-xs font-bold tracking-wide shadow-lg shadow-red-900/30 active:scale-98 transition-all cursor-pointer"
            >
              <Youtube className="w-4 h-4 text-white" />
              <span>YouTube TV Hub</span>
              <span className="text-[10px] py-0.5 px-1.5 rounded-full bg-white/20 text-white font-mono">
                Cast & Feeds
              </span>
            </button>
          </div>

          {/* DUAL ROCKERS: VOLUME & CHANNEL + MUTE */}
          <div className="grid grid-cols-3 gap-3 items-center px-2">
            {/* Volume Rocker */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-1 flex flex-col items-center shadow-md">
              <button
                id="btn-mobile-volup"
                onClick={() => handlePress('KEY_VOLUP')}
                disabled={!isConnected}
                title="KEY_VOLUP"
                className={`w-full py-3.5 flex items-center justify-center rounded-t-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_VOLUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>
              <span className="text-[10px] font-mono text-slate-500 py-1 uppercase tracking-wider">
                VOL
              </span>
              <button
                id="btn-mobile-voldown"
                onClick={() => handlePress('KEY_VOLDOWN')}
                disabled={!isConnected}
                title="KEY_VOLDOWN"
                className={`w-full py-3.5 flex items-center justify-center rounded-b-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_VOLDOWN' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                -
              </button>
            </div>

            {/* Center Mute Button */}
            <div className="flex flex-col items-center justify-center">
              <button
                id="btn-mobile-mute"
                onClick={() => handlePress('KEY_MUTE')}
                disabled={!isConnected}
                title="KEY_MUTE"
                className={`w-14 h-14 rounded-full border flex flex-col items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-30 ${
                  activeButton === 'KEY_MUTE'
                    ? 'bg-amber-600 text-white border-amber-500 scale-95'
                    : 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800'
                }`}
              >
                <VolumeX className="w-5 h-5" />
                <span className="text-[9px] font-semibold mt-0.5">Mute</span>
              </button>
            </div>

            {/* Channel Rocker */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-1 flex flex-col items-center shadow-md">
              <button
                id="btn-mobile-chup"
                onClick={() => handlePress('KEY_CHUP')}
                disabled={!isConnected}
                title="KEY_CHUP"
                className={`w-full py-3.5 flex items-center justify-center rounded-t-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_CHUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>
              <span className="text-[10px] font-mono text-slate-500 py-1 uppercase tracking-wider">
                CH
              </span>
              <button
                id="btn-mobile-chdown"
                onClick={() => handlePress('KEY_CHDOWN')}
                disabled={!isConnected}
                title="KEY_CHDOWN"
                className={`w-full py-3.5 flex items-center justify-center rounded-b-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_CHDOWN' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                -
              </button>
            </div>
          </div>

          {/* MEDIA CONTROLS ROW */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-2 flex items-center justify-around">
            <button
              id="btn-mobile-play"
              onClick={() => handlePress('KEY_PLAY')}
              disabled={!isConnected}
              title="KEY_PLAY"
              className={`p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_PLAY' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              id="btn-mobile-pause"
              onClick={() => handlePress('KEY_PAUSE')}
              disabled={!isConnected}
              title="KEY_PAUSE"
              className={`p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_PAUSE' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Pause className="w-4 h-4" />
            </button>
            <button
              id="btn-mobile-stop"
              onClick={() => handlePress('KEY_STOP')}
              disabled={!isConnected}
              title="KEY_STOP"
              className={`p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_STOP' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Bottom Home Indicator Bar */}
        <div className="flex items-center justify-center pt-2 pb-1">
          <div className="w-28 h-1 bg-slate-700 rounded-full"></div>
        </div>

      </div>
    </div>
  );
};
