import { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, StopCircle, Mic, Power, Home, Sliders, Plus, Minus, Eye, Maximize2, Compass } from 'lucide-react';

export function MobileControls({ telemetry, sendCommand, obstacleCount = 9, onSetObstacleCount, visionFrame, onOpenVision }: any) {
  const [speed, setSpeed] = useState(50);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startContinuousDrive = (direction: string) => {
    // Send immediate move
    sendCommand('manual_move', { direction, speed });
    
    // Clear any previous interval
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    
    // Repeat while held
    holdIntervalRef.current = setInterval(() => {
      sendCommand('manual_move', { direction, speed });
    }, 350);
  };

  const stopContinuousDrive = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    sendCommand('manual_stop');
  };

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    };
  }, []);

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Robot Live Vision Strip */}
      <div 
        onClick={onOpenVision}
        className="bg-black/90 border border-cyan-500/40 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.15)] relative aspect-[21/9] flex items-center justify-center cursor-pointer group active:scale-[0.99] transition-all"
      >
        {visionFrame?.image ? (
          <img 
            src={visionFrame.image} 
            alt="Robot Camera Stream" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
        ) : (
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs">
            <Eye className="w-4 h-4 animate-pulse" />
            <span>CONNECTING ROBOT CAMERA...</span>
          </div>
        )}

        {/* Live Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50 pointer-events-none flex flex-col justify-between p-2">
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-black/80 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
              ROBOT VISION FPV
            </span>
            {visionFrame?.heading !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-black/80 text-white border border-white/10 flex items-center gap-1">
                <Compass className="w-3 h-3 text-cyan-400" />
                {visionFrame.heading}°
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
            <span>{visionFrame?.detectedObjects?.length ? `${visionFrame.detectedObjects.length} Targets Detected` : 'Corridor Scan Clear'}</span>
            <span className="font-bold uppercase tracking-wider flex items-center gap-1 group-hover:text-white transition-colors">
              FULL VISION <Maximize2 className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Top Actions */}
      <div className="flex gap-3">
        <button 
          onClick={onOpenVision}
          className="flex-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 p-2.5 rounded-xl flex items-center justify-center gap-2 text-cyan-300 active:bg-cyan-500/30 transition-colors cursor-pointer"
        >
          <Eye className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold tracking-widest uppercase">ROBOT VISION</span>
        </button>
        <button 
          onClick={() => sendCommand('toggle_voice')}
          className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-center gap-2 text-gray-300 active:bg-white/10 transition-colors"
        >
          <Mic className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold tracking-widest">VOICE</span>
        </button>
      </div>
      
      {/* Mission Actions */}
      <div className="flex gap-3">
        <button 
          onClick={() => sendCommand('toggle_power', { turnOn: telemetry?.state === 'OFFLINE' })}
          className={`flex-1 border p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 active:bg-white/10 transition-all ${telemetry?.state !== 'OFFLINE' ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}
        >
          <Power className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest">{telemetry?.state !== 'OFFLINE' ? 'POWER OFF' : 'POWER ON'}</span>
        </button>
        <button 
          onClick={() => sendCommand('execute_console_command', { command: 'return home' })}
          className="flex-1 bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl flex flex-col items-center justify-center gap-1.5 text-yellow-400 active:bg-yellow-500/20 transition-all"
        >
          <Home className="w-5 h-5" />
          <span className="text-xs font-bold tracking-widest">RETURN HOME</span>
        </button>
      </div>

      {/* D-Pad */}
      <div className="flex items-center justify-center py-4">
        <div className="relative w-64 h-64">
          <ControlButton 
            icon={<ArrowUp />} 
            className="absolute top-0 left-1/2 -translate-x-1/2" 
            onHold={() => startContinuousDrive('forward')} 
            onRelease={stopContinuousDrive}
          />
          <ControlButton 
            icon={<ArrowDown />} 
            className="absolute bottom-0 left-1/2 -translate-x-1/2" 
            onHold={() => startContinuousDrive('backward')} 
            onRelease={stopContinuousDrive}
          />
          <ControlButton 
            icon={<ArrowLeft />} 
            className="absolute left-0 top-1/2 -translate-y-1/2" 
            onHold={() => startContinuousDrive('left')} 
            onRelease={stopContinuousDrive}
          />
          <ControlButton 
            icon={<ArrowRight />} 
            className="absolute right-0 top-1/2 -translate-y-1/2" 
            onHold={() => startContinuousDrive('right')} 
            onRelease={stopContinuousDrive}
          />
          <ControlButton 
            icon={<StopCircle className="text-red-400 w-8 h-8" />} 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-red-500/30" 
            onHold={stopContinuousDrive} 
            onRelease={() => {}}
          />
        </div>
      </div>

      {/* Speed Slider */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
        <div className="flex justify-between text-xs text-gray-400 font-mono">
          <span>SPEED LIMIT</span>
          <span className="text-cyan-400 font-bold">{speed}%</span>
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
          className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Campus Obstacles Control */}
      <div className="bg-white/5 border border-cyan-500/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">Campus Obstacles</span>
          </div>
          <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full border border-cyan-500/40">
            {obstacleCount} Entities
          </span>
        </div>

        {/* Stepper + Slider */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSetObstacleCount && onSetObstacleCount(Math.max(0, obstacleCount - 1))}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all border border-white/10"
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <input 
            type="range"
            min={0}
            max={30}
            step={1}
            value={obstacleCount}
            onChange={(e) => onSetObstacleCount && onSetObstacleCount(Number(e.target.value))}
            className="flex-1 accent-cyan-400 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
          />

          <button
            onClick={() => onSetObstacleCount && onSetObstacleCount(Math.min(30, obstacleCount + 1))}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all border border-white/10"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {[
            { label: '0 None', val: 0 },
            { label: '5 Low', val: 5 },
            { label: '10 Norm', val: 10 },
            { label: '20 High', val: 20 },
          ].map(p => (
            <button
              key={p.val}
              onClick={() => onSetObstacleCount && onSetObstacleCount(p.val)}
              className={`py-1 rounded-lg text-[10px] font-bold font-mono transition-all ${
                obstacleCount === p.val
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon, className, onHold, onRelease }: any) {
  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    onHold();
  };

  const handleUp = (e: React.PointerEvent) => {
    e.preventDefault();
    onRelease();
  };

  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
      style={{ touchAction: 'none' }}
      className={`w-20 h-20 select-none rounded-full bg-[#0f172a] border border-white/10 flex items-center justify-center text-white active:bg-cyan-500/20 active:border-cyan-500 active:scale-95 transition-all shadow-xl cursor-pointer ${className}`}
    >
      <div className="[&>svg]:w-8 [&>svg]:h-8 pointer-events-none">{icon}</div>
    </button>
  );
}
