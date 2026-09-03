import React, { useState } from 'react';
import { Layers, Play, CheckCircle, Clock, Youtube } from 'lucide-react';
import { KNOWN_TV_APPS } from '../engine/modularAppLauncher.ts';

interface ModularCapabilitiesCardProps {
  isConnected: boolean;
  onLaunchYouTubeProbe: () => Promise<boolean>;
  onOpenYouTubeHub?: () => void;
}

export const ModularCapabilitiesCard: React.FC<ModularCapabilitiesCardProps> = ({
  isConnected,
  onLaunchYouTubeProbe,
  onOpenYouTubeHub,
}) => {
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchResult(null);
    try {
      const res = await onLaunchYouTubeProbe();
      setLaunchResult(
        res
          ? 'Application launch request sent via IAppLauncher.'
          : 'App launch dispatched. (Note: In browser preview, verify TV is on and on the same subnet).'
      );
    } finally {
      setLaunching(false);
    }
  };

  const modules = [
    {
      name: 'Samsung TV Core Controller',
      phase: 'Phase 4 (Active)',
      status: 'IMPLEMENTED',
      details: 'WSS 8002, token auth, whitelist validation, auto-reconnect',
      color: 'emerald',
    },
    {
      name: 'YouTube Control Module (IAppLauncher)',
      phase: 'Phase 5 (Active)',
      status: 'IMPLEMENTED',
      details: `Target App ID: ${KNOWN_TV_APPS.YOUTUBE.id} (Tizen YouTube Application, Deep Link v=ID)`,
      color: 'emerald',
    },
    {
      name: 'Google / OAuth Account Service',
      phase: 'Phase 5 (Active)',
      status: 'READY',
      details: 'Popup OAuth flow, server proxy for YouTube Data API v3, no token leak to browser',
      color: 'emerald',
    },
    {
      name: 'AI & Voice Intent Pipeline',
      phase: 'Future Phase',
      status: 'DECOUPLED',
      details: 'Speech-to-Text → Intent → Whitelist Validator → TV Controller',
      color: 'slate',
    },
  ];

  return (
    <div id="modular-capabilities-card" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Modular Controller Architecture
          </h3>
          <p className="text-xs text-slate-500">
            Strict separation of concerns. Secondary modules connect without restructuring core TV socket layer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {modules.map((m) => (
          <div key={m.name} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">{m.name}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                  m.color === 'emerald'
                    ? 'bg-emerald-100 text-emerald-800'
                    : m.color === 'blue'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {m.status}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{m.details}</p>
            <p className="text-[10px] font-mono text-indigo-600 mt-1 flex items-center gap-1">
              {m.color === 'emerald' ? (
                <CheckCircle className="w-3 h-3 text-emerald-600" />
              ) : (
                <Clock className="w-3 h-3 text-slate-400" />
              )}
              {m.phase}
            </p>
          </div>
        ))}
      </div>

      {/* YouTube Capability Actions */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">YouTube Capability:</span> Target App ID{' '}
          <code className="bg-slate-100 px-1 py-0.5 rounded text-red-700 font-mono">
            {KNOWN_TV_APPS.YOUTUBE.id}
          </code>
        </div>
        <div className="flex items-center gap-2">
          {onOpenYouTubeHub && (
            <button
              id="btn-open-youtube-hub-card"
              onClick={onOpenYouTubeHub}
              className="min-h-[36px] px-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>Open YouTube TV Hub</span>
            </button>
          )}
          <button
            id="btn-launch-youtube-probe"
            onClick={handleLaunch}
            disabled={launching}
            className="min-h-[36px] px-3.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-indigo-600" />
            <span>Probe App Launch</span>
          </button>
        </div>
      </div>

      {launchResult && (
        <div className="mt-2 text-xs text-indigo-800 bg-indigo-50 p-2 rounded-lg border border-indigo-100 font-mono">
          {launchResult}
        </div>
      )}
    </div>
  );
};

