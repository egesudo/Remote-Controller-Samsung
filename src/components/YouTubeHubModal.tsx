import React, { useEffect, useState } from 'react';
import {
  Cast,
  CheckCircle2,
  ExternalLink,
  FastForward,
  HelpCircle,
  ListVideo,
  LogOut,
  Play,
  PlaySquare,
  Rewind,
  Search,
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from 'lucide-react';
import {
  CURATED_YOUTUBE_STREAMS,
  tvController,
  tvDeviceManager,
  youTubeService,
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

  // Deep Link State
  const [videoInput, setVideoInput] = useState('');
  const [launchMessage, setLaunchMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
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

  // Sync active TV info
  useEffect(() => {
    const updateTvInfo = () => {
      const activeTv = tvDeviceManager.getActiveDevice();
      if (activeTv) {
        setActiveTvName(activeTv.customName || activeTv.name || 'Samsung Smart TV');
        setActiveTvIp(activeTv.ip);
      }
      setIsTvConnected(tvController.getConnectionState() === 'CONNECTED');
    };

    updateTvInfo();
    const unsubController = tvController.addListener({
      onStateChange: () => updateTvInfo(),
    });
    const unsubManager = tvDeviceManager.subscribe(() => updateTvInfo());

    return () => {
      unsubController();
      unsubManager();
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

  // Launch YouTube app on TV
  const handleLaunchYouTubeApp = async (videoId?: string) => {
    setIsLaunching(true);
    setLaunchMessage({ type: 'info', text: videoId ? `Video ${activeTvName} ekranına gönderiliyor...` : `YouTube ${activeTvName} üzerinde başlatılıyor...` });

    try {
      const payload = videoId ? `v=${videoId}` : undefined;
      const success = tvController.appLauncher.launchYouTube
        ? await tvController.appLauncher.launchYouTube(payload)
        : await tvController.appLauncher.launchApp('111299001912', payload);

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
          text: `YouTube başlatma komutu ${activeTvIp || 'TV'} adresine iletildi. Uygulama açılmazsa TV'nin açık olduğundan emin olun.`,
        });
      }
    } catch {
      setLaunchMessage({
        type: 'error',
        text: 'Uygulama başlatılamadı. Lütfen yerel ağ bağlantısını kontrol edin.',
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
            className={`px-4 py-2.5 text-xs flex items-center justify-between ${
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
            <button
              onClick={() => setLaunchMessage(null)}
              className="text-slate-400 hover:text-slate-200 ml-2 text-xs cursor-pointer"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
