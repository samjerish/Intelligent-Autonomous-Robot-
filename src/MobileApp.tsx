import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MobileDashboard } from './components/mobile/MobileDashboard';
import { MobileControls } from './components/mobile/MobileControls';
import { MobileEmergencyMap } from './components/mobile/MobileEmergencyMap';
import { MobileTerminal } from './components/mobile/MobileTerminal';
import { MobileEmergencyPanel } from './components/mobile/MobileEmergencyPanel';
import { Activity, Gamepad2, Map as MapIcon, Terminal, AlertTriangle } from 'lucide-react';

export default function MobileApp() {
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [pendingEmergency, setPendingEmergency] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    // Parse token from URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      setToken(urlToken);
    }

    fetch(`/api/map`)
      .then(res => res.json())
      .then(data => setMapData(data))
      .catch(err => console.error("Failed to load map data:", err));

    const socket = io(`/`);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('telemetry_update', (data) => {
      setTelemetry(data);
    });

    socket.on('init_state', (state: any) => {
      if (state.pendingEmergency !== undefined) setPendingEmergency(state.pendingEmergency);
    });

    socket.on('state_updated', (newState: any) => {
      if (newState.pendingEmergency !== undefined) setPendingEmergency(newState.pendingEmergency);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center p-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-red-500 mb-2">Unauthorized Access</h1>
          <p className="text-sm text-gray-400">
            Please scan the QR code from the Desktop Control Center to pair your device.
          </p>
        </div>
      </div>
    );
  }

  const sendCommand = (action: string, payload: any = {}) => {
    if (socketRef.current) {
      socketRef.current.emit('mobile_command', {
        token,
        action,
        ...payload
      });
    }
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
        return <MobileDashboard telemetry={telemetry} isConnected={isConnected} sendCommand={sendCommand} />;
      case 'controls':
        return <MobileControls telemetry={telemetry} sendCommand={sendCommand} />;
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
      <header className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0f172a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-widest text-cyan-400">PAS-MOBILE</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-xs text-gray-400 font-mono">
                {isConnected ? 'LINK ACTIVE' : 'NO SIGNAL'}
              </span>
            </div>
          </div>
        </div>
        <div className="px-2 py-1 bg-white/5 rounded border border-white/10 text-xs font-mono text-cyan-500/50">
          ID: {token.slice(0,6)}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {renderContent()}
      </main>

      {/* EMERGENCY APPROVAL MODAL */}
      {pendingEmergency && (
        <div className="fixed bottom-[80px] left-1/2 -translate-x-1/2 z-[600] w-[95%] max-w-2xl bg-black/40 backdrop-blur-3xl border border-red-500/50 rounded-2xl shadow-[0_10px_50px_rgba(239,68,68,0.3)] overflow-hidden flex flex-col md:flex-row items-stretch animate-in slide-in-from-bottom-10 duration-300">
          <div className="w-full md:w-2 bg-red-600 h-1 md:h-auto shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
          
          <div className="flex-1 p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col md:flex-row items-center text-center md:text-left gap-4 flex-1">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 border border-red-500/30 flex-shrink-0 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-red-500 tracking-wider">Emergency Stopped</h2>
                <p className="text-gray-300 mt-1 text-xs md:text-sm leading-relaxed">
                  The robot is holding position. Click authorize to resume.
                </p>
              </div>
            </div>
            
            <div className="w-full md:w-auto flex-shrink-0">
              <button 
                onClick={handleEmergencyApprove}
                className="w-full md:w-48 py-3 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-500 transition-all uppercase tracking-wider active:scale-95 border border-red-400/50"
              >
                AUTHORIZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="shrink-0 bg-[#0f172a] border-t border-white/10 pb-safe">
        <div className="flex items-center justify-around p-2">
          <NavButton icon={<Activity />} label="STATUS" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Gamepad2 />} label="DRIVE" active={activeTab === 'controls'} onClick={() => setActiveTab('controls')} />
          <NavButton icon={<MapIcon />} label="MAP" active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          <NavButton icon={<Terminal />} label="CMD" active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} />
          <NavButton icon={<AlertTriangle />} label="E-STOP" active={activeTab === 'emergency'} onClick={() => setActiveTab('emergency')} isDanger />
        </div>
      </nav>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, isDanger = false }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg min-w-[64px] transition-colors
        ${active ? (isDanger ? 'text-red-400 bg-red-400/10' : 'text-cyan-400 bg-cyan-400/10') : 'text-gray-500 hover:text-gray-300'}
      `}
    >
      <div className={`[&>svg]:w-6 [&>svg]:h-6 ${active && isDanger ? 'animate-pulse' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold tracking-wider">{label}</span>
    </button>
  );
}
