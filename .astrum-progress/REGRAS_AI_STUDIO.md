# REGRAS GLOBAIS — PROJETO ASTRUM ISP (AI STUDIO)

> Documento de referência permanente.
> Salvo em: 2026-06-27 pelo Antigravity para garantir integridade na migração AI Studio → Claude Code.

---

## ⚠️ AMBIENTE DE EXECUÇÃO
O projeto Astrum ISP é desenvolvido dentro do **Google AI Studio**, um ambiente sandbox gerenciado.
NÃO é um ambiente local com terminal livre.

---

## 🔒 REGRAS INVIOLÁVEIS PARA GERAÇÃO DE PROMPTS DE SESSÃO

### REGRA ABSOLUTA 1 — NUNCA gerar `npm install` nos prompts
Ao gerar qualquer prompt de sessão para o projeto Astrum ISP:
- ❌ NUNCA inclua `npm install <pacote>`
- ❌ NUNCA inclua `npm i <pacote>`
- ❌ NUNCA inclua `yarn add <pacote>`
- ❌ NUNCA inclua `pnpm add <pacote>`
- Se um pacote for necessário, apenas use no código e liste como "DEPENDÊNCIA NECESSÁRIA" no checklist final
- Verifique SEMPRE se o pacote já existe no package.json antes de qualquer menção

### REGRA ABSOLUTA 2 — NUNCA gerar `npx` de scaffold nos prompts
- ❌ NUNCA inclua `npx shadcn@latest init`
- ❌ NUNCA inclua `npx shadcn@latest add <componente>`
- ❌ NUNCA inclua `npx tailwindcss init`
- ❌ NUNCA inclua qualquer `npx create-*`
- ✅ SEMPRE substitua pelo código que o comando geraria (crie os arquivos manualmente)

### REGRA ABSOLUTA 3 — Verificar package.json antes de sugerir instalação
Pacotes JÁ instalados no Astrum (NUNCA pedir npm install destes):
```
tailwindcss, @tailwindcss/vite, class-variance-authority, clsx, tailwind-merge,
lucide-react, @radix-ui/* (todos), framer-motion, motion, zustand, @tanstack/react-query,
react-hook-form, zod, recharts, sonner, react-router-dom, @supabase/supabase-js,
firebase, firebase-admin, openai, @anthropic-ai/sdk, @google/genai, @qdrant/js-client-rest,
bullmq, ioredis, date-fns, date-fns-tz, jspdf, jspdf-autotable, express, fastify,
socket.io-client, nodemailer, qrcode.react, html5-qrcode, node-forge
```

### REGRA ABSOLUTA 4 — NUNCA modificar imports existentes em App.tsx
App.tsx tem +6000 linhas. Ao gerar prompts que tocam App.tsx:
- ❌ NUNCA instrua a remover imports existentes
- ❌ NUNCA instrua a reordenar imports existentes
- ✅ SEMPRE instrua a ADICIONAR imports no final do bloco existente
- ✅ SEMPRE instrua a verificar duplicatas antes de adicionar

### REGRA ABSOLUTA 5 — Todo import deve ter seu arquivo criado na mesma sessão
Ao gerar um prompt que importa um novo arquivo:
- ✅ O arquivo importado DEVE estar no prompt da MESMA sessão
- ❌ NUNCA deixe imports pendentes apontando para arquivos não criados

### REGRA ABSOLUTA 6 — Cada prompt deve incluir o BLOCO DE PROTEÇÃO
Todo prompt de sessão gerado para o Astrum DEVE começar (após o cabeçalho) com:
```
⚠️ AMBIENTE: Google AI Studio — não execute npm install, npm i, npx shadcn, npx tailwindcss init.
Substitua qualquer comando npm/npx pelo código que ele geraria. Verifique package.json antes de qualquer import.
```

---

## 📍 CONTEXTO ADICIONAL PARA MIGRAÇÃO

### Estrutura do Monorepo
```
e:\Saas\AstrumISP\
├── apps/
│   ├── api/        # Backend Fastify (porta 3001)
│   └── web/        # Frontend React + Vite
├── packages/
│   ├── queue/      # BullMQ workers e filas
│   ├── shared/     # Schemas Zod compartilhados
│   └── db/         # Migrations SQL do Supabase
├── src/            # Código legado Express (porta 3000, Strangler Fig)
├── workers/        # Workers legados
├── server.ts       # Entry point Express + Vite middleware
├── .astrum-progress/ # Documentação de progresso
└── docs/           # Changelogs e documentação técnica
```

### Banco de Dados
- **Supabase** (PostgreSQL) com RLS por tenant
- **Qdrant** para Vector DB (RAG)
- **Redis** para cache e BullMQ
- **DuckDB** para analytics OLAP

### Stack de IA
- **Vercel AI SDK** para Function Calling + Structured Outputs
- **LangGraph** para State Machines de agentes
- **Zep/Mem0** para memória de longo prazo
- **Helicone** para FinOps
- **LangSmith** para tracing
- **Sentry** para error monitoring

---

## 📋 ESTADO ATUAL DO PROJETO (Junho 2026)

- **Última sessão concluída:** Sessão 67 — WebSockets Bidirecionais
- **Próxima sessão:** Sessão 68 — Svix Outbound Webhooks + Cloudflare Workers
- **Sprint atual:** Sprint 6 (Escala Multi-tenant)
- **Sprints 0–5:** Todos com GATE APROVADO ✅
- **Total de sessões planejadas:** 98 (Dias 1–98)
- **Total de sessões concluídas:** 67

---

*Salvo pelo Antigravity em 2026-06-27 para garantir continuidade na migração de plataforma.*
