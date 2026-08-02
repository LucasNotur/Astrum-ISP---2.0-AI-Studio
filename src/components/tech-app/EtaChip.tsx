import React from 'react';
import { Clock } from 'lucide-react';
import { formatDistance, formatDuration } from '../../lib/osrm';

interface EtaChipProps {
  distance: number;
  duration: number;
}

export function EtaChip({ distance, duration }: EtaChipProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 backdrop-blur rounded-full text-white shadow-lg">
      <Clock size={14} className="text-indigo-400" />
      <span className="text-sm font-semibold">{formatDuration(duration)}</span>
      <span className="text-zinc-500 text-xs">•</span>
      <span className="text-xs text-zinc-400">{formatDistance(distance)}</span>
    </div>
  );
}
