import React, { useState, useEffect, useRef } from 'react';
import { 
  Eye, 
  Maximize2, 
  Compass, 
  Lightbulb, 
  Flame, 
  Crosshair, 
  X,
  Gauge
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
  onSwitchToFPV: () => void;
}

export const RobotVisionPIP: React.FC<RobotVisionPIPProps> = ({ onClose, onSwitchToFPV }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameData, setFrameData] = useState<any>(null);
  const [headlightOn, setHeadlightOn] = useState(false);
  const [visionMode, setVisionMode] = useState<'normal' | 'night' | 'flir'>('normal');
  const [fps, setFps] = useState(30);
  const frameCountRef = useRef(0);
  const lastFpsCalcRef = useRef(performance.now());

  useEffect(() => {
    const handleVisionFrame = (e: any) => {
      const detail = e.detail;
      if (!detail) return;

      // Update frame telemetry without re-rendering parent SimulationView
      setFrameData(detail);
      if (typeof detail.headlights === 'boolean') {
        setHeadlightOn(detail.headlights);
      }

      // Calculate dynamic FPS
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsCalcRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastFpsCalcRef.current)));
        frameCountRef.current = 0;
        lastFpsCalcRef.current = now;
      }

      // Zero-lag direct canvas painting
      const targetCanvas = canvasRef.current;
      if (targetCanvas) {
        const sourceCanvas = detail.canvas || (window as any).__ROBOT_VISION_CANVAS__;
        if (sourceCanvas) {
          const ctx = targetCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
          }
        }
      }
    };

    window.addEventListener('local_robot_vision_frame', handleVisionFrame);
    return () => window.removeEventListener('local_robot_vision_frame', handleVisionFrame);
  }, []);

  const getFilterStyle = () => {
    switch (visionMode) {
      case 'night':
        return 'contrast(160%) brightness(130%) sepia(100%) hue-rotate(85deg) saturate(300%)';
      case 'flir':
        return 'invert(100%) hue-rotate(180deg) saturate(250%) contrast(150%)';
      default:
        return 'none';
    }
  };

  const detectedObjects: DetectedBox[] = frameData?.detectedObjects || [];
  const heading = frameData?.heading ?? 0;
  const speed = frameData?.speed ?? 0;
  const nearestObstacle = frameData?.nearestObstacleDist ?? 12.0;
  const battery = frameData?.battery ?? 100;
  const hazardAlert = frameData?.hazardAlert;

  return (
    <div className="absolute bottom-6 right-6 w-88 md:w-96 bg-slate-950/95 backdrop-blur-2xl border-2 border-cyan-500/50 rounded-2xl z-[95] overflow-hidden shadow-[0_0_45px_rgba(6,182,212,0.35)] animate-in fade-in slide-in-from-bottom-4 duration-200 select-none">
      {/* Header Bar */}
      <div className="px-3.5 py-2.5 border-b border-cyan-500/30 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div>
            <span className="font-mono font-bold text-xs text-white tracking-wider flex items-center gap-1.5">
              ROBOT VISION FPV
              <span className="text-[9px] text-cyan-400 font-normal px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30">
                {fps} FPS
              </span>
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Switch to Fullscreen Robot Eyes Button */}
          <button
            onClick={onSwitchToFPV}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-white border border-cyan-500/40 text-[10px] font-mono font-bold transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]"
            title="Switch Main Camera to What the Robot Sees (FPV 60 FPS)"
          >
            <Maximize2 className="w-3 h-3 text-cyan-400" />
            <span>FULL EYES</span>
          </button>
          
          <button 
            onClick={onClose} 
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold"
            title="Close Picture-in-Picture"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Viewport with Canvas & Cybernetic HUD */}
      <div className="relative aspect-[4/3] w-full bg-black flex items-center justify-center overflow-hidden">
        {/* Hardware-Accelerated 2D Canvas for Zero-Lag Instant Frame Blit */}
        <canvas 
          ref={canvasRef} 
          width={320} 
          height={240} 
          style={{ filter: getFilterStyle() }}
          className="w-full h-full object-cover"
        />

        {/* Fallback Image if direct canvas not initialized yet */}
        {!frameData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-cyan-400/80 font-mono text-xs gap-2 p-4 text-center bg-black/90">
            <Eye className="w-8 h-8 animate-pulse text-cyan-400" />
            <span className="tracking-widest">CONNECTING ROBOT CAMERA...</span>
            <span className="text-[10px] text-gray-500">Syncing mast sensor optical feed</span>
          </div>
        )}

        {/* Reticle / Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
          <Crosshair className="w-12 h-12 text-cyan-400/70 stroke-[1.2]" />
          <div className="w-1 h-1 rounded-full bg-cyan-300" />
        </div>

        {/* YOLOv8 Detection Bounding Boxes Overlay */}
        {detectedObjects.length > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
            {detectedObjects.map((obj) => (
              <g key={obj.id}>
                <rect
                  x={obj.boxPercent.x}
                  y={obj.boxPercent.y}
                  width={obj.boxPercent.w}
                  height={obj.boxPercent.h}
                  fill="none"
                  stroke={obj.color}
                  strokeWidth="0.9"
                  strokeDasharray={obj.type === 'fire' ? '2 1' : 'none'}
                />
                <rect
                  x={obj.boxPercent.x}
                  y={Math.max(1, obj.boxPercent.y - 5)}
                  width={Math.min(45, obj.boxPercent.w * 1.6 + 12)}
                  height="4.6"
                  fill={obj.color}
                  rx="0.8"
                />
                <text
                  x={obj.boxPercent.x + 1}
                  y={Math.max(4, obj.boxPercent.y - 1.4)}
                  fill="#000000"
                  fontSize="2.7"
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
          <div className="px-2 py-0.5 rounded bg-black/85 border border-cyan-500/30 text-[9px] font-mono text-cyan-300 backdrop-blur-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>REAL-TIME STREAM</span>
          </div>
          {hazardAlert && (
            <div className="px-2 py-0.5 rounded bg-red-600/90 border border-red-400 text-[9px] font-mono font-bold text-white flex items-center gap-1 animate-pulse">
              <Flame className="w-3 h-3 text-yellow-300" />
              <span>HAZARD IN SIGHT</span>
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
          <div className="px-2 py-0.5 rounded bg-black/85 border border-cyan-500/30 text-[9px] font-mono text-cyan-300 backdrop-blur-sm flex items-center gap-1">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>{heading}°</span>
          </div>
        </div>

        {/* Bottom Telemetry Bar */}
        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[9px] font-mono text-gray-300 bg-black/85 border border-white/10 px-2.5 py-1 rounded-lg backdrop-blur-sm z-20">
          <div className="flex items-center gap-1 text-cyan-300">
            <Gauge className="w-3 h-3 text-cyan-400" />
            <span>{speed} m/s</span>
          </div>
          <span className="text-purple-300">OBS: {nearestObstacle}m</span>
          <span className="text-emerald-400">BAT: {battery}%</span>
        </div>
      </div>

      {/* Quick Controls Bar */}
      <div className="p-2.5 bg-slate-900/90 border-t border-cyan-500/20 flex items-center justify-between gap-2">
        {/* Optical Mode Selectors */}
        <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10">
          <button
            onClick={() => setVisionMode('normal')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
              visionMode === 'normal' ? 'bg-cyan-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            RGB
          </button>
          <button
            onClick={() => setVisionMode('night')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
              visionMode === 'night' ? 'bg-emerald-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            NIGHT
          </button>
          <button
            onClick={() => setVisionMode('flir')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
              visionMode === 'flir' ? 'bg-orange-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            FLIR
          </button>
        </div>

        {/* Headlight Toggle */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('remote_toggle_headlight'));
            setHeadlightOn(!headlightOn);
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold border transition-all ${
            headlightOn
              ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
              : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
          }`}
          title="Toggle Robot Front Headlights"
        >
          <Lightbulb className={`w-3 h-3 ${headlightOn ? 'text-amber-400 fill-amber-400' : 'text-gray-400'}`} />
          <span>{headlightOn ? 'LIGHTS ON' : 'LIGHTS'}</span>
        </button>
      </div>
    </div>
  );
};
