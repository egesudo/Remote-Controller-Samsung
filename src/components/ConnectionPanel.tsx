import React, { useState } from 'react';
import {
  Link2,
  Unlink,
  KeyRound,
  Trash2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { ConnectionState, TVDeviceInfo } from '../types/tv.types.ts';

interface ConnectionPanelProps {
  ip: string;
  onIpChange: (newIp: string) => void;
  port: number;
  onPortChange: (newPort: number) => void;
  connectionState: ConnectionState;
  tokenMasked: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearToken: () => void;
  onProbeInfo: () => Promise<TVDeviceInfo | null>;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  ip,
  onIpChange,
  port,
  onPortChange,
  connectionState,
  tokenMasked,
  onConnect,
  onDisconnect,
  onClearToken,
  onProbeInfo,
}) => {
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<TVDeviceInfo | null>(null);

  const isConnected = connectionState === 'CONNECTED';
  const isBusy = connectionState === 'CONNECTING' || connectionState === 'RECONNECTING';
  const isPairing = connectionState === 'PAIRING';

  const handleProbe = async () => {
    setProbing(true);
    try {
      const info = await onProbeInfo();
      setProbeResult(info);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div id="connection-management-panel" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600" />
            TV Bağlantısı & Kimlik Doğrulama
          </h2>
          <p className="text-xs text-slate-500">
            Tizen 5.5+ için belirteç (token) tabanlı eşleştirmeli güvenli WebSocket iletişimi
          </p>
        </div>

        {/* Token status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500">Belirteç (Token):</span>
            {tokenMasked ? (
              <span className="font-mono font-medium text-emerald-600 flex items-center gap-1">
                {tokenMasked}
                <span title="Belirteç güvenli bir şekilde saklanmaktadır" className="text-[10px] text-emerald-500">
                  (Korumalı)
                </span>
              </span>
            ) : (
              <span className="text-amber-600 font-medium">Yok (Eşleştirme gerekli)</span>
            )}
          </div>
          {tokenMasked && (
            <button
              id="btn-clear-token"
              onClick={onClearToken}
              title="Kayıtlı belirteci sil ve TV ile yeniden eşleşmeyi zorla"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Pairing Alert Banner */}
      {isPairing && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold">TV Ekranında İşlem Gerekiyor</p>
            <p className="mt-0.5">
              Samsung TV ekranında bir bağlantı onay penceresi belirdi.
              Eşleştirmeyi tamamlamak için kumandanızla <strong>"İzin Ver" (Allow)</strong> seçeneğini onaylayın.
            </p>
          </div>
        </div>
      )}

      {/* Error / SSL Guidance Banner */}
      {connectionState === 'ERROR' && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 flex-1">
            <p className="font-semibold text-rose-800">Bağlantı Kurulamadı (SSL veya Ağ Kısıtlaması)</p>
            <p className="mt-0.5 text-rose-700 leading-relaxed">
              Tarayıcınız, Samsung TV'nin (<strong>{ip.trim()}:8002</strong>) kendinden imzalı yerel SSL sertifikasını engelliyor olabilir veya TV açık/aynı ağda olmayabilir.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                id="btn-panel-open-ssl"
                href={`https://${ip.trim()}:8002/api/v2/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg text-xs transition-colors"
              >
                <span>TV SSL Sertifikasını Aç &amp; Onayla</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-[11px] text-rose-600">
                (Açılan sekmede: <strong>Gelişmiş &gt; İlerle (güvensiz)</strong> seçeneğine tıklayın)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* IP & Port Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div className="sm:col-span-6">
          <label htmlFor="input-tv-ip" className="block text-xs font-medium text-slate-700 mb-1">
            TV Yerel Ağ IP Adresi (LAN IP)
          </label>
          <input
            id="input-tv-ip"
            type="text"
            value={ip}
            onChange={(e) => onIpChange(e.target.value)}
            placeholder="ör. 192.168.1.103"
            disabled={isConnected || isBusy}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white disabled:opacity-60 transition-all"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="select-tv-port" className="block text-xs font-medium text-slate-700 mb-1">
            Port
          </label>
          <select
            id="select-tv-port"
            value={port}
            onChange={(e) => onPortChange(Number(e.target.value))}
            disabled={isConnected || isBusy}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          >
            <option value={8002}>8002 (WSS - Doğrulanmış)</option>
            <option value={8001}>8001 (WS - Eski Modeller)</option>
          </select>
          {port === 8002 && ip.trim() && (
            <a
              href={`https://${ip.trim()}:8002/api/v2/`}
              target="_blank"
              rel="noopener noreferrer"
              title="Tarayıcınızda TV'nin kendinden imzalı SSL sertifikasını onaylamak için tıklayın"
              className="mt-1 text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
            >
              <span>SSL Onayla</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        <div className="sm:col-span-4 flex items-end gap-2 pt-1 sm:pt-5">
          {isConnected ? (
            <button
              id="btn-disconnect-tv"
              onClick={onDisconnect}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-medium rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Unlink className="w-4 h-4" />
              Bağlantıyı Kes
            </button>
          ) : (
            <button
              id="btn-connect-tv"
              onClick={onConnect}
              disabled={isBusy || !ip.trim()}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-300 text-white text-sm font-medium rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {isBusy ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Bağlanılıyor...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  TV'ye Bağlan
                </>
              )}
            </button>
          )}

          <button
            id="btn-probe-tv"
            onClick={handleProbe}
            disabled={probing || !ip.trim()}
            title="HTTP GET /api/v2/ üzerinden TV tanı bilgilerini sorgula"
            className="min-h-[44px] px-3 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 text-slate-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Search className={`w-4 h-4 ${probing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">TV Tanı Sına</span>
          </button>
        </div>
      </div>

      {/* Diagnostic Probe Results */}
      {probeResult && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <div className="flex items-center justify-between font-semibold text-slate-800">
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tanı Yanıtı:
            </span>
            <span className="font-mono text-slate-600">{probeResult.modelName || 'Samsung TV'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-600">
            <div>Cihaz: <strong className="text-slate-800">{probeResult.name || 'Akıllı TV'}</strong></div>
            <div>Güç Durumu: <strong className="text-slate-800">{probeResult.powerState || 'AÇIK'}</strong></div>
            <div>Belirteç Doğrulama: <strong className="text-slate-800">{probeResult.tokenAuthSupport ? 'Destekleniyor' : 'Hayır'}</strong></div>
            <div>Ağ Türü: <strong className="text-slate-800">{probeResult.networkType || 'LAN'}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
};
