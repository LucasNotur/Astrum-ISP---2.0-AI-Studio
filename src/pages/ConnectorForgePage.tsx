/**
 * F5-01 — Connector Forge (super_admin).
 *
 * UI para o backend D-13 (`connector-forge.routes.ts`), que já existia sem tela:
 *   POST /api/v2/erp/forge      { erpName, apiSpec } → gera adapter via GPT-4o + testa contrato
 *   GET  /api/v2/erp/forge                            → lista drafts
 *   GET  /api/v2/erp/forge/:id                        → draft completo (código + test_results)
 *
 * "Fábrica de integração": onboarde qualquer ERP fora do top-5 sem escrever adapter à mão.
 * A geração usa GPT-4o (requer crédito de LLM). Promover a produção é revisão MANUAL de código
 * (não auto-promovemos código gerado por LLM), então aqui paramos em forjar/testar/revisar.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import {
  Hammer, Loader2, RefreshCw, CheckCircle2, XCircle, FileCode2, Info, ListChecks,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { apiGet, apiPost } from '@/src/lib/apiClient';
import { toast } from 'sonner';

interface TestResult { test: string; passed: boolean; output: string }
interface ForgeResult {
  draftId: string;
  erpName: string;
  status: string;
  generatedCode?: string;
  testResults: TestResult[];
}
interface DraftRow {
  id: string;
  erp_name: string;
  status: string;
  created_at: string;
  test_results?: TestResult[] | null;
}
interface DraftDetail extends DraftRow {
  api_spec?: Record<string, unknown>;
  generated_code?: string | null;
  notes?: string | null;
}

const SAMPLE_SPEC = `{
  "baseUrl": "https://api.meuerp.com.br",
  "auth": { "type": "bearer", "tokenEndpoint": "/oauth/token" },
  "endpoints": {
    "customers":  { "method": "GET",  "path": "/clientes" },
    "invoices":   { "method": "GET",  "path": "/faturas?cliente={id}" },
    "suspend":    { "method": "POST", "path": "/clientes/{id}/suspender" },
    "reactivate": { "method": "POST", "path": "/clientes/{id}/reativar" }
  }
}`;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    testing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    generating: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return map[status] ?? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
}

function TestResultList({ results }: { results: TestResult[] }) {
  if (!results?.length) return null;
  const passed = results.filter((r) => r.passed).length;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <ListChecks size={13} /> Testes de contrato — {passed}/{results.length} passaram
      </p>
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {r.passed
            ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            : <XCircle size={13} className="text-red-500 shrink-0" />}
          <span className="font-mono">{r.test}</span>
          {!r.passed && <span className="text-muted-foreground">— {r.output}</span>}
        </div>
      ))}
    </div>
  );
}

export function ConnectorForgePage() {
  const [erpName, setErpName] = useState('');
  const [apiSpec, setApiSpec] = useState(SAMPLE_SPEC);
  const [forging, setForging] = useState(false);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  async function loadDrafts() {
    setLoadingList(true);
    try {
      const res = await apiGet<{ drafts: DraftRow[] }>('/api/v2/erp/forge');
      setDrafts(res.drafts ?? []);
    } catch (e) {
      toast.error(`Falha ao listar drafts: ${(e as Error).message}`);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadDrafts(); }, []);

  async function handleForge() {
    if (!erpName.trim()) { toast.error('Informe o nome do ERP.'); return; }
    let parsedSpec: Record<string, unknown>;
    try {
      parsedSpec = JSON.parse(apiSpec);
      if (typeof parsedSpec !== 'object' || parsedSpec === null) throw new Error('não é objeto');
    } catch {
      toast.error('apiSpec inválido — precisa ser um JSON de objeto válido.');
      return;
    }
    setForging(true);
    setResult(null);
    setDetail(null);
    try {
      const res = await apiPost<ForgeResult>('/api/v2/erp/forge', { erpName: erpName.trim(), apiSpec: parsedSpec });
      setResult(res);
      const ok = res.testResults?.every((r) => r.passed);
      toast.success(`Connector "${res.erpName}" forjado — status: ${res.status}${ok ? ' ✓' : ''}`);
      loadDrafts();
    } catch (e) {
      // A geração usa GPT-4o; sem crédito de LLM o backend devolve 500.
      toast.error(`Falha ao forjar: ${(e as Error).message}`);
    } finally {
      setForging(false);
    }
  }

  async function openDraft(id: string) {
    setResult(null);
    try {
      const d = await apiGet<DraftDetail>(`/api/v2/erp/forge/${id}`);
      setDetail(d);
    } catch (e) {
      toast.error(`Falha ao abrir draft: ${(e as Error).message}`);
    }
  }

  const shownCode = result?.generatedCode ?? detail?.generated_code ?? null;
  const shownTests = result?.testResults ?? detail?.test_results ?? null;
  const shownName = result?.erpName ?? detail?.erp_name ?? null;
  const shownStatus = result?.status ?? detail?.status ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hammer size={22} className="text-primary" /> Connector Forge
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Gere um adaptador de ERP a partir da especificação da API. A fábrica usa os 5 adapters
            existentes como referência, gera o código e roda testes de contrato — de semanas para horas.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={loadDrafts} disabled={loadingList}>
          <RefreshCw size={14} className={cn(loadingList && 'animate-spin')} />
        </Button>
      </div>

      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-4 flex items-start gap-3 text-xs text-muted-foreground">
          <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
          <p>
            A <strong>geração</strong> usa GPT-4o (requer crédito de LLM configurado). A <strong>promoção
            a produção</strong> é revisão manual de código — o Forge para em forjar, testar e revisar;
            o código gerado é um rascunho para você auditar antes de virar adapter oficial.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Forjar novo connector</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">Nome do ERP</label>
              <Input
                placeholder="ex.: MinhaProvedora ERP"
                value={erpName}
                onChange={(e) => setErpName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">Especificação da API (JSON)</label>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setApiSpec(SAMPLE_SPEC)}>
                  Carregar exemplo
                </Button>
              </div>
              <Textarea
                className="font-mono text-xs h-64 resize-y"
                value={apiSpec}
                onChange={(e) => setApiSpec(e.target.value)}
                spellCheck={false}
              />
            </div>
            <Button onClick={handleForge} disabled={forging} className="self-start gap-2">
              {forging ? <Loader2 size={15} className="animate-spin" /> : <Hammer size={15} />}
              {forging ? 'Forjando...' : 'Forjar connector'}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode2 size={16} /> Resultado
              {shownName && <span className="text-muted-foreground font-normal">— {shownName}</span>}
              {shownStatus && <Badge className={cn('ml-auto text-[10px] uppercase border-none', statusBadge(shownStatus))}>{shownStatus}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!shownCode && !shownTests && (
              <div className="py-16 text-center text-sm text-muted-foreground italic">
                Forje um connector ou selecione um draft da lista para ver código e testes.
              </div>
            )}
            {shownTests && <TestResultList results={shownTests} />}
            {detail?.notes && (
              <p className="text-xs text-red-600 dark:text-red-400">Nota: {detail.notes}</p>
            )}
            {shownCode && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-muted-foreground">Código gerado</p>
                <pre className="text-[11px] font-mono bg-zinc-950 text-zinc-100 rounded-lg p-3 overflow-auto max-h-96 whitespace-pre">
                  {shownCode}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drafts list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Drafts recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">Nenhum connector forjado ainda.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {drafts.map((d) => {
                const passed = d.test_results?.filter((r) => r.passed).length ?? 0;
                const total = d.test_results?.length ?? 0;
                return (
                  <button
                    key={d.id}
                    onClick={() => openDraft(d.id)}
                    className="flex items-center gap-3 py-2.5 text-left hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors"
                  >
                    <FileCode2 size={15} className="text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{d.erp_name}</span>
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground">{passed}/{total} testes</span>
                    )}
                    <Badge className={cn('text-[10px] uppercase border-none', statusBadge(d.status))}>{d.status}</Badge>
                    <span className="text-[11px] text-muted-foreground w-28 text-right hidden sm:inline">
                      {new Date(d.created_at).toLocaleString('pt-BR')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ConnectorForgePage;
