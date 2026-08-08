import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';

// import { StrategyComparison } from './components/StrategyComparison';
import { IntroSequence } from './components/IntroSequence';
import { RobotShowcase } from './components/RobotShowcase';
import React, { Suspense } from 'react';

const SimulationView = React.lazy(() => import('./components/SimulationView').then(module => ({ default: module.SimulationView })));

import { useLocalStorage } from './hooks/useLocalStorage';
import type { MissionHistoryItem, MissionResult } from './types';
import { Bot, Info, Power, QrCode, History } from 'lucide-react';
import QRCode from 'react-qr-code';
import { io } from 'socket.io-client';
import { Play } from 'lucide-react'; // ensure Play is imported for the execute button

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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const safeGetSession = (key: string) => {
    try { return sessionStorage.getItem(key); } catch(e) { return null; }
  };
  const [showIntro, setShowIntro] = useState(() => {
    return safeGetSession('hasSeenIntro') !== 'true';
  });
  const [introRendered, setIntroRendered] = useState(() => {
    return safeGetSession('hasSeenIntro') !== 'true';
  });
  const [showRobotFeatures, setShowRobotFeatures] = useState(false);
  const [pendingEmergency, setPendingEmergency] = useState<{x: number, y: number} | null>(null);
  const [showReject, setShowReject] = useState(true);
  const [localIp, setLocalIp] = useState('');
  const [isOn, setIsOn] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [pairingToken, setPairingToken] = useState('');
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<any>(null);

  const togglePowerBroadcast = (turnOn: boolean) => {
    setIsOn(turnOn);
    socketRef.current?.emit('update_state', { isOn: turnOn });
  };

  const executeMissionBroadcast = () => {
    socketRef.current?.emit('update_state', { executeMission: Date.now() });
    window.dispatchEvent(new CustomEvent('remote_execute_mission'));
  };

  const handleIntroComplete = () => {
    try { sessionStorage.setItem('hasSeenIntro', 'true'); } catch(e) {}
    setShowIntro(false);
    setTimeout(() => setIntroRendered(false), 2000);
  };

  useEffect(() => {
    if (pendingEmergency) {
      setShowReject(true);
      const timer = setTimeout(() => setShowReject(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingEmergency]);

  useEffect(() => {
    // Fetch initial map data on mount so Control Center is always visible
    fetch(`/api/map`)
      .then(res => res.json())
      .then(data => setInitialMapData(data))
      .catch(err => console.error("Failed to load initial map:", err));

    fetch(`/api/ip`)
      .then(res => res.json())
      .then(data => setLocalIp(data.ip))
      .catch(console.error);

    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    setPairingToken(token);

    const newSocket = io(`/`);
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

    newSocket.on('init_state', (state: any) => {
      if (state.history) setHistory(state.history);
      if (state.currentMission !== undefined) setCurrentMission(state.currentMission);
      if (state.pendingEmergency !== undefined) setPendingEmergency(state.pendingEmergency);
      if (state.isOn !== undefined) {
        setIsOn(state.isOn);
        window.dispatchEvent(new CustomEvent('remote_toggle_power', { detail: { turnOn: state.isOn } }));
      }
    });

    newSocket.on('state_updated', (newState: any) => {
      if (newState.history) setHistory(newState.history);
      if (newState.currentMission !== undefined) setCurrentMission(newState.currentMission);
      if (newState.pendingEmergency !== undefined) setPendingEmergency(newState.pendingEmergency);
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
      // Validate token
      if (data.token !== token) return;

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
         console.log('Mobile moving:', data.direction, data.speed);
      }
      if (data.action === 'set_speed') {
         window.dispatchEvent(new CustomEvent('remote_speed_update', { detail: { speed: data.speed } }));
      }
    });

    return () => { newSocket.close(); };
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

  const handleEmergencyApprove = () => {
     setPendingEmergency(null);
     socketRef.current?.emit('update_state', { pendingEmergency: null, emergencyApprove: pendingEmergency });
     window.dispatchEvent(new CustomEvent('remote_emergency_approve', { detail: pendingEmergency }));
  };

  const handleEmergencyReject = () => {
     setPendingEmergency(null);
     socketRef.current?.emit('update_state', { pendingEmergency: null, emergencyApprove: false });
     window.dispatchEvent(new CustomEvent('remote_emergency_deny', { detail: pendingEmergency }));
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
      {introRendered && <IntroSequence onComplete={handleIntroComplete} />}
      
      {/* Futuristic Navbar */}
      <nav className={`flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md z-40 transition-all duration-1000 ${showIntro ? 'opacity-0 translate-y-[-20px]' : 'opacity-100 translate-y-0'}`}>
        <div className="flex items-center gap-4">
          <div className="text-cyan-400 font-black tracking-widest text-xl drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">ASPIRE</div>
          <div className="w-px h-6 bg-white/10 hidden md:block"></div>
          <div className="text-[10px] text-gray-400 tracking-[0.2em] uppercase hidden md:block">Intelligent Robotics Environment</div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="hidden md:flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <History className="w-4 h-4" /> History
          </button>
          <button
            onClick={() => setShowQR(true)}
            className="hidden md:flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <QrCode className="w-4 h-4" /> Mobile Connect
          </button>
          <button
            onClick={() => setShowRobotFeatures(true)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <Info className="w-4 h-4" /> Robot Specs
          </button>
        </div>
      </nav>

      {/* Main Workspace Area */}
      <div className={`flex-1 flex flex-col md:flex-row overflow-hidden relative transition-all duration-1000 ${showIntro ? 'opacity-0 translate-y-20' : 'opacity-100 translate-y-0'}`}>
        {/* Ambient Grid for App */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] z-0" />
        

      
      {/* Main Workspace */}
      <main className="flex-1 flex flex-col gap-2 md:gap-6 min-w-0">
        
        {/* MOBILE REMOTE CONTROL (Only visible on mobile) */}
        <div className="md:hidden flex flex-col flex-1 bg-[#050505] p-2 gap-8 justify-center overflow-y-auto z-50 rounded-2xl border border-white/10">
          <div className="text-center mt-2">
             <Bot className="w-20 h-20 text-cyan-500 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
             <h2 className="text-3xl font-black text-white tracking-widest flex items-center justify-center"><AnimatedPASName /></h2>
             <p className="text-cyan-500 text-xs mt-2 font-mono uppercase tracking-widest">Remote Control Active</p>
          </div>
          
          <div className="flex gap-4 w-full px-2">
            <button 
              onClick={() => togglePowerBroadcast(true)}
              className={`flex-1 p-6 rounded-2xl font-bold flex flex-col items-center justify-center gap-3 border-2 transition-all shadow-xl backdrop-blur-md ${isOn ? 'bg-green-500/20 text-green-400 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] scale-105' : 'bg-black/60 text-gray-500 border-white/10 hover:bg-white/5'}`}
            >
              <Power className="w-10 h-10" /> <span className="text-lg tracking-widest">POWER ON</span>
            </button>
            <button 
              onClick={() => togglePowerBroadcast(false)}
              className={`flex-1 p-6 rounded-2xl font-bold flex flex-col items-center justify-center gap-3 border-2 transition-all shadow-xl backdrop-blur-md ${!isOn ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)] scale-105' : 'bg-black/60 text-gray-500 border-white/10 hover:bg-white/5'}`}
            >
              <Power className="w-10 h-10" /> <span className="text-lg tracking-widest">POWER OFF</span>
            </button>
          </div>

          <div className="w-full px-2">
            <button 
              onClick={executeMissionBroadcast}
              className="w-full p-4 rounded-2xl font-bold flex items-center justify-center gap-3 border-2 transition-all shadow-xl backdrop-blur-md bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:bg-blue-500/30"
            >
              <Play className="w-8 h-8" /> <span className="text-lg tracking-widest">EXECUTE MISSION</span>
            </button>
          </div>

          <div className="w-full mt-2 px-2 pb-6 flex justify-center">
             <button 
               onClick={() => alert("CTR Mode activated via mobile. Monitor simulation command center for real-time robotic feedback.")}
               className="text-xs text-gray-500 hover:text-cyan-400 border border-white/10 bg-white/5 hover:bg-cyan-500/10 px-4 py-1.5 rounded-full uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg"
             >
                <Bot className="w-4 h-4" /> Connect to Robot (CTR)
             </button>
          </div>
        </div>


        {/* DESKTOP UI (Only visible on desktop) */}
        <div className="hidden md:flex flex-col gap-6 flex-1 min-w-0">


          {/* Main Simulation Area */}
          <div className="flex-1 flex min-h-0">
            {/* Main 3D Simulation Pane */}
            <div className="flex-1 bg-black/40 overflow-hidden relative min-w-0 z-10">
              
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
                <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-black text-cyan-400 font-mono tracking-[0.2em] animate-pulse z-50">INITIALIZING PAS CORE ENGINE...</div>}>
                  <SimulationView 
                    mapData={activeMapData} 
                    onEvent={() => {}} 
                    onDispatchMission={handleGenerate} 
                  />
                </Suspense>
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

      {showRobotFeatures && (
        <RobotShowcase onClose={() => setShowRobotFeatures(false)} />
      )}

      {showQR && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowQR(false)}>
          <div className="bg-[#0f172a] border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-cyan-400 tracking-wider uppercase">Mobile Pairing</h2>
            <div className="bg-white p-4 rounded-xl shadow-lg flex flex-col items-center">
              <QRCode value={`http://${localIp}:5173/mobile?token=${pairingToken}`} size={220} />
              <div className="mt-4 flex items-center justify-between w-full px-2">
                <span className="text-xs text-black/50 font-bold uppercase tracking-widest">TOKEN</span>
                <span className="text-sm font-mono font-bold text-cyan-600">{pairingToken}</span>
              </div>
            </div>
            <p className="text-sm text-gray-400 font-mono text-center max-w-xs">
              Scan this QR code with your mobile device to securely pair it with this dashboard.
            </p>
            <button 
              onClick={() => setShowQR(false)} 
              className="mt-2 px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* EMERGENCY APPROVAL MODAL */}
      {pendingEmergency && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md md:inset-auto md:bottom-6 md:left-6 md:bg-transparent md:backdrop-blur-none md:flex-none md:items-start md:justify-start">
          <div className="bg-[#111] border-2 border-red-500 p-8 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.3)] flex flex-col items-center text-center gap-6 w-[90%] max-w-sm animate-in zoom-in duration-300 md:bg-[#111]/90 md:backdrop-blur-xl md:border md:border-red-500/50 md:p-5 md:w-auto md:max-w-xs md:items-start md:text-left md:gap-3 md:shadow-[0_0_30px_rgba(239,68,68,0.2)] md:animate-in md:slide-in-from-bottom-10">
            <div className="flex flex-col md:flex-row items-center md:items-center gap-4 md:gap-3">
              <div className="w-16 h-16 md:w-10 md:h-10 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 border border-red-500/50 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </div>
              <div>
                <h2 className="text-2xl md:text-sm font-black text-red-400 uppercase tracking-widest leading-none">Emergency Reached</h2>
                <p className="text-sm md:text-xs text-red-300 font-bold mt-2 md:mt-1">Awaiting Authorization</p>
              </div>
            </div>
            
            <p className="text-sm md:text-xs text-gray-300 leading-relaxed mt-2 md:mt-0">
              The robot is holding position at the emergency location. Authorize to resume normal operations.
            </p>
            
            <div className="flex w-full gap-3 mt-2 md:mt-1">
              <button 
                onClick={handleEmergencyApprove}
                className="flex-1 py-4 md:py-2.5 rounded-xl font-bold bg-green-600 text-white hover:bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] md:shadow-[0_0_15px_rgba(34,197,94,0.4)] md:bg-green-600/90 transition-all text-base md:text-xs tracking-wider"
              >
                AUTHORIZE
              </button>
              {showReject && (
                <button 
                  onClick={handleEmergencyReject}
                  className="flex-1 py-4 md:py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] md:shadow-[0_0_15px_rgba(239,68,68,0.4)] md:bg-red-600/90 transition-all text-base md:text-xs tracking-wider"
                >
                  REJECT
                </button>
              )}
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
