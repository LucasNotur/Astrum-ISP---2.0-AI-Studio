# PLANO G — UI/UX 2.0: da paridade à referência de mercado
# Criado em 2026-07-13 por Fable 5. Pesquisa de mercado jul/2026 (fontes no fim).
# Pré-requisito de TODA sessão: abrir a skill `astrum-design` (regra U2).

> **A tese:** o Plano C (U0–U8) tirou a Astrum do feio e a colocou no consistente.
> O Plano G a leva do consistente ao **memorável** — o padrão de Linear, Stripe e
> Attio. E a Astrum tem uma vantagem que nenhum deles tem no nosso nicho: um
> **cérebro** (E-01..E-05) que pode PRIORIZAR pelo usuário em vez de mostrar tudo.

---

## §1 — OS 4 PADRÕES DE 2026 QUE VAMOS ADOTAR (pesquisa de mercado)

1. **Divulgação progressiva (Stripe/Linear).** A tela responde primeiro "está
   tudo bem?" com 5–9 elementos, não 50. Detalhe só sob demanda. Hoje várias
   telas da Astrum despejam tudo de uma vez.
2. **Dashboard IA-nativo (Attio/Hex).** Em vez de o usuário montar gráficos, o
   sistema RANKEIA e mostra "o que você deveria fazer agora". A Astrum já tem o
   motor disso pronto (cérebro noturno + churn + anomalia) — falta a UI consumir.
3. **Command palette como espinha (Linear).** Toda ação acessível por Ctrl+K,
   zero mouse. A Astrum já tem o U3 — falta EXPANDIR para "toda ação", não só busca.
4. **Experiência por papel, não só permissão (2026).** O dono, o atendente e o
   técnico veem interfaces DIFERENTES pelo que FAZEM. O U6 fez por permissão;
   agora é por jornada.

## §2 — AS SESSÕES (G-01 a G-07)

### G-01 — "Home inteligente" por papel (o maior impacto)
Substituir a home genérica por uma que o cérebro monta: as 5–7 coisas que ESTE
usuário deve fazer hoje, rankeadas. Dono vê "3 CTOs em risco, R$ X recuperável,
churn subindo no bairro Y". Atendente vê "12 conversas esperando, 3 urgentes".
Técnico vê "suas 4 OS de hoje, rota otimizada".
- **Consome:** `/api/v2/ia/reflections`, churn, incidentes, filas.
- **Irmão de UI:** o dashboard configurável do U6 (widgets) — mas aqui o cérebro
  escolhe os widgets, não o usuário.
- **Padrão:** divulgação progressiva — 1 número grande de saúde no topo, drill abaixo.

### G-02 — Command palette total (Ctrl+K faz TUDO)
Expandir o `CommandPalette.tsx` (U3) de "busca + navegação" para "toda ação":
criar ticket, suspender cliente (com confirm), rodar scan de KB, abrir incidente,
mudar tema, exportar. Padrão Linear: ações agrupadas, atalhos visíveis, recentes.
- **Irmão:** o próprio `CommandPalette.tsx` já existente.

### G-03 — Detalhe fluido (Attio-style DetailSheet)
Transformar o `DetailSheet` (U1) num painel lateral rico: perfil do cliente com
timeline unificada (conversas + faturas + OS + reflexões da IA sobre ele),
enriquecimento automático (a IA preenche o que sabe sem o usuário digitar).
- **Padrão:** "o CRM já sabe" — dados aparecem sem preencher campo.

### G-04 — Micro-interações e polish (o que faz parecer caro)
Transições de estado (Framer Motion já está no bundle), skeleton loaders em vez
de spinners, otimistic UI nas ações, toasts com desfazer, empty states que
ensinam. É o detalhe que separa "funciona" de "é gostoso de usar".
- **Regra:** nada de animação gratuita — cada uma comunica estado (RN21 do design).

### G-05 — Modo foco do atendente (inbox estilo Linear/Front)
A ChatPage vira um inbox de teclado: J/K navega conversas, atalhos para respostas
prontas, IA sugere a resposta e o atendente aprova com Enter. Volume alto, mão no
teclado. É a tela onde o atendente passa o dia — merece ser a melhor.

### G-06 — Data-viz de referência (Stripe/Amplitude)
Aplicar a skill `dataviz` a TODOS os gráficos: paleta acessível única, mesmo
sistema em claro/escuro, tooltips ricos, sparklines nos cards. Hoje os gráficos
são funcionais mas inconsistentes (BIPage já foi corrigida no U4; falta o resto).

### G-07 — Onboarding "aha em 5 minutos"
O trial Radar (P5-05) tem que dar o "uau" rápido: assim que conecta o ERP, uma
animação revela o dinheiro vazando (churn + inadimplência somados num número
grande) em vez de uma tela vazia esperando dados. O momento-aha vende o upgrade.

## §3 — MÉTRICA DE SUCESSO
Antes/depois com a telemetria de uso do U0: tempo até primeira ação, cliques por
tarefa, uso do Ctrl+K, taxa de conclusão de onboarding. UI boa é mensurável.

## §4 — FONTES DA PESQUISA (jul/2026)
- 925studios — 35 SaaS Dashboard Design Examples 2026
- saasui.design — 7 SaaS UI Design Trends 2026 + biblioteca de padrões
- gitnexa.com — SaaS Dashboard UX Patterns Complete 2026 Guide
- orbix.studio — B2B SaaS Dashboard Examples That Close Deals
Referências vivas a estudar: Linear (command palette + velocidade), Stripe
(divulgação progressiva + data-viz), Attio (IA-nativo + enriquecimento), Mercury
(clareza financeira), Vercel (polish).
