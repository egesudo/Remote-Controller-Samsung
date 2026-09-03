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
  ExternalLink,
  ShieldAlert,
  Info,
  RefreshCw,
} from 'lucide-react';
import { ConnectionState, ValidRemoteKey, ManagedTVDevice } from '../types/tv.types.ts';
import { checkTvSslCertificate } from '../engine/index.ts';

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

  const isConnected = connectionState === 'CONNECTED';
  const isPairing = connectionState === 'PAIRING';
  const isError = connectionState === 'ERROR';

  const cleanIp = ip.trim();
  const certUrl = `https://${cleanIp}:8002/api/v2/`;

  const handleVerifySslAndConnect = async () => {
    if (!cleanIp) return;
    setIsCheckingSsl(true);
    setSslStatusMsg(null);
    try {
      const trusted = await checkTvSslCertificate(cleanIp, 8002, 3000);
      if (trusted) {
        setIsSslSuccess(true);
        setSslStatusMsg('✅ SSL sertifikası onaylandı! TV\'ye bağlanılıyor...');
        setTimeout(() => {
          onConnect?.();
        }, 300);
      } else {
        setIsSslSuccess(false);
        setSslStatusMsg('Sertifika henüz onaylanmamış veya TV kapalı. Lütfen "1. TV Sertifikasını Aç" butonuna tıklayıp tarayıcıda "İlerle" seçeneğini onaylayın.');
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
                Aktif TV Seçin:
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
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                >
                  TV'leri Yönet & Ağda Ara...
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {/* Voice Assistant Trigger */}
            <button
              id="btn-mobile-top-voice"
              onClick={onOpenVoiceAssistant}
              title="Yapay Zeka Sesli Komut & İzinli Liste Kontrolü"
              className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-xl transition-colors cursor-pointer relative"
            >
              <Mic className="w-4 h-4" />
              <span className="absolute 1 top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            </button>

            {/* Settings trigger */}
            <button
              id="btn-mobile-settings"
              onClick={onOpenSettings}
              title="Bağlantı Ayarları"
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
              title={isConnected ? 'Aç / Kapat (KEY_POWER)' : 'TV Bağlantısı Kesik - Bağlanmak İçin Dokunun'}
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
              <p className="font-semibold text-amber-300">Eşleştirme Devam Ediyor</p>
              <p className="text-[11px] text-amber-200/90 leading-tight mt-0.5">
                TV ekranına bakın ve fiziksel kumandayla <strong>"İzin Ver" (Allow)</strong> seçeneğine basın.
              </p>
            </div>
          </div>
        )}

        {/* State Banner: Reconnecting */}
        {connectionState === 'RECONNECTING' && (
          <div className="mt-2 mx-1 p-2 bg-indigo-950/80 border border-indigo-500/40 rounded-2xl flex items-center justify-between text-xs text-indigo-300">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              TV'ye otomatik yeniden bağlanılıyor...
            </span>
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                İptal
              </button>
            )}
          </div>
        )}

        {/* State Banner: Connecting */}
        {connectionState === 'CONNECTING' && (
          <div className="mt-2 mx-1 p-2 bg-slate-900 border border-slate-700 rounded-2xl flex items-center gap-1.5 text-xs text-indigo-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Güvenli WSS bağlantısı kuruluyor...</span>
          </div>
        )}

        {/* State Banner: ERROR with Guided 1-Click SSL & Reachability Flow */}
        {isError && (
          <div className="mt-2 mx-1 p-3 bg-slate-900 border-2 border-amber-500/60 rounded-2xl space-y-2.5 text-xs shadow-lg animate-fade-in">
            <div className="flex items-start gap-2 text-amber-300">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-200 block text-xs">
                  TV SSL Sertifikası Onayı Gerekiyor
                </span>
                <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                  Tarayıcınız, Samsung TV'nin (<strong>{cleanIp}:8002</strong>) yerel SSL sertifikasını güvenlik kısıtlaması nedeniyle engelliyor.
                </p>
              </div>
            </div>

            {/* Step 1 Button: Open TV Certificate */}
            <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Adım 1:</span>
                <span className="text-[9px] text-slate-400 font-mono">Port 8002 WSS</span>
              </div>
              <a
                id="btn-mobile-open-ssl"
                href={certUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[36px] py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 text-xs transition-colors shadow-xs"
              >
                <span>TV Sertifikasını Yeni Sekmede Aç</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="text-[10px] text-slate-400 leading-tight pt-0.5">
                Sekmede: <strong>"Gelişmiş"</strong> &gt; <strong>"{cleanIp} sitesine ilerle (güvensiz)"</strong> butonuna tıklayın.
              </p>
            </div>

            {/* Step 2 Button: Verify & Reconnect */}
            <div className="space-y-1">
              <button
                id="btn-mobile-verify-ssl"
                onClick={handleVerifySslAndConnect}
                disabled={isCheckingSsl}
                className="w-full min-h-[38px] py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer shadow-xs"
              >
                {isCheckingSsl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sertifika Kontrol Ediliyor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Adım 2: Sertifikayı Doğrula &amp; Bağlan</span>
                  </>
                )}
              </button>

              {sslStatusMsg && (
                <div
                  className={`p-2 rounded-lg text-[10px] leading-tight ${
                    isSslSuccess
                      ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
                  }`}
                >
                  {sslStatusMsg}
                </div>
              )}
            </div>

            {/* TV Checklist Footnote */}
            <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400 space-y-0.5">
              <p>• TV açık ve telefon/bilgisayarınızla <strong>aynı Wi-Fi</strong> ağında olmalıdır.</p>
              <p>• TV Menüsü: <em>Genel &gt; Harici Cihaz Yöneticisi &gt; Erişim Bildirimi</em>: <strong>"İlk Seferde"</strong> olmalıdır.</p>
            </div>
          </div>
        )}

        {/* State Banner: Disconnected Normal Quick Connect Bar */}
        {connectionState === 'DISCONNECTED' && (
          <div className="mt-2 mx-1 p-2 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span>TV Bağlantısı Kesik</span>
            </div>
            {onConnect && (
              <button
                id="btn-mobile-quick-connect"
                onClick={onConnect}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl text-[11px] transition-colors cursor-pointer"
              >
                Bağlan
              </button>
            )}
          </div>
        )}

        {/* Key Dispatched Feedback Toast */}
        {lastDispatchedKey && (
          <div className="mt-1.5 mx-auto px-3 py-1 bg-indigo-950/80 border border-indigo-500/30 rounded-full flex items-center gap-1.5 text-[10px] font-mono text-indigo-300 animate-fade-in">
            <Radio className="w-3 h-3 text-indigo-400 animate-pulse" />
            <span>Gönderildi: {lastDispatchedKey}</span>
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
                aria-label="Yukarı"
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
                aria-label="Aşağı"
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
                aria-label="Sol"
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
                aria-label="Sağ"
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
              title="KEY_RETURN (Geri)"
              className={`flex-1 py-3 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_RETURN' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Geri</span>
            </button>

            {/* Central Mic Button */}
            <button
              id="btn-mobile-mic-center"
              onClick={() => onOpenVoiceAssistant?.()}
              title="Yapay Zeka Sesli Komut & Doğrulama Geçidi"
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 border border-indigo-400/40"
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              id="btn-mobile-home"
              onClick={() => handlePress('KEY_HOME')}
              disabled={!isConnected}
              title="KEY_HOME (Ana Menü / Smart Hub)"
              className={`flex-1 py-3 px-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 ${
                activeButton === 'KEY_HOME' ? 'bg-indigo-900/60 border-indigo-500 text-indigo-300 scale-95' : ''
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Ana Menü</span>
            </button>
          </div>

          {/* DEDICATED APP LAUNCHER BAR: YOUTUBE */}
          <div className="px-4">
            <button
              id="btn-mobile-youtube"
              onClick={() => onOpenYouTubeHub?.()}
              title="YouTube TV Merkezi & Oynatıcı"
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-red-700/80 via-red-600/90 to-red-700/80 hover:from-red-600 hover:to-red-600 border border-red-500/40 text-white flex items-center justify-center gap-2 text-xs font-bold tracking-wide shadow-lg shadow-red-900/30 active:scale-98 transition-all cursor-pointer"
            >
              <Youtube className="w-4 h-4 text-white" />
              <span>YouTube TV Merkezi</span>
              <span className="text-[10px] py-0.5 px-1.5 rounded-full bg-white/20 text-white font-mono">
                Yayın & Kontrol
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
                title="Sesi Arttır (KEY_VOLUP)"
                className={`w-full py-3.5 flex items-center justify-center rounded-t-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_VOLUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>
              <span className="text-[10px] font-mono text-slate-500 py-1 uppercase tracking-wider">
                SES
              </span>
              <button
                id="btn-mobile-voldown"
                onClick={() => handlePress('KEY_VOLDOWN')}
                disabled={!isConnected}
                title="Sesi Azalt (KEY_VOLDOWN)"
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
                title="Sesi Kapat / Aç (KEY_MUTE)"
                className={`w-14 h-14 rounded-full border flex flex-col items-center justify-center transition-all cursor-pointer shadow-md disabled:opacity-30 ${
                  activeButton === 'KEY_MUTE'
                    ? 'bg-amber-600 text-white border-amber-500 scale-95'
                    : 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800'
                }`}
              >
                <VolumeX className="w-5 h-5" />
                <span className="text-[9px] font-semibold mt-0.5">Sessiz</span>
              </button>
            </div>

            {/* Channel Rocker */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-1 flex flex-col items-center shadow-md">
              <button
                id="btn-mobile-chup"
                onClick={() => handlePress('KEY_CHUP')}
                disabled={!isConnected}
                title="Kanal Yukarı (KEY_CHUP)"
                className={`w-full py-3.5 flex items-center justify-center rounded-t-2xl font-bold text-xs text-slate-200 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 ${
                  activeButton === 'KEY_CHUP' ? 'bg-indigo-600 text-white' : ''
                }`}
              >
                +
              </button>
              <span className="text-[10px] font-mono text-slate-500 py-1 uppercase tracking-wider">
                KANAL
              </span>
              <button
                id="btn-mobile-chdown"
                onClick={() => handlePress('KEY_CHDOWN')}
                disabled={!isConnected}
                title="Kanal Aşağı (KEY_CHDOWN)"
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
              title="Oynat (KEY_PLAY)"
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
              title="Duraklat (KEY_PAUSE)"
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
              title="Durdur (KEY_STOP)"
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
