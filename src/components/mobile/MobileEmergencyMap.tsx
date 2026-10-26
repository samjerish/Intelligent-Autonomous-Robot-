import { useState } from 'react';
import { Target, X, Check } from 'lucide-react';

export function MobileEmergencyMap({ sendCommand, mapData, telemetry }: any) {
  const [target, setTarget] = useState<{ x: number, y: number } | null>(null);

  const handleMapTap = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / rect.width * 120);
    const y = Math.floor((e.clientY - rect.top) / rect.height * 100);
    setTarget({ x, y });
  };

  const handleConfirm = () => {
    if (target) {
      sendCommand('emergency_target', target);
      setTarget(null);
      alert('Target coordinates transmitted!');
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
          <Target className="w-6 h-6" /> Emergency Target
        </h2>
        <p className="text-xs text-gray-400 font-mono mt-1">TAP MAP TO SET EMERGENCY OVERRIDE COORDINATES</p>
      </div>

      {/* Map Area */}
      <div 
        className="flex-1 bg-[#0f172a] border-2 border-red-500/20 rounded-xl relative overflow-hidden"
      >
        <svg 
          viewBox="0 0 120 100" 
          preserveAspectRatio="none" 
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onClick={handleMapTap}
        >
          {/* Base Grid Overlay */}
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="0.5"/>
          </pattern>
          <rect width="120" height="100" fill="url(#grid)" />

          {/* Render Rooms */}
          {mapData?.rooms?.map((room: any) => {
            const width = room.end.x - room.start.x + 1;
            const height = room.end.y - room.start.y + 1;
            return (
              <g key={room.id}>
                <rect 
                  x={room.start.x} 
                  y={room.start.y} 
                  width={width} 
                  height={height} 
                  fill={room.color} 
                  fillOpacity="0.4"
                  stroke={room.color}
                  strokeWidth="0.5"
                />
                <text 
                  x={room.start.x + width / 2} 
                  y={room.start.y + height / 2} 
                  fill="white" 
                  fontSize="2.5" 
                  textAnchor="middle" 
                  alignmentBaseline="middle"
                  className="font-mono font-bold pointer-events-none drop-shadow-md"
                >
                  {room.name.split(' ').map((word: string, i: number) => (
                     <tspan key={i} x={room.start.x + width/2} dy={i === 0 ? 0 : 3}>{word}</tspan>
                  ))}
                </text>
              </g>
            );
          })}

          {/* Render Robot Position */}
          {telemetry?.position && (
             <circle 
               cx={telemetry.position.x} 
               cy={telemetry.position.y} 
               r="1.5" 
               fill="#3b82f6" 
               className="animate-pulse"
             />
          )}

          {/* Target Reticle */}
          {target && (
            <g transform={`translate(${target.x}, ${target.y})`}>
              <circle r="2.5" fill="none" stroke="red" strokeWidth="0.5" className="animate-ping" />
              <circle r="0.5" fill="white" />
              <path d="M 0 -3 L 0 -1 M 0 1 L 0 3 M -3 0 L -1 0 M 1 0 L 3 0" stroke="red" strokeWidth="0.3" />
            </g>
          )}
        </svg>
      </div>

      {/* Target Info */}
      <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 min-h-[120px]">
        {target ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="text-[10px] text-gray-400 font-mono mb-1">SELECTED TARGET</div>
                <div className="font-mono text-lg text-white">
                  LAT: {target.x.toFixed(2)} <br/>
                  LNG: {target.y.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-mono mb-1">EST DISTANCE</div>
                <div className="font-mono text-lg text-yellow-400">14.2m</div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setTarget(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold tracking-widest border border-white/10"
              >
                <X className="w-4 h-4" /> CANCEL
              </button>
              <button 
                onClick={handleConfirm}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold tracking-widest"
              >
                <Check className="w-4 h-4" /> CONFIRM
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 font-mono text-sm text-center">
            AWAITING COORDINATE SELECTION...
          </div>
        )}
      </div>
    </div>
  );
}
