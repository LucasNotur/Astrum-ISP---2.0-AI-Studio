import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../cache/redis.client', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock('../ai/vercel-ai.service', () => ({
  agentTools: {
    check_invoice: { description: 'read' },
    get_billing_status: { description: 'read' },
    query_knowledge_base: { description: 'read' },
    check_coverage: { description: 'read' },
    run_diagnostics: { description: 'read' },
    query_network_graph: { description: 'read' },
    suspend_signal: { description: 'write' },
    create_ticket: { description: 'write' },
    schedule_technical_visit: { description: 'write' },
  },
}));

import { hashKey, generateApiKey, isMcpEnabled } from './mcp-server';
import {
  SIDE_EFFECT_TOOLS,
  READ_ONLY_TOOLS,
} from '../ai/tool-registry';
import { agentTools } from '../ai/vercel-ai.service';

describe('mcp-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (process.env as any).MCP_SERVER_ENABLED;
  });

  it('isMcpEnabled returns false by default', () => {
    expect(isMcpEnabled()).toBe(false);
  });

  it('isMcpEnabled returns true when set', () => {
    process.env.MCP_SERVER_ENABLED = 'true';
    expect(isMcpEnabled()).toBe(true);
  });

  it('generateApiKey returns key and hash', () => {
    const { plaintext, hash } = generateApiKey();
    expect(plaintext).toMatch(/^astrum_mcp_/);
    expect(hash).toHaveLength(64);
    expect(hashKey(plaintext)).toBe(hash);
  });

  it('SIDE_EFFECT_TOOLS contains write tools', () => {
    expect(SIDE_EFFECT_TOOLS.has('suspend_signal')).toBe(true);
    expect(SIDE_EFFECT_TOOLS.has('create_ticket')).toBe(true);
    expect(SIDE_EFFECT_TOOLS.has('schedule_technical_visit')).toBe(true);
  });

  it('READ_ONLY_TOOLS excludes write tools', () => {
    expect(READ_ONLY_TOOLS.has('suspend_signal')).toBe(false);
    expect(READ_ONLY_TOOLS.has('create_ticket')).toBe(false);
    expect(READ_ONLY_TOOLS.has('check_invoice')).toBe(true);
    expect(READ_ONLY_TOOLS.has('query_knowledge_base')).toBe(true);
  });

  it('READ_ONLY ∪ SIDE_EFFECT == full catalog', () => {
    const union = new Set([...READ_ONLY_TOOLS, ...SIDE_EFFECT_TOOLS]);
    const catalog = new Set(Object.keys(agentTools));
    expect(union).toEqual(catalog);
  });

  it('write tools NEVER appear in READ_ONLY_TOOLS even if injected', () => {
    for (const tool of SIDE_EFFECT_TOOLS) {
      expect(READ_ONLY_TOOLS.has(tool)).toBe(false);
    }
  });
});
