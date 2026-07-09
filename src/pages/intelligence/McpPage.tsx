import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Copy, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { Skeleton } from '@/src/components/Skeleton';
import { DataTablePro } from '@/src/components/intelligence/DataTablePro';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Switch } from '@/src/components/ui/switch';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface McpKey {
  id: string;
  name: string;
  enabled: boolean;
  tools: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

async function fetchKeys(token: string): Promise<{ keys: McpKey[]; readOnlyTools: string[] }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/mcp/keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function createKey(token: string, name: string, tools: string[]): Promise<{ id: string; plaintext: string }> {
  const res = await fetch(`${API_BASE_URL}/api/v2/ia/mcp/keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tools }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function patchKey(token: string, id: string, body: { enabled?: boolean }): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v2/ia/mcp/keys/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function deleteKey(token: string, id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v2/ia/mcp/keys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function McpPage() {
  const { flags, isLoading: isFlagsLoading } = useFeatureFlags();
  const flagOn = flags.mcp === true;
  const queryClient = useQueryClient();

  const [token, setToken] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [selectedTools, setSelectedTools] = React.useState<Set<string>>(new Set());
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const keysQuery = useQuery({
    queryKey: ['mcp-keys', token],
    queryFn: () => fetchKeys(token!),
    enabled: !!token && flagOn,
  });

  const createMut = useMutation({
    mutationFn: () => createKey(token!, newName, [...selectedTools]),
    onSuccess: (data) => {
      setCreatedKey(data.plaintext);
      setShowCreate(false);
      setNewName('');
      setSelectedTools(new Set());
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => patchKey(token!, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mcp-keys'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteKey(token!, id),
    onSuccess: () => {
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['mcp-keys'] });
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
            <Plug size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Conexões MCP
            </h1>
            <p className="text-sm text-muted-foreground">
              Defina MCP_SERVER_ENABLED=true para ativar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const keys = keysQuery.data?.keys ?? [];
  const readOnlyTools = keysQuery.data?.readOnlyTools ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Plug size={20} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Conexões MCP
            </h1>
            <p className="text-sm text-muted-foreground">
              Conecte o Claude e outros clientes aos dados do seu provedor.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" /> Nova chave
        </Button>
      </div>

      {createdKey && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Guarde agora — a chave não será exibida de novo.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-amber-100 px-3 py-2 font-mono text-xs text-amber-900 dark:bg-amber-900/50 dark:text-amber-100 break-all">
                {createdKey}
              </code>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(createdKey)}>
                <Copy size={14} />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>Fechar</Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Nova chave MCP</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Nome da chave"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tools (somente leitura)</p>
              {readOnlyTools.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTools.has(t)}
                    onChange={() => {
                      setSelectedTools((prev) => {
                        const next = new Set(prev);
                        if (next.has(t)) next.delete(t); else next.add(t);
                        return next;
                      });
                    }}
                  />
                  {t}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!newName || selectedTools.size === 0 || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                Criar
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {confirmDelete && (
        <Card className="border-red-300 dark:border-red-700">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Revogar esta chave?</p>
            <p className="text-xs text-muted-foreground">
              Integrações usando esta chave param de funcionar imediatamente.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate(confirmDelete)}>
                Revogar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {keys.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="Nenhuma chave MCP."
          description="Crie uma chave para conectar clientes MCP aos dados do provedor."
        />
      ) : (
        <DataTablePro<McpKey>
          data={keys}
          pageSize={20}
          columns={[
            { key: 'name', header: 'Nome', accessor: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'created', header: 'Criada', accessor: (r) => new Date(r.createdAt).toLocaleDateString('pt-BR') },
            { key: 'lastUsed', header: 'Último uso', accessor: (r) => r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString('pt-BR') : '—' },
            { key: 'tools', header: 'Tools', className: 'text-right', accessor: (r) => r.tools.length },
            {
              key: 'enabled',
              header: 'Ativa',
              accessor: (r) => (
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => toggleMut.mutate({ id: r.id, enabled: v })}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              accessor: (r) => (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(r.id)}>
                  <Trash2 size={14} className="text-red-500" />
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export default McpPage;
