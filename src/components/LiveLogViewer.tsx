import React, { useState } from 'react';
import { Terminal, Trash2, ShieldCheck, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { TVLogEntry } from '../types/tv.types.ts';

interface LiveLogViewerProps {
  logs: TVLogEntry[];
  onClearLogs: () => void;
}

export const LiveLogViewer: React.FC<LiveLogViewerProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'all' | 'error' | 'security'>('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'error') return log.level === 'error' || log.level === 'warn';
    if (filter === 'security') return log.message.includes('BLOCKED') || log.message.includes('Security');
    return true;
  });

  const getLogIcon = (level: TVLogEntry['level'], msg: string) => {
    if (msg.includes('BLOCKED') || msg.includes('Security')) {
      return <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    switch (level) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'warn':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
    }
  };

  const getLogColor = (level: TVLogEntry['level'], msg: string) => {
    if (msg.includes('BLOCKED') || msg.includes('Security')) {
      return 'text-amber-300';
    }
    switch (level) {
      case 'success':
        return 'text-emerald-300';
      case 'error':
        return 'text-rose-300 font-semibold';
      case 'warn':
        return 'text-amber-200';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div id="live-log-viewer" className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-lg text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Engine Event & Telemetry Stream
          </h3>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            {logs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex bg-slate-800 p-0.5 rounded-lg text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                filter === 'error' ? 'bg-rose-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Warnings/Errors
            </button>
            <button
              onClick={() => setFilter('security')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                filter === 'security' ? 'bg-amber-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Security Blocks
            </button>
          </div>

          <button
            id="btn-clear-logs"
            onClick={onClearLogs}
            title="Clear logs"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="h-48 overflow-y-auto font-mono text-[11px] space-y-1 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic text-xs">
            No events logged yet. Connect to TV or dispatch a command to view real-time frames.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-tight py-0.5 hover:bg-slate-800/50 px-1.5 rounded">
              <span className="text-slate-500 shrink-0 text-[10px] select-none pt-0.5">{log.timestamp}</span>
              <span className="pt-0.5">{getLogIcon(log.level, log.message)}</span>
              <span className={`break-all ${getLogColor(log.level, log.message)}`}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
