import React from 'react';
import { History, Download, Trash2 } from 'lucide-react';
import type { MissionHistoryItem } from '../types';

interface SidebarProps {
  history: MissionHistoryItem[];
  onSelectMission: (mission: MissionHistoryItem) => void;
  onClearHistory: () => void;
  onExport: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ history, onSelectMission, onClearHistory, onExport }) => {
  return (
    <div className="w-full h-full flex flex-col bg-transparent">
      <div className="p-4 border-b border-white/10 flex items-center justify-between text-gray-200">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <History className="w-5 h-5" /> History
        </h2>
        <div className="flex gap-2">
          <button onClick={onExport} title="Export mission.json" className="p-1 hover:text-brand transition-colors">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClearHistory} title="Clear History" className="p-1 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 ? (
          <p className="text-text-muted text-sm text-center">No previous missions.</p>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectMission(item)}
              className="p-3 bg-white/5 rounded-lg cursor-pointer hover:border-cyan-500 border border-white/10 transition-all backdrop-blur-sm"
            >
              <p className="text-sm line-clamp-2 text-gray-300">{item.mission}</p>
              <span className="text-xs text-text-muted mt-2 block">
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
