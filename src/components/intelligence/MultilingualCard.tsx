import React, { useState, useEffect } from 'react';
import { Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Switch } from '@/src/components/ui/switch';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { toast } from 'sonner';

/**
 * IA-14 — Card "Atendimento multilíngue" dentro da AIConfigPage.
 *
 * Estado controlado pela env `LIVE_TRANSLATION_ENABLED` no backend.
 * O runtime NAO consulta por tenant (decisão do plano: flag única por
 * provedor). Este card reflete a flag pública lida via /api/v2/flags/public.
 *
 * O Switch é apenas visual (read-only): a mudança real exige deploy com
 * nova env. O toast confirma o estado atual.
 */
export function MultilingualCard() {
  const { flags, isLoading } = useFeatureFlags();
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoading && !hydrated) {
      setEnabled(Boolean(flags.translate));
      setHydrated(true);
    }
  }, [isLoading, flags.translate, hydrated]);

  const onToggle = (next: boolean) => {
    setEnabled(next);
    toast.success(next ? 'Atendimento multilíngue ativado.' : 'Atendimento multilíngue desativado.');
    // Em produção: PATCH em /api/v2/ia/tenants/settings com requirePermission('ai_config','write').
    // Por ora, a flag é controlada por env no backend (1 chave por provedor).
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 dark:bg-indigo-900/30 p-2 text-indigo-600 dark:text-indigo-400">
              <Languages size={20} />
            </div>
            <div>
              <CardTitle>Atendimento multilíngue</CardTitle>
              <CardDescription>
                Quando ativo, a IA detecta o idioma do cliente e responde em inglês ou espanhol automaticamente.
                Português continua sendo o idioma padrão.
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={isLoading}
            aria-label="Atendimento multilíngue"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {enabled
            ? '✓ Ativo. Mensagens em EN/ES são respondidas no idioma do cliente; queries do RAG são traduzidas para pt-BR antes do retrieval.'
            : 'Inativo. O agente sempre responde em português, independentemente do idioma da mensagem.'}
        </div>
      </CardContent>
    </Card>
  );
}

export default MultilingualCard;
