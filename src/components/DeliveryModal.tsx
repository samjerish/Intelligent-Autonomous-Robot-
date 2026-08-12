import React, { useState } from 'react';
import { Utensils, Cross, X, Send, Activity, Navigation2 } from 'lucide-react';

interface DeliveryModalProps {
  type: 'food' | 'medical';
  initialDestination?: string;
  onClose: () => void;
  onSubmit: (missionText: string) => void;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({ type, initialDestination = '', onClose, onSubmit }) => {
  const [item, setItem] = useState('');
  const [destination, setDestination] = useState(initialDestination);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFood = type === 'food';
  const Icon = isFood ? Utensils : Cross;
  const title = isFood ? 'Food Delivery Request' : 'Medical Assistance';
  const source = isFood ? 'Food Court' : 'Medical Center';
  const itemPlaceholder = isFood ? 'e.g., Pizza, Coffee, Burger' : 'e.g., First Aid Kit, Paracetamol';

  // Dynamic Tailwind styles depending on type
  const bgGradient = isFood ? 'from-orange-500/20' : 'from-rose-500/20';
  const borderGlow = isFood ? 'border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.15)]' : 'border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.15)]';
  const buttonGradient = isFood ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/30' : 'bg-gradient-to-r from-rose-500 to-pink-500 shadow-rose-500/30';
  const iconBg = isFood ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' : 'bg-rose-500/20 border-rose-500/30 text-rose-400';
  const largeWatermark = isFood ? 'text-orange-500/5' : 'text-rose-500/5';
  const inputFocus = isFood ? 'focus:border-orange-500 focus:ring-1 focus:ring-orange-500' : 'focus:border-rose-500 focus:ring-1 focus:ring-rose-500';
  const iconFocus = isFood ? 'group-focus-within:text-orange-400' : 'group-focus-within:text-rose-400';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (item.trim() && destination.trim()) {
      setIsSubmitting(true);
      // Brief timeout to show off the fancy button spinner state before dispatching
      setTimeout(() => {
        const missionText = `pick up ${item.trim()} from ${source} and deliver to ${destination.trim()}`;
        onSubmit(missionText);
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className={`relative overflow-hidden bg-black/80 border ${borderGlow} p-8 rounded-[2rem] flex flex-col gap-6 w-[90%] max-w-lg animate-in zoom-in-95 duration-300`} 
        onClick={e => e.stopPropagation()}
      >
        {/* Decorative Background Elements */}
        <div className={`absolute top-0 left-0 w-full h-48 bg-gradient-to-b ${bgGradient} to-transparent opacity-60 pointer-events-none`}></div>
        <Icon className={`absolute -right-8 -top-8 w-64 h-64 ${largeWatermark} rotate-12 pointer-events-none`} />

        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-2xl border ${iconBg}`}>
              <Icon className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-widest">
              {title}
            </h2>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative z-10 flex flex-col gap-5 mt-2">
          <div className="flex flex-col gap-2 group">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-focus-within:text-white transition-colors">
              {isFood ? 'What food would you like?' : 'What medical item is needed?'}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={item}
                onChange={e => setItem(e.target.value)}
                placeholder={itemPlaceholder}
                className={`w-full bg-black/50 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none ${inputFocus} transition-all`}
              />
              <Activity className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 ${iconFocus} transition-colors`} />
            </div>
          </div>

          <div className="flex flex-col gap-2 group">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-focus-within:text-white transition-colors">
              Delivery Destination
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="e.g., Library, Room 101, Computer Science"
                className={`w-full bg-black/50 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none ${inputFocus} transition-all`}
              />
              <Navigation2 className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 ${iconFocus} transition-colors`} />
            </div>
          </div>

          <button
            type="submit"
            disabled={!item.trim() || !destination.trim() || isSubmitting}
            className={`mt-4 ${buttonGradient} disabled:opacity-50 disabled:grayscale text-white py-4 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-lg relative overflow-hidden`}
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Dispatching...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" /> Dispatch Robot
              </>
            )}
            
            {/* Shimmer overlay on active button */}
            {!isSubmitting && item.trim() && destination.trim() && (
               <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
