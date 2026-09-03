import React, { useState, useEffect } from 'react';
import {
  Tv,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  Wifi,
  ShieldCheck,
  KeyRound,
  Radio,
  ExternalLink,
  ChevronRight,
  Terminal,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  ManagedTVDevice,
  DiscoveredTVDevice,
  DiscoveryState,
  DiscoveryProgress,
  ConnectionState,
} from '../types/tv.types.ts';
import { tvDeviceManager } from '../engine/tvDeviceManager.ts';
import { tvDiscoveryEngine } from '../engine/tvDiscoveryEngine.ts';

interface TVDiscoveryAndManagerProps {
  currentConnectionState: ConnectionState;
  onSelectAndConnectTV: (device: ManagedTVDevice) => Promise<void>;
  onDisconnectTV: () => void;
}

export const TVDiscoveryAndManager: React.FC<TVDiscoveryAndManagerProps> = ({
  currentConnectionState,
  onSelectAndConnectTV,
  onDisconnectTV,
}) => {
  // Device Manager state
  const [devices, setDevices] = useState<ManagedTVDevice[]>(() => tvDeviceManager.getDevices());
  const [activeDevice, setActiveDevice] = useState<ManagedTVDevice | null>(() => tvDeviceManager.getActiveDevice());
  
  // Renaming state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>('');

  // Discovery engine state
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('IDLE');
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredTVDevice[]>([]);
  const [subnetPrefix, setSubnetPrefix] = useState<string>('192.168.1');
  const [scanRange, setScanRange] = useState<'quick' | 'full'>('quick');
  const [isManualAddOpen, setIsManualAddOpen] = useState<boolean>(false);
  const [pingingDeviceId, setPingingDeviceId] = useState<string | null>(null);

  // Manual Add state
  const [manualIp, setManualIp] = useState<string>('');
  const [manualName, setManualName] = useState<string>('');
  const [manualModel, setManualModel] = useState<string>('UE55TU8500UXTK');

  // Subscribe to Device Manager
  useEffect(() => {
    const unsub = tvDeviceManager.subscribe((allDevices, active) => {
      setDevices(allDevices);
      setActiveDevice(active);
    });
    return () => unsub();
  }, []);

  // Subscribe to Discovery Engine
  useEffect(() => {
    const unsub = tvDiscoveryEngine.subscribe({
      onStateChange: (st) => setDiscoveryState(st),
      onProgress: (p) => setProgress(p),
      onDeviceFound: (dev) => {
        setDiscoveredList((prev) => (prev.some((d) => d.ip === dev.ip) ? prev : [...prev, dev]));
      },
      onComplete: (found) => {
        setDiscoveredList(found);
      },
    });
    return () => unsub();
  }, []);

  // Start Discovery Scan
  const handleStartScan = async () => {
    setDiscoveredList([]);
    const startHost = scanRange === 'quick' ? 50 : 1;
    const endHost = scanRange === 'quick' ? 120 : 254;

    await tvDiscoveryEngine.startScan({
      subnetPrefix,
      startHost,
      endHost,
      concurrency: 12,
      timeoutMs: 1200,
    });
  };

  const handleCancelScan = () => {
    tvDiscoveryEngine.cancelScan();
  };

  // Add Discovered TV
  const handleAddDiscoveredTV = (tv: DiscoveredTVDevice, autoConnect = false) => {
    const added = tvDeviceManager.addDevice({
      ip: tv.ip,
      port: tv.port,
      name: tv.name,
      customName: tv.name,
      modelName: tv.modelName,
    });

    if (autoConnect) {
      tvDeviceManager.setActiveDevice(added.id);
      onSelectAndConnectTV(added);
    }
  };

  // Ping TV status
  const handlePingTV = async (deviceId: string) => {
    setPingingDeviceId(deviceId);
    try {
      await tvDeviceManager.pingDevice(deviceId);
    } finally {
      setPingingDeviceId(null);
    }
  };

  // Switch Active TV
  const handleSwitchTV = async (device: ManagedTVDevice) => {
    tvDeviceManager.setActiveDevice(device.id);
    await onSelectAndConnectTV(device);
  };

  // Inline Rename
  const handleStartRename = (device: ManagedTVDevice) => {
    setEditingDeviceId(device.id);
    setEditNameValue(device.customName || device.name);
  };

  const handleSaveRename = (deviceId: string) => {
    if (editNameValue.trim()) {
      tvDeviceManager.renameDevice(deviceId, editNameValue.trim());
    }
    setEditingDeviceId(null);
  };

  // Manual Add Form Submit
  const handleSaveManual = () => {
    if (!manualIp.trim()) return;
    const added = tvDeviceManager.addDevice({
      ip: manualIp.trim(),
      name: manualName.trim() || `Samsung TV (${manualIp.trim()})`,
      customName: manualName.trim() || `Samsung TV (${manualIp.trim()})`,
      modelName: manualModel.trim() || 'Samsung Smart TV',
    });
    setManualIp('');
    setManualName('');
    setIsManualAddOpen(false);
    tvDeviceManager.setActiveDevice(added.id);
  };

  const isConnected = currentConnectionState === 'CONNECTED';

  return (
    <div className="space-y-6">
      {/* SECTION 1: MANAGED TV DEVICES LIST */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Tv className="w-5 h-5 text-indigo-600" />
              Saved TV Devices ({devices.length})
            </h2>
            <p className="text-xs text-slate-500">
              Manage paired Samsung TVs, switch active target, or assign custom friendly names.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-open-manual-add"
              onClick={() => setIsManualAddOpen(!isManualAddOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add TV by IP</span>
            </button>
            <button
              id="btn-ping-all-tvs"
              onClick={() => tvDeviceManager.pingAllDevices()}
              title="Ping all devices to check online status"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check Status</span>
            </button>
          </div>
        </div>

        {/* Manual Add Form Expandable */}
        {isManualAddOpen && (
          <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-600" />
                Add Samsung TV Manually
              </h3>
              <button
                onClick={() => setIsManualAddOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  TV IP Address *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.65"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Friendly Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bedroom TV / Office Display"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Model Code
                </label>
                <input
                  type="text"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setIsManualAddOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveManual}
                disabled={!manualIp.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Save Device
              </button>
            </div>
          </div>
        )}

        {/* TV Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {devices.map((device) => {
            const isActive = activeDevice?.id === device.id;
            const isEditing = editingDeviceId === device.id;
            const isPinging = pingingDeviceId === device.id;

            return (
              <div
                key={device.id}
                className={`relative rounded-2xl border transition-all p-4 ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {/* Top Row: Active status & action badges */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white shadow-xs">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Active Target
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSwitchTV(device)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 px-2 py-0.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Set as Active
                      </button>
                    )}

                    {/* Online status indicator */}
                    <span
                      title={device.onlineStatus ? `Status: ${device.onlineStatus}` : 'Status unknown'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        device.onlineStatus === 'online'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : device.onlineStatus === 'offline'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          device.onlineStatus === 'online'
                            ? 'bg-emerald-500'
                            : device.onlineStatus === 'offline'
                            ? 'bg-rose-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      {device.onlineStatus || 'Unknown'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Ping button */}
                    <button
                      onClick={() => handlePingTV(device.id)}
                      disabled={isPinging}
                      title="Ping TV via HTTP port 8001 /api/v2/"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>

                    {/* Delete button (only if more than 1 TV) */}
                    {devices.length > 1 && (
                      <button
                        onClick={() => tvDeviceManager.removeDevice(device.id)}
                        title="Remove TV from saved devices"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* TV Info & Rename */}
                <div className="space-y-1 mb-3">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        className="flex-1 px-2.5 py-1 text-sm font-bold border border-indigo-500 rounded-lg focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRename(device.id)}
                        className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingDeviceId(null)}
                        className="p-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                        <span>{device.customName || device.name}</span>
                        <button
                          onClick={() => handleStartRename(device)}
                          title="Rename TV"
                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400">
                        {device.modelName || 'TU8500'}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                    <span>IP: {device.ip}:{device.port}</span>
                  </div>
                </div>

                {/* Token status & Connect Action */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <KeyRound className="w-3 h-3 text-slate-400" />
                    <span>Token: </span>
                    {device.token ? (
                      <span className="font-mono text-emerald-600 font-medium">Paired</span>
                    ) : (
                      <span className="text-amber-600 font-medium">Unpaired</span>
                    )}
                  </div>

                  <div>
                    {isActive && isConnected ? (
                      <button
                        onClick={onDisconnectTV}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSwitchTV(device)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs cursor-pointer"
                      >
                        {isActive ? 'Connect' : 'Switch & Connect'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: LOCAL NETWORK SCANNER (SSDP & HTTP PROBE) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-600" />
              Local Network TV Discovery
            </h2>
            <p className="text-xs text-slate-500">
              Scan your local Wi-Fi subnet for responsive Samsung Smart TVs via port 8001 /api/v2/ diagnostic endpoint.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {discoveryState === 'SCANNING' ? (
              <button
                id="btn-cancel-scan"
                onClick={handleCancelScan}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Stop Scan</span>
              </button>
            ) : (
              <button
                id="btn-start-scan"
                onClick={handleStartScan}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Scan Subnet</span>
              </button>
            )}
          </div>
        </div>

        {/* Scan Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Subnet Prefix
            </label>
            <input
              type="text"
              value={subnetPrefix}
              onChange={(e) => setSubnetPrefix(e.target.value)}
              disabled={discoveryState === 'SCANNING'}
              placeholder="192.168.1"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Scan Scope
            </label>
            <select
              value={scanRange}
              onChange={(e) => setScanRange(e.target.value as 'quick' | 'full')}
              disabled={discoveryState === 'SCANNING'}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            >
              <option value="quick">Quick Range (.50 to .120 - Recommended)</option>
              <option value="full">Full Subnet (.1 to .254 - Comprehensive)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <div className="text-[11px] text-slate-500">
              Protocol: <span className="font-mono text-slate-800">HTTP GET :8001/api/v2/</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Target: <span className="font-semibold text-slate-800">Tizen 5.5+ TU8500</span>
            </div>
          </div>
        </div>

        {/* Scan In-Progress Bar */}
        {discoveryState === 'SCANNING' && progress && (
          <div className="mb-4 p-4 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-900 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                Scanning subnet: <code className="font-mono text-indigo-700">{progress.currentIp}</code>
              </span>
              <span className="font-mono text-indigo-700 font-bold">
                {progress.scannedCount} / {progress.totalToScan} ({progress.progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-150"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-indigo-600">
              Found {progress.foundCount} Samsung Smart TV(s) so far...
            </p>
          </div>
        )}

        {/* Scan Completed summary */}
        {discoveryState === 'COMPLETED' && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
            <span>
              Scan completed. Discovered <strong>{discoveredList.length}</strong> Samsung TV(s) on your local network.
            </span>
            <span className="text-[11px] text-emerald-600 font-mono">Status: Finished</span>
          </div>
        )}

        {/* Discovered TV Results List */}
        {discoveredList.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Discovered Devices on Network
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {discoveredList.map((tv) => {
                const isAlreadySaved = devices.some((d) => d.ip === tv.ip);

                return (
                  <div
                    key={tv.ip}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Tv className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-900">{tv.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {tv.ip}:8002 • {tv.modelName}
                      </div>
                      <div className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>Latency: {tv.responseTimeMs || 25}ms</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAlreadySaved ? (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                          Saved
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddDiscoveredTV(tv, true)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                        >
                          Add & Connect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          discoveryState === 'COMPLETED' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
              No Samsung Smart TVs responded in this IP range. Ensure the TV is switched on and connected to the same Wi-Fi.
            </div>
          )
        )}
      </div>

      {/* SECTION 3: PHYSICAL DEVICE TERMINAL DISCOVERY GUIDE */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm mb-2">
          <Terminal className="w-4 h-4" />
          <span>Real Hardware Network Discovery Tool (SSDP & CLI)</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          For physical LAN integration testing, you can execute the standalone SSDP multicast broadcast tool directly on your terminal. This sends UPnP M-SEARCH packets over UDP port 1900 to discover TU8500 and other Tizen devices:
        </p>
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-400 flex items-center justify-between select-all">
          <span>npx tsx scripts/discover-tvs.ts {subnetPrefix}</span>
          <span className="text-[10px] text-slate-500 font-sans">Node.js UDP 1900 + HTTP 8001</span>
        </div>
      </div>
    </div>
  );
};
