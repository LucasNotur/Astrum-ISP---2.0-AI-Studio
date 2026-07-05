import { useQuery } from '@tanstack/react-query';
import { fetchPublicFlags } from '@/src/lib/feature-flags';

const QUERY_KEY = ['public-flags'];

/**
 * Hook fail-closed para feature flags públicas.
 *
 * - loading ou erro → retorna flags vazio.
 * - staleTime de 60s (sincronizado com o Cache-Control do backend).
 * - retry apenas 1 vez.
 */
export function useFeatureFlags() {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPublicFlags,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    flags: data ?? {},
    isLoading,
  };
}
