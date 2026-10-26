import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  Maximize2, 
  Minimize2, 
  Lightbulb, 
  Camera, 
  Compass, 
  Flame, 
  Crosshair, 
  Check, 
  X, 
  Gauge, 
  Battery 
} from 'lucide-react';

interface DetectedBox {
  id: string;
  type: 'fire' | 'smoke' | 'pedestrian' | 'car' | 'obstacle' | 'barricade' | 'building';
  label: string;
  confidence: number;
  distance: number;
  boxPercent: { x: number; y: number; w: number; h: number };
  color: string;
}

interface RobotVisionPIPProps {
  onClose: () => void;
  isFPV: boolean;
  onToggleFPV: () => void;
  isNight?: boolean;
}

export const RobotVisionPIP: React.FC<RobotVisionPIPProps> = ({
  onClose,
  isFPV,
  onToggleFPV,
  isNight = false
}) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [visionMode, setVisionMode] = useState<'yolo' | 'rgb' | 'night' | 'flir'>(() => isNight ? 'night' : 'yolo');
  const [headlights, setHeadlights] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  // Subscribe to lightweight telemetry updates without causing full SimulationView re-renders
  useEffect(() => {
    const handleTelemetry = (e: any) => {
      setTelemetry(e.detail);
      if (typeof e.detail?.headlights === 'boolean') {
        setHeadlights(e.detail.headlights);
      }
    };
    window.addEventListener('robot_vision_telemetry', handleTelemetry);
    return () => window.removeEventListener('robot_vision_telemetry', handleTelemetry);
  }, []);

  const handleToggleHeadlights = () => {
    window.dispatchEvent(new CustomEvent('remote_toggle_headlight'));
    setHeadlights(prev => !prev);
  };

  const handleCaptureSnapshot = () => {
    const canvas = document.getElementById('robot-pip-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ROBOT_VISION_SNAP_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSnapshotSaved(true);
      setTimeout(() => setSnapshotSaved(false), 2000);
    } catch (err) {
      console.error('Failed to capture robot camera snapshot:', err);
    }
  };

  const getFilterStyle = () => {
    switch (visionMode) {
      case 'night':
        return 'contrast(160%) brightness(130%) sepia(100%) hue-rotate(85deg) saturate(300%)';
      case 'flir':
        return 'invert(100%) hue-rotate(180deg) saturate(250%) contrast(150%)';
      case 'rgb':
        return 'none';
      case 'yolo':
      default:
        return 'contrast(106%) saturate(108%)';
    }
  };

  const heading = telemetry?.heading ?? 0;
  const speed = telemetry?.speed ?? 0;
  const battery = telemetry?.battery ?? 100;
  const nearestObstacle = telemetry?.nearestObstacleDist ?? 12.0;
  const detectedBoxes: DetectedBox[] = telemetry?.detectedObjects || [];
  const hazardAlert = telemetry?.hazardAlert;

  const cardinal = 
    heading >= 338 || heading < 23 ? 'N' :
    heading >= 23 && heading < 68 ? 'NE' :
    heading >= 68 && heading < 113 ? 'E' :
    heading >= 113 && heading < 158 ? 'SE' :
    heading >= 158 && heading < 203 ? 'S' :
    heading >= 203 && heading < 248 ? 'SW' :
    heading >= 248 && heading < 293 ? 'W' : 'NW';

  return (
    <div className="absolute bottom-6 right-6 w-96 max-w-[calc(100vw-32px)] bg-slate-950/95 backdrop-blur-2xl border-2 border-cyan-500/40 rounded-2xl z-[90] overflow-hidden shadow-[0_0_40px_rgba(6,182,212,0.35)] animate-in fade-in slide-in-from-bottom-4 duration-200 select-none">
      {/* Title Bar */}
      <div className="px-3.5 py-2 border-b border-white/10 bg-slate-900/90 flex justify-between items-center select-none">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
          </div>
          <span className="font-mono font-bold text-xs text-white tracking-wider flex items-center gap-1.5">
            ROBOT VISION FPV
            {hazardAlert && (
              <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/50 text-[9px] animate-pulse">
                HAZARD
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Compass pill */}
          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1">
            <Compass className="w-3 h-3 text-cyan-400" />
            {heading}° {cardinal}
          </span>

          {/* Toggle Fullscreen / FPV */}
          <button
            onClick={onToggleFPV}
            className={`w-6 h-6 flex items-center justify-center rounded-lg border transition-colors ${
              isFPV 
                ? 'bg-cyan-500/30 text-cyan-300 border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.4)]' 
                : 'text-gray-400 hover:text-white hover:bg-white/10 border-white/10'
            }`}
            title={isFPV ? "Switch Main View back to Orbit/Follow" : "Switch Main View to Full Robot Eyes View"}
          >
            {isFPV ? <Minimize2 className="w-3.5 h-3.5 text-cyan-300" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close PIP */}
          <button 
            onClick={onClose} 
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
            title="Close Picture-in-Picture View"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Main Viewport Container */}
      <div className="relative aspect-[4/3] w-full bg-black flex items-center justify-center overflow-hidden">
        {/* Direct Hardware-Accelerated 2D Canvas (0ms GPU-to-screen blit) */}
        <canvas 
          id="robot-pip-canvas" 
          width={480} 
          height={360} 
          style={{ filter: getFilterStyle() }}
          className="w-full h-full object-cover"
        />

        {/* Scanlines Effect for Night Vision */}
        {visionMode === 'night' && (
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_60%,rgba(0,40,0,0.4)_100%)] bg-[linear-gradient(rgba(18,255,0,0)_50%,rgba(0,255,0,0.15)_50%)] bg-[length:100%_4px]"></div>
        )}

        {/* Thermal Grid for FLIR */}
        {visionMode === 'flir' && (
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,100,0,0.1)_0%,rgba(0,0,80,0.4)_100%)]"></div>
        )}

        {/* HUD Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
          <Crosshair className="w-12 h-12 text-cyan-400/50 stroke-[1.2]" />
          <div className="w-1 h-1 rounded-full bg-cyan-300"></div>
        </div>

        {/* YOLO Detection Bounding Boxes SVG Overlay */}
        {(visionMode === 'yolo' || visionMode === 'rgb') && detectedBoxes.length > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
            {detectedBoxes.map((obj) => (
              <g key={obj.id}>
                <rect
                  x={obj.boxPercent.x}
                  y={obj.boxPercent.y}
                  width={obj.boxPercent.w}
                  height={obj.boxPercent.h}
                  fill="none"
                  stroke={obj.color}
                  strokeWidth="0.8"
                  strokeDasharray={obj.type === 'fire' ? '2 1' : 'none'}
                  className={obj.type === 'fire' ? 'animate-pulse' : ''}
                />
                {/* Corner Accents */}
                <path
                  d={`
                    M ${obj.boxPercent.x} ${obj.boxPercent.y + 2} L ${obj.boxPercent.x} ${obj.boxPercent.y} L ${obj.boxPercent.x + 2} ${obj.boxPercent.y}
                    M ${obj.boxPercent.x + obj.boxPercent.w - 2} ${obj.boxPercent.y} L ${obj.boxPercent.x + obj.boxPercent.w} ${obj.boxPercent.y} L ${obj.boxPercent.x + obj.boxPercent.w} ${obj.boxPercent.y + 2}
                    M ${obj.boxPercent.x} ${obj.boxPercent.y + obj.boxPercent.h - 2} L ${obj.boxPercent.x} ${obj.boxPercent.y + obj.boxPercent.h} L ${obj.boxPercent.x + 2} ${obj.boxPercent.y + obj.boxPercent.h}
                    M ${obj.boxPercent.x + obj.boxPercent.w - 2} ${obj.boxPercent.y + obj.boxPercent.h} L ${obj.boxPercent.x + obj.boxPercent.w} ${obj.boxPercent.y + obj.boxPercent.h} L ${obj.boxPercent.x + obj.boxPercent.w} ${obj.boxPercent.y + obj.boxPercent.h - 2}
                  `}
                  stroke={obj.color}
                  strokeWidth="1.2"
                  fill="none"
                />
                {/* Label Tag */}
                <rect
                  x={obj.boxPercent.x}
                  y={Math.max(1, obj.boxPercent.y - 4.5)}
                  width={Math.min(42, obj.boxPercent.w * 1.5 + 8)}
                  height="4.2"
                  fill={obj.color}
                  rx="0.8"
                />
                <text
                  x={obj.boxPercent.x + 1}
                  y={Math.max(3.8, obj.boxPercent.y - 1.2)}
                  fill="#000000"
                  fontSize="2.4"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {obj.label} • {obj.distance}m
                </text>
              </g>
            ))}
          </svg>
        )}

        {/* Top Overlay Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20">
          <div className="px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[9px] font-mono text-cyan-300 flex items-center gap-1 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            <span>ROBOT FPV • 60 FPS</span>
          </div>
          {hazardAlert && (
            <div className="px-2 py-0.5 rounded bg-red-600/90 text-white border border-red-400 text-[9px] font-mono font-bold animate-pulse flex items-center gap-1 shadow-[0_0_10px_rgba(239,68,68,0.6)]">
              <Flame className="w-3 h-3 text-yellow-300 animate-bounce" />
              FIRE IN SIGHT
            </div>
          )}
        </div>

        {detectedBoxes.length > 0 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-yellow-500/30 text-[9px] font-mono text-yellow-300 backdrop-blur-sm z-20">
            {detectedBoxes.length} Target{detectedBoxes.length > 1 ? 's' : ''} in FOV
          </div>
        )}

        {/* Bottom Telemetry Bar */}
        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[9px] font-mono text-gray-200 bg-black/85 border border-white/10 px-2 py-1 rounded-lg backdrop-blur-sm z-20">
          <span className="flex items-center gap-1 text-cyan-300">
            <Gauge className="w-3 h-3 text-cyan-400" />
            {speed.toFixed(1)} m/s
          </span>
          <span className="text-purple-300">
            OBS: {nearestObstacle.toFixed(1)}m
          </span>
          <span className="flex items-center gap-1 text-emerald-400">
            <Battery className="w-3 h-3 text-emerald-400" />
            {battery}%
          </span>
        </div>
      </div>

      {/* Control Footer Toolbar */}
      <div className="p-2.5 bg-slate-900/90 border-t border-white/5 flex items-center justify-between gap-2 text-[11px]">
        {/* Vision Mode Filter Switches */}
        <div className="flex items-center gap-0.5 bg-black/50 border border-white/10 p-0.5 rounded-lg">
          {(['yolo', 'night', 'flir', 'rgb'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setVisionMode(mode)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-all ${
                visionMode === mode 
                  ? 'bg-cyan-500 text-black shadow-sm' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Headlights Toggle */}
          <button
            onClick={handleToggleHeadlights}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 font-mono text-[10px] border transition-all ${
              headlights 
                ? 'bg-yellow-500/25 text-yellow-300 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]' 
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
            }`}
            title="Toggle Robot Forward Headlights"
          >
            <Lightbulb className={`w-3 h-3 ${headlights ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
            <span>Lights</span>
          </button>

          {/* Capture Snapshot */}
          <button
            onClick={handleCaptureSnapshot}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 font-mono text-[10px] border transition-all ${
              snapshotSaved 
                ? 'bg-green-500/20 text-green-400 border-green-500/50' 
                : 'bg-white/5 hover:bg-white/10 text-cyan-300 border-white/10'
            }`}
            title="Capture High-Res Photo from Robot Camera"
          >
            {snapshotSaved ? <Check className="w-3 h-3 text-green-400" /> : <Camera className="w-3 h-3 text-cyan-400" />}
            <span>{snapshotSaved ? 'Saved' : 'Snap'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
