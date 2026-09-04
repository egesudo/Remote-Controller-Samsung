import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Sliders,
  FolderCode,
  ShieldCheck,
  Radio,
  Tv,
  Search,
  Youtube,
  Mic,
  ExternalLink,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import {
  tvController,
  ConnectionState,
  TVLogEntry,
  ValidRemoteKey,
  TVDeviceInfo,
  KNOWN_TV_APPS,
  tvDeviceManager,
  ManagedTVDevice,
} from './engine/index.ts';
import { DeviceHeader } from './components/DeviceHeader.tsx';
import { MobileRemoteScreen } from './components/MobileRemoteScreen.tsx';
import { MobileSettingsDrawer } from './components/MobileSettingsDrawer.tsx';
import { RealTvTestGuide } from './components/RealTvTestGuide.tsx';
import { ConnectionPanel } from './components/ConnectionPanel.tsx';
import { RemoteControlPad } from './components/RemoteControlPad.tsx';
import { SecurityValidatorCard } from './components/SecurityValidatorCard.tsx';
import { ModularCapabilitiesCard } from './components/ModularCapabilitiesCard.tsx';
import { LiveLogViewer } from './components/LiveLogViewer.tsx';
import { TVDiscoveryAndManager } from './components/TVDiscoveryAndManager.tsx';
import { YouTubeHubModal } from './components/YouTubeHubModal.tsx';
import { VoiceRemoteModal } from './components/VoiceRemoteModal.tsx';

const TARGET_MODEL = 'UE55TU8500UXTK';
const FIRMWARE_VERSION = 'T-NKLDEUC-2740.1,BT-S';
const DEFAULT_IP_STORAGE_KEY = 'samsung_tv_default_ip';

export default function App() {
  const [activeTab, setActiveTab] = useState<'mobile' | 'devices' | 'studio'>('mobile');
  
  // Managed TV Devices state
  const [allTvs, setAllTvs] = useState<ManagedTVDevice[]>(() => tvDeviceManager.getDevices());
  const [activeTv, setActiveTv] = useState<ManagedTVDevice | null>(() => tvDeviceManager.getActiveDevice());

  const [ip, setIp] = useState<string>(() => {
    return activeTv?.ip || localStorage.getItem(DEFAULT_IP_STORAGE_KEY) || '192.168.1.50';
  });
  const [port, setPort] = useState<number>(() => activeTv?.port || 8002);
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [tokenMasked, setTokenMasked] = useState<string | null>(() => {
    return tvController.getMaskedToken(tvController.getStoredToken(ip));
  });
  const [logs, setLogs] = useState<TVLogEntry[]>(() => tvController.getLogs());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isYouTubeHubOpen, setIsYouTubeHubOpen] = useState<boolean>(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState<boolean>(false);
  const [lastDispatchedKey, setLastDispatchedKey] = useState<string | null>(null);

  // Subscribe to TV Device Manager changes
  useEffect(() => {
    const unsub = tvDeviceManager.subscribe((devices, active) => {
      setAllTvs(devices);
      setActiveTv(active);
      if (active && active.ip !== ip) {
        setIp(active.ip);
        setPort(active.port);
        const storedToken = active.token || tvController.getStoredToken(active.ip);
        setTokenMasked(tvController.getMaskedToken(storedToken));
      }
    });
    return () => unsub();
  }, [ip]);

  // Sync IP changes with localStorage and reload stored token mask
  const handleIpChange = (newIp: string) => {
    setIp(newIp);
    localStorage.setItem(DEFAULT_IP_STORAGE_KEY, newIp);
    const existingToken = tvController.getStoredToken(newIp);
    setTokenMasked(tvController.getMaskedToken(existingToken));
  };

  // Wire event listener to TV controller
  useEffect(() => {
    const unsubscribe = tvController.addListener({
      onStateChange: (state) => {
        setConnectionState(state);
        if (state === 'CONNECTED') {
          setErrorMessage(null);
        }
      },
      onTokenChange: (tokenMask) => {
        setTokenMasked(tokenMask);
        // Persist token in device manager
        const rawToken = tvController.getStoredToken(ip);
        if (rawToken) {
          tvDeviceManager.associateToken(ip, rawToken);
        }
      },
      onLog: (entry) => {
        setLogs((prev) => [entry, ...prev.slice(0, 99)]);
      },
      onError: (err) => {
        setErrorMessage(err);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [ip]);

  // Connect to TV
  const handleConnect = useCallback(async () => {
    setErrorMessage(null);
    await tvController.connect({
      host: ip,
      port,
      appName: 'SamsungRemoteApp',
      autoReconnect: true,
      maxReconnectAttempts: 5,
    });
  }, [ip, port]);

  // Disconnect from TV
  const handleDisconnect = useCallback(() => {
    tvController.disconnect();
  }, []);

  // Select and connect to a specific TV device
  const handleSelectAndConnectTV = useCallback(async (device: ManagedTVDevice) => {
    setErrorMessage(null);
    tvDeviceManager.setActiveDevice(device.id);
    setIp(device.ip);
    setPort(device.port);
    const token = device.token || tvController.getStoredToken(device.ip);
    setTokenMasked(tvController.getMaskedToken(token));

    // If currently connected to another IP, disconnect first
    if (tvController.getConnectionState() === 'CONNECTED') {
      tvController.disconnect();
    }

    await tvController.connect({
      host: device.ip,
      port: device.port,
      token: device.token || undefined,
      appName: 'SamsungRemoteApp',
      autoReconnect: true,
      maxReconnectAttempts: 5,
    });
  }, []);

  // Clear stored token
  const handleClearToken = useCallback(() => {
    tvController.clearStoredToken(ip);
    setTokenMasked(null);
    const active = tvDeviceManager.getDeviceByIp(ip);
    if (active) {
      tvDeviceManager.updateDevice(active.id, { token: null });
    }
  }, [ip]);

  // Diagnostic Probe
  const handleProbeInfo = useCallback(async (): Promise<TVDeviceInfo | null> => {
    return await tvController.probeDeviceInfo(ip);
  }, [ip]);

  // Send validated key command
  const handleSendKey = useCallback(async (key: ValidRemoteKey): Promise<boolean> => {
    setLastDispatchedKey(key);
    return await tvController.sendKey(key);
  }, []);

  // Arbitrary command security test
  const handleTestArbitraryCommand = useCallback(async (arbitraryCmd: string): Promise<boolean> => {
    return await tvController.sendKey(arbitraryCmd);
  }, []);

  // Modular probe: Launch YouTube app
  const handleLaunchYouTubeProbe = useCallback(async (): Promise<boolean> => {
    return await tvController.appLauncher.launchApp(KNOWN_TV_APPS.YOUTUBE.id);
  }, []);

  // Clear UI Logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Device & Header Info */}
      <DeviceHeader
        connectionState={connectionState}
        targetModel={activeTv?.modelName || TARGET_MODEL}
        firmwareVersion={FIRMWARE_VERSION}
        ip={ip}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-6 space-y-4">
        {/* Error notification & guided troubleshooting banner */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs shadow-xs space-y-3 animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-rose-950 block text-xs mb-0.5">Connection Issue Detected</span>
                  <span className="text-rose-800">{errorMessage}</span>
                </div>
              </div>
              <button
                id="btn-dismiss-error"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-800 font-bold px-2 py-1 bg-rose-100/60 hover:bg-rose-100 rounded-lg cursor-pointer shrink-0 transition-colors"
              >
                Dismiss
              </button>
            </div>

            {/* If the error relates to WSS or connection failure on port 8002 */}
            {(errorMessage.includes('8002') || errorMessage.includes('SSL') || errorMessage.includes('connect')) && (
              <div className="p-3 bg-white/90 border border-rose-200 rounded-xl space-y-2.5 text-slate-800">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                  <HelpCircle className="w-4 h-4 text-indigo-600" />
                  <span>3 Adımda Bağlantıyı Tamamlama (Samsung TV & Tarayıcı Güvenliği)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                  {/* Step 1 */}
                  <div className="p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-1.5 flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-indigo-900 block">1. TV SSL Sertifikasını Onaylayın</span>
                      <p className="text-slate-600">
                        Tarayıcılar TV'nin kendinden imzalı SSL sertifikasını varsayılan olarak engeller. Tek seferlik izin vermeniz gerekir.
                      </p>
                    </div>
                    <a
                      href={`https://${ip.trim()}:8002/api/v2/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-[11px] transition-colors shadow-xs"
                    >
                      <span>Sertifika Sayfasını Aç</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Step 2 */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <span className="font-bold text-slate-900 block">2. Tarayıcıda İlerleyin</span>
                    <p className="text-slate-600">
                      Açılan yeni sekmede <strong>"Gelişmiş" (Advanced)</strong> butonuna, ardından <strong>"{ip.trim()} sitesine ilerle (güvensiz)"</strong> seçeneğine tıklayın.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <span className="font-bold text-slate-900 block">3. TV Ayarını Kontrol Edin</span>
                    <p className="text-slate-600">
                      TV Menüsü $\rightarrow$ Genel $\rightarrow$ Harici Cihaz Yöneticisi $\rightarrow$ <strong>Erişim Bildirimi</strong>: "İlk Seferde" olmalıdır. TV açık olmalıdır.
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    Sertifikayı onayladıktan sonra sekmeyi kapatıp aşağıdaki "TV'ye Bağlan" butonuna tekrar basabilirsiniz.
                  </span>
                  <button
                    onClick={handleConnect}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Tekrar Bağlan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Mode Selector Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              id="tab-mobile-remote"
              onClick={() => setActiveTab('mobile')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'mobile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span>Mobil Kumanda</span>
            </button>

            <button
              id="tab-tv-discovery"
              onClick={() => setActiveTab('devices')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'devices'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Search className="w-4 h-4 text-indigo-600" />
              <span>TV Keşfi & Cihazlar ({allTvs.length})</span>
            </button>

            <button
              id="tab-studio-diagnostics"
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'studio'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Stüdyo & Tanılama</span>
            </button>
          </div>

          {/* Quick Connection Status & Active TV trigger */}
          <div className="flex items-center gap-2 px-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionState === 'CONNECTED'
                    ? 'bg-emerald-500'
                    : connectionState === 'PAIRING'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span>
                {connectionState === 'CONNECTED'
                  ? 'BAĞLI'
                  : connectionState === 'CONNECTING'
                  ? 'BAĞLANIYOR'
                  : connectionState === 'PAIRING'
                  ? 'EŞLEŞİYOR'
                  : connectionState === 'ERROR'
                  ? 'HATA'
                  : 'BAĞLI DEĞİL'}
              </span>
            </div>

            <button
              id="btn-nav-youtube-hub"
              onClick={() => setIsYouTubeHubOpen(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>YouTube Merkezi</span>
            </button>

            <button
              id="btn-nav-voice-assistant"
              onClick={() => setIsVoiceAssistantOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Sesli AI</span>
            </button>

            <button
              id="btn-quick-settings"
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Tv className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-medium truncate max-w-[120px]">
                {activeTv?.customName || activeTv?.name || ip}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: Mobile App Remote View */}
        {activeTab === 'mobile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Center Remote Control */}
            <div className="lg:col-span-7 flex justify-center">
              <MobileRemoteScreen
                connectionState={connectionState}
                targetModel={activeTv?.modelName || TARGET_MODEL}
                ip={ip}
                tokenMasked={tokenMasked}
                onSendKey={handleSendKey}
                onOpenSettings={() => setIsSettingsOpen(true)}
                lastDispatchedKey={lastDispatchedKey}
                activeTv={activeTv}
                allTvs={allTvs}
                onSelectTv={handleSelectAndConnectTV}
                onOpenYouTubeHub={() => setIsYouTubeHubOpen(true)}
                onOpenVoiceAssistant={() => setIsVoiceAssistantOpen(true)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            </div>

            {/* Desktop Companion Card: Active TV Overview & Natural Voice Guide */}
            <div className="lg:col-span-5 space-y-4">
              {/* TV Quick Overview */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Tv className="w-4 h-4 text-indigo-600" />
                    Aktif TV Durumu
                  </span>
                  <button
                    onClick={() => setActiveTab('devices')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    TV Değiştir →
                  </button>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold text-slate-900">
                        {activeTv?.customName || activeTv?.name || 'Samsung Smart TV'}
                      </p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        {ip}:{port} • {activeTv?.modelName || TARGET_MODEL}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      connectionState === 'CONNECTED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : connectionState === 'PAIRING'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : connectionState === 'CONNECTING'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {connectionState === 'CONNECTED'
                        ? 'BAĞLI'
                        : connectionState === 'PAIRING'
                        ? 'EŞLEŞİYOR'
                        : connectionState === 'CONNECTING'
                        ? 'BAĞLANIYOR'
                        : 'BAĞLANTI YOK'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Komut Beyaz Listesi Aktif
                    </span>
                    <span className="font-mono text-slate-500">
                      Token: {tokenMasked || 'Yok'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Natural Voice Guide Card */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Doğal Sesli Komutlar
                    </h3>
                    <p className="text-xs text-slate-500">
                      Kumandadaki mikrofona basarak konuşun
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">"Sesi 20 yap"</span>
                    <span className="text-[11px] text-indigo-600 font-mono">Hedef ses düzeyi</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">"Sesi 5 artır" / "Kıs"</span>
                    <span className="text-[11px] text-indigo-600 font-mono">Kademeli ses</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">"YouTube'u aç"</span>
                    <span className="text-[11px] text-red-600 font-mono">Uygulama başlat</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-800">"Kanal değiştir" / "Ana menü"</span>
                    <span className="text-[11px] text-slate-600 font-mono">Gezinme</span>
                  </div>
                </div>

                <div className="pt-1 text-center">
                  <button
                    onClick={() => setIsVoiceAssistantOpen(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                  >
                    Detaylı Ses & Yapay Zeka Laboratuvarı →
                  </button>
                </div>
              </div>

              {/* Developer & Diagnostics Switcher */}
              <div className="bg-slate-50 rounded-3xl border border-slate-200 p-4 text-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">Gelişmiş Tanılama & Testler</p>
                  <p className="text-slate-500 text-[11px]">Canlı loglar, donanım kontrol listesi ve React Native Expo kılavuzu</p>
                </div>
                <button
                  onClick={() => setActiveTab('studio')}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs shrink-0"
                >
                  Tanılama
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TV Discovery & Devices Management View */}
        {activeTab === 'devices' && (
          <div className="space-y-6">
            <TVDiscoveryAndManager
              currentConnectionState={connectionState}
              onSelectAndConnectTV={handleSelectAndConnectTV}
              onDisconnectTV={handleDisconnect}
            />
          </div>
        )}

        {/* TAB 3: Studio & Diagnostics View */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* Real TV Verification Checklist Banner */}
            <RealTvTestGuide
              isConnected={connectionState === 'CONNECTED'}
              ip={ip}
              onSendKey={handleSendKey}
              lastDispatchedKey={lastDispatchedKey}
            />

            {/* Connection & Pairing Control */}
            <ConnectionPanel
              ip={ip}
              onIpChange={handleIpChange}
              port={port}
              onPortChange={setPort}
              connectionState={connectionState}
              tokenMasked={tokenMasked}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onClearToken={handleClearToken}
              onProbeInfo={handleProbeInfo}
            />

            {/* Remote Control Pad */}
            <RemoteControlPad
              isConnected={connectionState === 'CONNECTED'}
              onSendKey={handleSendKey}
            />

            {/* Security & Modular Architecture Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SecurityValidatorCard
                onTestArbitraryCommand={handleTestArbitraryCommand}
                onOpenVoiceAssistant={() => setIsVoiceAssistantOpen(true)}
              />

              <ModularCapabilitiesCard
                isConnected={connectionState === 'CONNECTED'}
                onLaunchYouTubeProbe={handleLaunchYouTubeProbe}
                onOpenYouTubeHub={() => setIsYouTubeHubOpen(true)}
              />
            </div>

            {/* Expo Native Codebase Guide Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FolderCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    React Native / Expo Mobil Projesi Hazır
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tam yerel mobil kod tabanı <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">/mobile</code> dizininde mevcuttur.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1.5 font-mono">
                <p className="font-bold text-indigo-950">Fiziksel Android / iOS cihazınızda çalıştırmak için:</p>
                <p className="text-slate-600">$ cd mobile</p>
                <p className="text-slate-600">$ npm install</p>
                <p className="text-slate-600">$ npx expo start</p>
                <p className="text-slate-500 text-[10px] pt-1">
                  Samsung TV'niz ile aynı Wi-Fi ağına bağlıyken Expo Go uygulamasında terminaldeki QR kodu okutun!
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Sıkı Beyaz Liste Doğrulayıcı Etkin
                </span>
                <span className="font-mono text-slate-400">Port 8002 WSS</span>
              </div>
            </div>

            {/* Full Live Event Stream / Log Terminal */}
            <LiveLogViewer
              logs={logs}
              onClearLogs={handleClearLogs}
            />
          </div>
        )}

        {/* Settings Drawer Modal */}
        <MobileSettingsDrawer
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          ip={ip}
          onIpChange={handleIpChange}
          port={port}
          onPortChange={setPort}
          connectionState={connectionState}
          tokenMasked={tokenMasked}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onClearToken={handleClearToken}
          onProbeInfo={handleProbeInfo}
          activeTv={activeTv}
          onSelectTv={handleSelectAndConnectTV}
        />

        {/* YouTube TV Hub Modal */}
        <YouTubeHubModal
          isOpen={isYouTubeHubOpen}
          onClose={() => setIsYouTubeHubOpen(false)}
          onSendKey={handleSendKey}
        />

        {/* AI Voice Remote & Whitelist Gate Modal */}
        <VoiceRemoteModal
          isOpen={isVoiceAssistantOpen}
          onClose={() => setIsVoiceAssistantOpen(false)}
          connectionState={connectionState}
          activeTvName={activeTv?.customName || activeTv?.name || ip}
          onConnect={handleConnect}
        />
      </main>
    </div>
  );
}
