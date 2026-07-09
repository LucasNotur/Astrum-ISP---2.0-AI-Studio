import { FastifyInstance } from 'fastify';
import {
  isMcpEnabled,
  createKey,
  listKeys,
  updateKey,
  deleteKey,
  authenticateKey,
  resolveTools,
} from '../../infrastructure/mcp/mcp-server';
import { READ_ONLY_TOOLS } from '../../infrastructure/ai/tool-registry';
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import { recordToolUsage } from '../../infrastructure/ai/tool-registry';

export async function mcpAdminRoutes(app: FastifyInstance) {
  app.get('/api/v2/ia/mcp/keys', {
    onRequest: [async (req, reply) => { await (app as any).authenticate(req, reply); }],
  }, async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { keys: [] };
    const keys = await listKeys(tenantId);
    return { keys, readOnlyTools: [...READ_ONLY_TOOLS] };
  });

  app.post<{ Body: { name: string; tools: string[] } }>('/api/v2/ia/mcp/keys', {
    onRequest: [async (req, reply) => { await (app as any).authenticate(req, reply); }],
  }, async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
    const { name, tools } = req.body;
    if (!name) return reply.code(400).send({ error: 'name obrigatório' });
    if (!tools?.length) return reply.code(400).send({ error: 'tools obrigatório' });
    try {
      const result = await createKey(tenantId, name, tools);
      return reply.code(201).send(result);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean; tools?: string[] } }>(
    '/api/v2/ia/mcp/keys/:id',
    { onRequest: [async (req, reply) => { await (app as any).authenticate(req, reply); }] },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
      const ok = await updateKey(tenantId, req.params.id, req.body);
      if (!ok) return reply.code(500).send({ error: 'Falha ao atualizar' });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v2/ia/mcp/keys/:id',
    { onRequest: [async (req, reply) => { await (app as any).authenticate(req, reply); }] },
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
      const ok = await deleteKey(tenantId, req.params.id);
      if (!ok) return reply.code(500).send({ error: 'Falha ao revogar' });
      return { ok: true };
    },
  );

  app.post('/api/v2/mcp', async (req, reply) => {
    if (!isMcpEnabled()) {
      return reply.code(404).send({ error: 'MCP desabilitado' });
    }
    const auth = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!auth) return reply.code(401).send({ error: 'API key ausente' });

    const keyInfo = await authenticateKey(auth);
    if (!keyInfo) return reply.code(401).send({ error: 'API key inválida ou revogada' });

    const availableTools = await resolveTools(keyInfo);

    const body = req.body as any;
    if (!body?.method) {
      return reply.code(400).send({ error: 'method obrigatório' });
    }

    if (body.method === 'tools/list') {
      return {
        tools: availableTools.map((name) => ({
          name,
          description: `Read-only tool: ${name}`,
        })),
      };
    }

    if (body.method === 'tools/call') {
      const toolName = body.params?.name;
      if (!toolName || !availableTools.includes(toolName)) {
        return reply.code(403).send({ error: `Tool "${toolName}" não disponível` });
      }
      try {
        const executor = new ToolsExecutor();
        const result = await executor.execute(
          toolName,
          body.params?.arguments ?? {},
          keyInfo.tenantId,
        );
        recordToolUsage(keyInfo.tenantId, toolName, result);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }

    return reply.code(400).send({ error: `method "${body.method}" não suportado` });
  });
}
