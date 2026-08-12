import React, { useState } from 'react';
import { Send, Loader2, Utensils, Cross } from 'lucide-react';
import { DeliveryModal } from './DeliveryModal';

interface MissionInputProps {
  onGenerate: (mission: string) => void;
  isLoading: boolean;
}

export const MissionInput: React.FC<MissionInputProps> = ({ onGenerate, isLoading }) => {
  const [mission, setMission] = useState('');
  const [modalType, setModalType] = useState<'food' | 'medical' | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mission.trim() && !isLoading) {
      onGenerate(mission.trim());
      setMission(''); // Optionally clear input after submission
    }
  };

  const handleDeliverySubmit = (missionText: string) => {
    onGenerate(missionText);
    setModalType(null);
  };

  return (
    <>
      <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/10 shadow-md flex flex-col gap-3">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between font-mono">
          <span>{'>'} USER COMMAND TERMINAL</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModalType('food')}
              className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
              title="Order Food Delivery"
            >
              <Utensils className="w-3 h-3" /> FOOD
            </button>
            <button
              type="button"
              onClick={() => setModalType('medical')}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
              title="Request Medical Delivery"
            >
              <Cross className="w-3 h-3" /> MEDICAL
            </button>
          </div>
        </h2>
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-4 flex items-center justify-center text-cyan-500 font-mono font-bold text-lg">
            $
          </div>
          <input
            type="text"
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            placeholder="Enter command..."
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-10 pr-32 text-cyan-400 placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors text-sm font-mono"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!mission.trim() || isLoading}
            className="absolute right-1.5 bg-white/10 hover:bg-cyan-500 hover:text-black hover:border-cyan-500 disabled:opacity-50 disabled:hover:bg-white/5 disabled:hover:text-white disabled:hover:border-white/5 text-white px-4 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-2 transition-colors border border-white/10"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            ENTER
          </button>
        </form>
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
};
