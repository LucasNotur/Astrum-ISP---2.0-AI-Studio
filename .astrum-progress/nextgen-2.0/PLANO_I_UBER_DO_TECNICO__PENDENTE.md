# PLANO I — O "UBER DO TÉCNICO" (Astrum Campo dentro do ISP)

> Status: **PENDENTE** (planejamento aprovado em conversa, execução por sessões)
> Criado: 2026-07-15 · Dono: Lucas
> Relação com outros planos: é a materialização interna do **H-4 (Astrum Campo)** do
> PLANO_H — primeiro nasce DENTRO do produto ISP, depois vira produto avulso.
> Regras: R1 (página nova no frontend legado é permitida), R4 (toda lógica nova em
> `apps/api`), R2 (Supabase único banco).

---

## 0. A tese

O técnico de rua é o funcionário mais caro e menos instrumentado do ISP. Hoje ele
recebe OS por WhatsApp, anota material em papel, ninguém sabe onde ele está, quantos
km rodou, quanto tempo levou, nem se o serviço ficou bem feito. O "Uber do técnico"
resolve isso com o mesmo padrão mental do Uber:

- **Para o técnico:** abre o app → vê a rota do dia otimizada → "a caminho" → chegou
  → executa com checklist + fotos → cliente assina → próxima parada. Zero papel.
- **Para o gestor:** mapa ao vivo com todos os técnicos, SLA de cada OS, km rodados
  por dia/mês, tempo por tipo de serviço, custo por OS — e a IA em cima de tudo.
- **Para a Astrum:** cada foto, tempo e km vira dado proprietário → alimenta o
  gêmeo digital (D-01), o diagnóstico visual (D-06) e futuramente o H-4 standalone.

## 1. O que JÁ EXISTE (inventário — não reimplementar)

| Peça | Onde | Estado |
|---|---|---|
| Tabelas `technicians`, `service_orders`, `network_ctos` | `packages/db/migrations/015` + `073` | Em produção (status pt-BR + en unificados) |
| Diagnóstico de foto por IA (D-06) | `field_photo_diagnoses` (069) + `apps/api/src/domain/campo/field-copilot.*` | Funcional (`POST /api/v2/field/diagnose`) |
| PWA do técnico | `src/pages/TechnicianAppPage.tsx` | UI rica (câmera, assinatura, QR de material, fila offline IDB, jsPDF) porém **100% mock** e chamando `/api/os/optimize-route` que **não existe** |
| RBAC (`service_orders` read/write) | `apps/api/.../rbac.middleware.ts` | Pronto |
| Upload de arquivos por tenant | `src/lib/storage.ts` (`uploadTenantFile`) | Pronto (Supabase Storage) |

**Conclusão:** o MVP é 60% "ligar fios existentes" e 40% modelo de dados novo.

## 2. Modelo de dados (novas migrações, ordem 074+)

### 2.1 Local do cliente — `customer_premises`
O "prontuário do endereço". Sobrevive a trocas de plano e acumula histórico visual.

```sql
customer_premises (
  id, tenant_id, customer_id,
  address, latitude, longitude,        -- coordenada CONFIRMADA pelo técnico no local
  reference_notes,                     -- "portão azul, cachorro bravo, falar com a sogra"
  access_instructions,
  cto_id REFERENCES network_ctos,      -- base/caixa que atende o local
  cto_port INTEGER,
  facade_photo_url,                    -- foto da fachada (a "foto da casa")
  created_at, updated_at
)
```

### 2.2 Mídia da OS — `service_order_media`
Toda foto/documento do trabalho, tipada. É a prova do "antes e depois".

```sql
service_order_media (
  id, tenant_id, service_order_id, technician_id,
  kind CHECK (kind IN ('fachada','antes','depois','equipamento','base_cto',
                       'assinatura','documento','serial','outro')),
  url, thumbnail_url,
  latitude, longitude, taken_at,       -- EXIF/GPS: prova de que a foto foi NO local
  diagnosis_id REFERENCES field_photo_diagnoses,  -- liga com o D-06 quando houver
  note, created_at
)
```

### 2.3 Linha do tempo da OS — `service_order_events`
Cada transição vira evento imutável. É daqui que sai TODA a gestão de tempo.

```sql
service_order_events (
  id, tenant_id, service_order_id, technician_id,
  event CHECK (event IN ('criada','atribuida','aceita','a_caminho','chegou',
                         'iniciada','pausada','retomada','concluida','cancelada',
                         'reagendada')),
  latitude, longitude,                 -- onde o técnico estava no momento
  metadata JSONB,                      -- motivo de pausa, quem reagendou, etc.
  created_at
)
```

Derivados (view/serviço, não coluna): tempo de deslocamento (`a_caminho→chegou`),
tempo de execução (`iniciada→concluida` menos pausas), SLA (criada→concluida).

### 2.4 Checklist — `service_order_checklist_templates` + `service_order_checklist_items`
Template por tipo de OS (instalação FTTH, reparo, mudança de endereço…); os itens
são copiados para a OS na atribuição e marcados pelo técnico (com timestamp).

### 2.5 Materiais — `service_order_materials`
```sql
service_order_materials (
  id, tenant_id, service_order_id,
  name, serial_number,                 -- serial via QR scanner (já existe na PWA)
  quantity, unit, created_at
)
```

### 2.6 Jornada e KM — `technician_shifts` + `technician_locations`
```sql
technician_shifts (
  id, tenant_id, technician_id,
  started_at, ended_at,
  start_odometer_km, end_odometer_km,  -- odômetro manual (foto do painel opcional)
  vehicle, computed_km NUMERIC,        -- km calculado por GPS (comparação/auditoria)
  base_id REFERENCES bases
)

technician_locations (                 -- breadcrumbs GPS (o "carrinho andando no mapa")
  id, tenant_id, technician_id, shift_id,
  latitude, longitude, accuracy_m, speed_kmh,
  recorded_at
)  -- particionada/limpa por retenção (ver §8 LGPD)
```

`bases (id, tenant_id, name, latitude, longitude)` — ponto de partida das rotas.

### 2.7 Rota do dia — `route_plans` + `route_stops`
```sql
route_plans  (id, tenant_id, technician_id, date, status, total_km_estimated,
              optimized_at, algorithm)
route_stops  (id, route_plan_id, service_order_id, position, eta,
              arrived_at, departed_at)
```

### 2.8 Extensões em tabelas existentes
- `technicians`: `+ vehicle, plate, avatar_url, skills TEXT[], base_id`
- `service_orders`: `+ premise_id REFERENCES customer_premises, sla_due_at,
  time_window_start/end` (janela prometida ao cliente, estilo "chegada entre 14h–16h")

## 3. API (`apps/api/src/domain/campo/` — R4)

### 3.1 Ciclo de vida da OS (máquina de estados)
- `GET  /api/v2/field/agenda?date=` — OSs do técnico logado, já na ordem da rota
- `POST /api/v2/field/os/:id/transition` — body `{event, lat, lng, metadata}`;
  valida transições permitidas (ex.: não pode `concluir` sem `chegou`), grava
  `service_order_events` e atualiza `service_orders.status`. **Um endpoint, uma
  máquina de estados testada** — não N endpoints soltos.
- Guard de conclusão: exige checklist 100% (ou justificativa), ≥1 foto `depois`
  e assinatura — configurável por tipo de OS.

### 3.2 Mídia e prova
- `POST /api/v2/field/os/:id/media/sign-upload` — devolve signed URL do Supabase
  Storage (upload direto do device, sem passar pelo servidor)
- `POST /api/v2/field/os/:id/media` — registra a mídia com kind/GPS/EXIF
- `POST /api/v2/field/os/:id/signature` — assinatura do cliente (base64 → storage)
- Reuso: quem enviar foto de equipamento pode encadear o `diagnose` do D-06.

### 3.3 Rota e localização
- `POST /api/v2/field/shift/start|end` — abre/fecha jornada (odômetro opcional)
- `POST /api/v2/field/location` — ping em lote (o app junta N pontos e manda 1
  request a cada 30–60s; economiza bateria e rede)
- `POST /api/v2/field/route/optimize?date=` — v1: **vizinho-mais-próximo + 2-opt**
  (puro TypeScript, zero custo, resolve 95% dos casos de ≤15 paradas/dia).
  v2: OSRM self-hosted ou Google Routes (decisão §8). Salva `route_plan`.
- `GET  /api/v2/field/live` — (gestor) posição atual de todos os técnicos + status

### 3.4 Relatórios (gestor)
- `GET /api/v2/field/reports/km?technician&from&to` — km/dia, km/mês (GPS × odômetro)
- `GET /api/v2/field/reports/tempo` — médias por tipo de OS, por técnico, SLA
- `GET /api/v2/field/os/:id/dossie` — dossiê completo (eventos + fotos + checklist
  + materiais + assinatura) → alimenta o PDF de comprovante

Cálculo de km por GPS: haversine entre breadcrumbs consecutivos com filtros
(descarta accuracy > 50m, saltos > 150 km/h, pontos parados). Odômetro manual do
shift fica como fallback e auditoria cruzada.

## 4. PWA do técnico (evoluir `TechnicianAppPage.tsx` — R1 permite)

Fluxo Uber, tela a tela:

1. **Início do dia:** clock-in (abre shift, odômetro opcional) → rota do dia
   otimizada com ETAs, distância total e mapa.
2. **Card da parada (o "corridinha"):** cliente, endereço, tipo, janela prometida,
   histórico do local (fotos da fachada e instalações anteriores vindas de
   `customer_premises` — o técnico SABE onde está indo). Botões: **Aceitar →
   A caminho** (deep-link Waze/Google Maps para navegação) → **Cheguei**
   (check-in; v2 valida geofence de ~150m).
3. **Execução:** checklist do tipo de OS + foto **antes** (obrigatória) →
   trabalho → materiais via QR (já existe) → foto **depois** (obrigatória) →
   diagnóstico IA opcional por foto (D-06, já pronto) → observações.
4. **Fechamento:** assinatura do cliente (já existe) → PDF de comprovante
   (jsPDF já existe; passa a usar o dossiê real) → **Concluir** → próxima parada.
5. **Fim do dia:** clock-out → resumo: OSs feitas, km rodados, tempo por OS.

**Offline-first:** a fila IDB já existente vira oficial — toda mutação (transição,
foto, checklist) entra na fila e sincroniza quando voltar sinal. Fotos ficam no
IDB até o upload confirmar. Breadcrumbs GPS acumulam localmente e sobem em lote.

Visual: carregar a skill `astrum-design` antes de mexer na tela (padrão do projeto).

## 5. Painel do gestor (página NOVA no frontend legado — permitido por R1)

`src/pages/FieldOpsPage.tsx` — o "mapa da frota":

- **Mapa ao vivo:** técnicos (com status colorido), OSs do dia (pendente/em
  execução/concluída), CTOs. Clique no técnico → rota do dia + replay do trajeto.
- **Dispatch:** atribuir/reatribuir OS arrastando para o técnico; sugestão
  automática (mais próximo + skill compatível + carga do dia).
- **Painéis:** SLA em risco (janela prometida estourando), km/dia e km/mês por
  técnico, tempo médio por tipo de OS, OSs/técnico/dia, custo estimado por OS
  (km × R$/km + hora técnica).
- **Dossiê da OS:** timeline + galeria antes/depois + assinatura — vira o
  comprovante enviado ao cliente por WhatsApp (integra com canais existentes).

## 6. A camada de IA (o que NENHUM concorrente de field service tem)

1. **Diagnóstico por foto** — já existe (D-06). Passa a rodar automaticamente na
   foto "antes" para sugerir ação e materiais.
2. **Validação da foto "depois"** — visão IA confere: a foto mostra serviço
   concluído do tipo declarado? (anti-"foto do chão para fechar OS").
3. **Resumo automático da OS** — GPT-4o-mini gera o `ai_summary` a partir de
   eventos + checklist + diagnósticos → vai no comprovante do cliente.
4. **Previsão de duração** — média histórica por tipo×técnico alimenta ETAs
   reais da rota (hoje seria chute).
5. **Anomalia de rota/tempo** — desvio grande entre rota planejada e executada,
   ou tempo 3× acima da média → alerta discreto ao gestor.
6. **WhatsApp do cliente** — "seu técnico está a caminho, chega ~14h20" com
   link de acompanhamento (a experiência Uber completa) — usa os canais que já
   existem no produto.

## 7. Fases de execução

| Fase | Entrega | Sessões est. |
|---|---|---|
| **I-1 MVP fio-de-ponta** | Migrações §2 (premises, media, events, checklist, materials) + máquina de estados + agenda real na PWA + fotos antes/depois + assinatura + dossiê/PDF real | 2–3 |

> **I-1 FRONTEND LIGADO (2026-07-23):** `src/lib/fieldOps.ts` (camada de dados, R1)
> + `TechnicianAppPage.tsx` religada aos endpoints reais: agenda real no mount
> (fallback IDB/mock offline), otimização via `/route/optimize`, check-in dispara a
> sequência da máquina de estados (aceita→a_caminho→chegou→iniciada), check-out
> chama `concluida` com o gate (checklist/foto/assinatura). Teste de render verde,
> typecheck limpo, sem erros de console no Vite. **Falta:** dossiê/PDF real +
> sign-upload de mídia tipada + popular checklist real (service_order_checklist_items).
>
> **I-1 BACKEND CODE-COMPLETE (2026-07-23):** migration `082_field_ops_uber.sql`
> aplicada no Supabase (todas as tabelas §2 + extensões). Máquina de estados pura
> `apps/api/src/domain/campo/os-lifecycle.service.ts` (gate de conclusão: checklist
> 100% + foto "depois" + assinatura, ou justificativa) + cálculo de KM por GPS
> `field-km.service.ts` (haversine com filtros de accuracy/velocidade/jitter) —
> **35 testes Vitest verdes**. Ports Supabase (`os-lifecycle.repo.ts`) + rotas
> `field-ops.routes.ts` (`GET /api/v2/field/agenda`, `POST /api/v2/field/os/:id/transition`)
> registradas no server.ts. **Falta (frontend):** ligar `TechnicianAppPage.tsx`
> (hoje mock) nesses endpoints + dossiê/PDF real + sign-upload de mídia.
| **I-2 Rotas & KM** | shifts, breadcrumbs, otimizador v1 (NN+2-opt), deep-link navegação, relatórios km/tempo | 1–2 |

> **I-2 CODE-COMPLETE (2026-07-23):** `route-optimizer.service.ts` (NN + 2-opt, puro
> TS — 11 testes) + `POST /route/optimize`. **Shift & relatórios (2026-07-23):**
> endpoints `POST /shift/start`, `POST /shift/end` (km por GPS via computeShiftKm +
> auditoria odômetro), `POST /location` (breadcrumbs em lote), `field-reports.service.ts`
> (deriva deslocamento/execução/SLA dos eventos + agrega km-dia/tempo-tipo, 10 testes) +
> `GET /reports/km`, `GET /reports/tempo`. **Falta:** deep-link Waze na PWA + captura
> real de breadcrumbs no app (hoje o backend está pronto para recebê-los).
| **I-3 Gestor ao vivo** | FieldOpsPage (mapa + dispatch + painéis + dossiê), WhatsApp "a caminho" | 2 |

> **I-3 MVP CODE-COMPLETE (2026-07-23):** endpoints `GET /field/live` (frota + última
> posição + OSs ativas), `GET /field/reports/km`, `GET /field/reports/tempo` +
> `src/pages/FieldOpsPage.tsx` (rota `/campo`, item na sidebar): KPIs, frota ao vivo
> (auto-refresh 30s), km/dia (recharts), tempo médio por tipo. **Sem mapa Leaflet**
> (dependência não instalada — board data-rich como MVP; mapa fica de evolução).
> **Falta:** dispatch drag-and-drop + dossiê visual da OS na UI + WhatsApp "a caminho".
| **I-4 IA de campo** | validação de foto depois, resumo automático, previsão de duração, anomalias | 1–2 |
| **I-5 → H-4** | extrair para ASTRUM CAMPO standalone (R$ 49/técnico/mês, verticais não-ISP) | pós-Atlas |

DoD por fase: Vitest nos serviços novos (máquina de estados e cálculo de km são
os críticos), `npx vitest run` verde, protocolo §0 do PLANO_MESTRE_V2.

## 8. Decisões em aberto (trazer para o Lucas antes da I-2)

1. **Provedor de mapas:** Leaflet + OpenStreetMap (grátis) para exibição;
   otimização v1 sem provedor (haversine). Google Routes só se precisar de
   trânsito real — custo por request. **Recomendação: começar 100% grátis.**
2. **LGPD do rastreamento:** breadcrumbs de GPS de funcionário exigem política
   interna (finalidade, ciência do técnico, retenção). Proposta: reter pontos
   brutos por 90 dias, agregados (km/dia) para sempre. Rastrear SÓ com shift
   aberto — clock-out desliga o GPS. Isso também é argumento de venda ("respeita
   o técnico"), não só compliance.
3. **Frequência de ping:** 1 ponto/15s em movimento, 1/2min parado, envio em
   lote a cada 60s — equilíbrio bateria × fidelidade do km.
4. **Custo de storage de fotos:** ~4 fotos/OS × compressão client-side (WebP
   ~200KB). 1.000 OSs/mês ≈ 800MB/mês por tenant — ok no Supabase, mas definir
   política de compressão já na I-1.
5. **Assinatura tem valor legal?** Para comprovante operacional sim; se o ISP
   quiser valor jurídico forte, integrar carimbo de tempo depois (não bloqueia).

---

*Preparado em 2026-07-15. Execução segue o protocolo §0 do PLANO_MESTRE_V2.*
