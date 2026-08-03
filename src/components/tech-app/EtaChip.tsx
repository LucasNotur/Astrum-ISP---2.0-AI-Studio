import React from 'react';
import { Clock } from 'lucide-react';
import { formatDistance, formatDuration } from '../../lib/osrm';

interface EtaChipProps {
  distance: number;
  duration: number;
}

export function EtaChip({ distance, duration }: EtaChipProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 backdrop-blur-lg shadow-xl"
      style={{
        background: 'rgba(17,17,17,0.9)',
        borderRadius: '20px',
        border: '1px solid #222',
      }}
    >
      <Clock size={14} style={{ color: '#3D5AFE' }} />
      <span className="text-sm font-bold text-white">{formatDuration(duration)}</span>
      <span style={{ color: '#444' }}>•</span>
      <span className="text-xs" style={{ color: '#888' }}>{formatDistance(distance)}</span>
    </div>
  );
}
