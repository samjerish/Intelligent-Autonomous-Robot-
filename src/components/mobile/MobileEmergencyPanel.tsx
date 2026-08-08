import { useState } from 'react';
import { AlertOctagon, Home, XCircle, RotateCcw, Volume2 } from 'lucide-react';

export function MobileEmergencyPanel({ sendCommand }: any) {
  const [confirmStop, setConfirmStop] = useState(false);

  const handleEStop = () => {
    if (confirmStop) {
      sendCommand('emergency_action', { type: 'ESTOP' });
      setConfirmStop(false);
      alert('EMERGENCY STOP ENGAGED!');
    } else {
      setConfirmStop(true);
      setTimeout(() => setConfirmStop(false), 3000);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
          <AlertOctagon className="w-6 h-6" /> Safety Overrides
        </h2>
        <p className="text-xs text-gray-400 mt-1">WARNING: These actions take immediate priority over all current tasks.</p>
      </div>

      {/* Massive E-Stop Button */}
      <div className="flex-1 flex items-center justify-center mb-8">
        <button 
          onClick={handleEStop}
          className={`relative w-48 h-48 rounded-full border-4 flex flex-col items-center justify-center transition-all shadow-2xl ${
            confirmStop 
              ? 'bg-red-600 border-red-300 animate-pulse scale-95' 
              : 'bg-red-500 border-red-700 hover:bg-red-400'
          }`}
          style={{ boxShadow: '0 0 40px rgba(239, 68, 68, 0.4)' }}
        >
          <AlertOctagon className="w-16 h-16 text-white mb-2" />
          <span className="text-white font-black text-xl tracking-widest">
            {confirmStop ? 'CONFIRM' : 'E-STOP'}
          </span>
        </button>
      </div>

      {/* Action Grid */}
      <div className="grid grid-cols-2 gap-3">
        <EmergencyAction 
          icon={<Home />} 
          label="RETURN HOME" 
          onClick={() => sendCommand('emergency_action', { type: 'RTL' })} 
        />
        <EmergencyAction 
          icon={<XCircle />} 
          label="ABORT MISSION" 
          onClick={() => sendCommand('emergency_action', { type: 'ABORT' })} 
        />
        <EmergencyAction 
          icon={<RotateCcw />} 
          label="RESET ROBOT" 
          onClick={() => sendCommand('emergency_action', { type: 'RESET' })} 
        />
        <EmergencyAction 
          icon={<Volume2 />} 
          label="SOUND ALARM" 
          onClick={() => sendCommand('emergency_action', { type: 'ALARM' })} 
          className="text-yellow-400 border-yellow-500/30 bg-yellow-500/10 hover:bg-yellow-500/20"
        />
      </div>
    </div>
  );
}

function EmergencyAction({ icon, label, onClick, className = "" }: any) {
  return (
    <button 
      onClick={onClick}
      className={`bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all ${className}`}
    >
      <div className="w-6 h-6">{icon}</div>
      <span className="text-[10px] font-bold tracking-wider">{label}</span>
    </button>
  );
}
