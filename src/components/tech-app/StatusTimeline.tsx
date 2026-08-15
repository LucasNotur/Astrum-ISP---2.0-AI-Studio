import React from 'react';
import { Check } from 'lucide-react';
import { tech } from './theme';

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
              <div
                className="flex-1 h-0.5"
                style={{ background: isDone ? tech.accent : tech.border }}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: isDone ? tech.accent : tech.elevated,
                  color: isDone ? tech.onAccent : tech.textMuted,
                  border: isDone ? 'none' : `1px solid ${tech.border}`,
                  boxShadow: isCurrent ? `0 0 0 3px ${tech.accentBorder}` : 'none',
                }}
              >
                {isDone && idx < currentIdx ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </div>
              <span
                className="text-[9px] mt-1.5 whitespace-nowrap font-medium"
                style={{ color: isDone ? tech.accent : tech.textMuted }}
              >
                {phase.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
