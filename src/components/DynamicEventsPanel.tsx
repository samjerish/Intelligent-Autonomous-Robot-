import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DynamicEvent {
  type: string;
  position: { x: number; y: number } | null;
}

interface DynamicEventsPanelProps {
  events: DynamicEvent[];
}

export const DynamicEventsPanel: React.FC<DynamicEventsPanelProps> = ({ events }) => {
  if (events.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl p-6 border border-border shadow-lg mt-4">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-red-400">
        <AlertTriangle className="w-5 h-5" /> Dynamic Events Log
      </h2>
      <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
        {events.map((event, idx) => (
          <div key={idx} className="flex gap-3 items-start p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
            <span className="font-medium text-red-400 uppercase">[{event.type.replace('_', ' ')}]</span>
            <span className="text-text-muted">
              {event.type === 'battery_warning' 
                ? 'Battery level dropped unexpectedly. Recalculating safe return route.'
                : `Detected at (${event.position?.x}, ${event.position?.y}). Planner recalculated the route.`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
