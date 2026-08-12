import React, { useState } from 'react';
import { Utensils, Cross, X, Send } from 'lucide-react';

interface DeliveryModalProps {
  type: 'food' | 'medical';
  onClose: () => void;
  onSubmit: (missionText: string) => void;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({ type, onClose, onSubmit }) => {
  const [item, setItem] = useState('');
  const [destination, setDestination] = useState('');

  const isFood = type === 'food';
  const Icon = isFood ? Utensils : Cross;
  const title = isFood ? 'Food Delivery Request' : 'Medical Delivery Request';
  const source = isFood ? 'Food Court' : 'Medical Center';
  const itemPlaceholder = isFood ? 'e.g., Pizza, Coffee, Burger' : 'e.g., First Aid Kit, Paracetamol';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (item.trim() && destination.trim()) {
      const missionText = `pick up ${item.trim()} from ${source} and deliver to ${destination.trim()}`;
      onSubmit(missionText);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f172a] border border-white/10 p-6 rounded-2xl shadow-2xl flex flex-col gap-4 w-[90%] max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-lg font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <Icon className="w-5 h-5" /> {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {isFood ? 'What food would you like?' : 'What medical item is needed?'}
            </label>
            <input
              type="text"
              required
              value={item}
              onChange={e => setItem(e.target.value)}
              placeholder={itemPlaceholder}
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Delivery Destination
            </label>
            <input
              type="text"
              required
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="e.g., Library, Room 101, Computer Science"
              className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={!item.trim() || !destination.trim()}
            className="mt-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 text-white py-3 rounded-lg font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
          >
            <Send className="w-4 h-4" /> Dispatch Robot
          </button>
        </form>
      </div>
    </div>
  );
};
