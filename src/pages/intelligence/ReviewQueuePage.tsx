import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSearch } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Skeleton } from '@/src/components/Skeleton';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface OcrItem {
  id: string;
  doc_type: string;
  media_url: string | null;
  extraction: Record<string, unknown>;
  confidence: number;
  review_status: string;
  created_at: string;
}

const DOC_LABELS: Record<string, string> = {
  boleto: 'Boleto',
  energia: 'Conta de Energia',
  concorrente: 'Fatura Concorrente',
  desconhecido: 'Desconhecido',
};

async function fetchQueue(token: string): Promise<{ queue: OcrItem[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/ocr/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function reviewItem(
  token: string,
  id: string,
  action: 'approve' | 'correct',
  corrected?: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/ocr/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, corrected }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function ReviewQueuePage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.reviewqueue === true;
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [editedFields, setEditedFields] = React.useState<Record<string, string>>({});
  const [hasEdited, setHasEdited] = React.useState(false);

  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const queueQuery = useQuery({
    queryKey: ['ocr-queue', token],
    queryFn: () => fetchQueue(token!),
    enabled: !!token && flagOn,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action, corrected }: { id: string; action: 'approve' | 'correct'; corrected?: Record<string, unknown> }) =>
      reviewItem(token!, id, action, corrected),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ocr-queue'] });
      setEditedFields({});
      setHasEdited(false);
      setCurrentIndex((i) => Math.max(0, i));
    },
  });

  if (isFlagsLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <FileSearch size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Revisão de Documentos
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina OCR_MULTILAYOUT_ENABLED=true para ativar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const queue = queueQuery.data?.queue ?? [];
  const current = queue[currentIndex] ?? null;
  const extractionFields = current
    ? Object.entries(current.extraction).filter(([k]) => k !== 'confidence' && k !== 'is_boleto')
    : [];

  function handleFieldChange(key: string, value: string) {
    setEditedFields((prev) => ({ ...prev, [key]: value }));
    setHasEdited(true);
  }

  function handleApprove() {
    if (!current) return;
    mutation.mutate({ id: current.id, action: 'approve' });
  }

  function handleCorrectAndApprove() {
    if (!current) return;
    const corrected = { ...current.extraction };
    for (const [k, v] of Object.entries(editedFields)) {
      (corrected as any)[k] = v;
    }
    mutation.mutate({ id: current.id, action: 'correct', corrected });
  }

  return (
    <div className="space-y-6 p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <FileSearch size={20} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Revisão de Documentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Confirme extrações com baixa confiança.
          </p>
        </div>
      </div>

      {!current ? (
        <EmptyState
          icon={FileSearch}
          title="Nenhum documento aguardando revisão."
          description="Extrações com confiança alta são aprovadas automaticamente."
        />
      ) : (
        <>
          <div className="text-sm text-muted-foreground text-center">
            {currentIndex + 1} de {queue.length}
          </div>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  <Badge variant="outline">{DOC_LABELS[current.doc_type] ?? current.doc_type}</Badge>
                </CardTitle>
                <ConfidenceMeter value={current.confidence} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {current.media_url && (
                <img
                  src={current.media_url}
                  alt="Documento"
                  className="w-full rounded-md border cursor-zoom-in"
                  onClick={(e) => {
                    const el = e.currentTarget;
                    el.classList.toggle('max-h-48');
                    el.classList.toggle('object-cover');
                  }}
                />
              )}
              <div className="space-y-2">
                {extractionFields.map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-muted-foreground">{key}</label>
                    <Input
                      defaultValue={String(value ?? '')}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleApprove}
                  disabled={mutation.isPending}
                >
                  Aprovar
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleCorrectAndApprove}
                  disabled={mutation.isPending || !hasEdited}
                >
                  Corrigir e aprovar
                </Button>
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentIndex >= queue.length - 1}
                  onClick={() => setCurrentIndex((i) => i + 1)}
                >
                  Próximo
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default ReviewQueuePage;
