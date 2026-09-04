import React, { useState, useEffect } from 'react';
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
  Radio,
  Youtube,
  Mic,
  MicOff,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import { ConnectionState, ValidRemoteKey, ManagedTVDevice } from '../types/tv.types.ts';
import { checkTvSslCertificate } from '../engine/index.ts';
import { volumeManager } from '../engine/volumeManager.ts';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition.ts';
import { interpretVoiceIntentWithAI, parseVoiceIntentLocally } from '../engine/voiceIntentParser.ts';
import { voiceCommandBridge } from '../engine/voiceCommandBridge.ts';
import { tvController } from '../engine/samsungTvController.ts';

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
  const [isCheckingSsl, setIsCheckingSsl] = useState<boolean>(false);
  const [sslStatusMsg, setSslStatusMsg] = useState<string | null>(null);
  const [isSslSuccess, setIsSslSuccess] = useState<boolean>(false);
  const [currentVolume, setCurrentVolume] = useState<number>(volumeManager.getEstimatedVolume());

  // Inline Voice Controller State
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState<boolean>(false);
  const [voiceStatusText, setVoiceStatusText] = useState<string | null>(null);
  const [voiceSuccessBadge, setVoiceSuccessBadge] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState<boolean>(false);

  const {
    isSupported: isSpeechSupported,
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceRecognition('tr-TR');

  // Track volume updates
  useEffect(() => {
    const unsubscribe = volumeManager.subscribe((vol) => {
      setCurrentVolume(vol);
    });
    return unsubscribe;
  }, []);

  const isConnected = connectionState === 'CONNECTED';
  const isPairing = connectionState === 'PAIRING';
  const isError = connectionState === 'ERROR';

  const cleanIp = ip.trim();
  const certUrl = `https://${cleanIp}:8002/api/v2/`;

  // Voice transcript completion handler
  useEffect(() => {
    if (transcript && !isListening && isVoicePanelOpen) {
      handleProcessVoiceInput(transcript);
    }
  }, [transcript, isListening, isVoicePanelOpen]);

  const handleProcessVoiceInput = async (spokenText: string) => {
    const clean = spokenText.trim();
    if (!clean) return;

    setIsProcessingVoice(true);
    setVoiceStatusText(`İşleniyor: "${clean}"...`);
    setVoiceSuccessBadge(null);

    try {
      // Step 1: Parse speech to intent (Rule-based or Gemini AI)
      let intent;
      try {
        intent = await interpretVoiceIntentWithAI(clean, true);
      } catch {
        intent = parseVoiceIntentLocally(clean);
      }

      // Step 2: Validate against command whitelist & execute safely
      const result = await voiceCommandBridge.processAndExecute(intent);

      if (result.securityViolation || !result.isValid) {
        setVoiceStatusText(`Engellendi: ${result.rejectionReason || 'İzin verilmeyen komut'}`);
        setVoiceSuccessBadge(null);
      } else if (result.executed) {
        const desc = result.intent.intentExplanation || 'Komut TV\'ye iletildi';
        setVoiceSuccessBadge(`✓ ${desc}`);
        setVoiceStatusText(null);
      } else {
        setVoiceStatusText(result.executionError || 'Komut TV\'ye iletilemedi');
      }
    } catch (err: any) {
      setVoiceStatusText(`Hata: ${err?.message || 'Bilinmeyen ses hatası'}`);
    } finally {
      setIsProcessingVoice(false);
      resetTranscript();
    }
  };

  const handleToggleInlineVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      setIsVoicePanelOpen(true);
      resetTranscript();
      setVoiceStatusText('Dinleniyor... (Konuşun)');
      setVoiceSuccessBadge(null);
      startListening();
    }
  };

  const handleVerifySslAndConnect = async () => {
    if (!cleanIp) return;
    setIsCheckingSsl(true);
    setSslStatusMsg(null);
    try {
      const trusted = await checkTvSslCertificate(cleanIp, 8002, 3000);
      if (trusted) {
        setIsSslSuccess(true);
        setSslStatusMsg('SSL sertifikası onaylandı! TV\'ye bağlanılıyor...');
        setTimeout(() => {
          onConnect?.();
        }, 300);
      } else {
        setIsSslSuccess(false);
        setSslStatusMsg('Sertifika henüz onaylanmamış. "TV Sertifikasını Aç" butonuna tıklayıp tarayıcıda onaylayın.');
      }
    } catch {
      setIsSslSuccess(false);
      setSslStatusMsg('Bağlantı kontrolü yapılamadı. TV\'nin açık ve aynı Wi-Fi ağında olduğunu doğrulayın.');
    } finally {
      setIsCheckingSsl(false);
    }
  };

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
      setTimeout(() => setActiveButton(null), 180);
    }
  };

  // 1-Click Launch YouTube on TV
  const handleFastLaunchYouTube = async () => {
    if (!isConnected) {
      onOpenYouTubeHub?.();
      return;
    }
    triggerHaptic();
    setActiveButton('YOUTUBE');
    try {
      const launched = tvController.appLauncher.launchYouTube
        ? await tvController.appLauncher.launchYouTube()
        : await tvController.appLauncher.launchApp('111299001912');
      if (launched) {
        setVoiceSuccessBadge('✓ YouTube TV üzerinde başlatıldı (111299001912)');
      } else {
        setVoiceSuccessBadge('Komut iletildi (TV onay bekleniyor)');
      }
    } catch {
      onOpenYouTubeHub?.();
    } finally {
      setTimeout(() => setActiveButton(null), 250);
    }
  };

  return (
    <div className="w-full flex justify-center py-2 px-2 sm:px-4">
      {/* Refined Ergonomic Remote Control Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl relative flex flex-col text-slate-100 select-none">
        
        {/* TOP STATUS & DEVICE BAR */}
        <div className="relative pb-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              id="btn-remote-device-switcher"
              onClick={() => setShowTvDropdown(!showTvDropdown)}
              className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="TV Cihazını Değiştir veya Yönet"
            >
              <div className={`p-2 rounded-xl transition-colors ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-white truncate max-w-[170px]">
                    {activeTv?.customName || activeTv?.name || 'Samsung Smart TV'}
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isConnected
                        ? 'bg-emerald-400 animate-pulse'
                        : isPairing
                        ? 'bg-amber-400 animate-ping'
                        : 'bg-rose-400'
                    }`}
                    title={isConnected ? 'Bağlı' : isPairing ? 'Eşleştiriliyor' : 'Bağlantı Kesik'}
                  />
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {ip} • {targetModel.replace('UXTK', '')}
                </p>
              </div>
            </button>
          </div>

          {/* Quick TV Switcher Popover */}
          {showTvDropdown && allTvs.length > 0 && (
            <div className="absolute top-16 left-0 z-40 w-64 bg-slate-800 border border-slate-700 rounded-2xl p-2.5 shadow-2xl animate-fade-in text-xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
                Kayıtlı TV'ler:
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allTvs.map((tv) => (
                  <button
                    key={tv.id}
                    onClick={() => {
                      onSelectTv?.(tv);
                      setShowTvDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer ${
                      tv.id === activeTv?.id
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-700/80'
                    }`}
                  >
                    <span className="truncate">{tv.customName || tv.name}</span>
                    <span className="text-[11px] font-mono opacity-80">{tv.ip}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-700 text-center">
                <button
                  onClick={() => {
                    setShowTvDropdown(false);
                    onOpenSettings();
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer py-1 block w-full text-center"
                >
                  TV'leri Keşfet & Yönet →
                </button>
              </div>
            </div>
          )}

          {/* Header Action Controls */}
          <div className="flex items-center gap-2">
            {/* Connect / Disconnect Toggle */}
            {isConnected ? (
              <button
                id="btn-remote-disconnect"
                onClick={onDisconnect}
                title="TV Bağlantısını Kes"
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Ayır
              </button>
            ) : (
              <button
                id="btn-remote-connect"
                onClick={onConnect}
                title="TV'ye Bağlan"
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Bağlan
              </button>
            )}

            {/* Settings */}
            <button
              id="btn-remote-settings"
              onClick={onOpenSettings}
              title="Ağ ve Cihaz Ayarları"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Cihaz Ayarları"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Power button */}
            <button
              id="btn-remote-power"
              onClick={() => {
                if (isConnected) {
                  handlePress('KEY_POWER');
                } else if (onConnect) {
                  onConnect();
                }
              }}
              title={isConnected ? 'TV Aç / Kapat (KEY_POWER)' : 'TV Bağlantısı Kur'}
              aria-label="Güç Aç/Kapat"
              className={`p-2.5 rounded-2xl transition-all cursor-pointer shadow-md focus-visible:ring-2 focus-visible:ring-rose-400 ${
                activeButton === 'KEY_POWER'
                  ? 'bg-rose-600 text-white scale-95'
                  : isConnected
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95'
                  : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
              }`}
            >
              <Power className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONNECTION & SYSTEM STATE NOTIFICATIONS */}
        <div aria-live="polite">
          {/* Pairing Banner */}
          {isPairing && (
            <div className="mt-3 p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-start gap-3 text-amber-200 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300 text-sm">TV Eşleştirme Onayı Gerekiyor</p>
                <p className="text-xs text-amber-100 mt-1 leading-relaxed">
                  Lütfen TV ekranına bakın ve fiziksel kumandanızla <strong>"İzin Ver" (Allow)</strong> seçeneğini seçin.
                </p>
              </div>
            </div>
          )}

          {/* Reconnecting Banner */}
          {connectionState === 'RECONNECTING' && (
            <div className="mt-3 p-2.5 bg-indigo-950/80 border border-indigo-500/40 rounded-2xl flex items-center justify-between text-xs text-indigo-200">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>TV'ye otomatik yeniden bağlanılıyor...</span>
              </span>
              {onDisconnect && (
                <button
                  onClick={onDisconnect}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  İptal
                </button>
              )}
            </div>
          )}

          {/* Connecting Banner */}
          {connectionState === 'CONNECTING' && (
            <div className="mt-3 p-2.5 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center gap-2 text-xs text-indigo-300">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Güvenli WSS:8002 bağlantısı kuruluyor...</span>
            </div>
          )}

          {/* SSL Certificate & Error Recovery Banner */}
          {isError && (
            <div className="mt-3 p-3.5 bg-slate-950 border-2 border-amber-500/60 rounded-2xl space-y-3 text-xs shadow-lg">
              <div className="flex items-start gap-2.5 text-amber-300">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-200 block text-sm">
                    TV Yerel SSL Sertifikası İzni Gerekli
                  </span>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Samsung Tizen TV güvenli WebSocket portunu (<strong>{cleanIp}:8002</strong>) tarayıcıda onaylamak için aşağıdaki butona dokunun:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={certUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold rounded-xl text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                >
                  <span>1. Sertifikayı Aç</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={handleVerifySslAndConnect}
                  disabled={isCheckingSsl}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-center flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                >
                  {isCheckingSsl ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>2. Doğrula & Bağlan</span>
                </button>
              </div>

              {sslStatusMsg && (
                <p className={`text-xs p-2 rounded-xl ${isSslSuccess ? 'bg-emerald-950/80 text-emerald-300' : 'bg-slate-900 text-amber-200'}`}>
                  {sslStatusMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* INLINE VOICE CONTROLLER BAR & PANEL */}
        <div className="mt-3 border border-indigo-500/20 bg-indigo-950/30 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <button
              id="btn-remote-inline-mic"
              onClick={handleToggleInlineVoice}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                isListening
                  ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-900/40'
                  : isVoicePanelOpen
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30'
              }`}
              aria-label={isListening ? 'Mikrofonu Kapat' : 'Sesli Komut Ver'}
            >
              {isListening ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Dinleniyor... (Durdur)</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-indigo-400" />
                  <span>Sesli Komut</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              {voiceSuccessBadge ? (
                <span className="text-xs font-semibold text-emerald-400 animate-fade-in flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[150px]">{voiceSuccessBadge}</span>
                </span>
              ) : voiceStatusText ? (
                <span className="text-xs text-indigo-200 truncate max-w-[160px] animate-pulse">
                  {voiceStatusText}
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  Örn: "Sesi 20 yap"
                </span>
              )}

              {onOpenVoiceAssistant && (
                <button
                  onClick={onOpenVoiceAssistant}
                  title="Detaylı Ses & Yapay Zeka Laboratuvarı"
                  className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  aria-label="Detaylı Ses Paneli"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Voice Sample Chips (1-Click Test) */}
          {isVoicePanelOpen && (
            <div className="mt-2.5 pt-2 border-t border-indigo-500/20 space-y-1.5">
              <div className="text-[11px] text-slate-400 font-medium">Hızlı Komut Dokunuşu:</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'sesi 20 yap',
                  'sesi 5 artır',
                  'sesi kapat',
                  'youtube aç',
                  'kanal değiştir',
                  'ana menü',
                ].map((sample) => (
                  <button
                    key={sample}
                    onClick={() => handleProcessVoiceInput(sample)}
                    disabled={isProcessingVoice || !isConnected}
                    className="px-2 py-1 bg-slate-800 hover:bg-indigo-900/60 active:bg-indigo-800 disabled:opacity-40 text-slate-200 hover:text-white rounded-lg text-xs font-mono transition-colors cursor-pointer border border-slate-700"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* REMOTE CONTROL MAIN BODY */}
        <div className="py-4 space-y-5">
          
          {/* D-PAD NAVIGATION CLUSTER */}
          <div className="flex flex-col items-center">
            <div className="relative w-52 h-52 rounded-full bg-slate-950 border-2 border-slate-800 shadow-xl flex items-center justify-center">
              
              {/* UP */}
              <button
                id="btn-remote-up"
                onClick={() => handlePress('KEY_UP')}
                disabled={!isConnected}
                aria-label="Yukarı Yön Tuşu"
                title="KEY_UP"
                className={`absolute top-2 w-16 h-14 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-t-full transition-colors cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_UP' ? 'text-indigo-400 bg-slate-800' : ''
                }`}
              >
                <ChevronUp className="w-7 h-7" />
              </button>

              {/* DOWN */}
              <button
                id="btn-remote-down"
                onClick={() => handlePress('KEY_DOWN')}
                disabled={!isConnected}
                aria-label="Aşağı Yön Tuşu"
                title="KEY_DOWN"
                className={`absolute bottom-2 w-16 h-14 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-b-full transition-colors cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_DOWN' ? 'text-indigo-400 bg-slate-800' : ''
                }`}
              >
                <ChevronDown className="w-7 h-7" />
              </button>

              {/* LEFT */}
              <button
                id="btn-remote-left"
                onClick={() => handlePress('KEY_LEFT')}
                disabled={!isConnected}
                aria-label="Sol Yön Tuşu"
                title="KEY_LEFT"
                className={`absolute left-2 w-14 h-16 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-l-full transition-colors cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_LEFT' ? 'text-indigo-400 bg-slate-800' : ''
                }`}
              >
                <ChevronLeft className="w-7 h-7" />
              </button>

              {/* RIGHT */}
              <button
                id="btn-remote-right"
                onClick={() => handlePress('KEY_RIGHT')}
                disabled={!isConnected}
                aria-label="Sağ Yön Tuşu"
                title="KEY_RIGHT"
                className={`absolute right-2 w-14 h-16 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/80 rounded-r-full transition-colors cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_RIGHT' ? 'text-indigo-400 bg-slate-800' : ''
                }`}
              >
                <ChevronRight className="w-7 h-7" />
              </button>

              {/* CENTER OK / ENTER */}
              <button
                id="btn-remote-enter"
                onClick={() => handlePress('KEY_ENTER')}
                disabled={!isConnected}
                aria-label="Tamam / Seç (KEY_ENTER)"
                title="KEY_ENTER"
                className={`w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 font-bold text-sm text-white shadow-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_ENTER'
                    ? 'bg-indigo-600 scale-95 border-indigo-500'
                    : 'hover:bg-slate-700 active:scale-95'
                }`}
              >
                OK
              </button>
            </div>
          </div>

          {/* SYSTEM QUICK KEYS: RETURN, MIC & HOME */}
          <div className="flex items-center justify-between gap-3">
            {/* RETURN */}
            <button
              id="btn-remote-return"
              onClick={() => handlePress('KEY_RETURN')}
              disabled={!isConnected}
              aria-label="Geri Dön (KEY_RETURN)"
              title="KEY_RETURN (Geri)"
              className={`flex-1 min-h-[48px] px-3 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-700 flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeButton === 'KEY_RETURN' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Geri</span>
            </button>

            {/* Central Mic Button */}
            <button
              id="btn-remote-mic-center"
              onClick={handleToggleInlineVoice}
              title="Sesli Komut & Yapay Zeka"
              aria-label="Mikrofon ile Sesli Komut Ver"
              className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-all cursor-pointer border border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Mic className="w-6 h-6" />
            </button>

            {/* HOME */}
            <button
              id="btn-remote-home"
              onClick={() => handlePress('KEY_HOME')}
              disabled={!isConnected}
              aria-label="Ana Menü / Smart Hub (KEY_HOME)"
              title="KEY_HOME (Ana Menü)"
              className={`flex-1 min-h-[48px] px-3 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-slate-200 hover:text-white hover:bg-slate-700 flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeButton === 'KEY_HOME' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Ana Menü</span>
            </button>
          </div>

          {/* DIRECT 1-TAP APP LAUNCHER: YOUTUBE */}
          <div>
            <button
              id="btn-remote-youtube"
              onClick={handleFastLaunchYouTube}
              title="YouTube TV Uygulamasını Başlat"
              aria-label="YouTube TV Uygulamasını Aç"
              className={`w-full min-h-[48px] px-4 rounded-2xl bg-gradient-to-r from-red-700 via-red-600 to-red-700 hover:from-red-600 hover:to-red-500 border border-red-500/50 text-white flex items-center justify-between text-xs font-bold tracking-wide shadow-lg shadow-red-950/40 active:scale-98 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 ${
                activeButton === 'YOUTUBE' ? 'scale-95 ring-2 ring-white' : ''
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Youtube className="w-5 h-5 text-white" />
                <span className="text-sm font-bold">YouTube</span>
              </div>
              <span className="text-xs py-1 px-2.5 rounded-lg bg-black/30 text-white font-medium">
                1-Tık TV'de Aç
              </span>
            </button>
          </div>

          {/* DUAL ROCKERS: VOLUME & CHANNEL + MUTE */}
          <div className="grid grid-cols-3 gap-3 items-center">
            {/* Volume Rocker */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-1.5 flex flex-col items-center shadow-md">
              <button
                id="btn-remote-volup"
                onClick={() => handlePress('KEY_VOLUP')}
                disabled={!isConnected}
                aria-label="Sesi Arttır"
                title="Sesi Arttır (KEY_VOLUP)"
                className={`w-full min-h-[48px] flex items-center justify-center rounded-t-2xl font-bold text-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_VOLUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>

              <div className="flex flex-col items-center py-2">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                  SES
                </span>
                <span
                  title="Senkronize Edilmiş TV Ses Seviyesi"
                  className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-950 border border-indigo-500/30 text-indigo-300 mt-1"
                >
                  {currentVolume}
                </span>
              </div>

              <button
                id="btn-remote-voldown"
                onClick={() => handlePress('KEY_VOLDOWN')}
                disabled={!isConnected}
                aria-label="Sesi Azalt"
                title="Sesi Azalt (KEY_VOLDOWN)"
                className={`w-full min-h-[48px] flex items-center justify-center rounded-b-2xl font-bold text-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_VOLDOWN' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                -
              </button>
            </div>

            {/* Center Mute Button */}
            <div className="flex flex-col items-center justify-center">
              <button
                id="btn-remote-mute"
                onClick={() => handlePress('KEY_MUTE')}
                disabled={!isConnected}
                aria-label="Sesi Kapat veya Aç (KEY_MUTE)"
                title="Sesi Kapat / Aç (KEY_MUTE)"
                className={`w-16 h-16 rounded-full border flex flex-col items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_MUTE'
                    ? 'bg-rose-600 border-rose-500 text-white scale-95'
                    : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white active:scale-95'
                }`}
              >
                <VolumeX className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-bold">MUTE</span>
              </button>
            </div>

            {/* Channel Rocker */}
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-1.5 flex flex-col items-center shadow-md">
              <button
                id="btn-remote-chup"
                onClick={() => handlePress('KEY_CHUP')}
                disabled={!isConnected}
                aria-label="Sonraki Kanal"
                title="Kanal Yukarı (KEY_CHUP)"
                className={`w-full min-h-[48px] flex items-center justify-center rounded-t-2xl font-bold text-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_CHUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>

              <div className="flex flex-col items-center py-2">
                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                  KANAL
                </span>
              </div>

              <button
                id="btn-remote-chdown"
                onClick={() => handlePress('KEY_CHDOWN')}
                disabled={!isConnected}
                aria-label="Önceki Kanal"
                title="Kanal Aşağı (KEY_CHDOWN)"
                className={`w-full min-h-[48px] flex items-center justify-center rounded-b-2xl font-bold text-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  activeButton === 'KEY_CHDOWN' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                -
              </button>
            </div>
          </div>

          {/* MEDIA PLAYBACK BAR */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-2 flex items-center justify-around">
            <button
              id="btn-remote-play"
              onClick={() => handlePress('KEY_PLAY')}
              disabled={!isConnected}
              aria-label="Oynat"
              title="Oynat (KEY_PLAY)"
              className={`min-w-[48px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeButton === 'KEY_PLAY' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Play className="w-5 h-5" />
            </button>
            <button
              id="btn-remote-pause"
              onClick={() => handlePress('KEY_PAUSE')}
              disabled={!isConnected}
              aria-label="Duraklat"
              title="Duraklat (KEY_PAUSE)"
              className={`min-w-[48px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeButton === 'KEY_PAUSE' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Pause className="w-5 h-5" />
            </button>
            <button
              id="btn-remote-stop"
              onClick={() => handlePress('KEY_STOP')}
              disabled={!isConnected}
              aria-label="Durdur"
              title="Durdur (KEY_STOP)"
              className={`min-w-[48px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                activeButton === 'KEY_STOP' ? 'bg-indigo-600 text-white' : ''
              }`}
            >
              <Square className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* BOTTOM FEEDBACK TOAST */}
        {lastDispatchedKey && (
          <div className="mt-2 mx-auto px-3.5 py-1.5 bg-indigo-950/90 border border-indigo-500/30 rounded-full flex items-center gap-2 text-xs font-mono text-indigo-300 animate-fade-in">
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>İletildi: {lastDispatchedKey}</span>
          </div>
        )}

      </div>
    </div>
  );
};
