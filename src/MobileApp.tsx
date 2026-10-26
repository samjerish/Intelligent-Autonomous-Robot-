import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MobileDashboard } from './components/mobile/MobileDashboard';
import { MobileControls } from './components/mobile/MobileControls';
import { MobileRobotVision } from './components/mobile/MobileRobotVision';
import { MobileEmergencyMap } from './components/mobile/MobileEmergencyMap';
import { MobileTerminal } from './components/mobile/MobileTerminal';
import { MobileEmergencyPanel } from './components/mobile/MobileEmergencyPanel';
import { Activity, Gamepad2, Map as MapIcon, Terminal, AlertTriangle, Eye } from 'lucide-react';

export default function MobileApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Auto-authenticate so mobile application opens and works immediately on any device
    try { localStorage.setItem('pas_mobile_authenticated', 'true'); } catch(e) {}
    return true;
  });

  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [telemetry, setTelemetry] = useState<any>({
    battery: 100,
    temperature: 35.0,
    cpu: 12,
    network: 98,
    speed: 0,
    position: { x: 61, y: 81 },
    state: 'Patrol'
  });
  const [visionFrame, setVisionFrame] = useState<any>(null);
  const [robotPose, setRobotPose] = useState<any>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [pendingEmergency, setPendingEmergency] = useState<{x: number, y: number} | null>(null);
  const [obstacleCount, setObstacleCount] = useState<number>(9);

  useEffect(() => {
    fetch(`/api/map`)
      .then(res => res.json())
      .then(data => setMapData(data))
      .catch(err => console.error("Failed to load map data:", err));

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('request_robot_vision');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('telemetry_update', (data) => {
      setTelemetry(data);
    });

    socket.on('robot_vision_frame', (frameData) => {
      setVisionFrame(frameData);
    });

    socket.on('robot_pose_stream', (poseData) => {
      setRobotPose(poseData);
    });

    socket.on('obstacle_count_updated', (data: { count: number }) => {
      if (typeof data?.count === 'number') {
        setObstacleCount(data.count);
      }
    });

    socket.on('init_state', (state: any) => {
      if (state.pendingEmergency !== undefined) setPendingEmergency(state.pendingEmergency);
      if (state.obstacleCount !== undefined) setObstacleCount(state.obstacleCount);
    });

    socket.on('state_updated', (newState: any) => {
      if (newState.pendingEmergency !== undefined) setPendingEmergency(newState.pendingEmergency);
      if (newState.obstacleCount !== undefined) setObstacleCount(newState.obstacleCount);
    });

    // Periodic heartbeat to keep real-time vision and telemetry hot
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('request_robot_vision');
      }
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket.connected) {
        socket.emit('request_robot_vision');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center p-4">
        <div className="bg-[#0a1122] border border-cyan-500/30 rounded-2xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-5 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <Eye className="w-8 h-8 animate-pulse" />
          </div>
          <h1 className="text-xl font-black text-white mb-1 uppercase tracking-widest text-center">Mobile Robot Link</h1>
          <p className="text-xs text-gray-400 mb-6 text-center">Live robot vision, touch steering & campus emergency controls.</p>
          
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (passwordInput === '1234') {
                try { localStorage.setItem('pas_mobile_authenticated', 'true'); } catch(err) {}
                setIsAuthenticated(true);
                setError(false);
              } else {
                setError(true);
              }
            }}
            className="w-full space-y-3"
          >
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter PIN (1234)"
              className={`w-full bg-[#020817] border ${error ? 'border-red-500' : 'border-cyan-500/50'} rounded-xl px-4 py-3 text-white text-center text-xl tracking-widest outline-none focus:border-cyan-400 transition-colors`}
            />
            {error && <p className="text-red-500 text-xs font-bold uppercase text-center">Incorrect PIN Code</p>}
            
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black uppercase tracking-widest py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] cursor-pointer active:scale-98"
            >
              Connect Controller
            </button>

            <button
              type="button"
              onClick={() => {
                try { localStorage.setItem('pas_mobile_authenticated', 'true'); } catch(err) {}
                setIsAuthenticated(true);
              }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-cyan-400 text-xs font-mono font-bold rounded-xl border border-white/10 transition-colors"
            >
              Quick Connect (Default PIN: 1234)
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sendCommand = (action: string, payload: any = {}) => {
    if (socketRef.current) {
      socketRef.current.emit('mobile_command', {
        token: 'mobile-auth',
        action,
        ...payload
      });
    }
  };

  const handleSetObstacleCount = (count: number) => {
    const clamped = Math.max(0, Math.min(30, count));
    setObstacleCount(clamped);
    sendCommand('set_obstacle_count', { count: clamped });
  };

  const handleEmergencyApprove = () => {
    if (socketRef.current) {
      socketRef.current.emit('update_state', { pendingEmergency: null, emergencyApprove: pendingEmergency });
      setPendingEmergency(null);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <MobileDashboard 
            telemetry={telemetry} 
            isConnected={isConnected} 
            sendCommand={sendCommand} 
            obstacleCount={obstacleCount} 
            onSetObstacleCount={handleSetObstacleCount}
            visionFrame={visionFrame}
            onOpenVision={() => setActiveTab('vision')}
          />
        );
      case 'vision':
        return (
          <MobileRobotVision
            visionFrame={visionFrame}
            robotPose={robotPose}
            mapData={mapData}
            sendCommand={sendCommand}
            telemetry={telemetry}
            isConnected={isConnected}
          />
        );
      case 'controls':
        return (
          <MobileControls 
            telemetry={telemetry} 
            sendCommand={sendCommand} 
            obstacleCount={obstacleCount} 
            onSetObstacleCount={handleSetObstacleCount} 
            visionFrame={visionFrame}
            onOpenVision={() => setActiveTab('vision')}
          />
        );
      case 'map':
        return <MobileEmergencyMap telemetry={telemetry} mapData={mapData} sendCommand={sendCommand} />;
      case 'terminal':
        return <MobileTerminal telemetry={telemetry} sendCommand={sendCommand} />;
      case 'emergency':
        return <MobileEmergencyPanel sendCommand={sendCommand} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#020817] text-gray-100 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-3.5 border-b border-white/10 bg-[#0f172a] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <Eye className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="font-black text-xs tracking-widest text-cyan-400 uppercase">ACVS ROBOT MOBILE</h1>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-[10px] text-gray-400 font-mono">
                {isConnected ? 'TELEMETRY & VISION ONLINE' : 'DISCONNECTED'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('vision')}
          className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-[10px] font-mono font-bold text-cyan-300 flex items-center gap-1 transition-all"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          <span>ROBOT CAM</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {renderContent()}
      </main>

      {/* EMERGENCY APPROVAL MODAL */}
      {pendingEmergency && (
        <div className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-[600] flex justify-center w-full max-w-4xl px-4 pointer-events-none">
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

      {/* Bottom Navigation */}
      <nav className="shrink-0 bg-[#0f172a] border-t border-white/10 pb-safe">
        <div className="flex items-center justify-around p-1.5">
          <NavButton icon={<Activity />} label="STATUS" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton 
            icon={<Eye />} 
            label="VISION" 
            active={activeTab === 'vision'} 
            onClick={() => setActiveTab('vision')} 
            isSpecial 
            hasBadge={visionFrame?.hazardAlert}
          />
          <NavButton icon={<Gamepad2 />} label="DRIVE" active={activeTab === 'controls'} onClick={() => setActiveTab('controls')} />
          <NavButton icon={<MapIcon />} label="MAP" active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          <NavButton icon={<Terminal />} label="CMD" active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} />
          <NavButton icon={<AlertTriangle />} label="E-STOP" active={activeTab === 'emergency'} onClick={() => setActiveTab('emergency')} isDanger />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, isDanger = false, isSpecial = false, hasBadge = false }: any) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 p-1.5 rounded-lg min-w-[50px] transition-all cursor-pointer
        ${active 
          ? (isDanger ? 'text-red-400 bg-red-400/15' : isSpecial ? 'text-cyan-300 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'text-cyan-400 bg-cyan-400/10') 
          : (isSpecial ? 'text-cyan-400/80 hover:text-cyan-300' : 'text-gray-400 hover:text-gray-200')}
      `}
    >
      {hasBadge && (
        <span className="absolute top-1 right-2.5 w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
      )}
      <div className={`[&>svg]:w-5 [&>svg]:h-5 ${active && isDanger ? 'animate-pulse' : ''} ${isSpecial && active ? 'text-cyan-300 stroke-[2.2]' : ''}`}>
        {icon}
      </div>
      <span className="text-[9px] font-bold tracking-wider">{label}</span>
    </button>
  );
}
