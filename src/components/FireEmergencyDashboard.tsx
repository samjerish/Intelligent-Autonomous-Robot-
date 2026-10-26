import React, { useState } from 'react';
import type { FireIncident, GridPoint } from '../types';
import { 
  Flame, 
  PhoneCall, 
  MessageSquare, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Camera, 
  X, 
  RotateCcw,
  History,
  Bot
} from 'lucide-react';

interface FireEmergencyDashboardProps {
  activeIncident: FireIncident | null;
  incidentHistory: FireIncident[];
  robotStatus: string;
  robotPos?: GridPoint;
  isPlacingFire: boolean;
  onTogglePlaceFire: () => void;
  onAcknowledge: (incidentId: string) => void;
  onResolve: (incidentId: string) => void;
  onSimulateAtBuilding: (bldgName: string, coords: GridPoint) => void;
}

export const FireEmergencyDashboard: React.FC<FireEmergencyDashboardProps> = ({
  activeIncident,
  incidentHistory,
  robotStatus,
  robotPos,
  isPlacingFire,
  onTogglePlaceFire,
  onAcknowledge,
  onResolve,
  onSimulateAtBuilding: _onSimulateAtBuilding
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoricalIncident, setSelectedHistoricalIncident] = useState<FireIncident | null>(null);

  const displayIncident = selectedHistoricalIncident || activeIncident;

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* Top Emergency Strobe Banner (when active fire is unacknowledged) */}
      {activeIncident && !activeIncident.acknowledgement.is_acknowledged && (
        <div className="bg-gradient-to-r from-red-650 via-red-600 to-orange-600 text-white px-4 py-2.5 rounded-xl shadow-[0_0_30px_rgba(239,68,68,0.6)] border border-red-400 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-black/30 rounded-lg">
              <Flame className="w-5 h-5 text-yellow-300 animate-bounce" />
            </div>
            <div>
              <div className="font-black text-sm tracking-widest uppercase flex items-center gap-2">
                <span>CRITICAL FIRE ALARM ACTIVE</span>
                <span className="bg-black/40 text-[10px] px-2 py-0.5 rounded font-mono border border-white/20">
                  {activeIncident.id}
                </span>
              </div>
              <div className="text-xs text-red-100 font-medium">
                {activeIncident.location.display_location} • Confidence: {Math.round(activeIncident.confidence * 100)}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onAcknowledge(activeIncident.id)}
              className="bg-white text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-md hover:scale-105 cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 text-red-600" />
              <span>Acknowledge</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Monitoring Card */}
      <div className="bg-[#0b101d]/90 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        {/* Subtle accent border */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${activeIncident ? 'bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`} />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${activeIncident ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'}`}>
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black tracking-widest uppercase text-white flex items-center gap-2">
                AI Fire Emergency & Surveillance
                {activeIncident ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    EMERGENCY
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    PATROL CLEAR
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-gray-400 font-mono">
                Continuous YOLOv8 & Multi-Spectral OpenCV Monitoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSimModal(!showSimModal)}
              className="px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              title="Test fire detection at campus buildings"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Simulate Fire</span>
            </button>
            <button
              onClick={onTogglePlaceFire}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                isPlacingFire 
                  ? 'bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
              }`}
              title="Click on the 3D map to deploy simulated fire"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{isPlacingFire ? 'Click 3D Map...' : 'Map Pin Fire'}</span>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="View Incident History"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Simulation Dropdown Modal */}
        {showSimModal && (
          <div className="mb-3 p-3 bg-black/60 border border-orange-500/30 rounded-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> Deploy Test Fire to Campus Landmark:
              </span>
              <button onClick={() => setShowSimModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {quickSimulationTargets.map((tgt) => (
                <button
                  key={tgt.name}
                  onClick={() => {
                    onSimulateAtBuilding(tgt.name, tgt.coords);
                    setShowSimModal(false);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-orange-500/20 text-gray-300 hover:text-orange-200 border border-white/10 hover:border-orange-500/40 text-[11px] font-medium text-left truncate transition-all cursor-pointer"
                >
                  {tgt.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Incident Details or Normal Patrol Monitor */}
        {displayIncident ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
            {/* Left Column: Snapshot & Bounding Box Evidence */}
            <div className="md:col-span-5 bg-black/40 border border-white/10 rounded-xl overflow-hidden flex flex-col justify-between">
              <div className="relative aspect-video bg-black/80 flex items-center justify-center overflow-hidden">
                {displayIncident.snapshot_base64 ? (
                  <img
                    src={displayIncident.snapshot_base64}
                    alt="Fire AI Evidence"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-500 gap-2">
                    <Camera className="w-8 h-8 opacity-40 text-orange-400" />
                    <span className="text-[11px]">AI Vision Frame Capture</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-red-500/50 text-[10px] font-mono text-red-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  YOLOv8 + OpenCV AI
                </div>
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 border border-white/20 text-[10px] font-mono text-gray-300">
                  CONF: {Math.round(displayIncident.confidence * 100)}%
                </div>
              </div>

              <div className="p-2.5 bg-white/5 flex items-center justify-between text-[11px] font-mono text-gray-400">
                <span>Safe Observation Point:</span>
                <span className="text-cyan-400 font-bold">
                  ({displayIncident.safe_observation_point.x}, {displayIncident.safe_observation_point.y})
                </span>
              </div>
            </div>

            {/* Right Column: Incident Telemetry, Location, and Emergency Contacts */}
            <div className="md:col-span-7 flex flex-col justify-between gap-2.5">
              <div className="space-y-2">
                {/* Incident Location */}
                <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-mono flex items-center gap-1 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-red-400" /> Verified Incident Location
                  </div>
                  <div className="text-sm font-bold text-white">
                    {displayIncident.location.display_location}
                  </div>
                  <div className="text-[11px] text-gray-300 font-mono mt-0.5">
                    Building/Zone: <span className="text-cyan-400">{displayIncident.location.building_name}</span> • Level: <span className="text-gray-200">{displayIncident.location.floor}</span>
                  </div>
                  {displayIncident.location.door_coordinate && (
                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                      Fastest Fire Access Door: ({displayIncident.location.door_coordinate.x}, {displayIncident.location.door_coordinate.y})
                    </div>
                  )}
                </div>

                {/* Status Badges Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                    <div className="text-[10px] text-gray-400 font-mono uppercase">Detection Type</div>
                    <div className="font-bold text-orange-400 mt-0.5 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      <span>{displayIncident.detection_type}</span>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                    <div className="text-[10px] text-gray-400 font-mono uppercase">Detection Timestamp</div>
                    <div className="font-bold text-gray-200 mt-0.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{displayIncident.timestamp_formatted}</span>
                    </div>
                  </div>
                </div>

                {/* Response Team Notification Status */}
                <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl space-y-1.5">
                  <div className="text-[10px] text-gray-400 font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>Automated Emergency Dispatch</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      SAFE TEST MODE
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 border border-white/5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      <div>
                        <div className="text-[10px] text-gray-400">SMS Alert:</div>
                        <div className="font-bold text-green-400 uppercase">
                          {displayIncident.notifications.sms_status}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 border border-white/5">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                      <div>
                        <div className="text-[10px] text-gray-400">Automated Call:</div>
                        <div className="font-bold text-green-400 uppercase">
                          {displayIncident.notifications.voice_status}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                {!displayIncident.acknowledgement.is_acknowledged ? (
                  <button
                    onClick={() => onAcknowledge(displayIncident.id)}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Acknowledge Incident</span>
                  </button>
                ) : (
                  <div className="flex-1 bg-green-500/10 border border-green-500/30 text-green-400 font-bold py-1.5 px-3 rounded-xl text-[11px] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span>Acknowledged by {displayIncident.acknowledgement.acknowledged_by || 'Operator'}</span>
                  </div>
                )}

                <button
                  onClick={() => onResolve(displayIncident.id)}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-bold py-2 px-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                  title="Clear incident and resume routine patrol"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resolve & Clear</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Normal State: Robot Patrol Monitoring */
          <div className="py-3 px-2 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="font-bold text-white flex items-center gap-2">
                  <span>Robot Patrol Unit #1</span>
                  <span className="text-gray-400 font-mono text-[11px]">[{robotStatus.toUpperCase()}]</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Vision sensor active. AI fire and smoke hazard detection running continuously.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-center">
                <div className="text-[10px] text-gray-400 font-mono">Robot Position</div>
                <div className="font-bold text-cyan-400 font-mono">
                  {robotPos ? `(${robotPos.x}, ${robotPos.y})` : '--'}
                </div>
              </div>

              <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-center">
                <div className="text-[10px] text-gray-400 font-mono">Total Incidents</div>
                <div className="font-bold text-white font-mono">
                  {incidentHistory.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Incident History Drawer */}
        {showHistory && (
          <div className="mt-3 pt-3 border-t border-white/10 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-cyan-400" /> Incident History Logs ({incidentHistory.length})
              </span>
              {selectedHistoricalIncident && (
                <button
                  onClick={() => setSelectedHistoricalIncident(null)}
                  className="text-xs text-cyan-400 hover:underline cursor-pointer"
                >
                  Return to Active Incident
                </button>
              )}
            </div>

            {incidentHistory.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-500 italic">
                No past fire incidents recorded. Campus status is clean.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {incidentHistory.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedHistoricalIncident(inc)}
                    className={`p-2 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      (displayIncident && displayIncident.id === inc.id)
                        ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                        : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <div>
                        <span className="font-bold font-mono mr-2">{inc.id}</span>
                        <span className="text-gray-400">{inc.location.display_location}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      <span className="text-gray-400">{inc.timestamp_formatted}</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        inc.status === 'ACTIVE_EMERGENCY' ? 'bg-red-500/20 text-red-400' :
                        inc.status === 'ACKNOWLEDGED' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {inc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
