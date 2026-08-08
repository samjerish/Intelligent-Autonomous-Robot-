import React from 'react';
import type { Strategy } from '../types';
import { Lightbulb, Info } from 'lucide-react';

interface ExplainableAIProps {
  strategy: Strategy | null;
}

export const ExplainableAI: React.FC<ExplainableAIProps> = ({ strategy }) => {
  if (!strategy) return null;

  return (
    <div className="bg-surface rounded-xl p-6 border border-border shadow-lg mt-4">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-brand">
        <Lightbulb className="w-5 h-5" /> Explainable AI
      </h2>
      <div className="flex gap-4 p-4 bg-brand/10 border border-brand/20 rounded-lg text-text">
        <div className="mt-1">
          <Info className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h3 className="font-medium text-lg mb-1">Why was this strategy chosen?</h3>
          <p className="text-text-muted leading-relaxed">
            {strategy.description} The system determined a score of {strategy.score} based on the balance of {strategy.time} travel time, {strategy.energy} energy consumption, and {strategy.risk.toLowerCase()} risk profile, aligning with the mission constraints.
          </p>
        </div>
      </div>
    </div>
  );
};
