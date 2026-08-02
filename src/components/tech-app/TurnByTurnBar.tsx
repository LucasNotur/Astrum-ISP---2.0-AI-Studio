import React from 'react';

interface TurnByTurnBarProps {
  icon: string;
  instruction: string;
  distance: string;
  nextInstruction?: string;
}

export function TurnByTurnBar({ icon, instruction, distance, nextInstruction }: TurnByTurnBarProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 safe-area-top">
      <div className="mx-3 mt-3 bg-indigo-700/95 backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Main instruction */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-3xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">{instruction}</p>
            <p className="text-indigo-200 text-xs mt-0.5">{distance}</p>
          </div>
        </div>

        {/* Next instruction preview */}
        {nextInstruction && (
          <div className="px-4 py-2 bg-indigo-800/50 border-t border-indigo-600/30">
            <p className="text-indigo-300 text-xs truncate">Depois: {nextInstruction}</p>
          </div>
        )}
      </div>
    </div>
  );
}
