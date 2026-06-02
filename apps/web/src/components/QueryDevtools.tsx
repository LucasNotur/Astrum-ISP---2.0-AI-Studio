import { lazy, Suspense } from 'react';

// Carregar devtools apenas em desenvolvimento (tree-shaken em produção)
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then(m => ({
        default: m.ReactQueryDevtools,
      }))
    )
  : null;

export function QueryDevtools() {
  if (!ReactQueryDevtools || !import.meta.env.DEV) return null;

  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools initialIsOpen={false} />
    </Suspense>
  );
}
