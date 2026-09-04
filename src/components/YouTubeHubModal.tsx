import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cast,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FastForward,
  HelpCircle,
  Info,
  ListVideo,
  LogOut,
  Play,
  PlaySquare,
  RefreshCw,
  Rewind,
  Search,
  Sparkles,
  Terminal,
  Tv,
  Volume2,
  VolumeX,
  X,
  Youtube,
  Copy,
  Check,
} from 'lucide-react';
import {
  CURATED_YOUTUBE_STREAMS,
  tvController,
  tvDeviceManager,
  youTubeService,
  type AppLaunchTelemetryRecord,
  type ConnectionState,
  type DiscoveredAppInfo,
  type YouTubeAuthStatus,
  type YouTubePlaylist,
  type YouTubeVideo,
} from '../engine/index.ts';

interface YouTubeHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendKey: (key: string) => void;
}

export const YouTubeHubModal: React.FC<YouTubeHubModalProps> = ({
  isOpen,
  onClose,
  onSendKey,
}) => {
  const [activeTvName, setActiveTvName] = useState('Samsung Smart TV');
  const [activeTvIp, setActiveTvIp] = useState('');
  const [isTvConnected, setIsTvConnected] = useState(false);
  const [connState, setConnState] = useState<ConnectionState>(tvController.getConnectionState());

  // Deep Link State
  const [videoInput, setVideoInput] = useState('');
  const [launchMessage, setLaunchMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    showTroubleshoot?: boolean;
  } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // Google OAuth & YouTube Data State
  const [authStatus, setAuthStatus] = useState<YouTubeAuthStatus>({
    isAuthenticated: false,
    user: null,
    hasOAuthConfig: false,
  });
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [likedVideos, setLikedVideos] = useState<YouTubeVideo[]>([]);
  const [activeTab, setActiveTab] = useState<'streams' | 'playlists' | 'liked' | 'setup'>('streams');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>(CURATED_YOUTUBE_STREAMS);
  const [showConfigGuide, setShowConfigGuide] = useState(false);

  // Runtime App Discovery State
  const [resolvedYtId, setResolvedYtId] = useState<string>(
    tvController.appLauncher.getResolvedYouTubeAppId?.() || '111299001912'
  );
  const [isScanningApps, setIsScanningApps] = useState(false);
  const [discoveredCount, setDiscoveredCount] = useState(
    tvController.appLauncher.getInstalledApps?.().length || 0
  );
  const [discoveredAppsList, setDiscoveredAppsList] = useState<DiscoveredAppInfo[]>(
    tvController.appLauncher.getInstalledApps?.() || []
  );
  const [showDiscoveryDetails, setShowDiscoveryDetails] = useState(false);
  const [lastTelemetry, setLastTelemetry] = useState<AppLaunchTelemetryRecord | null>(
    tvController.appLauncher.getLastLaunchTelemetry?.() || null
  );
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Sync active TV info and telemetry
  useEffect(() => {
    const updateTvInfo = () => {
      const activeTv = tvDeviceManager.getActiveDevice();
      if (activeTv) {
        setActiveTvName(activeTv.customName || activeTv.name || 'Samsung Smart TV');
        setActiveTvIp(activeTv.ip);
      }
      const state = tvController.getConnectionState();
      setConnState(state);
      setIsTvConnected(state === 'CONNECTED');
      const ytId = tvController.appLauncher.getResolvedYouTubeAppId?.();
      if (ytId) setResolvedYtId(ytId);
      const apps = tvController.appLauncher.getInstalledApps?.() || [];
      setDiscoveredAppsList(apps);
      setDiscoveredCount(apps.length);
      const latestTelemetry = tvController.appLauncher.getLastLaunchTelemetry?.();
      if (latestTelemetry) setLastTelemetry(latestTelemetry);
    };

    updateTvInfo();
    const unsubController = tvController.addListener({
      onStateChange: () => updateTvInfo(),
    });
    const unsubManager = tvDeviceManager.subscribe(() => updateTvInfo());
    const unsubTelemetry = tvController.appLauncher.addTelemetryListener?.((record) => {
      setLastTelemetry({ ...record });
    });

    return () => {
      unsubController();
      unsubManager();
      unsubTelemetry?.();
    };
  }, []);

  // Fetch Auth Status
  const refreshAuthStatus = async () => {
    const status = await youTubeService.getAuthStatus();
    setAuthStatus(status);
    if (status.isAuthenticated) {
      const [userPlaylists, userLiked] = await Promise.all([
        youTubeService.getUserPlaylists(),
        youTubeService.getLikedVideos(),
      ]);
      setPlaylists(userPlaylists);
      setLikedVideos(userLiked);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshAuthStatus();
    }
  }, [isOpen]);

  // Listen for OAuth postMessage from popup window
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        refreshAuthStatus();
        setLaunchMessage({
          type: 'success',
          text: 'Google Account successfully linked with YouTube Hub!',
        });
        setActiveTab('playlists');
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setLaunchMessage({
          type: 'error',
          text: `Google OAuth error: ${event.data.error || 'Authorization failed'}`,
        });
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  if (!isOpen) return null;

  // Manual trigger for runtime app discovery to troubleshoot launch issues
  const handleRefreshAppDiscovery = async () => {
    setIsScanningApps(true);
    setLaunchMessage({
      type: 'info',
      text: 'Samsung TV aktif ve yüklü uygulamaları taranıyor (WebSocket EDEN & REST)...',
    });
    try {
      const apps = await tvController.appLauncher.discoverInstalledApps?.({
        forceRefresh: true,
        timeoutMs: 3500,
      });
      const count = apps?.length || 0;
      setDiscoveredCount(count);
      const ytId = await tvController.appLauncher.resolveYouTubeAppId?.(true);
      if (ytId) {
        setResolvedYtId(ytId);
      }
      const updatedList = tvController.appLauncher.getInstalledApps?.() || [];
      setDiscoveredAppsList(updatedList);

      setLaunchMessage({
        type: 'success',
        text: `Refresh App Discovery tamamlandı! ${count} uygulama algılandı. Doğrulanan YouTube App ID: ${ytId || '111299001912'}`,
      });
    } catch (err) {
      setLaunchMessage({
        type: 'error',
        text: `Uygulama taraması sırasında hata oluştu: ${err instanceof Error ? err.message : String(err)}. Lütfen TV bağlantısını kontrol edin.`,
        showTroubleshoot: true,
      });
    } finally {
      setIsScanningApps(false);
    }
  };
  const handleScanApps = handleRefreshAppDiscovery;

  // Launch YouTube app on TV
  const handleLaunchYouTubeApp = async (videoId?: string) => {
    // Pre-flight check: TV must be connected via Port 8002 WSS
    const currentConn = tvController.getConnectionState();
    if (currentConn !== 'CONNECTED') {
      if (currentConn === 'ERROR') {
        setLaunchMessage({
          type: 'error',
          text: `TV bağlı değil (SSL sertifikası onayı gerekiyor). Lütfen yukarıdaki "1. TV SSL Sertifikasını Aç" butonuna tıklayıp onaylayın, ardından TV'ye bağlanın.`,
        });
      } else if (currentConn === 'PAIRING') {
        setLaunchMessage({
          type: 'info',
          text: `TV eşleştirme bekliyor: Lütfen Samsung TV ekranındaki "İzin Ver" (Allow) uyarısını kumandanızla onaylayın.`,
        });
      } else {
        setLaunchMessage({
          type: 'info',
          text: `TV bağlı değil. TV bağlantısı (${activeTvIp || '192.168.1.102'}:8002) başlatılıyor...`,
        });
        if (activeTvIp) {
          tvController.connect({ host: activeTvIp, port: 8002 });
        }
      }
      return;
    }

    setIsLaunching(true);
    setLaunchMessage({ type: 'info', text: videoId ? `Video ${activeTvName} ekranına gönderiliyor...` : `YouTube ${activeTvName} üzerinde başlatılıyor...` });

    try {
      const payload = videoId ? `v=${videoId}` : undefined;
      const success = tvController.appLauncher.launchYouTube
        ? await tvController.appLauncher.launchYouTube(payload)
        : await tvController.appLauncher.launchApp('111299001912', payload);

      const ytId = tvController.appLauncher.getResolvedYouTubeAppId?.();
      if (ytId) setResolvedYtId(ytId);

      if (success) {
        setLaunchMessage({
          type: 'success',
          text: videoId
            ? `Video ${activeTvName} ekranına iletildi (ID: ${videoId})!`
            : `YouTube ${activeTvName} üzerinde açıldı!`,
        });
      } else {
        setLaunchMessage({
          type: 'info',
          text: `YouTube başlatma komutu iletildi. Uygulama açılmazsa TV'nin açık olduğunu kontrol edin veya "Refresh App Discovery" ile uygulama kimliğini yenileyin.`,
          showTroubleshoot: true,
        });
      }
    } catch {
      setLaunchMessage({
        type: 'error',
        text: 'Uygulama başlatılamadı. TV yerel ağ bağlantısını kontrol edin veya "Refresh App Discovery" ile kimliği yenileyin.',
        showTroubleshoot: true,
      });
    } finally {
      setIsLaunching(false);
    }
  };

  // Launch from custom URL or ID
  const handleDirectPlay = () => {
    const videoId = youTubeService.extractVideoId(videoInput);
    if (!videoId) {
      setLaunchMessage({
        type: 'error',
        text: 'Lütfen geçerli bir YouTube Video Bağlantısı (ör. youtu.be/...) veya 11 haneli Video ID girin.',
      });
      return;
    }
    handleLaunchYouTubeApp(videoId);
  };

  // Connect Google Account via popup
  const handleConnectGoogle = async () => {
    const authUrl = await youTubeService.getAuthUrl();
    if (!authUrl) {
      setLaunchMessage({
        type: 'info',
        text: 'Google OAuth İstemci kimlik bilgileri henüz sunucuya eklenmemiş. Aşağıdaki rehbere göz atın.',
      });
      setShowConfigGuide(true);
      return;
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );
  };

  // Disconnect Google Account
  const handleDisconnect = async () => {
    await youTubeService.disconnect();
    setAuthStatus({ isAuthenticated: false, user: null, hasOAuthConfig: authStatus.hasOAuthConfig });
    setPlaylists([]);
    setLikedVideos([]);
    setActiveTab('streams');
    setLaunchMessage({ type: 'info', text: 'Google hesabının bağlantısı kesildi.' });
  };

  // Search handling
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(CURATED_YOUTUBE_STREAMS);
      return;
    }
    const results = await youTubeService.searchVideos(searchQuery);
    setSearchResults(results);
  };

  return (
    <div
      id="youtube-hub-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="youtube-hub-modal"
        className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-900 border border-red-900/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/30">
              <Youtube className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-tight">YouTube TV Merkezi</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-950/80 text-red-400 border border-red-800/40">
                  Tizen Modüler
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
                <Tv className="w-3.5 h-3.5" />
                <span className="truncate max-w-[240px] font-medium text-slate-300">
                  {activeTvName}
                </span>
                {activeTvIp && <span>• {activeTvIp}</span>}
                <span
                  className={`inline-block w-2 h-2 rounded-full ml-1 ${
                    isTvConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </div>
            </div>
          </div>

          <button
            id="btn-close-youtube-hub"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            aria-label="YouTube Merkezini Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast / Launch Feedback */}
        {launchMessage && (
          <div
            className={`px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
              launchMessage.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-800/40'
                : launchMessage.type === 'error'
                ? 'bg-red-950/80 text-red-300 border-b border-red-800/40'
                : 'bg-indigo-950/80 text-indigo-300 border-b border-indigo-800/40'
            }`}
          >
            <div className="flex items-center space-x-2 truncate">
              {launchMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
              {launchMessage.type === 'error' && <X className="w-4 h-4 shrink-0 text-red-400" />}
              {launchMessage.type === 'info' && <Cast className="w-4 h-4 shrink-0 text-indigo-400" />}
              <span className="truncate">{launchMessage.text}</span>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              {launchMessage.showTroubleshoot && (
                <button
                  id="btn-troubleshoot-refresh-app-discovery"
                  onClick={handleRefreshAppDiscovery}
                  disabled={isScanningApps}
                  className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50 shadow-sm"
                  title="TV uygulama listesini ve YouTube kimliğini yeniden tara"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanningApps ? 'animate-spin' : ''}`} />
                  <span>Refresh App Discovery</span>
                </button>
              )}
              <button
                onClick={() => setLaunchMessage(null)}
                className="text-slate-400 hover:text-slate-200 ml-2 text-xs cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TV Connection & SSL Alert when not CONNECTED */}
          {!isTvConnected && (
            <div
              id="youtube-tv-connection-alert"
              className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200 flex-1">
                  <p className="font-bold text-sm text-amber-300">
                    {connState === 'ERROR'
                      ? 'Samsung TV Bağlantısı & SSL İzni Gerekli'
                      : connState === 'PAIRING'
                      ? 'TV Ekranında Onay Bekleniyor (Eşleştirme)'
                      : connState === 'CONNECTING'
                      ? 'TV\'ye Güvenli WSS Bağlantısı Kuruluyor...'
                      : 'Samsung TV\'ye Bağlı Değil'}
                  </p>
                  <p className="mt-1 leading-relaxed text-amber-100/90">
                    {connState === 'ERROR'
                      ? `Tarayıcınız, Samsung TV'nin (${activeTvIp || '192.168.1.102'}:8002) kendinden imzalı SSL sertifikasını engelliyor olabilir. YouTube'u TV'de açabilmek için aşağıdaki 2 adımı tamamlayın:`
                      : connState === 'PAIRING'
                      ? 'TV ekranının sağ üstünde beliren "İzin Ver" (Allow) bildirimini fiziksel kumandanızla onaylayın. Onaylandığında YouTube başlatılabilir.'
                      : connState === 'CONNECTING'
                      ? 'Port 8002 (WSS) üzerinden TV ile el sıkışılıyor, lütfen bekleyin...'
                      : 'YouTube uygulamasını TV\'de açabilmek için TV\'nin açık ve yerel ağ (Port 8002 WSS) üzerinden bağlı olması gerekir.'}
                  </p>
                </div>
              </div>

              {connState === 'ERROR' && (
                <div className="space-y-2 pt-1 border-t border-amber-800/40">
                  <div className="text-[11px] text-amber-200/90 bg-amber-900/30 p-2.5 rounded-lg">
                    <span className="font-semibold text-amber-300">Nasıl Onaylanır?</span>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5 text-amber-100">
                      <li>Aşağıdaki <strong>"1. TV SSL Sertifikasını Aç"</strong> linkine tıklayın.</li>
                      <li>Açılan sekmede <strong>"Gelişmiş" (Advanced)</strong> butonuna basın.</li>
                      <li>En alttaki <strong>"{activeTvIp || '192.168.1.102'} sitesine ilerle (güvensiz)"</strong> seçeneğine tıklayın.</li>
                      <li>Buraya dönüp <strong>"2. TV'ye Yeniden Bağlan"</strong> butonuna basın.</li>
                    </ol>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={`https://${activeTvIp || '192.168.1.102'}:8002/api/v2/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                      <span>1. TV SSL Sertifikasını Aç</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={async () => {
                        if (activeTvIp) {
                          await tvController.connect({ host: activeTvIp, port: 8002 });
                        }
                      }}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>2. TV'ye Yeniden Bağlan</span>
                    </button>
                  </div>
                </div>
              )}

              {(connState === 'DISCONNECTED' || connState === 'PAIRING') && (
                <button
                  onClick={async () => {
                    if (activeTvIp) {
                      await tvController.connect({ host: activeTvIp, port: 8002 });
                    }
                  }}
                  className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Tv className="w-4 h-4" />
                  <span>{connState === 'PAIRING' ? 'TV\'ye Tekrar Bağlanmayı Dene' : 'Samsung TV\'ye Bağlan (Port 8002 WSS)'}</span>
                </button>
              )}
            </div>
          )}

          {/* Quick Launch & TV Media Controls Bar */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <PlaySquare className="w-4 h-4 text-red-500" />
                  TV Üzerinde YouTube Kontrolleri
                </h3>
                <p className="text-xs text-slate-400">
                  Samsung TV için hızlı uygulama başlatma ve oynatma kontrolleri
                </p>
              </div>

              <button
                id="btn-launch-youtube-app"
                onClick={() => handleLaunchYouTubeApp()}
                disabled={isLaunching}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-semibold flex items-center space-x-2 transition shadow-md shadow-red-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Youtube className="w-4 h-4" />
                <span>{isLaunching ? 'Başlatılıyor...' : 'TV\'de YouTube Aç'}</span>
              </button>
            </div>

            {/* Dynamic Runtime App Discovery & Troubleshooting Bar */}
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400 font-medium">YouTube App ID:</span>
                  <code className="px-2 py-0.5 rounded bg-slate-950 font-mono text-amber-300 font-semibold border border-slate-700/80 shadow-inner">
                    {resolvedYtId}
                  </code>
                  <span className="text-[11px] text-emerald-400 font-medium px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/50">
                    {discoveredCount > 0 ? `${discoveredCount} Uygulama Algılandı` : 'Dinamik Algılama'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDiscoveryDetails(!showDiscoveryDetails)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 cursor-pointer ml-1"
                    title="Sorun giderme ve bulunan uygulamaları incele"
                  >
                    <span>{showDiscoveryDetails ? 'Ayrıntıları Gizle' : 'Sorun Giderme & Uygulamalar'}</span>
                    {showDiscoveryDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Primary Requested Action: Refresh App Discovery */}
                <button
                  id="btn-refresh-app-discovery"
                  onClick={handleRefreshAppDiscovery}
                  disabled={isScanningApps}
                  className="text-xs text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 px-3 py-1.5 rounded-lg transition font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-sm border border-indigo-500/50"
                  title="TV'deki aktif ve yüklü uygulamaları yeniden tara (başlatma sorunlarını gidermek için)"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningApps ? 'animate-spin' : ''}`} />
                  <span>{isScanningApps ? 'Taranıyor...' : 'Refresh App Discovery'}</span>
                </button>
              </div>

              {/* Troubleshooting & Discovered Apps Expansion */}
              {showDiscoveryDetails && (
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-2 mt-1">
                  <div className="flex items-start gap-2 text-slate-300">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-white">App Discovery Sorun Giderme Rehberi:</span>
                      <p className="mt-0.5 text-slate-300 leading-relaxed text-[11px]">
                        Eğer YouTube TV'de açılmıyorsa; <strong>"Refresh App Discovery"</strong> butonuna tıklayarak
                        Samsung Smart TV'nizden (TU8500 / T-NKLDEUC) güncel uygulama listesini canlı olarak yeniden çekebilirsiniz.
                        Sistem WebSocket EDEN kanalı (<code>ed.installedApp.get</code>) ve REST port 8001 üzerinden TV'deki aktif
                        YouTube paket kimliğini (<code>111299001912</code>, <code>9Ur5IzDKqV.TizenYouTube</code> vb.) otomatik doğrular.
                      </p>
                    </div>
                  </div>

                  {/* Discovered Apps List Preview */}
                  {discoveredAppsList.length > 0 ? (
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>TV'de Algılanan Yüklü Uygulamalar ({discoveredAppsList.length}):</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Aktif Bağlantı: Port 8002 WSS</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                        {discoveredAppsList.map((app) => (
                          <div
                            key={app.appId}
                            className={`flex items-center justify-between p-1.5 rounded border ${
                              app.appId === resolvedYtId
                                ? 'bg-indigo-950/50 border-indigo-600/60 text-indigo-200 font-semibold'
                                : 'bg-slate-900/60 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <span className="truncate">{app.name}</span>
                              {app.appId === resolvedYtId && (
                                <span className="text-[9px] px-1 py-0.2 bg-indigo-500 text-white rounded font-sans">
                                  Aktif YouTube
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-slate-400 text-[10px]">{app.appId}</span>
                              <span className="text-[9px] px-1 py-0.2 bg-slate-800 text-slate-400 rounded">
                                {app.source === 'websocket_eden' ? 'EDEN WSS' : 'REST'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Henüz TV'den uygulama listesi önbelleğe alınmadı.</span>
                      <button
                        type="button"
                        onClick={handleRefreshAppDiscovery}
                        disabled={isScanningApps}
                        className="text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                      >
                        Şimdi Tara
                      </button>
                    </div>
                  )}

                  {/* Granular Event Log & Exact Payload Diagnostic */}
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <div className="flex items-center space-x-1.5 text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-amber-400" />
                        <span>Son Uygulama Başlatma Telemetrisi (Granular Event Log):</span>
                      </div>
                      {lastTelemetry && (
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                              lastTelemetry.responseStatus === 'SUCCESS_200'
                                ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                                : lastTelemetry.responseStatus === 'ERROR_404'
                                ? 'bg-rose-950/70 border-rose-700 text-rose-300'
                                : lastTelemetry.responseStatus === 'PERMISSION_DENIED_AUTH'
                                ? 'bg-amber-950/70 border-amber-700 text-amber-300'
                                : lastTelemetry.responseStatus === 'ERROR_PAYLOAD'
                                ? 'bg-purple-950/70 border-purple-700 text-purple-300'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            {lastTelemetry.responseStatus}
                          </span>
                          <span className="text-[10px] text-slate-400">{lastTelemetry.timestamp}</span>
                        </div>
                      )}
                    </div>

                    {lastTelemetry ? (
                      <div className="space-y-2 font-mono text-[11px]">
                        {/* Diagnosis Banner */}
                        <div
                          className={`p-2 rounded border leading-relaxed ${
                            lastTelemetry.responseStatus === 'SUCCESS_200'
                              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                              : lastTelemetry.responseStatus === 'ERROR_404'
                              ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                              : lastTelemetry.responseStatus === 'PERMISSION_DENIED_AUTH'
                              ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                              : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="font-sans font-semibold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                            Firmware Tanısı (T-NKLDEUC / TU8500):
                          </div>
                          {lastTelemetry.diagnosis}
                        </div>

                        {/* Exact JSON Outbound Payload */}
                        <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-amber-300 font-semibold font-sans">
                              TV'ye Gönderilen Doğrulanmış JSON Yükü (Port 8002 WSS):
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(lastTelemetry.outboundEdenJson);
                                setCopiedPayload(true);
                                setTimeout(() => setCopiedPayload(false), 2000);
                              }}
                              className="text-[10px] text-slate-300 hover:text-white flex items-center space-x-1 cursor-pointer"
                              title="JSON Yükünü Kopyala"
                            >
                              {copiedPayload ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Kopyalandı</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-400" />
                                  <span>Kopyala</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-28 p-1 bg-slate-900/90 rounded border border-slate-800">
                            {lastTelemetry.outboundEdenJson}
                          </pre>
                        </div>

                        {/* TV Response Payload if available */}
                        {lastTelemetry.rawResponseJson && (
                          <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
                            <div className="text-[10px] text-emerald-400 font-semibold font-sans">
                              TV'den Alınan WebSocket Yanıtı ({lastTelemetry.responseEvent || 'ed.apps.launch'}):
                            </div>
                            <pre className="text-[10px] text-emerald-300 overflow-x-auto max-h-24 p-1 bg-slate-900/90 rounded border border-slate-800">
                              {lastTelemetry.rawResponseJson}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        Henüz uygulama başlatma isteği gönderilmedi. "TV'de YouTube Aç" butonuna basıldığında TV'ye iletilen tam JSON yükü ve Samsung WebSocket yanıtı burada anlık olarak raporlanacaktır.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* In-App Media Keys for TV */}
            <div className="grid grid-cols-6 gap-1.5 pt-2 border-t border-slate-800/60 text-xs">
              <button
                onClick={() => onSendKey('KEY_PLAY')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="Videoyu Oynat"
              >
                <Play className="w-4 h-4 text-emerald-400 mb-0.5" />
                <span>Oynat</span>
              </button>
              <button
                onClick={() => onSendKey('KEY_PAUSE')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="Videoyu Duraklat"
              >
                <div className="w-4 h-4 flex items-center justify-center font-bold text-amber-400 text-xs mb-0.5">
                  ||
                </div>
                <span>Duraklat</span>
              </button>
              <button
                onClick={() => onSendKey('KEY_LEFT')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="10 Saniye Geri Sar"
              >
                <Rewind className="w-4 h-4 text-slate-300 mb-0.5" />
                <span>-10sn</span>
              </button>
              <button
                onClick={() => onSendKey('KEY_RIGHT')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="10 Saniye İleri Sar"
              >
                <FastForward className="w-4 h-4 text-slate-300 mb-0.5" />
                <span>+10sn</span>
              </button>
              <button
                onClick={() => onSendKey('KEY_VOLUP')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="Sesi Arttır"
              >
                <Volume2 className="w-4 h-4 text-sky-400 mb-0.5" />
                <span>Ses +</span>
              </button>
              <button
                onClick={() => onSendKey('KEY_MUTE')}
                className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 flex flex-col items-center justify-center transition font-medium cursor-pointer"
                title="Sesi Aç/Kapat"
              >
                <VolumeX className="w-4 h-4 text-rose-400 mb-0.5" />
                <span>Sessiz</span>
              </button>
            </div>
          </div>

          {/* Deep Link Video Bar */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5">
            <label htmlFor="input-video-link" className="block text-xs font-semibold text-slate-300">
              Video Bağlantısını veya ID'sini TV'ye Gönder
            </label>
            <div className="flex gap-2">
              <input
                id="input-video-link"
                type="text"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                placeholder="YouTube bağlantısı (youtu.be/...) veya Video ID yapıştırın"
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-red-500"
              />
              <button
                id="btn-cast-video"
                onClick={handleDirectPlay}
                disabled={!videoInput.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 disabled:opacity-40 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition shrink-0 cursor-pointer"
              >
                <Cast className="w-3.5 h-3.5" />
                <span>TV'de Oynat</span>
              </button>
            </div>
          </div>

          {/* Google Account Connection Status Card */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80">
            {authStatus.isAuthenticated && authStatus.user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {authStatus.user.picture ? (
                    <img
                      src={authStatus.user.picture}
                      alt={authStatus.user.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-slate-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-900/60 text-red-300 font-bold flex items-center justify-center">
                      {authStatus.user.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-white">{authStatus.user.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                        Google Bağlandı
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{authStatus.user.email}</p>
                  </div>
                </div>

                <button
                  id="btn-disconnect-google"
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Bağlantıyı Kes</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Google Hesabı & YouTube Akışları
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Kişisel oynatma listelerinize ve beğendiğiniz videolara erişmek için Google Hesabınızı bağlayın.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      id="btn-connect-google"
                      onClick={handleConnectGoogle}
                      className="px-3.5 py-1.5 rounded-lg bg-white text-slate-900 hover:bg-slate-100 active:scale-95 text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Google Bağla</span>
                    </button>

                    <button
                      onClick={() => setShowConfigGuide(!showConfigGuide)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title="OAuth ve Bağlantı Bilgisi"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Collapsible OAuth & TV Linking Guide */}
                {showConfigGuide && (
                  <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2.5 mt-2 animate-in fade-in">
                    <div className="font-semibold text-slate-300">
                      Teknik Bağlantı Modları:
                    </div>
                    <div className="space-y-1.5 text-slate-400">
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-emerald-400 font-bold">1.</span>
                        <div>
                          <strong className="text-slate-300">Doğrudan Yerel Ağ (LAN) Kontrolü (Aktif):</strong> Samsung TV (`111299001912`) üzerinde herhangi bir video ID'si veya arama sorgusu ile YouTube uygulamasını OAuth gerektirmeden yerel ağdan doğrudan açar.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-indigo-400 font-bold">2.</span>
                        <div>
                          <strong className="text-slate-300">TV Ekranı ile Google Eşleme:</strong> TV'nizde YouTube'u açın, <em>Ayarlar → TV kodu ile bağla</em> bölümüne gidin ve verilen kodu <code className="text-indigo-300 font-mono">youtube.com/pair</code> adresine girin.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-amber-400 font-bold">3.</span>
                        <div>
                          <strong className="text-slate-300">Google OAuth Kurulumu:</strong> Uygulama içi Google oturumu açmak isterseniz ortam değişkenlerine <code className="text-amber-300 font-mono">GOOGLE_CLIENT_ID</code> ve <code className="text-amber-300 font-mono">GOOGLE_CLIENT_SECRET</code> ekleyin:
                          <div className="font-mono text-[11px] bg-slate-950 p-1.5 rounded border border-slate-800 text-amber-200 mt-1 select-all break-all">
                            {authStatus.redirectUri || 'https://<APP_URL>/auth/callback'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('streams')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                activeTab === 'streams'
                  ? 'bg-red-600/20 text-red-400 border border-red-800/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>4K Test Yayınları</span>
            </button>

            {authStatus.isAuthenticated && (
              <>
                <button
                  onClick={() => setActiveTab('playlists')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'playlists'
                      ? 'bg-red-600/20 text-red-400 border border-red-800/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span>Oynatma Listelerim ({playlists.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('liked')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'liked'
                      ? 'bg-red-600/20 text-red-400 border border-red-800/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Beğendiğim Videolar ({likedVideos.length})</span>
                </button>
              </>
            )}
          </div>

          {/* Tab 1: 4K Test Streams & Search */}
          {activeTab === 'streams' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="TV'de oynatmak için YouTube videoları arayın..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-red-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Ara
                </button>
              </form>

              {/* Video Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {searchResults.map((video) => (
                  <div
                    key={video.id}
                    className="group flex flex-col justify-between p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-slate-700 transition"
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        {video.duration && (
                          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-medium text-white">
                            {video.duration}
                          </span>
                        )}
                        {video.isCurated && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600/90 text-[10px] font-bold text-white uppercase tracking-wider">
                            4K HDR
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 group-hover:text-red-400 transition">
                          {video.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                          {video.description || video.channelTitle}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-900 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {video.channelTitle}
                      </span>
                      <button
                        onClick={() => handleLaunchYouTubeApp(video.id)}
                        className="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-medium flex items-center space-x-1 transition cursor-pointer"
                      >
                        <Cast className="w-3 h-3" />
                        <span>TV'de Oynat</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: User Playlists */}
          {activeTab === 'playlists' && (
            <div className="space-y-3">
              {playlists.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Bağlı YouTube hesabınızda oynatma listesi bulunamadı.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between space-x-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={pl.thumbnailUrl}
                          alt={pl.title}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-900 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-200 truncate">
                            {pl.title}
                          </h4>
                          <span className="text-[11px] text-slate-500">
                            {pl.itemCount} video
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleLaunchYouTubeApp()}
                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center space-x-1 transition shrink-0 cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        <span>Aç</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Liked Videos */}
          {activeTab === 'liked' && (
            <div className="space-y-3">
              {likedVideos.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Beğenilen video bulunamadı veya YouTube izinlerinin yenilenmesi gerekiyor.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {likedVideos.map((video) => (
                    <div
                      key={video.id}
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between space-x-3 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-14 h-9 rounded object-cover bg-slate-900 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-200 truncate">
                            {video.title}
                          </h4>
                          <span className="text-[11px] text-slate-500 truncate block">
                            {video.channelTitle}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleLaunchYouTubeApp(video.id)}
                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center space-x-1 transition shrink-0 cursor-pointer"
                      >
                        <Cast className="w-3 h-3" />
                        <span>Oynat</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
          <span>YouTube Uygulama ID: 111299001912 (Tizen 5.5+)</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
          >
            Kumandaya Dön
          </button>
        </div>
      </div>
    </div>
  );
};
