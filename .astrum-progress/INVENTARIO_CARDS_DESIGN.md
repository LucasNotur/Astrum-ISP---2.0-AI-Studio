# Inventário de cards/blocos/botões SEM design — para aplicar o StatusCard (Passo 2)

> Gerado no Passo 1 (clone do card "Network devices"). O componente-clone vive em
> `src/components/tech-app/StatusCard.tsx` (`StatusCard`, `HeroStatusCard`, `StatusBadge`).
> Preview de aprovação: rota `/card-preview` (`src/pages/CardPreview.tsx`).
>
> **Como ler:** ✅ = confirmado por leitura do arquivo. 🔎 = sinalizado por varredura
> (hex hardcoded), precisa confirmação linha-a-linha na hora de aplicar.
> Metodologia: grep de cores `#xxxxxx` em `style={{}}` + leitura dos arquivos do app do Técnico.

---

## Diagnóstico geral

- **Páginas legadas (`src/pages/*`)**: usam majoritariamente shadcn `Card`/`Button`
  (design system já aplicado). Grep de `background:'#...'` inline retornou **0** —
  ou seja, os cards das páginas estão OK; o que falta ali é *padronizar o estilo*
  para o novo visual (barra de acento + badge de status), não "criar do zero".
- **App do Técnico (`src/components/tech-app/*`)**: é onde há cor **hardcoded fora dos
  tokens** `tech.*`. Vários blocos quebram no **tema claro**. É a prioridade da aplicação.

---

## A) Onde o StatusCard entra, por tela

### App do Técnico
| Tela / arquivo | Bloco atual | Vira |
|---|---|---|
| `MyDayView.tsx` — "Timeline do Dia" (l.255) | lista de OS com bolinha+hora+nome | `StatusCard` por OS (status `scheduled`/`in_progress`/`completed` ↔ `os.status`) |
| `MyDayView.tsx` — KPIs (l.144) `KpiCard` | 4 mini-cards | manter grid, aplicar superfície/tokens do card novo |
| `MyDayView.tsx` — "Próxima OS" (l.114) | card azul cheio | `HeroStatusCard` (variante destaque) |
| `AgendaView.tsx` 🔎 | itens de agenda | `StatusCard` por compromisso |
| `ActiveOsView.tsx` 🔎 | blocos da OS ativa | `StatusCard` + badges de etapa |
| `DayRouteView.tsx` 🔎 | jornada hora-a-hora | `StatusCard` por parada |
| `DayReportView.tsx` 🔎 | blocos de métricas | superfície do card novo |

### Páginas legadas (onde a semântica de status casa)
| Tela | Bloco | Vira |
|---|---|---|
| `ServiceOrdersPage.tsx` 🔎 | lista/cards de OS | `StatusCard` (status da OS + `findings` p/ contadores) |
| `TicketsPage.tsx` 🔎 | cards de ticket | `StatusCard` (aberto/andamento/resolvido) |
| `MapPage.tsx` 🔎 | cards de CTO | `StatusCard` (saúde da CTO) |
| `HealthDashboardPage.tsx` 🔎 | blocos de saúde | `StatusCard` + `findings` (nº de alertas por severidade) |
| `MonitoringPage.tsx` / `QualityMonitorPage.tsx` 🔎 | cards de monitor | `StatusCard` |
| `InventoryPage.tsx` 🔎 | itens de estoque | `StatusCard` (em estoque/baixo/zerado) |

---

## B) Cards / blocos / botões SEM design (tokens quebrados) — MARCADOS

### 🔴 Prioridade 1 — `src/components/tech-app/MyDayView.tsx` ✅ (35 hex crus)
Quebra no tema claro; não usa `tech.*`:
- l.146,151,157,162 — `KpiCard` ícones com `#3D5AFE`/`#888`/`#F5A524` hardcoded.
- l.171–177 — barra de progresso: `#666`, `#3D5AFE`, `#1a1a1a` crus.
- l.186 — bloco "Controle de Turno": `#151517`, `#1a1a1a`.
- l.199–210, 226–238 — inputs de odômetro: `#1a1a1a`, `#222`, texto branco fixo.
- l.212–221, 239–249 — botões Iniciar/Encerrar turno: `#E5484D`, `#3D5AFE` fixos.
- l.255–279 — "Timeline do Dia": `#151517`, `#00C2A8`, `#3D5AFE`, `#333`, `#555`, `#ccc`.
- l.300–312 — botão "Instalar App": borda/texto `#3D5AFE` fixos.
- l.319–336 — `KpiCard`: `#151517`, `#1a1a1a` fixos.

### 🔴 Prioridade 1 — `src/components/tech-app/ActiveOsView.tsx` 🔎 (32 hex)
Maior densidade de cor crua do app; blocos da OS ativa e botões de etapa. Confirmar l-a-l.

### 🔴 Prioridade 1 — `src/components/tech-app/ClientDossier.tsx` 🔎 (30 hex)
Dossiê do cliente: cards de dados + botões de ação sem tokens.

### 🟠 Prioridade 2 — `src/components/tech-app/OsBottomSheet.tsx` 🔎 (26 hex)
Bottom sheet da OS: cabeçalho + botões.

### 🟠 Prioridade 2 — `src/components/tech-app/OsReceipt.tsx` 🔎 (12 hex)
Recibo/comprovante de OS.

### 🟡 Prioridade 3 — demais componentes tech-app (hex por confirmar)
`MapView` (13), `NavigationView` (13 — em parte legítimos p/ mapa), `DayRouteView` (9),
`TeachingScreen` (8), `AgendaView` (7), `StatusTimeline` (5), `SpeedIndicator` (4),
`EtaChip` (4), `TurnByTurnBar` (4), `ProfileView` (3), `DayReportView` (1), `RerouteBanner` (1).
> Obs.: parte desses `#` são cores de mapa/ilustração (legítimas). Filtrar na aplicação.

### 🟡 Prioridade 3 — páginas legadas com mais cor crua (padronizar visual, não recriar)
- `BIPage.tsx` (23) 🔎 — cores de gráfico (muitas legítimas) + alguns blocos.
- `AIObservabilityPage.tsx` (9) 🔎
- `SettingsPage.tsx` (6) 🔎 — **onde entra o toggle Desktop/Mobile do Passo 2**.
- `InventoryPage`/`MapPage` (4 cada), `AICostsPage`/`DashboardPage` (3 cada) 🔎.

---

## Notas para o Passo 2 (aplicação)
1. **Portar o StatusCard para tokens `tech.*`**: hoje o clone usa hex exatos da Imagem 1
   (fidelidade). Na aplicação, mapear: accent→`tech.accent`, superfície→`tech.card`,
   badges→`tech.pending/active/done`, mantendo o glow/borda como opção do `HeroStatusCard`.
2. **Tema claro**: todo bloco marcado 🔴 precisa trocar hex fixo por `tech.*` (o proxy já
   é theme-aware) — resolve o clone E o bug do tema claro de uma vez.
3. **Botões**: padronizar os `<button>` crus do tech-app num helper único (superfície +
   estados) alinhado ao card novo.
