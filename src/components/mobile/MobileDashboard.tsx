import { useState } from 'react';
import { Battery, Gauge, Navigation, Utensils, Cross, Sliders, Eye, ChevronRight, Compass } from 'lucide-react';
import { DeliveryModal } from '../DeliveryModal';

export function MobileDashboard({ telemetry, isConnected, sendCommand, obstacleCount = 9, onSetObstacleCount, visionFrame, onOpenVision }: any) {
  const [modalType, setModalType] = useState<'food' | 'medical' | null>(null);

  if (!telemetry) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-gray-500 font-mono text-sm">
        WAITING FOR TELEMETRY...
      </div>
    );
  }

  const getBatteryColor = (level: number) => {
    if (level > 60) return 'text-green-400';
    if (level > 20) return 'text-yellow-400';
    return 'text-red-400 animate-pulse';
  };

  const handleDeliverySubmit = (missionText: string) => {
    sendCommand('execute_console_command', { command: missionText });
    setModalType(null);
  };

  return (
    <>
      <div className="p-4 space-y-4">
        {/* Robot Status Banner */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 font-mono mb-1">SYSTEM STATE</div>
            <div className={`font-bold text-lg uppercase tracking-wider ${isConnected ? 'text-cyan-400' : 'text-red-500'}`}>
              {isConnected ? telemetry.state : 'OFFLINE'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 font-mono mb-1">UPTIME</div>
            <div className="font-mono text-sm text-white">02:14:31</div>
          </div>
        </div>

        {/* Live Robot Vision Quick Preview Card */}
        <div 
          onClick={onOpenVision}
          className="bg-[#0b1329] border border-cyan-500/40 hover:border-cyan-400 rounded-2xl p-3.5 shadow-[0_0_25px_rgba(6,182,212,0.15)] flex flex-col gap-2.5 transition-all cursor-pointer group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                  ROBOT VISION FEED
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                </span>
                <span className="text-[10px] text-gray-400 font-mono block">
                  {visionFrame?.detectedObjects?.length ? `${visionFrame.detectedObjects.length} Targets in FOV` : 'YOLOv8 Real-Time FPV Stream'}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-cyan-400 font-mono font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
              OPEN CAM <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Thumbnail preview */}
          <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center">
            {visionFrame?.image ? (
              <img 
                src={visionFrame.image} 
                alt="Robot Vision Preview" 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-cyan-400/60 gap-1 font-mono text-[10px]">
                <Eye className="w-6 h-6 animate-pulse" />
                <span>CONNECTING SENSOR FEED...</span>
              </div>
            )}
            
            {/* Top Badges */}
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[9px] font-mono text-cyan-300 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
              LIVE FPV
            </div>

            {visionFrame?.heading !== undefined && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[9px] font-mono text-gray-300 flex items-center gap-1">
                <Compass className="w-3 h-3 text-cyan-400" />
                {visionFrame.heading}°
              </div>
            )}

            <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[9px] font-mono text-gray-300 bg-black/75 px-2 py-1 rounded backdrop-blur-sm">
              <span>HD 70° OPTICAL CONE</span>
              <span className="text-cyan-400 font-bold">TAP TO EXPAND</span>
            </div>
          </div>
        </div>

        {/* Quick Services */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => setModalType('food')}
            className="bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Utensils className="w-8 h-8 text-orange-400" />
            <span className="text-orange-400 font-bold text-xs uppercase tracking-wider">Food Delivery</span>
          </button>
          <button 
            onClick={() => setModalType('medical')}
            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Cross className="w-8 h-8 text-red-400" />
            <span className="text-red-400 font-bold text-xs uppercase tracking-wider">Medical Delivery</span>
          </button>
        </div>

        {/* Grid Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard 
            icon={<Battery />} 
            label="BATTERY" 
            value={`${telemetry.battery.toFixed(1)}%`} 
            valueClass={getBatteryColor(telemetry.battery)} 
          />
          <StatCard 
            icon={<Sliders />} 
            label="OBSTACLES" 
            value={`${obstacleCount} Active`} 
            valueClass="text-purple-400" 
          />
          <StatCard 
            icon={<Gauge />} 
            label="SPEED" 
            value={`${telemetry.speed.toFixed(1)} m/s`} 
            valueClass="text-yellow-400" 
          />
          <StatCard 
            icon={<Navigation />} 
            label="LOCATION" 
            value={`${telemetry.position.x.toFixed(0)}, ${telemetry.position.y.toFixed(0)}`} 
            valueClass="text-white font-mono text-xs" 
          />
        </div>

        {/* Quick Obstacle Density Presets */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Sliders className="w-3.5 h-3.5" />
              CAMPUS TRAFFIC
            </span>
            <span className="text-white font-bold">{obstacleCount} Entities</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: 'Clear', val: 0 },
              { label: 'Light (5)', val: 5 },
              { label: 'Med (10)', val: 10 },
              { label: 'Heavy (20)', val: 20 },
            ].map(p => (
              <button
                key={p.val}
                onClick={() => onSetObstacleCount && onSetObstacleCount(p.val)}
                className={`py-1 rounded text-[10px] font-bold font-mono transition-all ${
                  obstacleCount === p.val
                    ? 'bg-cyan-500 text-black shadow-md'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {modalType && (
        <DeliveryModal
          type={modalType}
          onClose={() => setModalType(null)}
          onSubmit={handleDeliverySubmit}
        />
      )}
    </>
  );
}

function StatCard({ icon, label, value, valueClass = "text-white" }: any) {
  return (
    <div className="bg-[#0f172a]/50 border border-white/5 p-4 rounded-xl flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-400">
        <div className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4">{icon}</div>
        <span className="text-[10px] font-bold tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-black ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
