# Guia Definitivo de Arquitetura e Migração de Banco de Dados

Este documento foi criado para registrar a arquitetura atual do sistema **Astrum** e fornecer um manual passo a passo para uma futura migração do **Firebase (NoSQL)** para o **Supabase (SQL)**.

Se você está lendo isso no futuro, saiba que **metade do caminho já está andado**.

---

## 1. O Seu Backup Seguro (O Arquivo ZIP)

Fique tranquilo: **O seu arquivo ZIP atual contém 100% do que você precisa para rodar o sistema do zero.**

*   **Frontend & Backend:** Toda a interface, telas, botões e integrações com Gemini e Evolution API (WhatsApp) estão preservados.
*   **Esqueleto do Banco de Dados:** O arquivo `firebase-blueprint.json` contém o mapa completo de todas as tabelas (coleções) e campos do sistema.
*   **Recriação Automática:** Se o banco for apagado, basta conectar um Firebase vazio. O código (Firebase NoSQL) recria as coleções automaticamente no momento em que o primeiro dado é salvo.
*   **Segurança:** As fechaduras do banco estão no arquivo `firestore.rules`. Para proteger um banco novo, basta rodar o comando `firebase deploy --only firestore:rules` na sua VPS.

---

## 2. O Que Já Foi Feito Para o Supabase? (O Caminho Andado)

Pensando no momento em que o Astrum tiver milhares de usuários e o Firebase começar a ficar caro, nós já preparamos o terreno para o **Supabase**:

1.  **SDK Instalado:** O pacote `@supabase/supabase-js` já faz parte do sistema (`package.json`).
2.  **Variáveis Prontas:** O arquivo `.env.example` já possui os campos `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` esperando para serem preenchidos na sua VPS.
3.  **Cliente Configurado:** O arquivo `src/lib/supabase.ts` já existe e possui a engrenagem pronta para iniciar a conexão assim que as chaves forem inseridas.

---

## 3. Passo a Passo da Migração (Para você e para a IA do futuro)

Quando você decidir que chegou a hora de dar adeus ao Firebase e usar o Supabase, entregue este documento para a IA e siga os passos abaixo:

### Passo 1: Criação do Projeto no Supabase
*   **Você:** Cria uma conta no Supabase (supabase.com) e inicia um novo projeto.
*   **Você:** Pega a **Project URL** e a **anon public API key**.
*   **Você:** Coloca essas duas chaves no arquivo `.env` do seu servidor (VPS).

### Passo 2: Geração da Estrutura SQL
*   **Você pede para a IA:** *"Leia o arquivo `firebase-blueprint.json` e crie um script SQL para criar todas essas tabelas no Supabase."*
*   **A IA:** Vai ler o blueprint e te devolver um código SQL (com `CREATE TABLE`, `UUID`, relacionamentos, etc.).
*   **Você:** Roda esse script SQL no painel "SQL Editor" do Supabase. (Isso criará o "Esqueleto" rígido lá).

### Passo 3: Refatoração do Arquivo `db.ts`
*   **Você pede para a IA:** *"Agora, reescreva todo o conteúdo do arquivo `src/lib/db.ts`, trocando todas as funções do Firebase (`addDoc`, `getDocs`, `onSnapshot`) pelas funções equivalentes do Supabase (`supabase.from().insert()`, `supabase.from().select()`)."*
*   **A IA:** Fará a troca completa de motor. Como o sistema inteiro usa o `db.ts` como ponte, o resto do sistema (Frontend) nem vai perceber que o banco mudou.

### Passo 4: Migração da Segurança (Vulnerabilidades)
*   No Firebase, nós usamos o `firestore.rules` para segurança.
*   No Supabase, nós usamos **RLS (Row Level Security)**.
*   **Você pede para a IA:** *"Analise o arquivo `firestore.rules` e gere as políticas RLS equivalentes no Supabase para preteger as tabelas de inserções, leituras e deleções indevidas."*

### Passo 5: Migração da Autenticação
*   A IA deverá substituir as funções de Login do Google (`signInWithPopup` do Firebase) para a versão do Supabase (`supabase.auth.signInWithOAuth`).

---

## Conclusão

Se você chegou aqui, o sistema está blindado. Você tem a flexibilidade e escalabilidade inicial do Firebase NoSQL, com a porta escancarada para a robustez de um Supabase SQL quando a empresa escalar. Pode seguir construindo sem medo!
