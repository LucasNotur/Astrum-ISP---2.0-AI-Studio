import { infraLogger } from '../logging/logger';

const DAY_MS = 86_400_000;

export function isMemoryDecayEnabled(): boolean {
  return (process.env.MEMORY_DECAY_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function applyDecay<T>(
  items: T[],
  getLastSeen: (item: T) => string | undefined,
  now: Date = new Date(),
  halfLifeDays = 90,
  minWeight = 0.2,
  maxFacts = 10,
): T[] {
  const scored = items.map((item) => {
    const lastSeen = getLastSeen(item);
    if (!lastSeen) return { item, weight: 1 };

    const ageMs = Math.max(0, now.getTime() - new Date(lastSeen).getTime());
    const ageDays = ageMs / DAY_MS;
    const weight = Math.exp(-ageDays / halfLifeDays);

    return { item, weight };
  });

  const filtered = scored.filter((x) => x.weight >= minWeight);
  filtered.sort((a, b) => b.weight - a.weight);

  return filtered.slice(0, maxFacts).map((x) => x.item);
}
