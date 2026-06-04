# BLOCO DE RODAPÉ — Cole no FINAL de cada prompt de sessão

> Este bloco vai no **FINAL** de cada prompt (após o checklist).
> O BLOCO DE PROTEÇÃO ainda vai no INÍCIO.
> Eles trabalham juntos: um protege a entrada, o outro protege a execução.

---

## ✂️ COPIE ESTE BLOCO E COLE NO FINAL DE CADA PROMPT:

```
════════════════════════════════════════════════════════════════
⚙️  INSTRUÇÕES DE EXECUÇÃO — LEIA ANTES DE COMEÇAR
════════════════════════════════════════════════════════════════

PASSO 1 — AVALIE O VOLUME DESTA SESSÃO:
Antes de executar qualquer código, conte quantas tarefas existem acima.

SE a sessão tiver 4 ou mais tarefas OU qualquer arquivo com +150 linhas:
  → Divida em partes de 2-3 tarefas cada
  → Informe: "Esta sessão tem [N] tarefas. Executarei em [X] partes."
  → Execute SOMENTE a Parte 1
  → Ao terminar a Parte 1, retorne EXATAMENTE:

┌─────────────────────────────────────────────────────┐
│ ✅ PARTE 1 de [X] — SESSÃO [N] CONCLUÍDA            │
│ Arquivos criados/modificados:                        │
│   + arquivo1.ts                                      │
│   ~ arquivo2.tsx                                     │
│ Status: compilável ✅ / sem imports quebrados ✅     │
│                                                      │
│ → Digite "continuar" para executar a Parte 2         │
└─────────────────────────────────────────────────────┘

SE a sessão tiver 3 ou menos tarefas simples:
  → Execute tudo de uma vez normalmente
  → Retorne o checklist completo ao final

PASSO 2 — PROTEÇÃO DURANTE EXECUÇÃO:
• Se detectar que uma tarefa vai criar um arquivo muito grande (+200 linhas):
  → Pause, avise, e pergunte se deve dividir ali
• Se o ambiente travar durante a execução:
  → Salve o progresso já feito
  → Retorne: "ALERTA: ambiente instável. Progresso salvo até [TAREFA X]. Aguardando instrução."

PASSO 3 — APENAS NA ÚLTIMA PARTE, retorne o checklist completo:
  ═══════════════════════════════════════
  SESSÃO [N] CONCLUÍDA — TODAS AS PARTES
  Sprint: [X] | Dia: [N]
  Total de partes executadas: [N]
  Arquivos criados: [lista completa]
  Arquivos modificados: [lista completa]
  ⏳ PENDÊNCIAS npm: [lista ou "nenhuma"]
  Checklist: sprint_[X].md → Dia [N] → [x]
  Próxima: Sessão [N+1] — [nome]
  ═══════════════════════════════════════

════════════════════════════════════════════════════════════════
FIM DAS INSTRUÇÕES DE EXECUÇÃO
════════════════════════════════════════════════════════════════
```

---

## 📐 COMO FICARÁ UM PROMPT COMPLETO COM OS DOIS BLOCOS:

```
═══ SESSÃO 72 ═══ (cabeçalho)

⚠️ BLOCO DE PROTEÇÃO          ← INÍCIO (anti npm install, anti apagar arquivos)
────────────────────────

CONTEXTO
TAREFA 1...
TAREFA 2...
TAREFA 3...
...
TAREFA 8...

CHECKLIST

⚙️ INSTRUÇÕES DE EXECUÇÃO     ← FINAL (anti-timeout, divisão automática)
════════════════════════
```

---

## 🔄 EXEMPLO DE COMO UMA SESSÃO GRANDE SERIA EXECUTADA:

**Você envia:** Sessão 72 (8 tarefas)

**AI Studio responde:**
```
Esta sessão tem 8 tarefas. Dividirei em 3 partes para evitar timeout.

[executa Tarefas 1, 2, 3]

✅ PARTE 1 de 3 — SESSÃO 72 CONCLUÍDA
Arquivos criados: + useWebSocket.ts, + SSEStream.ts
Status: compilável ✅
→ Digite "continuar" para a Parte 2
```

**Você digita:** continuar

**AI Studio responde:**
```
[executa Tarefas 4, 5, 6]

✅ PARTE 2 de 3 — SESSÃO 72 CONCLUÍDA
Arquivos criados: + useAbortController.ts, ~ ChatPage.tsx
Status: compilável ✅
→ Digite "continuar" para a Parte 3
```

**Você digita:** continuar

**AI Studio responde:**
```
[executa Tarefas 7, 8]

═══════════════════════════════════════
SESSÃO 72 CONCLUÍDA — TODAS AS PARTES
Sprint: 4 | Dia: 72
Total de partes: 3
Arquivos criados: [lista completa]
⏳ PENDÊNCIAS npm: nenhuma
═══════════════════════════════════════
```

---

*Arquivo criado em: 2026-06-04 | Projeto Astrum ISP*
