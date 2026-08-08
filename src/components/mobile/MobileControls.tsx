import { useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, StopCircle, Camera, Mic, Power, Home } from 'lucide-react';

export function MobileControls({ telemetry, sendCommand }: any) {
  const [speed, setSpeed] = useState(50);

  const handleHold = (direction: string) => {
    sendCommand('manual_move', { direction, speed });
  };

  const handleRelease = () => {
    sendCommand('manual_stop');
  };

  return (
    <div className="p-4 h-full flex flex-col justify-between">
      {/* Top Actions */}
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => sendCommand('toggle_camera')}
          className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 text-gray-300 active:bg-white/10"
        >
          <Camera className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest">CAM</span>
        </button>
        <button 
          onClick={() => sendCommand('toggle_voice')}
          className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 text-gray-300 active:bg-white/10"
        >
          <Mic className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest">VOICE</span>
        </button>
      </div>
      
      {/* Mission Actions */}
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => sendCommand('toggle_power', { turnOn: telemetry?.state === 'OFFLINE' })}
          className={`flex-1 border p-3 rounded-xl flex flex-col items-center justify-center gap-2 active:bg-white/10 transition-all ${telemetry?.state !== 'OFFLINE' ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}
        >
          <Power className="w-6 h-6" />
          <span className="text-xs font-bold tracking-widest">{telemetry?.state !== 'OFFLINE' ? 'POWER OFF' : 'POWER ON'}</span>
        </button>
        <button 
          onClick={() => sendCommand('execute_console_command', { command: 'return home' })}
          className="flex-1 bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl flex flex-col items-center justify-center gap-2 text-yellow-400 active:bg-yellow-500/20 transition-all"
        >
          <Home className="w-6 h-6" />
          <span className="text-xs font-bold tracking-widest">RETURN HOME</span>
        </button>
      </div>

      {/* D-Pad */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-64 h-64">
          <ControlButton 
            icon={<ArrowUp />} 
            className="absolute top-0 left-1/2 -translate-x-1/2" 
            onHold={() => handleHold('forward')} 
            onRelease={handleRelease}
          />
          <ControlButton 
            icon={<ArrowDown />} 
            className="absolute bottom-0 left-1/2 -translate-x-1/2" 
            onHold={() => handleHold('backward')} 
            onRelease={handleRelease}
          />
          <ControlButton 
            icon={<ArrowLeft />} 
            className="absolute left-0 top-1/2 -translate-y-1/2" 
            onHold={() => handleHold('left')} 
            onRelease={handleRelease}
          />
          <ControlButton 
            icon={<ArrowRight />} 
            className="absolute right-0 top-1/2 -translate-y-1/2" 
            onHold={() => handleHold('right')} 
            onRelease={handleRelease}
          />
          <ControlButton 
            icon={<StopCircle className="text-red-400 w-8 h-8" />} 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-red-500/30" 
            onHold={() => sendCommand('manual_stop')} 
            onRelease={() => {}}
          />
        </div>
      </div>

      {/* Speed Slider */}
      <div className="mt-8 bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex justify-between text-xs text-gray-400 font-mono mb-2">
          <span>SPEED LIMIT</span>
          <span className="text-cyan-400">{speed}%</span>
        </div>
        <input 
          type="range" 
          min="10" 
          max="100" 
          value={speed}
          onChange={(e) => {
            const newSpeed = parseInt(e.target.value);
            setSpeed(newSpeed);
            sendCommand('set_speed', { speed: newSpeed });
          }}
          className="w-full accent-cyan-500"
        />
      </div>
    </div>
  );
}

function ControlButton({ icon, className, onHold, onRelease }: any) {
  return (
    <button
      onPointerDown={onHold}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      className={`w-20 h-20 rounded-full bg-[#0f172a] border border-white/10 flex items-center justify-center text-white active:bg-cyan-500/20 active:border-cyan-500 active:scale-95 transition-all shadow-lg ${className}`}
    >
      <div className="[&>svg]:w-8 [&>svg]:h-8">{icon}</div>
    </button>
  );
}
