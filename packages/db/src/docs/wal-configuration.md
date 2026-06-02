# Write-Ahead Logging (WAL) — Astrum

## Status
O Supabase usa PostgreSQL com WAL ativado por padrão (`wal_level = logical`).
Nenhuma configuração adicional necessária.

## Verificação
Execute no SQL Editor do Supabase:
SELECT current_setting('wal_level'); -- deve retornar: logical

## Por que é crítico
- Garante recuperação após crash sem perda de dados
- Necessário para Supabase Realtime (CDC) — será ativado no Sprint 1
- Em caso de falha durante transação, o banco retorna ao estado consistente anterior

## Teste de validação
Iniciar transação → derrubar conexão → verificar que tabela está no estado pré-transação.
O Supabase gerencia isso automaticamente via managed PostgreSQL.
