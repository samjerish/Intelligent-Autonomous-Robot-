import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';

// import { StrategyComparison } from './components/StrategyComparison';
import { SimulationView } from './components/SimulationView';

import { useLocalStorage } from './hooks/useLocalStorage';
import type { MissionHistoryItem, MissionResult } from './types';
import { QrCode, History, Check, Copy, ExternalLink, Wifi, Smartphone, Sliders, Globe, RefreshCw, AlertTriangle } from 'lucide-react';
import QRCode from 'react-qr-code';
import { io } from 'socket.io-client';

export const AnimatedPASName = () => {
  return (
    <span className="group inline-flex items-center cursor-default">
      <span className="flex items-center overflow-hidden">
        P<span className="inline-block max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-500 ease-in-out font-mono tracking-normal text-cyan-300">RESTEN</span>
      </span>
      <span className="flex items-center overflow-hidden">
        <span className="ml-[2px] group-hover:ml-1 transition-all duration-500">A</span><span className="inline-block max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-500 ease-in-out font-mono tracking-normal text-cyan-300">JIN</span>
      </span>
      <span className="flex items-center overflow-hidden">
        <span className="ml-[2px] group-hover:ml-1 transition-all duration-500">S</span><span className="inline-block max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-500 ease-in-out font-mono tracking-normal text-cyan-300">AM</span>
      </span>
    </span>
  );
};

function App() {
  const [history, setHistory] = useLocalStorage<MissionHistoryItem[]>('robot-mission-history', []);
  const [currentMission, setCurrentMission] = useState<MissionHistoryItem | null>(null);

  const [initialMapData, setInitialMapData] = useState<any>(null);

  const [pendingEmergency, setPendingEmergency] = useState<{x: number, y: number} | null>(null);
  const [isOn, setIsOn] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<any>(null);

  const [networkIp, setNetworkIp] = useState<string>('');
  const [networkInterfaces, setNetworkInterfaces] = useState<Array<{ name: string; label: string; address: string; isHotspot?: boolean }>>([]);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [customHost, setCustomHost] = useState<string>('');
  const [isHotspotDetected, setIsHotspotDetected] = useState<boolean>(false);
  const [bonjourHost, setBonjourHost] = useState<string>('');
  const [connectedDevices, setConnectedDevices] = useState<number>(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [obstacleCount, setObstacleCount] = useState<number>(9);

  const [tunnelUrl, setTunnelUrl] = useState<string>('');
  const [tunnelStatus, setTunnelStatus] = useState<string>('initializing');
  const [connectionMode, setConnectionMode] = useState<'cloud' | 'local'>('cloud');
  const [isRestartingTunnel, setIsRestartingTunnel] = useState<boolean>(false);

  useEffect(() => {
    // Fetch initial map data on mount so Control Center is always visible
    fetch(`/api/map`)
      .then(res => res.json())
      .then(data => setInitialMapData(data))
      .catch(err => console.error("Failed to load initial map:", err));

    // Fetch network IPs and Cloudflare tunnel for multi-device mobile pairing
    fetch(`/api/ip`)
      .then(res => res.json())
      .then(data => {
        if (data.ip) {
          setNetworkIp(data.ip);
          setSelectedIp(data.ip);
        }
        if (data.hostname) {
          setBonjourHost(data.hostname);
        }
        if (data.isHotspotDetected) {
          setIsHotspotDetected(true);
        }
        if (data.tunnelUrl) {
          setTunnelUrl(data.tunnelUrl);
          setTunnelStatus('connected');
        } else if (data.tunnelStatus) {
          setTunnelStatus(data.tunnelStatus);
        }
        if (data.interfaces && Array.isArray(data.interfaces)) {
          setNetworkInterfaces(data.interfaces);
        }
      })
      .catch(err => console.error("Failed to load network IP:", err));

    const newSocket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      newSocket.emit('client_ready', {
        history: (() => {
          try { return JSON.parse(localStorage.getItem('robot-mission-history') || '[]'); }
          catch(e) { return []; }
        })(),
        isOn: true
      });
    });

    newSocket.on('tunnel_status', (data: { tunnelUrl: string; status: string }) => {
      if (data?.tunnelUrl) {
        setTunnelUrl(data.tunnelUrl);
        setTunnelStatus(data.status || 'connected');
      } else if (data?.status) {
        setTunnelStatus(data.status);
      }
    });

    newSocket.on('device_count', (count: number) => {
      if (typeof count === 'number') {
        setConnectedDevices(count);
      }
    });

    newSocket.on('obstacle_count_updated', (data: { count: number }) => {
      if (typeof data?.count === 'number') {
        setObstacleCount(data.count);
        window.dispatchEvent(new CustomEvent('remote_set_obstacle_count', { detail: { count: data.count } }));
      }
    });

    newSocket.on('init_state', (state: any) => {
      if (state.history) setHistory(state.history);
      if (state.currentMission !== undefined) setCurrentMission(state.currentMission);
      if (state.pendingEmergency !== undefined) setPendingEmergency(state.pendingEmergency);
      if (state.obstacleCount !== undefined) {
        setObstacleCount(state.obstacleCount);
        window.dispatchEvent(new CustomEvent('remote_set_obstacle_count', { detail: { count: state.obstacleCount } }));
      }
      if (state.isOn !== undefined) {
        setIsOn(state.isOn);
        window.dispatchEvent(new CustomEvent('remote_toggle_power', { detail: { turnOn: state.isOn } }));
      }
    });

    newSocket.on('state_updated', (newState: any) => {
      if (newState.history) setHistory(newState.history);
      if (newState.currentMission !== undefined) setCurrentMission(newState.currentMission);
      if (newState.pendingEmergency !== undefined) setPendingEmergency(newState.pendingEmergency);
      if (newState.obstacleCount !== undefined) {
        setObstacleCount(newState.obstacleCount);
        window.dispatchEvent(new CustomEvent('remote_set_obstacle_count', { detail: { count: newState.obstacleCount } }));
      }
      if (newState.isOn !== undefined) {
        setIsOn(newState.isOn);
        window.dispatchEvent(new CustomEvent('remote_toggle_power', { detail: { turnOn: newState.isOn } }));
      }
      if (newState.executeMission) {
        window.dispatchEvent(new CustomEvent('remote_execute_mission'));
      }
      if (newState.emergencyApprove) {
        window.dispatchEvent(new CustomEvent('remote_emergency_approve', { detail: newState.emergencyApprove }));
      }
      if (newState.emergencyDeny) {
        window.dispatchEvent(new CustomEvent('remote_emergency_deny'));
      }
    });

    newSocket.on('mobile_command_received', (data) => {
      // Validate token (fixed for password-based auth)
      if (data.token !== 'mobile-auth') return;

      if (data.action === 'set_obstacle_count' && typeof data.count === 'number') {
        setObstacleCount(data.count);
        window.dispatchEvent(new CustomEvent('remote_set_obstacle_count', { detail: { count: data.count } }));
      }
      if (data.action === 'toggle_power') {
         setIsOn(data.turnOn);
         socketRef.current?.emit('update_state', { isOn: data.turnOn });
         window.dispatchEvent(new CustomEvent('remote_toggle_power', { detail: { turnOn: data.turnOn } }));
      }
      if (data.action === 'execute_console_command') {
         window.dispatchEvent(new CustomEvent('remote_console_command', { detail: data.command }));
      }
      if (data.action === 'emergency_target') {
         window.dispatchEvent(new CustomEvent('local_emergency_request', { detail: data }));
      }
      if (data.action === 'emergency_action') {
         if (data.type === 'ESTOP') {
            window.dispatchEvent(new CustomEvent('remote_abort_mission'));
         }
         if (data.type === 'ABORT') {
            window.dispatchEvent(new CustomEvent('remote_abort_mission'));
         }
         if (data.type === 'RTL') {
            window.dispatchEvent(new CustomEvent('remote_console_command', { detail: 'return home' }));
         }
         if (data.type === 'RESET') {
            window.dispatchEvent(new CustomEvent('remote_console_command', { detail: 'reset robot' }));
         }
         if (data.type === 'ALARM') {
            setIsAlarmActive(true);
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.volume = 1.0;
              audioRef.current.play().catch(e => console.error("Audio play blocked", e));
            }
         }
      }
      if (data.action === 'manual_move') {
         window.dispatchEvent(new CustomEvent('remote_manual_move', { detail: { direction: data.direction, speed: data.speed } }));
      }
      if (data.action === 'manual_stop') {
         window.dispatchEvent(new CustomEvent('remote_manual_stop'));
      }
      if (data.action === 'set_speed') {
         window.dispatchEvent(new CustomEvent('remote_speed_update', { detail: { speed: data.speed } }));
      }
      if (data.action === 'toggle_camera') {
         window.dispatchEvent(new CustomEvent('remote_toggle_camera'));
      }
      if (data.action === 'toggle_voice') {
         window.dispatchEvent(new CustomEvent('remote_toggle_voice'));
      }
      if (data.action === 'dispatch_mission' && data.missionText) {
         handleGenerate(data.missionText);
      }
    });

    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    const handleLocalObstacle = (e: any) => {
      const count = e.detail?.count;
      if (typeof count === 'number') {
        setObstacleCount(count);
        socketRef.current?.emit('set_obstacle_count', { count });
      }
    };
    window.addEventListener('local_set_obstacle_count', handleLocalObstacle);
    return () => window.removeEventListener('local_set_obstacle_count', handleLocalObstacle);
  }, []);

  useEffect(() => {
    const handleLocalEmergencyRequest = (e: any) => {
      const targetPos = e.detail;
      setPendingEmergency(targetPos);
      socketRef.current?.emit('update_state', { pendingEmergency: targetPos });
    };

    window.addEventListener('local_emergency_request', handleLocalEmergencyRequest);
    return () => window.removeEventListener('local_emergency_request', handleLocalEmergencyRequest);
  }, []);

  useEffect(() => {
    const handleLocalTelemetry = (e: any) => {
      socketRef.current?.emit('update_telemetry', e.detail);
    };
    const handleLocalCtrUpdate = (e: any) => {
      socketRef.current?.emit('update_state', { ctrMessages: e.detail });
    };
    window.addEventListener('local_telemetry_update', handleLocalTelemetry);
    window.addEventListener('local_ctr_messages_update', handleLocalCtrUpdate);
    return () => {
       window.removeEventListener('local_telemetry_update', handleLocalTelemetry);
       window.removeEventListener('local_ctr_messages_update', handleLocalCtrUpdate);
    };
  }, []);

  const handleRestartTunnel = async () => {
    setIsRestartingTunnel(true);
    setTunnelStatus('starting');
    try {
      await fetch('/api/tunnel/restart', { method: 'POST' });
    } catch (e) {
      console.error('Failed to restart tunnel:', e);
    }
    setTimeout(() => setIsRestartingTunnel(false), 3000);
  };

  const handleEmergencyApprove = () => {
     setPendingEmergency(null);
     socketRef.current?.emit('update_state', { pendingEmergency: null, emergencyApprove: pendingEmergency });
     window.dispatchEvent(new CustomEvent('remote_emergency_approve', { detail: pendingEmergency }));
  };

  /*
  const handleEmergencyDeny = () => {
     setPendingEmergency(null);
     socketRef.current?.emit('update_state', { pendingEmergency: null, emergencyDeny: Date.now() });
     window.dispatchEvent(new CustomEvent('remote_emergency_deny'));
  };
  */
  
  const handleGenerate = async (missionText: string) => {
    try {
      let startPoint = undefined;
      const getPos = () => new Promise(resolve => {
         const handler = (e: any) => {
            window.removeEventListener('robot_position_response', handler);
            resolve(e.detail);
         };
         window.addEventListener('robot_position_response', handler);
         window.dispatchEvent(new CustomEvent('request_robot_position'));
         setTimeout(() => {
            window.removeEventListener('robot_position_response', handler);
            resolve(undefined);
         }, 200);
      });
      startPoint = await getPos() as any;


      const response = await fetch(`/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission: missionText, startPoint }),
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
      const result: MissionResult = await response.json();
      
      const newItem: MissionHistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        mission: missionText,
        result,
        selectedStrategyId: result.strategies[0].id, // Auto-select first strategy
      };

      setHistory(prev => {
        const newHistory = [newItem, ...prev];
        socketRef.current?.emit('update_state', { history: newHistory, currentMission: newItem });
        return newHistory;
      });
      setCurrentMission(newItem);
      
      // Removed setTimeout to prevent double-execution causing path refresh glitches. The robot now auto-plays immediately.
    } catch (error) {
      console.error('Error generating strategy:', error);
      alert('Failed to generate strategy. Ensure the backend server is restarted.');
    }
  };

  useEffect(() => {
    const handleRemoteConsoleCommand = (e: any) => {
      handleGenerate(e.detail);
    };
    window.addEventListener('remote_console_command', handleRemoteConsoleCommand);
    return () => window.removeEventListener('remote_console_command', handleRemoteConsoleCommand);
  }, []);

  /*
  const handleSelectStrategy = (strategyId: string) => {
    if (!currentMission) return;
    const updatedMission = { ...currentMission, selectedStrategyId: strategyId };
    setCurrentMission(updatedMission);
    setHistory(prev => {
      const newHistory = prev.map(item => item.id === updatedMission.id ? updatedMission : item);
      socketRef.current?.emit('update_state', { history: newHistory, currentMission: updatedMission });
      return newHistory;
    });
  };
  */

  const clearHistory = () => {
    if (confirm('Are you sure you want to clear all history?')) {
      setHistory([]);
      setCurrentMission(null);
      socketRef.current?.emit('update_state', { history: [], currentMission: null });
    }
  };

  const exportMission = () => {
    if (!currentMission) {
      alert('No active mission to export.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentMission, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `mission_${currentMission.id}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const activeMapData = currentMission?.selectedStrategyId ? currentMission.result.mapData : initialMapData;

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-text overflow-hidden font-sans relative">
      {/* Futuristic Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md z-40">
        <div className="flex items-center gap-4">
          <div className="text-cyan-400 font-black tracking-widest text-xl drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">ACVS – EDS</div>
          <div className="w-px h-6 bg-white/10 hidden md:block"></div>
          <div className="text-[10px] text-gray-400 tracking-[0.2em] uppercase hidden md:block">AI-Enabled Campus Vision System for Emergency Detection and Surveillance</div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-gray-400">Devices:</span>
            <span className="text-cyan-400 font-bold">{connectedDevices}</span>
          </div>

          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <History className="w-4 h-4" /> <span className="hidden sm:inline">History</span>
          </button>
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          >
            <QrCode className="w-4 h-4" /> <span>Mobile Connect</span>
          </button>
        </div>
      </nav>

      {/* Main Workspace Area */}
      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-6 gap-2 md:gap-6 overflow-hidden">
      
      {/* Main Workspace */}
      <main className="flex-1 flex flex-col gap-2 md:gap-6 min-w-0">
        
        {/* Mobile Controller Banner for small screens */}
        <div className="md:hidden bg-gradient-to-r from-cyan-950/70 via-blue-950/70 to-slate-900/80 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold text-white uppercase tracking-wider">PAS-Mobile Controller</div>
              <div className="text-[10px] text-cyan-300/70 font-mono">Touch drive, sensors, E-STOP & console</div>
            </div>
          </div>
          <a
            href="/mobile"
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase tracking-wider rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all flex items-center gap-1.5"
          >
            Launch <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Main Simulation Area */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <div className="flex-1 flex gap-4 min-h-0">
            <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative min-w-0 z-10">
              
              {/* Floating History Sidebar Overlay */}
              {isHistoryOpen && (
                <div className="absolute left-4 top-4 bottom-4 w-64 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden flex flex-col hidden md:flex pointer-events-auto animate-in slide-in-from-left-4 fade-in duration-300">
                  <Sidebar 
                    history={history} 
                    onSelectMission={setCurrentMission} 
                    onClearHistory={clearHistory}
                    onExport={exportMission}
                  />
                </div>
              )}

              {activeMapData ? (
                <SimulationView 
                  mapData={activeMapData} 
                  isOn={isOn}
                  onPowerChange={(newOn: boolean) => {
                    setIsOn(newOn);
                    socketRef.current?.emit('update_state', { isOn: newOn });
                  }}
                  onEvent={() => {}} 
                  onDispatchMission={handleGenerate} 
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted">
                  Initializing 3D Environment...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      </div>

      {showQR && (() => {
        const isCloudMode = connectionMode === 'cloud';
        const portPart = window.location.port ? `:${window.location.port}` : '';
        const hostToUse = customHost.trim() || selectedIp || networkIp || window.location.hostname;
        const localPairingUrl = `${window.location.protocol}//${hostToUse}${portPart}/mobile?key=1234`;
        const cloudPairingUrl = tunnelUrl ? `${tunnelUrl}/mobile?key=1234` : '';
        const isCloudReady = isCloudMode && Boolean(tunnelUrl) && (tunnelStatus === 'connected');
        const activePairingUrl = isCloudMode ? (cloudPairingUrl || '') : localPairingUrl;

        const handleCopy = () => {
          if (!activePairingUrl) return;
          navigator.clipboard.writeText(activePairingUrl);
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2500);
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setShowQR(false)}>
            <div className="bg-[#0b1329] border border-cyan-500/30 p-6 sm:p-7 rounded-3xl shadow-[0_0_70px_rgba(6,182,212,0.25)] flex flex-col items-center gap-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="text-center w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>PAS-MOBILE CONTROLLER</span>
                  </div>
                  {isCloudMode && (
                    <button
                      onClick={handleRestartTunnel}
                      disabled={isRestartingTunnel}
                      title="Regenerate Cloud Tunnel URL"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 text-[10px] font-mono transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRestartingTunnel ? 'animate-spin text-cyan-400' : ''}`} />
                      <span>{isRestartingTunnel ? 'Regenerating...' : 'New URL'}</span>
                    </button>
                  )}
                </div>
                <h2 className="text-2xl font-black text-white tracking-wider uppercase">Mobile Connect</h2>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-full">
                <button
                  type="button"
                  onClick={() => setConnectionMode('cloud')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    connectionMode === 'cloud'
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/25'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Any Network (Cloud)</span>
                  {tunnelStatus === 'connected' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-950 border border-emerald-400 animate-pulse"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionMode('local')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    connectionMode === 'local'
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/25'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Local Wi-Fi (LAN)</span>
                </button>
              </div>

              {/* Mode Description Banner */}
              <div className="w-full space-y-2">
                {isCloudMode ? (
                  <div className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-[11px] flex items-center gap-2">
                    {tunnelStatus === 'connected' ? (
                      <>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0 animate-ping"></div>
                        <span className="text-cyan-200">
                          <strong className="text-white">Active Global Tunnel:</strong> Works anywhere on cellular 4G/5G, Hotspot, or any Wi-Fi without router restrictions.
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0 animate-spin"></div>
                        <span className="text-yellow-200">
                          Creating secure Global Tunnel to Cloudflare edge... Please wait.
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-[11px] text-gray-300 flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Both phone and computer must be connected to the exact same Wi-Fi router.</span>
                    </div>
                    {(isHotspotDetected || networkIp.startsWith('192.0.0.')) && (
                      <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong>Cellular Hotspot Detected ({networkIp}):</strong> Hotspot devices isolate connections. Switch to <strong>Any Network (Cloud)</strong> for immediate connection.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* QR Code Container */}
              <div className="bg-white p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center border-4 border-cyan-400/30 relative group min-w-[220px] min-h-[240px]">
                {isCloudMode && !isCloudReady ? (
                  <div className="w-[190px] h-[190px] flex flex-col items-center justify-center p-3 text-center bg-slate-900 rounded-xl border border-cyan-500/30">
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Starting Cloud Tunnel</span>
                    <span className="text-[10px] text-cyan-300/80 mt-1 leading-snug">
                      Connecting to global edge...
                    </span>
                    <span className="text-[9px] text-gray-400 mt-2 font-mono">Status: {tunnelStatus}</span>
                  </div>
                ) : (
                  <>
                    <QRCode value={activePairingUrl || localPairingUrl} size={190} />
                    <div className="mt-2.5 flex items-center justify-between w-full px-1 border-t border-gray-200 pt-2">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">SECURITY PIN</span>
                      <span className="text-xs font-mono font-black text-cyan-700 bg-cyan-100 px-2 py-0.5 rounded">1234</span>
                    </div>
                  </>
                )}
              </div>

              {/* URL & Action buttons */}
              <div className="w-full space-y-2">
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl p-2.5">
                  <input 
                    type="text" 
                    readOnly 
                    value={activePairingUrl || (isCloudMode ? 'Starting secure cloud tunnel...' : localPairingUrl)} 
                    className="flex-1 bg-transparent text-xs text-cyan-300 font-mono focus:outline-none select-all truncate"
                  />
                  <button 
                    onClick={handleCopy}
                    disabled={!activePairingUrl}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                    title="Copy Pairing URL"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                  </button>
                  {activePairingUrl && (
                    <a
                      href={activePairingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg transition-colors shrink-0"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Local Wi-Fi Options (Interface switcher & custom host) */}
                {!isCloudMode && (
                  <div className="space-y-2 pt-1 border-t border-white/5">
                    {networkInterfaces.length > 1 && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between">
                          <span>Network Interface</span>
                          <span className="text-cyan-400 font-mono text-[9px]">{networkInterfaces.length} Available</span>
                        </label>
                        <select
                          value={selectedIp}
                          onChange={(e) => setSelectedIp(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-cyan-500/50"
                        >
                          {networkInterfaces.map((iface) => (
                            <option key={iface.address} value={iface.address} className="bg-slate-900 text-white">
                              {iface.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="shrink-0 font-mono">Custom Host:</span>
                      <input
                        type="text"
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                        placeholder={bonjourHost ? `e.g. ${bonjourHost}` : "e.g. 192.168.1.50 or hostname"}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    {bonjourHost && (
                      <div className="text-[10px] text-gray-400 font-mono flex items-center justify-between">
                        <span>mDNS Host: <strong className="text-cyan-300">{bonjourHost}</strong></span>
                        <button
                          type="button"
                          onClick={() => setCustomHost(bonjourHost)}
                          className="text-cyan-400 hover:underline cursor-pointer"
                        >
                          Use mDNS
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between w-full border-t border-white/10 pt-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-ping"></div>
                    <span className="text-green-400 font-bold font-mono">{connectedDevices} Device{connectedDevices > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1 text-purple-300 font-mono text-[11px] bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                    <Sliders className="w-3 h-3" />
                    <span>{obstacleCount} Obs</span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowQR(false)} 
                  className="px-5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* EMERGENCY APPROVAL MODAL */}
      {pendingEmergency && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[600] flex justify-center w-full max-w-4xl px-4 pointer-events-none">
          <div className="w-full bg-[#0a0a0a]/90 backdrop-blur-md border border-red-500/50 rounded-2xl shadow-[0_0_80px_rgba(239,68,68,0.2)] overflow-hidden flex flex-col md:flex-row items-stretch animate-in slide-in-from-bottom-10 duration-300 pointer-events-auto">
            {/* Left accent strip */}
            <div className="w-full md:w-3 bg-red-600 h-2 md:h-auto shadow-[0_0_20px_rgba(239,68,68,0.8)]"></div>
            
            <div className="flex-1 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col md:flex-row items-center text-center md:text-left gap-6 flex-1">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 border border-red-500/30 shadow-[inset_0_0_20px_rgba(239,68,68,0.2)] flex-shrink-0 animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                </div>
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-red-500 uppercase tracking-widest drop-shadow-[0_2px_10px_rgba(239,68,68,0.5)]">Emergency Reached</h2>
                  <p className="text-red-400 font-bold mt-2 text-lg uppercase tracking-wider">Awaiting Authorization</p>
                  <p className="text-gray-400 mt-2 max-w-xl text-sm md:text-base leading-relaxed">
                    The robot is holding position at the emergency location. Authorize to resume normal operations and clear the active emergency state.
                  </p>
                </div>
              </div>
              
              <div className="w-full md:w-auto flex-shrink-0 flex flex-col gap-3">
                <button 
                  onClick={handleEmergencyApprove}
                  className="w-full md:w-64 py-5 rounded-xl font-black text-lg bg-red-600 text-white hover:bg-red-500 hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all uppercase tracking-widest active:scale-95 border border-red-400/50"
                >
                  AUTHORIZE RESUME
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALARM OVERLAY */}
      {isAlarmActive && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-red-600/40 animate-pulse pointer-events-none">
          <div className="fixed inset-0 bg-red-900/30 backdrop-blur-sm"></div>
          <div className="z-10 bg-black/90 border-4 border-red-500 p-12 rounded-3xl flex flex-col items-center gap-6 pointer-events-auto shadow-[0_0_150px_rgba(239,68,68,1)] text-center">
             <div className="text-red-500 w-24 h-24 flex items-center justify-center animate-bounce">
               <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
             </div>
             <h1 className="text-6xl font-black text-red-500 tracking-widest uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">ALARM ACTIVE</h1>
             <p className="text-red-300 text-xl font-bold tracking-widest">EMERGENCY PROTOCOL INITIATED BY MOBILE OPERATOR</p>
             <button 
                onClick={() => {
                   setIsAlarmActive(false);
                   if (audioRef.current) {
                     audioRef.current.pause();
                     audioRef.current.currentTime = 0;
                   }
                }}
                className="mt-8 px-12 py-4 bg-red-600 hover:bg-red-500 text-white font-black text-2xl rounded-xl transition-all shadow-[0_0_20px_rgba(239,68,68,0.5)] active:scale-95 uppercase tracking-widest"
             >
                DISMISS ALARM
             </button>
          </div>
        </div>
      )}
      
      {/* AUDIO ELEMENT */}
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/991/991-preview.mp3" loop />
    </div>
  );
}

export default App;
