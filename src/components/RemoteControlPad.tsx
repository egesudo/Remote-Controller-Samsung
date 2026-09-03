import React, { useState } from 'react';
import {
  Power,
  Volume2,
  VolumeX,
  Volume1,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  Play,
  Pause,
  Square,
  Radio,
  Tv,
} from 'lucide-react';
import { ValidRemoteKey } from '../types/tv.types.ts';

interface RemoteControlPadProps {
  isConnected: boolean;
  onSendKey: (key: ValidRemoteKey) => Promise<boolean>;
}

export const RemoteControlPad: React.FC<RemoteControlPadProps> = ({
  isConnected,
  onSendKey,
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const handlePress = async (key: ValidRemoteKey) => {
    if (!isConnected) return;
    setActiveKey(key);
    try {
      await onSendKey(key);
    } finally {
      setTimeout(() => setActiveKey(null), 180);
    }
  };

  const btnClass = (key: ValidRemoteKey, extra = '') => {
    const isActive = activeKey === key;
    return `min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl font-medium text-xs transition-all select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      isActive
        ? 'bg-indigo-600 text-white scale-95 shadow-inner'
        : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 shadow-2xs'
    } ${extra}`;
  };

  return (
    <div id="remote-control-pad" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-indigo-600" />
            Uzaktan Kumanda Tuş Takımı
          </h2>
          <p className="text-xs text-slate-500">
            Doğrulanmış komutlar doğrudan Güvenli WebSocket (WSS 8002) üzerinden iletilir
          </p>
        </div>

        {/* Power Key */}
        <button
          id="btn-key-power"
          onClick={() => handlePress('KEY_POWER')}
          disabled={!isConnected}
          title="Güç Tuşu (KEY_POWER)"
          className={`min-h-[44px] px-4 flex items-center gap-2 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            activeKey === 'KEY_POWER'
              ? 'bg-rose-700 text-white scale-95'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 active:bg-rose-200 border border-rose-200'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>Aç / Kapat</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Navigation / D-Pad Section */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <span className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wider">
            Yön Tuşları (D-Pad)
          </span>

          <div className="relative w-52 h-52 flex items-center justify-center">
            {/* Outer Circular Ring Background */}
            <div className="absolute inset-0 rounded-full border-2 border-slate-200 bg-white shadow-2xs"></div>

            {/* D-Pad Up */}
            <button
              id="btn-key-up"
              onClick={() => handlePress('KEY_UP')}
              disabled={!isConnected}
              aria-label="Yukarı"
              title="KEY_UP"
              className="absolute top-2 w-14 h-12 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:bg-slate-200 rounded-t-2xl transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ChevronUp className="w-6 h-6" />
            </button>

            {/* D-Pad Down */}
            <button
              id="btn-key-down"
              onClick={() => handlePress('KEY_DOWN')}
              disabled={!isConnected}
              aria-label="Aşağı"
              title="KEY_DOWN"
              className="absolute bottom-2 w-14 h-12 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:bg-slate-200 rounded-b-2xl transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            {/* D-Pad Left */}
            <button
              id="btn-key-left"
              onClick={() => handlePress('KEY_LEFT')}
              disabled={!isConnected}
              aria-label="Sol"
              title="KEY_LEFT"
              className="absolute left-2 w-12 h-14 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:bg-slate-200 rounded-l-2xl transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* D-Pad Right */}
            <button
              id="btn-key-right"
              onClick={() => handlePress('KEY_RIGHT')}
              disabled={!isConnected}
              aria-label="Sağ"
              title="KEY_RIGHT"
              className="absolute right-2 w-12 h-14 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:bg-slate-200 rounded-r-2xl transition-colors disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* Center Enter / OK */}
            <button
              id="btn-key-enter"
              onClick={() => handlePress('KEY_ENTER')}
              disabled={!isConnected}
              title="Tamam / Seç (KEY_ENTER)"
              className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xs shadow-xs transition-all z-10 cursor-pointer disabled:opacity-40 ${
                activeKey === 'KEY_ENTER'
                  ? 'bg-indigo-700 text-white scale-95'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'
              }`}
            >
              TAMAM
            </button>
          </div>

          {/* Home and Return Buttons */}
          <div className="flex items-center gap-4 mt-4 w-full max-w-xs justify-center">
            <button
              id="btn-key-return"
              onClick={() => handlePress('KEY_RETURN')}
              disabled={!isConnected}
              title="Geri (KEY_RETURN)"
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Geri</span>
            </button>

            <button
              id="btn-key-home"
              onClick={() => handlePress('KEY_HOME')}
              disabled={!isConnected}
              title="Ana Menü / Smart Hub (KEY_HOME)"
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>Ana Menü</span>
            </button>
          </div>
        </div>

        {/* Volume, Channel & Media Controls */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-4">
          {/* Volume & Channel Columns */}
          <div className="grid grid-cols-2 gap-3">
            {/* Volume Column */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> Ses Kontrolü
              </span>
              <div className="flex flex-col gap-2 w-full max-w-[120px]">
                <button
                  id="btn-key-volup"
                  onClick={() => handlePress('KEY_VOLUP')}
                  disabled={!isConnected}
                  title="Sesi Arttır"
                  className={btnClass('KEY_VOLUP', 'py-3 font-bold text-sm')}
                >
                  SES +
                </button>
                <button
                  id="btn-key-mute"
                  onClick={() => handlePress('KEY_MUTE')}
                  disabled={!isConnected}
                  title="Sesi Kapat / Aç"
                  className={btnClass('KEY_MUTE', 'py-2.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100')}
                >
                  <VolumeX className="w-4 h-4 mr-1 inline" />
                  Sessiz
                </button>
                <button
                  id="btn-key-voldown"
                  onClick={() => handlePress('KEY_VOLDOWN')}
                  disabled={!isConnected}
                  title="Sesi Azalt"
                  className={btnClass('KEY_VOLDOWN', 'py-3 font-bold text-sm')}
                >
                  SES -
                </button>
              </div>
            </div>

            {/* Channel Column */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
                <Tv className="w-3.5 h-3.5" /> Kanal Kontrolü
              </span>
              <div className="flex flex-col gap-2 w-full max-w-[120px]">
                <button
                  id="btn-key-chup"
                  onClick={() => handlePress('KEY_CHUP')}
                  disabled={!isConnected}
                  title="Sonraki Kanal"
                  className={btnClass('KEY_CHUP', 'py-3 font-bold text-sm')}
                >
                  KANAL +
                </button>
                <div className="py-2.5 text-center text-xs text-slate-400 font-mono">
                  Kanal
                </div>
                <button
                  id="btn-key-chdown"
                  onClick={() => handlePress('KEY_CHDOWN')}
                  disabled={!isConnected}
                  title="Önceki Kanal"
                  className={btnClass('KEY_CHDOWN', 'py-3 font-bold text-sm')}
                >
                  KANAL -
                </button>
              </div>
            </div>
          </div>

          {/* Media Playback Controls */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 block text-center">
              Medya Oynatma
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                id="btn-key-play"
                onClick={() => handlePress('KEY_PLAY')}
                disabled={!isConnected}
                className={btnClass('KEY_PLAY', 'gap-1')}
              >
                <Play className="w-4 h-4" />
                <span>Oynat</span>
              </button>
              <button
                id="btn-key-pause"
                onClick={() => handlePress('KEY_PAUSE')}
                disabled={!isConnected}
                className={btnClass('KEY_PAUSE', 'gap-1')}
              >
                <Pause className="w-4 h-4" />
                <span>Duraklat</span>
              </button>
              <button
                id="btn-key-stop"
                onClick={() => handlePress('KEY_STOP')}
                disabled={!isConnected}
                className={btnClass('KEY_STOP', 'gap-1')}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Durdur</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
