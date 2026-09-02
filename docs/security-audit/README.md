# Auditoria de Segurança — AstrumISP

Relatório de auditoria de segurança (2026-09-01) cobrindo 5 categorias: isolamento de
tenant, permissão definida no navegador, IDOR, chaves expostas e XSS.

- **`relatorio-auditoria-seguranca.pdf`** — relatório final (pt-BR): capa, resumo executivo
  com gráficos, pontos fortes/fracos, achados detalhados por categoria, recomendações
  priorizadas e issues prontas para o GitHub.
- **`gerar_relatorio.py`** — gerador do PDF (dados dos achados embutidos no script).

## Regerar o PDF

O ambiente Python fica em `.venv/` (não versionado — ver `.gitignore`). Para recriar e rodar:

```bash
cd docs/security-audit
python -m venv .venv
./.venv/Scripts/python.exe -m pip install reportlab matplotlib   # Windows
# (Linux/macOS: ./.venv/bin/python -m pip install reportlab matplotlib)
./.venv/Scripts/python.exe gerar_relatorio.py
```

## Status das correções

**Todos os 5 achados foram corrigidos, testados e estão no `main`:**

| # | Achado | Severidade | Commit |
|---|--------|-----------|--------|
| 1 | IDOR + isolamento de tenant na biometria de voz | Alta | `2b0ea7f` |
| 2 | Token de assinante aceito em WebSocket de operador | Alta | `2b0ea7f` |
| 3 | Rotas de configuração privilegiada sem RBAC no servidor | Alta | `2b0ea7f` |
| 4 | Webhook Meta com validação fail-open sem `FACEBOOK_APP_SECRET` | Média | `2b0ea7f` |
| 5 | Segredos placeholder aceitos no boot + senha literal no SQL do Zep | Baixa | `0f8eaed` |

Verificação: `npx tsc --noEmit -p apps/api/tsconfig.json` limpo (0 erros) e suíte de
segurança verde (voice-consent, ai-config, settings-page, meta-webhook, super-admin,
env.validator).
