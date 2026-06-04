# ⚠️ REGRAS OBRIGATÓRIAS — AI STUDIO ASTRUM
> **Cole este bloco NO INÍCIO de cada prompt de sessão, logo após o cabeçalho.**
> Estas regras têm prioridade absoluta sobre qualquer instrução das TAREFAS.

---

## 🔒 BLOCO DE PROTEÇÃO — COPIE E COLE NO INÍCIO DE CADA PROMPT

```
════════════════════════════════════════════════════════════════
⚠️  REGRAS DE PROTEÇÃO DO AI STUDIO — LEIA ANTES DE EXECUTAR
════════════════════════════════════════════════════════════════

AMBIENTE: Google AI Studio (ambiente gerenciado, não é terminal local)
CONSEQUÊNCIA: comandos npm/npx DESTROEM o build do projeto se mal aplicados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 1 — PROIBIÇÃO TOTAL DE npm install
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ NUNCA execute: npm install <pacote>
❌ NUNCA execute: npm i <pacote>
❌ NUNCA execute: yarn add <pacote>
❌ NUNCA execute: pnpm add <pacote>

✅ SE um pacote for necessário e não estiver no package.json:
   → Anuncie: "DEPENDÊNCIA NECESSÁRIA: <pacote> — não instalada ainda"
   → Apenas declare no código como import (o usuário instalará depois)
   → NUNCA bloqueie a sessão esperando o npm install

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 2 — PROIBIÇÃO TOTAL DE npx em ferramentas de scaffold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ NUNCA execute: npx shadcn@latest init
❌ NUNCA execute: npx shadcn@latest add <componente>
❌ NUNCA execute: npx tailwindcss init
❌ NUNCA execute: npx create-* (qualquer scaffolding)

✅ SE um comando npx for parte da tarefa:
   → Substitua pelo código que o comando geraria
   → Crie os arquivos manualmente com o conteúdo correto
   → Anuncie: "SUBSTITUINDO npx <comando> por criação manual dos arquivos"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 3 — VERIFICAR package.json ANTES DE QUALQUER IMPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes de importar qualquer pacote externo, verifique se ele já existe
no package.json do projeto. Se já existe: use sem comentário.
Se não existe: siga a REGRA 1.

Pacotes JÁ INSTALADOS no projeto Astrum (não pedir npm install):
  - tailwindcss, @tailwindcss/vite
  - class-variance-authority, clsx, tailwind-merge
  - lucide-react
  - @radix-ui/* (dialog, select, tabs, avatar, tooltip, etc.)
  - framer-motion, motion
  - zustand, @tanstack/react-query
  - react-hook-form, zod
  - recharts
  - sonner
  - react-router-dom
  - @supabase/supabase-js
  - firebase, firebase-admin
  - openai, @anthropic-ai/sdk, @google/genai
  - @qdrant/js-client-rest
  - bullmq, ioredis
  - date-fns, date-fns-tz
  - jspdf, jspdf-autotable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 4 — NÃO MODIFICAR IMPORTS EXISTENTES EM App.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
App.tsx tem +6000 linhas. Para evitar quebrar o frontend:
❌ NUNCA remova imports existentes em App.tsx
❌ NUNCA reordene o bloco de imports de App.tsx
✅ Apenas ADICIONE novos imports no final do bloco existente
✅ Verifique se o import já existe antes de adicionar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 5 — CRIAR TODOS OS ARQUIVOS REFERENCIADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Se um arquivo importa outro (ex: import { Foo } from './foo'):
✅ O arquivo './foo' DEVE ser criado na MESMA sessão
❌ NUNCA deixe um import pendente apontando para arquivo não criado
❌ NUNCA divida uma implementação em "vou criar na próxima sessão"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRA 6 — QDRANT É OPCIONAL ATÉ CONFIGURAÇÃO EXPLÍCITA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O Qdrant ainda não está configurado no ambiente.
✅ Crie todo o código que usa Qdrant normalmente
✅ Use a variável de ambiente QDRANT_URL (que ainda não existe)
✅ O código deve ser resiliente: se QDRANT_URL não existir, não crasha
❌ NUNCA tente conectar ao Qdrant ou testar a conexão durante a sessão

════════════════════════════════════════════════════════════════
FIM DO BLOCO DE PROTEÇÃO
════════════════════════════════════════════════════════════════
```

---

## 📋 POR QUE CADA REGRA EXISTE

### Regra 1 — Por que não `npm install`?
O AI Studio roda em um ambiente **sandbox gerenciado**. Quando você roda `npm install`:
- O `package-lock.json` é regenerado com versões diferentes
- Conflitos de versão quebram o build silenciosamente
- Pacotes podem ser instalados em versões incompatíveis com o projeto atual
- **O frontend para de compilar** — e você precisa rodar "Fix the errors"

### Por que a Sessão 70 pediu `npm install`?
Os prompts foram escritos assumindo **ambiente local padrão**. No ambiente local você realmente precisaria instalar. No AI Studio, **todos esses pacotes já estavam no `package.json`**:

```
npm install tailwindcss          ← já tinha: tailwindcss ^4.3.0 ✅
npm install class-variance-authority ← já tinha: cva ^0.7.1 ✅  
npm install clsx                 ← já tinha: clsx ^2.1.1 ✅
npm install tailwind-merge       ← já tinha: tailwind-merge ^3.6.0 ✅
npm install lucide-react         ← já tinha: lucide-react ^1.17.0 ✅
npx shadcn@latest init           ← gerou arquivos que conflitaram com existentes ✅
npx shadcn@latest add button...  ← sobrescreveu componentes customizados existentes ✅
```

**O npm install não estava instalando nada novo — estava recriando locks e sobrescrevendo componentes que já funcionavam.**

### Regra 2 — Por que não `npx shadcn@latest`?
O projeto já tem componentes Shadcn customizados em `src/components/ui/`. 
Rodar `npx shadcn@latest add button` **sobrescreve** esses componentes com a versão padrão, apagando todas as customizações do design system Astrum que foram implementadas nas sessões anteriores.

---

## 🔄 COMO ATUALIZAR OS PROMPTS JÁ EXISTENTES

Para os prompts das sessões futuras (71 em diante), o Bloco de Proteção acima será automaticamente incluído no início de cada prompt gerado pelo Antigravity.

Para **reutilizar um prompt já gerado**, adicione o bloco manualmente:

```
1. Abra o prompt no AI Studio
2. Cole o BLOCO DE PROTEÇÃO logo após o cabeçalho (══ SESSÃO N ══)
3. O restante do prompt permanece igual
```

---

*Arquivo criado em: 2026-06-04 | Mantenha este arquivo em `.astrum-progress/`*
