import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseCSV, importSheet, type ColumnMapping, type SheetImportPorts } from './sheet-import.service';

describe('parseCSV', () => {
  it('parse CSV com vírgula', () => {
    const csv = 'Nome,CPF,Telefone\nJoão Silva,111.222.333-44,11999999999\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['nome']).toBe('João Silva');
    expect(rows[0]!['cpf']).toBe('111.222.333-44');
  });

  it('parse CSV com ponto-e-vírgula', () => {
    const csv = 'Nome;CPF;Telefone\nMaria;22233344455;11888888888\n';
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['nome']).toBe('Maria');
  });

  it('remove aspas ao redor dos valores', () => {
    const csv = '"Nome","CPF"\n"João","11122233344"\n';
    const rows = parseCSV(csv);
    expect(rows[0]!['nome']).toBe('João');
    expect(rows[0]!['cpf']).toBe('11122233344');
  });

  it('retorna vazio com menos de 2 linhas', () => {
    expect(parseCSV('Nome,CPF')).toHaveLength(0);
    expect(parseCSV('')).toHaveLength(0);
  });
});

describe('importSheet', () => {
  const mapping: ColumnMapping = { name: 'nome', cpf: 'cpf', phone: 'telefone' };

  function makePorts(existingCpfs: string[] = []): SheetImportPorts {
    const existing = new Set(existingCpfs);
    const db: any = {
      from: (table: string) => {
        if (table === 'customers') {
          return {
            select: () => ({
              eq: (_: string, __: string) => ({
                eq: (_: string, cpf: string) => ({
                  maybeSingle: () => Promise.resolve({
                    data: existing.has(cpf) ? { id: `existing-${cpf}` } : null,
                  }),
                }),
              }),
            }),
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {};
      },
    };
    return { db };
  }

  beforeEach(() => vi.clearAllMocks());

  it('importa 3 linhas válidas', async () => {
    const rows = [
      { nome: 'João', cpf: '111.222.333-44', telefone: '11999999999' },
      { nome: 'Maria', cpf: '222.333.444-55', telefone: '11888888888' },
      { nome: 'Pedro', cpf: '333.444.555-66', telefone: '11777777777' },
    ];
    const result = await importSheet('t1', rows, mapping, makePorts());
    expect(result.imported).toBe(3);
    expect(result.duplicatesSkipped).toBe(0);
  });

  it('dedupe por CPF dentro da própria planilha', async () => {
    const rows = [
      { nome: 'João', cpf: '11122233344', telefone: '11999' },
      { nome: 'João Dup', cpf: '11122233344', telefone: '11999' },
    ];
    const result = await importSheet('t1', rows, mapping, makePorts());
    expect(result.imported).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('dedupe contra banco (CPF já existente)', async () => {
    const rows = [
      { nome: 'Existente', cpf: '11122233344', telefone: '11999' },
    ];
    const result = await importSheet('t1', rows, mapping, makePorts(['11122233344']));
    expect(result.imported).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('pula linha com nome ou CPF vazio', async () => {
    const rows = [
      { nome: '', cpf: '11122233344', telefone: '11999' },
      { nome: 'João', cpf: '', telefone: '11999' },
    ];
    const result = await importSheet('t1', rows, mapping, makePorts());
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(2);
  });

  it('500 linhas importa sem problema', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      nome: `Cliente ${i}`,
      cpf: String(10000000000 + i),
      telefone: String(11900000000 + i),
    }));
    const result = await importSheet('t1', rows, mapping, makePorts());
    expect(result.imported).toBe(500);
  });
});
