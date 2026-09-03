import React, { useState, useEffect } from 'react';
import {
  X,
  Wifi,
  Shield,
  RefreshCw,
  Key,
  Info,
  CheckCircle2,
  AlertCircle,
  Tv,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  Radio,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  ConnectionState,
  TVDeviceInfo,
  ManagedTVDevice,
  DiscoveredTVDevice,
  DiscoveryState,
  DiscoveryProgress,
} from '../types/tv.types.ts';
import { tvDeviceManager } from '../engine/tvDeviceManager.ts';
import { tvDiscoveryEngine } from '../engine/tvDiscoveryEngine.ts';

interface MobileSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ip: string;
  onIpChange: (ip: string) => void;
  port: number;
  onPortChange: (port: number) => void;
  connectionState: ConnectionState;
  tokenMasked: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  onClearToken: () => void;
  onProbeInfo: () => Promise<TVDeviceInfo | null>;
  activeTv: ManagedTVDevice | null;
  onSelectTv: (device: ManagedTVDevice) => Promise<void>;
}

export const MobileSettingsDrawer: React.FC<MobileSettingsDrawerProps> = ({
  isOpen,
  onClose,
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
  activeTv,
  onSelectTv,
}) => {
  const [activeTab, setActiveTab] = useState<'current' | 'devices' | 'discover'>('devices');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<TVDeviceInfo | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // TV Management state
  const [devices, setDevices] = useState<ManagedTVDevice[]>(() => tvDeviceManager.getDevices());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Discovery state
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('IDLE');
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [discoveredTvs, setDiscoveredTvs] = useState<DiscoveredTVDevice[]>([]);
  const [subnet, setSubnet] = useState<string>('192.168.1');

  // Manual add inside mobile drawer
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    const unsub = tvDeviceManager.subscribe((allDevices) => {
      setDevices(allDevices);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = tvDiscoveryEngine.subscribe({
      onStateChange: (s) => setDiscoveryState(s),
      onProgress: (p) => setProgress(p),
      onDeviceFound: (d) => {
        setDiscoveredTvs((prev) => (prev.some((x) => x.ip === d.ip) ? prev : [...prev, d]));
      },
      onComplete: (list) => setDiscoveredTvs(list),
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleProbe = async () => {
    setProbing(true);
    setProbeError(null);
    setProbeResult(null);
    try {
      const res = await onProbeInfo();
      if (res) {
        setProbeResult(res);
      } else {
        setProbeError('No response from TV diagnostic endpoint (/api/v2/). Ensure TV is powered ON on local network.');
      }
    } catch (e) {
      setProbeError('Probe failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProbing(false);
    }
  };

  const handleStartScan = async () => {
    setDiscoveredTvs([]);
    await tvDiscoveryEngine.startScan({
      subnetPrefix: subnet,
      startHost: 50,
      endHost: 120,
      concurrency: 10,
    });
  };

  const handleAddDiscovered = async (tv: DiscoveredTVDevice) => {
    const added = tvDeviceManager.addDevice({
      ip: tv.ip,
      port: tv.port,
      name: tv.name,
      customName: tv.name,
      modelName: tv.modelName,
    });
    await onSelectTv(added);
    setActiveTab('devices');
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      tvDeviceManager.renameDevice(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleSaveManual = async () => {
    if (!manualIp.trim()) return;
    const added = tvDeviceManager.addDevice({
      ip: manualIp.trim(),
      name: manualName.trim() || `Samsung TV (${manualIp.trim()})`,
      customName: manualName.trim() || `Samsung TV (${manualIp.trim()})`,
    });
    setManualIp('');
    setManualName('');
    setIsAddingManual(false);
    await onSelectTv(added);
  };

  const isConnected = connectionState === 'CONNECTED';
  const isConnecting = connectionState === 'CONNECTING' || connectionState === 'PAIRING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto flex flex-col justify-between">
        
        <div>
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">TV Management & Setup</h3>
            </div>
            <button
              id="btn-close-settings"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 p-1 bg-slate-950 rounded-xl my-3 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('devices')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'devices'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>My TVs ({devices.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'discover'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Discover</span>
            </button>
            <button
              onClick={() => setActiveTab('current')}
              className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'current'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Direct IP</span>
            </button>
          </div>

          {/* TAB 1: SAVED TV DEVICES */}
          {activeTab === 'devices' && (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Select active TV to control:</span>
                <button
                  onClick={() => setIsAddingManual(!isAddingManual)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add IP</span>
                </button>
              </div>

              {isAddingManual && (
                <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-2 text-xs">
                  <span className="font-bold text-white text-xs">Add New TV:</span>
                  <input
                    type="text"
                    placeholder="TV IP (e.g. 192.168.1.65)"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Friendly Name (e.g. Bedroom TV)"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setIsAddingManual(false)}
                      className="px-2.5 py-1 text-slate-400 hover:text-white text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveManual}
                      disabled={!manualIp.trim()}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                    >
                      Save & Switch
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {devices.map((device) => {
                  const isActive = activeTv?.id === device.id;
                  const isRenaming = editingId === device.id;

                  return (
                    <div
                      key={device.id}
                      className={`p-3 rounded-2xl border transition-all ${
                        isActive
                          ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30'
                          : 'bg-slate-800/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-2">
                          {isRenaming ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="w-full px-2 py-0.5 bg-slate-900 border border-indigo-500 rounded text-xs text-white"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(device.id)}
                                className="p-1 text-emerald-400 hover:text-emerald-300"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">
                                {device.customName || device.name}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingId(device.id);
                                  setEditingName(device.customName || device.name);
                                }}
                                className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {device.ip}:{device.port} • {device.modelName || 'TU8500'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1">
                              <Radio className="w-2.5 h-2.5 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <button
                              onClick={async () => {
                                await onSelectTv(device);
                              }}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition-colors cursor-pointer"
                            >
                              Switch
                            </button>
                          )}

                          {devices.length > 1 && (
                            <button
                              onClick={() => tvDeviceManager.removeDevice(device.id)}
                              className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                              title="Delete device"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
                        <span className="flex items-center gap-1">
                          <Key className="w-3 h-3 text-indigo-400" />
                          {device.token ? 'Token Paired' : 'Not Paired'}
                        </span>
                        <span className="text-slate-500">
                          {device.onlineStatus ? `Status: ${device.onlineStatus}` : 'TU8500 WSS'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: LOCAL NETWORK DISCOVERY */}
          {activeTab === 'discover' && (
            <div className="space-y-3 py-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">LAN Scanner:</span>
                <span className="text-[10px] text-slate-400 font-mono">Port 8001 /api/v2/</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={subnet}
                  onChange={(e) => setSubnet(e.target.value)}
                  placeholder="Subnet (192.168.1)"
                  disabled={discoveryState === 'SCANNING'}
                  className="flex-1 px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                {discoveryState === 'SCANNING' ? (
                  <button
                    onClick={() => tvDiscoveryEngine.cancelScan()}
                    className="px-3 py-2 bg-rose-600/30 text-rose-300 border border-rose-500/50 rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={handleStartScan}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Scan</span>
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {discoveryState === 'SCANNING' && progress && (
                <div className="p-3 bg-slate-800/50 border border-slate-800 rounded-2xl space-y-1.5 animate-fade-in">
                  <div className="flex justify-between text-[11px] text-indigo-300">
                    <span>Scanning: {progress.currentIp}</span>
                    <span>{progress.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${progress.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Found {progress.foundCount} Samsung TV(s)
                  </p>
                </div>
              )}

              {/* Discovered TV List */}
              <div className="space-y-2">
                {discoveredTvs.map((tv) => (
                  <div
                    key={tv.ip}
                    className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-2xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Tv className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-bold text-white text-xs">{tv.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {tv.ip} • {tv.modelName}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAddDiscovered(tv)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Connect
                    </button>
                  </div>
                ))}

                {discoveryState === 'COMPLETED' && discoveredTvs.length === 0 && (
                  <div className="p-3 bg-slate-800/40 rounded-xl text-center text-slate-400 text-xs">
                    No TVs detected in this range. Verify TV is turned ON.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIRECT IP & PORT */}
          {activeTab === 'current' && (
            <div className="py-2 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Active TV IP Address
                </label>
                <input
                  id="input-mobile-tv-ip"
                  type="text"
                  value={ip}
                  onChange={(e) => onIpChange(e.target.value)}
                  placeholder="e.g. 192.168.1.50"
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Port (Protocol)
                  </label>
                  <select
                    id="select-mobile-tv-port"
                    value={port}
                    onChange={(e) => onPortChange(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={8002}>8002 (WSS Secure)</option>
                    <option value={8001}>8001 (WS Insecure)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target Model
                  </label>
                  <div className="px-3 py-2 bg-slate-800/50 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono truncate">
                    {activeTv?.modelName || 'TU8500'}
                  </div>
                </div>
              </div>

              {/* Status and Token */}
              <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Current Status:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                      isConnected
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isConnecting
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {connectionState}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Key className="w-3 h-3 text-indigo-400" />
                    Auth Token:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-300">
                      {tokenMasked || 'None (Requires Pair)'}
                    </span>
                    {tokenMasked && (
                      <button
                        id="btn-clear-mobile-token"
                        onClick={onClearToken}
                        className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* SSL Certificate & Port 8002 Helper */}
                {port === 8002 && ip.trim() && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">TV SSL Certificate:</span>
                      <a
                        href={`https://${ip.trim()}:8002/api/v2/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                      >
                        <span>Accept SSL (1-Click)</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    {connectionState === 'ERROR' && (
                      <p className="text-[10px] text-rose-300 mt-1 bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
                        Tarayıcınız TV'nin SSL sertifikasını engelliyor olabilir. "Accept SSL" linkine tıklayıp "Gelişmiş" $\rightarrow$ "İlerle (güvensiz)" diyerek sertifikayı kabul edin, ardından tekrar bağlanın.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {!isConnected ? (
                  <button
                    id="btn-mobile-connect"
                    onClick={async () => {
                      await onConnect();
                      if (connectionState === 'CONNECTED') onClose();
                    }}
                    disabled={isConnecting || !ip.trim()}
                    className="flex-1 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    <span>{tokenMasked ? 'Connect to TV' : 'Pair with TV'}</span>
                  </button>
                ) : (
                  <button
                    id="btn-mobile-disconnect"
                    onClick={onDisconnect}
                    className="flex-1 min-h-[44px] bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Disconnect</span>
                  </button>
                )}

                <button
                  id="btn-mobile-probe"
                  onClick={handleProbe}
                  disabled={probing || !ip.trim()}
                  title="Probe TV diagnostic endpoint /api/v2/"
                  className="px-4 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {probing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Info className="w-3.5 h-3.5" />
                  )}
                  <span>Probe</span>
                </button>
              </div>

              {probeResult && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-300 space-y-1">
                  <div className="flex items-center gap-1 font-bold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>TV Responded:</span>
                  </div>
                  <p>Name: {probeResult.name}</p>
                  <p>Model: {probeResult.modelName || 'UE55TU8500'}</p>
                  <p>Power State: {probeResult.powerState || 'ON'}</p>
                </div>
              )}

              {probeError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{probeError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="pt-3 border-t border-slate-800 flex items-center gap-2 text-[11px] text-slate-400">
          <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Strict Command Whitelist active. Serial numbers & raw credentials protected.</span>
        </div>

      </div>
    </div>
  );
};
