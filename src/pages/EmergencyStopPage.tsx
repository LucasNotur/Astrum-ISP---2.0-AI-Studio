import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '@/src/lib/apiClient';

interface EmergencyStopStatus {
  active: boolean;
  reason?: string;
  activatedAt?: string;
  activatedBy?: string;
}

export default function EmergencyStopPage() {
  const [status, setStatus] = useState<EmergencyStopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await apiGet<EmergencyStopStatus>('/api/v2/atendimento/emergency-stop');
      setStatus(data);
    } catch (e) {
      toast.error('Erro ao buscar estado do freio de emergência');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const activate = async () => {
    if (!reason.trim()) {
      toast.error('Descreva o motivo antes de ativar.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/api/v2/atendimento/emergency-stop', { reason: reason.trim() });
      toast.success('Parada de emergência ATIVADA — a IA parou de responder automaticamente.');
      setReason('');
      setConfirming(false);
      await fetchStatus();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao ativar a parada de emergência');
    } finally {
      setSubmitting(false);
    }
  };

  const resume = async () => {
    setSubmitting(true);
    try {
      await apiPost('/api/v2/atendimento/emergency-resume', {});
      toast.success('Atendimento IA retomado.');
      await fetchStatus();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao retomar o atendimento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Freio de Emergência — Atendimento IA</h2>
          <p className="text-zinc-500">Suspende TODA resposta automática da IA (WhatsApp/canais), globalmente.</p>
        </div>
        <Button onClick={fetchStatus} variant="outline" className="gap-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </Button>
      </div>

      <Card className={status?.active ? 'border-red-500' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status?.active ? (
              <ShieldAlert size={20} className="text-red-500" />
            ) : (
              <ShieldCheck size={20} className="text-green-500" />
            )}
            Estado atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
            <span className="text-sm font-medium">Atendimento IA</span>
            <Badge variant={status?.active ? 'destructive' : 'default'} className={!status?.active ? 'bg-green-500' : ''}>
              {status?.active ? 'PARADO (EMERGÊNCIA)' : 'ATIVO NORMAL'}
            </Badge>
          </div>

          {status?.active && (
            <div className="text-sm space-y-1 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg">
              <p><span className="text-zinc-500">Motivo:</span> {status.reason}</p>
              <p><span className="text-zinc-500">Ativado em:</span> {status.activatedAt ? new Date(status.activatedAt).toLocaleString() : '—'}</p>
            </div>
          )}

          {!status?.active ? (
            <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">
                Ativar suspende imediatamente TODA resposta automática (todos os tenants, todos os canais).
                Mensagens de clientes continuam sendo salvas na conversa para atendimento humano — a IA só para de responder sozinha.
              </p>
              {!confirming ? (
                <Button variant="destructive" onClick={() => setConfirming(true)} className="w-full">
                  🛑 Ativar Parada de Emergência
                </Button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Motivo (obrigatório) — ex.: IA respondendo boleto com valor errado"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={activate} disabled={submitting} className="flex-1">
                      Confirmar ativação
                    </Button>
                    <Button variant="outline" onClick={() => { setConfirming(false); setReason(''); }} disabled={submitting}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button onClick={resume} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700">
              ✅ Retomar Atendimento IA
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
