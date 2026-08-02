import React from 'react';
import { Check } from 'lucide-react';

const PHASES = [
  { key: 'aceita', label: 'Aceita' },
  { key: 'em_deslocamento', label: 'A caminho' },
  { key: 'no_local', label: 'No local' },
  { key: 'em_execucao', label: 'Executando' },
  { key: 'concluida', label: 'Concluída' },
];

const STATUS_MAP: Record<string, number> = {
  pending: 0,
  in_progress: 3,
  completed: 4,
};

interface StatusTimelineProps {
  status: string;
  className?: string;
}

export function StatusTimeline({ status, className = '' }: StatusTimelineProps) {
  const currentIdx = STATUS_MAP[status] ?? 0;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {PHASES.map((phase, idx) => {
        const isDone = idx <= currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <React.Fragment key={phase.key}>
            {idx > 0 && (
              <div className={`flex-1 h-0.5 ${isDone ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                  isDone
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                } ${isCurrent ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-zinc-900' : ''}`}
              >
                {isDone && idx < currentIdx ? <Check size={12} /> : idx + 1}
              </div>
              <span className={`text-[9px] mt-1 whitespace-nowrap ${isDone ? 'text-indigo-400' : 'text-zinc-600'}`}>
                {phase.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
