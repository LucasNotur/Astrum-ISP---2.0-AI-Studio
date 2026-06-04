# 🚨 RECUPERAÇÃO DE EMERGÊNCIA — PACKAGE.JSON APAGADO

## Quando usar este arquivo
Quando o AI Studio apagar o `package.json` por timeout ou crash de ambiente,
cole o prompt abaixo diretamente no AI Studio para restaurar.

---

## ⚡ PROMPT DE RESTAURAÇÃO — Cole no AI Studio quando o package.json sumir:

```
EMERGÊNCIA: o arquivo package.json foi apagado pelo ambiente.
Recrie o arquivo package.json na raiz do projeto com o conteúdo EXATO abaixo.
NÃO modifique nenhuma versão. NÃO adicione nem remova pacotes. Copie byte a byte.

Arquivo: package.json

{
  "name": "app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.98.0",
    "@google/genai": "^2.6.0",
    "@google/generative-ai": "^0.24.1",
    "@hello-pangea/dnd": "^18.0.1",
    "@qdrant/js-client-rest": "^1.18.0",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@supabase/supabase-js": "^2.106.1",
    "@tanstack/react-query": "^5.100.14",
    "archiver": "^8.0.0",
    "bullmq": "^5.77.6",
    "cheerio": "^1.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.4.0",
    "date-fns-tz": "^3.2.0",
    "express": "^4.18.2",
    "express-rate-limit": "^8.5.2",
    "fastify": "^5.8.5",
    "firebase": "^12.13.0",
    "firebase-admin": "^13.10.0",
    "framer-motion": "^12.40.0",
    "html5-qrcode": "^2.3.8",
    "idb": "^8.0.3",
    "ioredis": "^5.10.1",
    "jspdf": "^4.2.1",
    "jspdf-autotable": "^5.0.8",
    "lucide-react": "^1.17.0",
    "motion": "^12.40.0",
    "next-themes": "^0.4.6",
    "node-forge": "^1.4.0",
    "nodemailer": "^8.0.8",
    "openai": "^6.39.0",
    "qrcode.react": "^4.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.76.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^3.8.1",
    "socket.io-client": "^4.8.3",
    "sonner": "^2.0.7",
    "swagger-jsdoc": "^6.3.0",
    "swagger-ui-express": "^5.0.1",
    "tailwind-merge": "^3.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^4.4.3",
    "zustand": "^5.0.13"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/express": "^4.17.21",
    "@types/node": "^25.9.1",
    "@types/nodemailer": "^8.0.0",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/supertest": "^7.2.0",
    "@types/swagger-jsdoc": "^6.0.4",
    "@types/swagger-ui-express": "^4.1.8",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.2.1",
    "esbuild": "^0.20.0",
    "ioredis-mock": "^8.13.1",
    "jsdom": "^29.1.1",
    "supertest": "^7.2.2",
    "tailwindcss": "^4.3.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.10",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^4.1.7"
  }
}

Após recriar o arquivo, confirme: "package.json restaurado com sucesso."
```

---

## 🛡️ COMO PREVENIR O APAGAMENTO

### Adicione esta regra nas System Instructions do AI Studio:

```
REGRA CRÍTICA — ARQUIVOS PROTEGIDOS (NUNCA MODIFICAR OU APAGAR):
Os seguintes arquivos são SAGRADOS e não podem ser apagados, esvaziados ou sobrescritos
com conteúdo diferente, sob nenhuma circunstância:
  - package.json
  - package-lock.json
  - tsconfig.json
  - vite.config.ts
  - tailwind.config.js
  - index.html

Se uma tarefa pedir para modificar qualquer um desses arquivos:
  ✅ Apenas ADICIONE o que é necessário (não substitua o arquivo inteiro)
  ✅ Preserve TODO o conteúdo existente
  ❌ NUNCA reescreva o arquivo do zero
  ❌ NUNCA apague o conteúdo existente para colocar conteúdo novo
```

### Por que acontece o timeout + apagamento?

O AI Studio tem um limite de tempo por operação. Quando um prompt é muito grande ou
envolve muitas operações simultâneas, o ambiente:
1. Dá timeout na operação
2. Tenta "limpar" arquivos para reiniciar
3. Às vezes apaga arquivos críticos no processo

### Dicas para evitar timeouts:

| ✅ Faça | ❌ Evite |
|---|---|
| Prompts com 3-5 tarefas por sessão | Prompts com 10+ tarefas |
| Uma sessão por conversa | Múltiplas sessões seguidas sem pausa |
| Aguardar compilação antes da próxima tarefa | Enviar próximo prompt antes do anterior terminar |

---

## 📋 VERSÃO CANÔNICA DO PACKAGE.JSON

> Esta é a versão oficial. Sempre que o package.json for apagado, use exatamente esta versão.
> Última atualização: 2026-06-04

```json
{
  "name": "app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.98.0",
    "@google/genai": "^2.6.0",
    "@google/generative-ai": "^0.24.1",
    "@hello-pangea/dnd": "^18.0.1",
    "@qdrant/js-client-rest": "^1.18.0",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@supabase/supabase-js": "^2.106.1",
    "@tanstack/react-query": "^5.100.14",
    "archiver": "^8.0.0",
    "bullmq": "^5.77.6",
    "cheerio": "^1.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.4.0",
    "date-fns-tz": "^3.2.0",
    "express": "^4.18.2",
    "express-rate-limit": "^8.5.2",
    "fastify": "^5.8.5",
    "firebase": "^12.13.0",
    "firebase-admin": "^13.10.0",
    "framer-motion": "^12.40.0",
    "html5-qrcode": "^2.3.8",
    "idb": "^8.0.3",
    "ioredis": "^5.10.1",
    "jspdf": "^4.2.1",
    "jspdf-autotable": "^5.0.8",
    "lucide-react": "^1.17.0",
    "motion": "^12.40.0",
    "next-themes": "^0.4.6",
    "node-forge": "^1.4.0",
    "nodemailer": "^8.0.8",
    "openai": "^6.39.0",
    "qrcode.react": "^4.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.76.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^3.8.1",
    "socket.io-client": "^4.8.3",
    "sonner": "^2.0.7",
    "swagger-jsdoc": "^6.3.0",
    "swagger-ui-express": "^5.0.1",
    "tailwind-merge": "^3.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^4.4.3",
    "zustand": "^5.0.13"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/express": "^4.17.21",
    "@types/node": "^25.9.1",
    "@types/nodemailer": "^8.0.0",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/supertest": "^7.2.0",
    "@types/swagger-jsdoc": "^6.0.4",
    "@types/swagger-ui-express": "^4.1.8",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^4.2.1",
    "esbuild": "^0.20.0",
    "ioredis-mock": "^8.13.1",
    "jsdom": "^29.1.1",
    "supertest": "^7.2.2",
    "tailwindcss": "^4.3.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.10",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^4.1.7"
  }
}
```
