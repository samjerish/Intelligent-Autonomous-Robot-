import { Battery, Wifi, Gauge, Navigation } from 'lucide-react';

export function MobileDashboard({ telemetry, isConnected }: any) {
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

  return (
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

      {/* Grid Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard 
          icon={<Battery />} 
          label="BATTERY" 
          value={`${telemetry.battery.toFixed(1)}%`} 
          valueClass={getBatteryColor(telemetry.battery)} 
        />
        <StatCard 
          icon={<Wifi />} 
          label="SIGNAL" 
          value={`${telemetry.network.toFixed(0)} dBm`} 
          valueClass="text-blue-400" 
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
    </div>
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
