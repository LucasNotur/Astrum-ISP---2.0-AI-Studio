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

Os 4 achados acionáveis (3 altos + 1 médio) foram corrigidos no commit `2b0ea7f`
(IDOR de biometria de voz, token de assinante em WebSocket de operador, RBAC no servidor
para rotas de configuração e webhook Meta fail-closed). O achado #5 (baixo — defaults
placeholder / degrade-open de env) permanece em aberto como endurecimento.
