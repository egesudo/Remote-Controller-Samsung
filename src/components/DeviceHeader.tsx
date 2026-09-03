import React from 'react';
import { Tv, ShieldCheck, Wifi } from 'lucide-react';
import { ConnectionState } from '../types/tv.types.ts';

interface DeviceHeaderProps {
  connectionState: ConnectionState;
  targetModel: string;
  firmwareVersion: string;
  ip: string;
}

export const DeviceHeader: React.FC<DeviceHeaderProps> = ({
  connectionState,
  targetModel,
  firmwareVersion,
  ip,
}) => {
  const getStatusBadge = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            BAĞLANDI
          </span>
        );
      case 'PAIRING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
            EŞLEŞİYOR (TV EKRANINA BAKIN)
          </span>
        );
      case 'CONNECTING':
      case 'RECONNECTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            {connectionState === 'CONNECTING' ? 'BAĞLANILIYOR...' : 'YENİDEN BAĞLANILIYOR...'}
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            HATA / ERİŞİLEMİYOR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <span className="h-2 w-2 rounded-full bg-slate-400"></span>
            BAĞLANTI YOK
          </span>
        );
    }
  };

  return (
    <header id="tv-device-header" className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Samsung Akıllı TV Uzaktan Kumanda
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                Faz 4: Güvenli İletişim Motoru
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-3">
              <span>Hedef Model: <strong className="text-slate-800">{targetModel}</strong></span>
              <span>•</span>
              <span>Yazılım / Sürüm: <span className="font-mono text-xs text-slate-600">{firmwareVersion}</span></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-slate-500 flex items-center justify-end gap-1">
              <Wifi className="w-3.5 h-3.5 text-slate-400" />
              Hedef TV IP: {ip || 'Belirtilmedi'}
            </p>
            <p className="text-xs text-slate-400 font-mono">Port 8002 (Güvenli WSS)</p>
          </div>
          {getStatusBadge()}
        </div>
      </div>
    </header>
  );
};
