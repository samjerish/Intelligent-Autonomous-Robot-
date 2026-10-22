import { useState, useEffect, useRef } from 'react';
import { 
  Eye, 
  Camera, 
  Lightbulb, 
  Volume2, 
  Flame, 
  Compass, 
  Gauge, 
  Battery, 
  MapPin, 
  Radio, 
  Gamepad2, 
  Crosshair, 
  Check, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  StopCircle
} from 'lucide-react';

interface DetectedObject {
  id: string;
  type: 'fire' | 'smoke' | 'pedestrian' | 'car' | 'obstacle' | 'barricade' | 'building';
  label: string;
  confidence: number;
  distance: number;
  boxPercent: { x: number; y: number; w: number; h: number };
  color: string;
}

interface VisionFrame {
  image: string;
  timestamp: number;
  heading: number;
  speed: number;
  battery: number;
  position: { x: number; y: number };
  robotState: string;
  isNight?: boolean;
  headlights?: boolean;
  nearestObstacleDist: number;
  detectedObjects: DetectedObject[];
  hazardAlert?: boolean;
  hazardType?: string;
}

interface MobileRobotVisionProps {
  visionFrame: VisionFrame | null;
  robotPose?: any;
  mapData?: any;
  sendCommand: (action: string, payload?: any) => void;
  telemetry: any;
  isConnected: boolean;
}

export function MobileRobotVision({ visionFrame, robotPose, mapData: _mapData, sendCommand, telemetry, isConnected }: MobileRobotVisionProps) {
  const [visionMode, setVisionMode] = useState<'yolo' | 'rgb' | 'night' | 'flir'>('yolo');
  const [showDriveOverlay, setShowDriveOverlay] = useState(true);
  const [headlightOn, setHeadlightOn] = useState(false);
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [driveSpeed, setDriveSpeed] = useState(50);
  const [detectionHistory, setDetectionHistory] = useState<Array<{ text: string; time: string; type: string }>>([]);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync headlights from frame if provided
  useEffect(() => {
    if (visionFrame && typeof visionFrame.headlights === 'boolean') {
      setHeadlightOn(visionFrame.headlights);
    }
  }, [visionFrame?.headlights]);

  // Request vision frames when entering screen
  useEffect(() => {
    sendCommand('request_vision');
    const interval = setInterval(() => {
      sendCommand('request_vision');
    }, 4000);
    return () => clearInterval(interval);
  }, [sendCommand]);

  // Track detection events for history feed
  useEffect(() => {
    if (visionFrame?.detectedObjects && visionFrame.detectedObjects.length > 0) {
      const nowStr = new Date().toLocaleTimeString();
      const newItems = visionFrame.detectedObjects.map(obj => ({
        text: `${obj.label} (${obj.confidence}%) at ${obj.distance}m`,
        time: nowStr,
        type: obj.type
      }));
      setDetectionHistory(prev => {
        const merged = [...newItems, ...prev.slice(0, 8)];
        // Deduplicate consecutive identical texts
        return merged.filter((item, idx, arr) => idx === 0 || item.text !== arr[idx - 1].text);
      });
    }
  }, [visionFrame?.timestamp]);

  // Continuous drive for touch buttons
  const startDrive = (direction: string) => {
    sendCommand('manual_move', { direction, speed: driveSpeed });
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = setInterval(() => {
      sendCommand('manual_move', { direction, speed: driveSpeed });
    }, 350);
  };

  const stopDrive = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    sendCommand('manual_stop');
  };

  // Toggle headlights
  const handleToggleHeadlights = () => {
    setHeadlightOn(!headlightOn);
    sendCommand('toggle_headlight');
  };

  // Audio Ping
  const handleAudioPing = () => {
    sendCommand('trigger_audio_ping');
  };

  // Extinguish fire
  const handleExtinguish = () => {
    sendCommand('extinguish_fire');
  };

  // Save current frame as evidence
  const handleCaptureSnapshot = () => {
    if (!visionFrame?.image) return;
    const a = document.createElement('a');
    a.href = visionFrame.image;
    a.download = `ROBOT_VISION_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSnapshotTaken(true);
    setTimeout(() => setSnapshotTaken(false), 2000);
  };

  const heading = visionFrame?.heading ?? robotPose?.heading ?? 0;
  const speed = visionFrame?.speed ?? robotPose?.speed ?? telemetry?.speed ?? 0;
  const battery = visionFrame?.battery ?? robotPose?.battery ?? telemetry?.battery ?? 100;
  const pos = visionFrame?.position ?? (robotPose ? { x: Math.round(robotPose.x), y: Math.round(robotPose.z) } : telemetry?.position ?? { x: 61, y: 81 });
  const robotState = visionFrame?.robotState ?? robotPose?.robotState ?? telemetry?.state ?? 'ACTIVE';
  const nearestObstacle = visionFrame?.nearestObstacleDist ?? 12.0;

  // Vision mode filter styling
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
        return 'contrast(108%) saturate(110%)';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#030712] text-white overflow-y-auto pb-6">
      {/* Top Header & Tactical Info */}
      <div className="px-4 py-2.5 bg-[#0a1122] border-b border-cyan-500/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Eye className="w-5 h-5 text-cyan-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
              ROBOT VISION FPV
              {visionFrame?.hazardAlert && (
                <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/50 text-[9px] animate-pulse">
                  HAZARD IN SIGHT
                </span>
              )}
            </h2>
            <div className="text-[10px] text-gray-400 font-mono">
              YOLOv8 Real-Time Autonomous Stream
            </div>
          </div>
        </div>

        {/* Vision Mode Buttons */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 p-0.5 rounded-lg">
          <button
            onClick={() => setVisionMode('yolo')}
            className={`px-2 py-1 rounded text-[10px] font-bold font-mono transition-all ${
              visionMode === 'yolo' ? 'bg-cyan-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            YOLO
          </button>
          <button
            onClick={() => setVisionMode('night')}
            className={`px-2 py-1 rounded text-[10px] font-bold font-mono transition-all ${
              visionMode === 'night' ? 'bg-emerald-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
            title="Night Vision Mode"
          >
            NIGHT
          </button>
          <button
            onClick={() => setVisionMode('flir')}
            className={`px-2 py-1 rounded text-[10px] font-bold font-mono transition-all ${
              visionMode === 'flir' ? 'bg-orange-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
            title="Thermal FLIR Mode"
          >
            FLIR
          </button>
          <button
            onClick={() => setVisionMode('rgb')}
            className={`px-2 py-1 rounded text-[10px] font-bold font-mono transition-all ${
              visionMode === 'rgb' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Optical RGB"
          >
            RGB
          </button>
        </div>
      </div>

      {/* Main Camera Viewport with Cybernetic HUD */}
      <div className="relative mx-3 mt-3 rounded-2xl overflow-hidden bg-black border-2 border-cyan-500/40 shadow-[0_0_35px_rgba(6,182,212,0.2)] aspect-[4/3] max-h-[50vh] shrink-0 select-none">
        {/* Stream Image */}
        {visionFrame?.image ? (
          <img
            src={visionFrame.image}
            alt="Robot Real-Time Vision Feed"
            style={{ filter: getFilterStyle() }}
            decoding="async"
            className="w-full h-full object-cover will-change-contents"
          />
        ) : (
          /* High-Tech Standby Scanner HUD */
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#060c18] to-[#02050c] relative overflow-hidden">
            {/* Pulsing Radar Ring */}
            <div className="w-40 h-40 rounded-full border border-cyan-500/30 flex items-center justify-center relative animate-pulse">
              <div className="w-28 h-28 rounded-full border border-cyan-500/20 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-cyan-500/40 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></div>
                </div>
              </div>
              <div className="absolute inset-0 border-t-2 border-cyan-400/80 rounded-full animate-spin"></div>
            </div>
            <div className="mt-4 text-center z-10">
              <div className="text-xs font-mono font-bold text-cyan-300 tracking-wider">
                SYNCING OPTICAL SENSOR FEED...
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                Connecting to robot forward camera • Standby radar active
              </div>
            </div>
          </div>
        )}

        {/* Scanlines Effect for Night Vision */}
        {visionMode === 'night' && (
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_60%,rgba(0,40,0,0.4)_100%)] bg-[linear-gradient(rgba(18,255,0,0)_50%,rgba(0,255,0,0.15)_50%)] bg-[length:100%_4px]"></div>
        )}

        {/* Thermal Grid for FLIR */}
        {visionMode === 'flir' && (
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(255,100,0,0.1)_0%,rgba(0,0,80,0.4)_100%)]"></div>
        )}

        {/* ── TACTICAL HUD OVERLAYS ── */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2.5">
          {/* Top HUD Row: Live Badge & Compass Tape */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 border border-white/10 text-[10px] font-mono backdrop-blur-sm">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-red-500 animate-ping' : 'bg-gray-500'}`}></span>
              <span className="font-bold text-white tracking-widest">LIVE FPV</span>
              <span className="text-gray-400">|</span>
              <span className="text-cyan-400 font-mono font-bold">30 FPS ULTRA-SMOOTH</span>
            </div>

            {/* Mini Compass Heading */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-black/70 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 backdrop-blur-sm">
              <Compass className="w-3 h-3 text-cyan-400" />
              <span>{heading}°</span>
              <span className="font-bold text-white">
                {heading >= 338 || heading < 23 ? 'N' :
                 heading >= 23 && heading < 68 ? 'NE' :
                 heading >= 68 && heading < 113 ? 'E' :
                 heading >= 113 && heading < 158 ? 'SE' :
                 heading >= 158 && heading < 203 ? 'S' :
                 heading >= 203 && heading < 248 ? 'SW' :
                 heading >= 248 && heading < 293 ? 'W' : 'NW'}
              </span>
            </div>

            {/* Vision Mode Badge */}
            <div className="px-2 py-0.5 rounded bg-black/70 border border-white/10 text-[10px] font-mono uppercase tracking-wider backdrop-blur-sm text-yellow-400 font-bold">
              {visionMode.toUpperCase()} HUD
            </div>
          </div>

          {/* Center Crosshair & Pitch Ladder */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-24 h-24 flex items-center justify-center opacity-70">
              <Crosshair className="w-16 h-16 text-cyan-400/60 stroke-[1.2]" />
              {/* Pitch Marks */}
              <div className="absolute w-8 h-[1px] bg-cyan-400/40 -top-3"></div>
              <div className="absolute w-12 h-[1px] bg-cyan-400/40 -top-6"></div>
              <div className="absolute w-8 h-[1px] bg-cyan-400/40 -bottom-3"></div>
              <div className="absolute w-12 h-[1px] bg-cyan-400/40 -bottom-6"></div>
              {/* Center Dot */}
              <div className="w-1 h-1 rounded-full bg-cyan-300"></div>
            </div>
          </div>

          {/* YOLO Detection Bounding Boxes SVG Overlay */}
          {(visionMode === 'yolo' || visionMode === 'rgb') && visionFrame?.detectedObjects && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
              {visionFrame.detectedObjects.map((obj) => (
                <g key={obj.id}>
                  {/* Bounding Rectangle */}
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
                  {/* Label Pill */}
                  <rect
                    x={obj.boxPercent.x}
                    y={Math.max(1, obj.boxPercent.y - 4.5)}
                    width={Math.min(38, obj.boxPercent.w * 1.5 + 10)}
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

          {/* Bottom HUD Bar */}
          <div className="flex items-center justify-between text-[10px] font-mono bg-black/80 border border-white/10 rounded-lg px-2.5 py-1 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-cyan-300">
              <MapPin className="w-3 h-3 text-cyan-400" />
              <span>({pos.x}, {pos.y})</span>
            </div>
            <div className="flex items-center gap-1.5 text-yellow-300">
              <Gauge className="w-3 h-3 text-yellow-400" />
              <span>{speed.toFixed(1)} m/s</span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-300">
              <span>OBS: {nearestObstacle.toFixed(1)}m</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Battery className="w-3 h-3 text-emerald-400" />
              <span>{battery}%</span>
            </div>
            <div className="text-gray-400 uppercase font-bold text-[9px]">
              {robotState}
            </div>
          </div>
        </div>

        {/* Hazard Banner Alert */}
        {visionFrame?.hazardAlert && (
          <div className="absolute top-10 inset-x-2 bg-red-600/90 border border-red-400 rounded-lg py-1 px-2.5 flex items-center justify-between text-white text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse z-20">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-yellow-300 animate-bounce" />
              <span>FIRE HAZARD IN SENSOR CONE</span>
            </div>
            <button
              onClick={handleExtinguish}
              className="px-2 py-0.5 rounded bg-white text-red-700 text-[10px] font-black uppercase hover:bg-red-100 active:scale-95 transition-all shadow"
            >
              DISPENSE FOAM
            </button>
          </div>
        )}
      </div>

      {/* Quick Action Toolbar */}
      <div className="px-3 pt-3 grid grid-cols-4 gap-2 shrink-0">
        <button
          onClick={handleCaptureSnapshot}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-wider transition-all border ${
            snapshotTaken
              ? 'bg-green-500/20 text-green-400 border-green-500/50'
              : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10 active:scale-95'
          }`}
        >
          {snapshotTaken ? <Check className="w-4 h-4 text-green-400" /> : <Camera className="w-4 h-4 text-cyan-400" />}
          <span>{snapshotTaken ? 'SAVED' : 'SNAP'}</span>
        </button>

        <button
          onClick={handleToggleHeadlights}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-wider transition-all border ${
            headlightOn
              ? 'bg-yellow-500/25 text-yellow-300 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)]'
              : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10 active:scale-95'
          }`}
        >
          <Lightbulb className={`w-4 h-4 ${headlightOn ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
          <span>{headlightOn ? 'LIGHTS ON' : 'LIGHTS'}</span>
        </button>

        <button
          onClick={handleAudioPing}
          className="py-2 px-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-gray-300 active:scale-95 transition-all"
        >
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <span>HORN</span>
        </button>

        <button
          onClick={() => setShowDriveOverlay(!showDriveOverlay)}
          className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-bold tracking-wider transition-all border ${
            showDriveOverlay
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
              : 'bg-white/5 hover:bg-white/10 text-gray-400 border-white/10'
          }`}
        >
          <Gamepad2 className="w-4 h-4 text-cyan-400" />
          <span>{showDriveOverlay ? 'STEER ON' : 'STEER OFF'}</span>
        </button>
      </div>

      {/* Touch Drive Steering Overlay (Allows driving while watching feed!) */}
      {showDriveOverlay && (
        <div className="mx-3 mt-3 bg-gradient-to-b from-[#0b1329]/90 to-[#070d1e]/95 border border-cyan-500/30 rounded-2xl p-3 shadow-lg flex flex-col items-center relative backdrop-blur-md shrink-0">
          <div className="w-full flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Gamepad2 className="w-3.5 h-3.5" /> FPV Touch Steering
            </span>
            <span className="text-[10px] font-mono text-gray-400">
              HOLD ARROWS TO DRIVE
            </span>
          </div>

          {/* D-Pad Controller */}
          <div className="relative w-48 h-48 select-none">
            {/* Forward */}
            <VisionDriveButton
              icon={<ArrowUp />}
              className="absolute top-0 left-1/2 -translate-x-1/2"
              onHold={() => startDrive('forward')}
              onRelease={stopDrive}
            />
            {/* Backward */}
            <VisionDriveButton
              icon={<ArrowDown />}
              className="absolute bottom-0 left-1/2 -translate-x-1/2"
              onHold={() => startDrive('backward')}
              onRelease={stopDrive}
            />
            {/* Left */}
            <VisionDriveButton
              icon={<ArrowLeft />}
              className="absolute left-0 top-1/2 -translate-y-1/2"
              onHold={() => startDrive('left')}
              onRelease={stopDrive}
            />
            {/* Right */}
            <VisionDriveButton
              icon={<ArrowRight />}
              className="absolute right-0 top-1/2 -translate-y-1/2"
              onHold={() => startDrive('right')}
              onRelease={stopDrive}
            />
            {/* Center Stop */}
            <VisionDriveButton
              icon={<StopCircle className="w-6 h-6 text-red-400" />}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-red-500/40"
              onHold={stopDrive}
              onRelease={() => {}}
            />
          </div>

          {/* Drive Speed Slider */}
          <div className="w-full mt-2 flex items-center gap-2 px-2 text-[10px] font-mono text-gray-400">
            <span>SPEED:</span>
            <input
              type="range"
              min="20"
              max="100"
              value={driveSpeed}
              onChange={(e) => {
                const s = Number(e.target.value);
                setDriveSpeed(s);
                sendCommand('set_speed', { speed: s });
              }}
              className="flex-1 accent-cyan-400 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-cyan-400 font-bold">{driveSpeed}%</span>
          </div>
        </div>
      )}

      {/* AI Perception Live Log Feed */}
      <div className="mx-3 mt-3 bg-[#0a1122] border border-white/10 rounded-xl p-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            AI Perception Feed
          </span>
          <span className="text-[10px] font-mono text-cyan-300">
            {visionFrame?.detectedObjects?.length || 0} Targets in FOV
          </span>
        </div>

        <div className="space-y-1.5 max-h-28 overflow-y-auto font-mono text-[10px]">
          {detectionHistory.length > 0 ? (
            detectionHistory.map((item, idx) => (
              <div
                key={idx}
                className={`p-1.5 rounded bg-white/5 border flex items-center justify-between ${
                  item.type === 'fire'
                    ? 'border-red-500/40 text-red-300 bg-red-950/20'
                    : item.type === 'pedestrian'
                    ? 'border-cyan-500/30 text-cyan-300'
                    : 'border-white/5 text-gray-300'
                }`}
              >
                <span>{item.text}</span>
                <span className="text-gray-500 text-[9px]">{item.time}</span>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-center py-2">
              Sensor scanning corridor ahead • No obstacles in immediate trajectory
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VisionDriveButton({ icon, className, onHold, onRelease }: any) {
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
      className={`w-14 h-14 select-none rounded-full bg-[#0a1428] border border-cyan-500/40 flex items-center justify-center text-cyan-300 active:bg-cyan-500/30 active:border-cyan-400 active:scale-95 transition-all shadow-lg cursor-pointer ${className}`}
    >
      <div className="[&>svg]:w-6 [&>svg]:h-6 pointer-events-none">{icon}</div>
    </button>
  );
}
