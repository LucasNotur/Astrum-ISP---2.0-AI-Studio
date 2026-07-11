import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Input } from './input';

interface FilterBarProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  filters?: React.ReactNode;
  sort?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  value = '',
  onValueChange,
  placeholder = 'Buscar...',
  filters,
  sort,
  className,
}: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative min-w-48 flex-1">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          placeholder={placeholder}
          className="pl-8 h-9 text-sm"
        />
      </div>
      {filters && <div className="flex items-center gap-2">{filters}</div>}
      {sort && <div className="ml-auto">{sort}</div>}
    </div>
  );
}
