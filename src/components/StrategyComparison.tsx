import React from 'react';
import type { Strategy } from '../types';
import { Clock, Battery, ShieldAlert, CheckCircle2, Zap } from 'lucide-react';

interface StrategyComparisonProps {
  strategies: Strategy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const StrategyComparison: React.FC<StrategyComparisonProps> = ({ strategies, selectedId, onSelect }) => {
  if (strategies.length === 0) return null;

  const bestScore = Math.max(...strategies.map(s => s.score));

  return (
    <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-md flex flex-col gap-3">
      <h2 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
        <Zap className="w-3.5 h-3.5" /> Strategy Analysis
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-2">
        {strategies.map((strategy) => {
          const isSelected = strategy.id === selectedId;
          const isBest = strategy.score === bestScore;

          return (
            <div
              key={strategy.id}
              onClick={() => onSelect(strategy.id)}
              className={`relative rounded-xl p-3 border cursor-pointer transition-all duration-300 overflow-hidden w-full ${
                isSelected ? 'border-cyan-500 bg-cyan-900/20' : 'border-white/10 bg-white/5 hover:border-cyan-500/50'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className={`text-sm font-bold ${strategy.color}`}>{strategy.name}</h3>
                <div className="flex items-center gap-2">
                  {isBest && <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Optimal</span>}
                  <span className={`text-sm font-black ${isBest ? 'text-yellow-400' : 'text-text'}`}>{strategy.score}</span>
                </div>
              </div>
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
                <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 rounded">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-400"/> Time</span>
                  <span className="font-semibold text-text">{strategy.time}</span>
                </div>
                <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 rounded">
                  <span className="flex items-center gap-1.5"><Battery className="w-3.5 h-3.5 text-green-400"/> Power</span>
                  <span className="font-semibold text-text">{strategy.energy}</span>
                </div>
                <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 rounded">
                  <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-red-400"/> Risk</span>
                  <span className="font-semibold text-text">{strategy.risk}</span>
                </div>
                <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 rounded">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-purple-400"/> Conf</span>
                  <span className="font-semibold text-text">{strategy.confidence}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
