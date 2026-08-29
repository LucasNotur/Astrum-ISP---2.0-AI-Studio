# CHECKLIST — Pendências que exigem dados/acessos externos

> Atualizado pela IA ao final de cada sessão P-XX.
> Cada item que NÃO pode ser resolvido sem dados reais (API key, instância de ERP, credencial) fica aqui.
> Itens que podem ser executados com Supabase local já são aplicados diretamente pela IA.

---

## Como usar

- **[ ] aberto** — ainda pendente, aguarda Lucas.
- **[x] feito** — Lucas confirmou ou IA aplicou.
- **[~] parcial** — executado com fallback/mock; precisa validação com dado real.

---

## MIGRATIONS (Supabase local)

| # | Migration | Status | Sessão |
|---|-----------|--------|--------|
| 062 | `p1_trust_unlock` | [x] aplicada pela IA | P1 |
| 063 | `p1_negotiation_policies` | [x] aplicada pela IA | P1 |
| 064 | `p1_outage_notifications` | [x] aplicada pela IA | P1 |
| 065 | `p2_meta_pages` | [x] aplicada pela IA | P2 |
| 066 | `p2_email_inboxes` | [x] aplicada pela IA | P2 |
| 067 | `p3_sales_leads` | [x] aplicada pela IA em 2026-07-11 | P3 |
| P4 | *(sem nova migration)* | [x] usa tabelas existentes: customers, invoices, service_orders | P4 |

> Próximas migrations serão aplicadas automaticamente pela IA via `tsx packages/db/src/migrate.ts`.

---

## CREDENCIAIS / CONFIGURAÇÕES DE AMBIENTE

> **RECLASSIFICADO 2026-08-24 (correção de arquitetura do Lucas):** Astrum é SaaS
> multi-tenant — cada ISP assinante configura as PRÓPRIAS credenciais (IA, SMTP,
> assinatura digital) via Configurações → Integrações depois que assina, não é a
> Astrum quem fornece/paga essas contas. Os itens abaixo deixam de ser "aguarda
> Lucas conseguir a credencial" e viram "self-service, cada tenant resolve a sua".
> As envs globais (`OPENAI_API_KEY`, `SMTP_*`, `CLICKSIGN_API_KEY` etc.) continuam
> existindo só como FALLBACK (ex.: trial sem chave própria ainda, ou uso interno
> da Astrum) — ver `astrum-saas-byok-multitenant` na memória do Claude Code.

### P2 — Omnichannel
- [x] **OpenAI/Gemini/Anthropic — BYOK por tenant CORRIGIDO (2026-08-24).** Achado:
  a Settings UI já tinha campo pra cada tenant colar a própria chave (cifrada em
  `tenants.integration_keys`), mas o motor de IA (`model-router.ts`) nunca lia
  essa coluna — sempre usava a env global da Astrum, mesmo com o tenant
  configurando a própria. Corrigido: `getModel`/`withFailover` resolvem a chave do
  tenant 1x por chamada (`resolveTenantAiKeys`), prioridade sobre o env global.
  Bônus: os botões Salvar Gemini/Anthropic também estavam gravando em texto puro
  direto do browser na coluna errada (`tenants.integrations`, não
  `tenants.integration_keys`) — corrigido pra usar a mesma rota cifrada do OpenAI.
- [x] **SMTP — BYOK por tenant CONSTRUÍDO (2026-08-24).** Não existia UI nem
  leitura por tenant — `email.adapter.ts` só lia `SMTP_*` global. Criado
  `resolveTenantSmtpConfig` + card "E-mail (SMTP)" em Configurações →
  Integrações (host/porta/usuário/senha/remetente, senha cifrada).
- [x] **Clicksign/D4Sign — BYOK por tenant CONSTRUÍDO (2026-08-24).** Idem SMTP:
  `contract.service.ts` só lia env global. Criado `resolveTenantContractKeys` +
  cards Clicksign/D4Sign (categoria nova "Contrato").
- [ ] **META_WEBHOOK_VERIFY_TOKEN** / **FACEBOOK_APP_SECRET** — ficam globais de
  propósito (são do App Meta da própria Astrum, Tech Provider — não por tenant).
  `page_access_token` (por página conectada) já é por tenant desde antes
  (`tenant_meta_pages`), isso já estava certo.
- [ ] **EMAIL_WEBHOOK_SECRET** — bearer token para o webhook de e-mail inbound (global, é do endpoint da Astrum, não por tenant)

---

## VALIDAÇÕES CONTRA ERP REAL

### P0 — Conectores ERP (adapter implementado, API real não testada)

**Auditoria estática 2026-08-28 (5 subagentes em paralelo, sem credencial real —
código lido contra a própria doc pública de cada API):** achados corrigidos
sem precisar de credencial (bugs de lógica interna, confirmados só lendo o
código) e achados que **continuam pendentes** porque dependem de confirmar o
formato real contra doc oficial/instância — não fixados por incerteza, não
por preguiça. Ver `astrum-erp-adapters-auditoria` na memória do Claude Code
pro relatório completo dos 5 subagentes.

**✅ Corrigido nos 5 adapters (sistêmico, não dependia de doc externa):**
timeout de 15s em toda chamada HTTP (nenhum tinha — ERP travado prendia o
worker indefinidamente); normalização de URL com barra final; corpo de erro
HTTP incluído na exceção (antes só status/statusText).

**✅ Corrigido — IXC:** os métodos (exceto `suspendCustomer`, que já tratava)
ignoravam o padrão `type:"error"` que o IXC devolve com HTTP 200 em erro de
negócio — `generateSecondCopy` chegava a devolver um "boleto" com todos os
campos vazios em vez de lançar. Agora todos os métodos de leitura/2ª via
lançam quando `type==="error"`.

**✅ Corrigido — MK-Auth:** `generateSecondCopy` caía pro **primeiro boleto da
lista** quando o `invoiceId` pedido não era encontrado — risco real de mandar
a cobrança de uma fatura diferente da que o cliente pediu. Agora lança.
`res.json()` também não tratava resposta não-JSON (painéis PHP às vezes
devolvem HTML de erro com status 200) — agora lança erro claro em vez de
`SyntaxError` opaco.

**⚠️ Continua pendente — precisa de doc oficial/instância real, NÃO fixado
por incerteza (risco de "corrigir" errado sem poder testar):**
- [ ] **IXC** — validar `IXCAdapter` contra instância real (segue pendente,
  sem ambiente de teste gratuito):
  - endpoints: `/webservice/v1/cliente`, `/fn_areceber`, `/radusuarios`, `/get_boleto`, `/cliente_desbloqueio_confianca`
  - P3 new: `/viabilidade`, `/plano_acesso`, `/cliente` (POST create), `/os` (POST create)
  - **Suspeita descartada 2026-08-29:** a dúvida era se `token` deveria
    concatenar `api_client:token` antes do base64. Confirmado contra dois
    SDKs comunitários independentes do IXC lidos direto do código-fonte
    (`github.com/LSaints/ixc-sdk`, `src/resources/base.ts`: `` `Basic
    ${btoa(this.apiKey)}` `` — só o token, sem concatenação; e
    `github.com/isacna/ixc-soft-api`) mais a doc oficial (wiki.ixcsoft.com.br,
    achada via busca — token tem o formato `id:chave`, é uma string única
    que já vai inteira pro base64). O adapter atual (`Authorization: Basic
    ${Buffer.from(creds.token).toString('base64')}`) já está correto — não
    era bug, nenhuma mudança de código necessária.
- [ ] **Voalle/Elleven** — validar `VoalleAdapter` contra instância real (segue
  pendente, sem ambiente de teste gratuito — a doc oficial existe mas exige
  cliente pagante). **Cache corrigido 2026-08-29** (`erp-oauth-cache.service.ts`,
  Redis compartilhado por tenant+provider — sem isso `erp.factory.ts` cria
  instância nova por chamada e reautentica quase sempre). **Reescrito por
  completo 2026-08-29** contra o SDK Go de terceiros
  `github.com/raykavin/elleven-go` (a versão OAuth anterior, JSON contra
  `/oauth/token` no mesmo host, era inventada).
  **Confirmado contra doc oficial 2026-08-29 (mesma sessão seguinte)** — achei
  a doc Postman oficial de verdade: não é a URL morta indexada pelo Google
  (`postman.com/desenvelite/voalle-integrator`), é
  `documenter.getpostman.com/view/16282829/TzzBqFw1` ("API's para Terceiros -
  ERPVoalle", 137 endpoints), achada buscando o nome do produto em vez da URL
  antiga. A página é SPA e não aparece pro `WebFetch`/`get_page_text` (só a
  Introdução) — a collection real vem de
  `documenter.gw.postman.com/api/collections/{id}/{token}`, achada no HTML
  cru. **Tudo que já tínhamos do SDK bateu exatamente** com a doc oficial
  (portas, form fields do auth, paths) — e a doc trouxe 2 correções reais que
  o SDK não expunha:
  - Auth roda numa **porta separada do resto da API** no mesmo host (`:45700`
    auth, `:45715` API — confirmado oficialmente, não só pelo SDK).
  - `POST {authUrl}/connect/token`, form-urlencoded,
    `grant_type=client_credentials&scope=syngw` + `client_id`/`client_secret`
    (Suíte → Configurações → Usuários, usuário "Integrador") +
    **3º segredo `syndata`** (Suíte → Configurações → Parâmetros →
    Integração/Mapa).
  - Cliente: `GET /external/integrations/thirdparty/people/txid/{cpf}`.
  - Faturas: `GET .../getopentitlesbytxid/{cpf}` (abertas) e
    `.../gettitlesbytxid/{cpf}` (todas, usado pra 2ª via) — boleto/PIX prontos
    no título (`billet.pixQRCode`, `billet.typefulLine`).
  - **CORRIGIDO — link de boleto**: existe sim `GET .../GetBilletLink/{id_fatura}`
    (`response.link`), que o SDK não expunha — a 1ª reescrita deixava
    `boletoUrl` vazio "por honestidade" achando que não existia; existia, só
    não estava na fonte usada. `GetBillet/{id}` continua sendo o PDF binário
    direto, sem URL — não usado (`SecondCopyResult.boletoUrl` é string).
  - Conexão: `.../getaccesspointstatusbyclient/{id}` — confirmado no response
    de exemplo oficial (`{title, inMaintenance, maintenance, active}`) que é
    mesmo **status do ACCESS POINT/OLT, não sessão RADIUS por cliente**.
  - **CORRIGIDO — resolução CPF→contrato pro desbloqueio**: `unlockCustomer`
    antes exigia que quem chamasse já soubesse o número do contrato (a API de
    unlock usa `contractNumber`, não CPF, e o SDK não resolvia um a partir do
    outro). Achei `POST .../contract/getpaged`
    (`{txId: cpf, onlyActiveContracts: true, page: 1, pageSize: 1}` →
    `response.data[0].contractNumber`) — `unlockCustomer` agora aceita CPF
    como os outros métodos deste adapter, resolvendo o contrato sozinho.
  - Wizard: `url` (sem porta) + `clientId` + `clientSecret` + `syndata`
    (sem mudança nesta rodada). Suite Voalle: 20/20 verde, 135/135 na suite
    ERP completa, typecheck limpo.
- [ ] **MK Solutions / MK-Auth** — validar `MKAuthAdapter` contra instância
  real (segue pendente, sem ambiente de teste gratuito). **Reconfirmado
  2026-08-29** navegando ao vivo no demo público (`mkauth-br.marracloud.com.br`,
  login teste/teste) em vez de só ler o `menu.js.hhvm` estático — abri o menu
  completo (PROVEDOR/CADASTROS/CLIENTES/FINANCEIRO/SUPORTE/CENTRAL/HOTSITE/
  CONEXÕES, todas as seções) e tentei "Controle de funcionarios" (o item mais
  próximo de "Controle de usuários" que existe nessa instância) — é só um
  cadastro de RH (nome/CPF/endereço/salário), sem aba de login nem API. Não
  existe *nenhum* jeito de gerar `Client_id`/`Client_secret` nesse demo,
  confirmado por exploração interativa, não só leitura de código. Também
  investiguei outro suposto demo (`demo.painelbr.com.br`, achado num fórum
  MK-Auth) — não resolve DNS e a descrição do próprio fórum ("gerenciador de
  domínios... hospedagem e revenda") não tem nada a ver com MK-Auth; provável
  spam/post fora de tópico no fórum, descartado.
  **Reescrito por completo 2026-08-29** (decisão do Lucas: mesmo tratamento
  do Hubsoft — doc oficial sólida o bastante mesmo sem poder testar ao vivo).
  A API real é outra, confirmado contra o **OpenAPI completo baixado de
  `postman.mk-auth.com.br/openapi.yaml`** (11784 linhas, lido por inteiro —
  não resumo/UI screenshot) + `wiki.mk-auth.com.br/doku.php?id=api_basic`:
  - Auth: `GET /api/` com Basic Auth (`Client_id:Client_Secret`, gerados em
    Cadastros → Controle de usuários → [usuário] → aba API). Resposta é uma
    **string JWT crua no corpo** (não JSON com campo "token") — o adapter
    decodifica o próprio claim `exp` do JWT pra saber quando expira (~10min
    no exemplo oficial). `Authorization: Bearer <jwt>` nas chamadas seguintes.
  - Clientes: `GET /api/cliente/listar/<campo>=<valor>` (filtro livre — usamos
    `cpf_cnpj`) e `GET /api/cliente/show/{login}`.
  - Títulos: `GET /api/titulo/aberto/{cpf_ou_login}` e
    `GET /api/titulo/show/{uuid}`. **A API não devolve link de boleto PDF**
    (campo `url` do título é sempre `null` no exemplo oficial) — só linha
    digitável (`linhadig`) e PIX (`pix`/`pix_link`/`pix_qr`). `boletoUrl` no
    `SecondCopyResult` fica vazio por honestidade (não inventamos link).
  - Bloqueio/desbloqueio: **achado novo que a auditoria anterior (baseada só
    na lista de endpoints) não pegou** — não existe endpoint dedicado, mas o
    campo `bloqueado` ("sim"/"nao") do registro do cliente é editável via
    `PUT /api/cliente/editar` com `{ uuid: <uuid_cliente>, bloqueado: "nao" }`.
    `unlockCustomer` resolve o `uuid_cliente` via `cliente/show` primeiro (a
    API não aceita `login` direto no `editar`), depois edita. Sem endpoint
    equivalente ao `radusuarios` do IXC (sessão RADIUS ao vivo) —
    `getConnectionStatus` usa `bloqueado` como proxy (bloqueio administrativo/
    financeiro, não sessão de rede em tempo real), mesma limitação documentada
    nos outros adapters.
  - `customerId` nos métodos do adapter é tratado como o **login** do MK-Auth
    (aceito tanto pelos endpoints de título quanto pelos de cliente).
  - Autenticação dual-mode igual Voalle/Hubsoft: `clientId`+`clientSecret`
    (troca via Basic Auth) OU `token` pré-gerado direto como Bearer. Cache de
    JWT local + `tokenCache` Redis compartilhado (mesmo `erp-oauth-cache.service.ts`
    do Voalle/Hubsoft) — sem isso o TTL curto do JWT (~10min) faria
    reautenticar ainda mais que os outros dois.
  - Formulário do wizard atualizado: `url` + `clientId` + `clientSecret`
    (era `url` + `user` + `password`, campos que o adapter antigo nem lia).
  Suite: 173/173 verde, typecheck limpo.
- [x] **SGP/TSMX — ✅ VALIDADO AO VIVO 2026-08-29** contra `demo.sgp.net.br`
  (ambiente de demonstração público e self-service da própria TSMX, dados
  fictícios isolados de produção — nenhum custo, nenhum contato comercial).
  A suspeita da auditoria estática era parcialmente certa e o adapter foi
  **reescrito por completo** (não era só um campo faltando):
  - Autenticação real: `token` + `app` (nome EXATO da Aplicação cadastrada
    no painel SGP, case-sensitive — ex.: "Chatbot") enviados como campos de
    **form-data no corpo** — não como header, e o corpo NÃO é JSON.
  - Endpoint único real: `POST /api/ura/clientes/` com `cpfcnpj` (sem
    underscore, sem máscara) — devolve o cliente completo (cadastro +
    TODOS os contratos + TODOS os títulos/boletos) numa resposta só. Os 5
    endpoints antigos (`/api/v2/contratos`, `/financeiro/faturas`, etc.)
    não existiam.
  - A API só busca por CPF/CNPJ — não existe lookup por ID interno. Os
    métodos do adapter (`getBillingStatus`/`generateSecondCopy`/
    `getConnectionStatus`) agora esperam CPF no parâmetro `customerId`, não
    o `customers.id` do Astrum. O chamador (`tools.executor.ts`) hoje passa
    o id interno — precisa resolver `customers.cpf` antes de chamar o
    adapter quando o provider for SGP (mesmo gap de `customers.cpf`/
    `legacy_id` já registrado abaixo, não é bug novo).
  - **CORRIGIDO 2026-08-29 — `unlockCustomer` implementado.** O nome real é
    "Liberação por Confiança", não "desbloqueio de confiança" — por isso os
    nomes de endpoint testados antes (`/api/ura/desbloqueio/`, `/confianca/`,
    `/trust/`) nunca existiam, e por isso a busca textual no
    bookstack.sgp.net.br por "desbloqueio"/"confiança" dava 0 resultados.
    Achado na **collection Postman oficial** (linkada em
    `tsmx.net.br/developers`, achada buscando o nome do produto):
    `POST /api/ura/liberacaopromessa/`, form-data com `token`+`app`+
    `contrato` (**ID do contrato, não CPF**) — `unlockCustomer` resolve isso
    sozinho buscando o cliente por CPF primeiro. Existe uma versão paralela
    em `/api/central/promessapagamento/` (auth por CPF+senha do cliente
    final, categoria diferente) — não usada aqui. Campo do ID do contrato na
    resposta de `/api/ura/clientes/` tem uma divergência não resolvida: o
    teste ao vivo de 2026-08-28 usa `contratos[].id`, o exemplo da collection
    oficial usa `contratos[].contrato` — código aceita os dois por segurança,
    mas isso não foi testado ao vivo (só a busca de cliente foi).
  - **MELHORADO 2026-08-29 — `getConnectionStatus` agora usa sessão RADIUS
    real quando disponível.** A collection oficial revelou que
    `/api/ura/clientes/` já embute `contratos[].servicos[].onu.conexao.status`
    (conexão de verdade, não proxy administrativo) pra serviços FTTH/ONU —
    isso não tinha aparecido no teste ao vivo original porque a instância
    demo usada não tinha serviço FTTH cadastrado. Cai pro status
    administrativo do contrato (Ativo/Bloqueado) só quando nenhum serviço
    tem esse campo.
  - Frontend (`ERPIntegrationsPage.tsx`) e validação do wizard
    (`erp-admin.routes.ts`) atualizados para exigir/coletar `credentials.app`
    — antes disso um tenant configurando SGP não tinha nem como preencher
    esse campo.
  - Suite SGP: 13/13 verde nesta rodada (bate o mesmo contrato dos 127 testes
    de regressão anteriores). Commit no main.
- [ ] **Hubsoft** — validar `HubsoftAdapter` contra instância real (segue
  pendente, sem credencial de tenant real). OAuth2 (grant `password`,
  `client_id`+`client_secret`+`username`+`password`) confirmado contra a doc
  oficial (github.com/hubsoftbrasil/api) — tentei validar ao vivo contra
  `api.dev.hubsoft.com.br` com as credenciais de exemplo (mortas, 401), mas
  confirma que a URL/formato do request são reais (servidor respondeu de
  verdade, não é domínio inventado).
  **Endpoints de negócio corrigidos 2026-08-29** — a 1ª reescrita usava paths
  inventados (`/api/v1/clientes`, `/api/v1/financeiro/cobrancas/.../segunda-via`).
  Corrigido contra a **collection Postman oficial publicada**
  (docs.hubsoft.com.br → `/api/collections/23327122/2sA35LUysW`, 189
  endpoints com exemplos de resposta reais, timestamps de julho/2026 — não é
  doc estática, vem de uma conta de teste viva regenerada periodicamente):
  `GET /api/v1/integracao/cliente?busca=cpf_cnpj&termo_busca=<cpf>` (clientes),
  `GET .../cliente/financeiro?busca=id_cliente_servico&termo_busca=<id>`
  (faturas — boleto/PIX já vêm prontos, não existe endpoint de "gerar 2ª
  via"), `busca=id_cliente_servico&ultima_conexao=sim` embutido na mesma
  consulta de cliente (conexão — último acct RADIUS, não status ao vivo
  separado), `POST .../cliente/desbloqueio_confianca` (desbloqueio).
  `customerId` nos métodos = `id_cliente_servico` (serviço/plano, não
  cliente). Suite: 19/19 verde. Commit no main.
  **Reconfirmado 2026-08-29** contra uma 2ª fonte independente: o repositório
  GitHub `hubsoftbrasil/api` versiona a própria collection Postman
  (`Postman Collections/postman_doc.json`, 1.1MB, commit mais recente de
  2024-03-25 — mais antiga que a versão de julho/2026 já usada, mas
  git-versionada, então dá pra checar estabilidade). Todos os paths usados
  aqui (`/cliente`, `/cliente/financeiro`, `/cliente/desbloqueio_confianca`)
  são idênticos nas duas versões — 2+ anos sem mudar, boa evidência de
  estabilidade. Achei também `GET /cliente/extrato_conexao` (histórico de
  sessões RADIUS com `acctstoptime`) — não usado porque o embutido
  `ultima_conexao=sim` já resolve com 1 chamada só, sem alteração de
  comportamento. Não achei sandbox/trial self-service (a doc oficial e o
  fórum concordam: precisa autorização do gestor da empresa via suporte).
- [ ] **RadiusNet** — validar `RadiusNetAdapter` contra instância real (segue
  pendente, sem ambiente de teste gratuito — é software on-premise, cada ISP
  tem o próprio host). **Reescrito por completo 2026-08-29** — a versão S75
  era inteiramente inventada (`/api/clientes`, `/api/financeiro/segunda-via`,
  Bearer token — nada disso existe). Corrigido contra a **doc oficial
  publicada** (`radius.net.br/api/`, prosa completa com request/response
  reais por endpoint, incluindo os JSONs de exemplo escondidos atrás de um
  toggle "CLIQUE AQUI" só visível no HTML cru, não no texto renderizado):
  - Auth: header `RTOKEN` cru (sem esquema Bearer/Basic). Path base fixo
    `{host}/radiusnet/index.php/api/v1/...` — não é livre, o adapter monta
    esse prefixo, o tenant só informa o host.
  - Cliente: `GET /cp/{cpf}/{status}` (planos do cliente por CPF/CNPJ).
  - Cobrança: `GET /cbc/{filtro}/{id_cliente}` (plano + avulsas juntos).
    2ª via precisa de 3 chamadas combinadas — nenhum endpoint sozinho tem os
    5 campos: `/cbc` pro valor/vencimento/linha digitável, `GET /bc/{id_cobranca}`
    pro link do boleto PDF, `GET /scp/{id_cobranca}` pro Pix copia-e-cola.
  - Desbloqueio: `PUT /ascli/` (body `IDCLI`+`IDSTATUS=2` urlencoded, muda
    status pra "Avisado" — libera velocidade integral por um prazo
    configurável no RadiusNet, não é desbloqueio permanente).
  - **Sem endpoint de sessão RADIUS por cliente** — só `/cl`, lista paginada
    de TODOS os clientes sem filtro por CPF/id. `getConnectionStatus` usa
    status administrativo do plano (`/cp/{cpf}/2`, Ativo) como proxy, mesma
    limitação já documentada nos outros adapters.
  - Formulário do wizard corrigido: pedia `user`+`password` (que o adapter
    nunca leu — nem a versão antiga usava esses campos, só `url`+`token`).
    Agora pede `url` + `token`(RTOKEN).
  Suite: 9/9 verde, typecheck limpo.
- [ ] **RBX (RBXSoft)** — validar `RBXAdapter` contra instância real (segue
  pendente, sem ambiente de teste gratuito). **Reescrito por completo
  2026-08-29** — a versão S75 era inteiramente inventada (REST comum tipo
  `/api/v1/cliente?cpf=`, que não existe). API real é RPC sobre HTTP:
  achei a **doc oficial** (`developers.rbxsoft.com/v2/`) com um link de
  download pra **collection Postman oficial** publicada na própria página,
  baixada e lida por inteiro (194KB).
  - Duas versões coexistem com auth e endpoint diferentes: **v2.0**
    (`POST {host}/routerbox/ws_json/ws_json.php`, header `authentication_key`,
    nome do serviço como chave raiz do corpo JSON) e **v1.0**
    (`POST {host}/routerbox/ws/rbx_server_json.php`, auth embutida no corpo
    em `Autenticacao.ChaveIntegracao`, sem exemplo de resposta documentado
    em lugar nenhum).
  - Conexão: `get_online_customer` (v2.0, confirmado com exemplo real) —
    online = tem sessão RADIUS ativa retornada, esse aqui é sessão de
    verdade, não proxy administrativo como os outros ERPs.
  - Cobrança: `get_unpaid_document` (v2.0, confirmado com exemplo real).
  - 2ª via/linha digitável: só existe em v1.0 (`ConsultaLinhaDigitavelBoleto`)
    — **resposta não documentada em lugar nenhum**, parsing defensivo com
    fallback de nomes de campo (mesmo tratamento usado quando não há doc).
  - Busca por CPF: só existe em v1.0 (`ConsultaClientes`, filtro tipo SQL
    livre) — **campo de filtro por CPF não confirmado** (a doc só mostra
    exemplos com `Codigo`/`Nome`/`Cliente_Codigo`; usei `CPF` por ser a
    suposição mais razoável, sem exemplo oficial).
  - Bloqueio/desbloqueio (`contract_block`/`contract_unblock`) exigem
    `customer_id` **e** `contract_id` juntos — a API não aceita só um.
    `unlockCustomer` resolve o `contract_id` sozinho via
    `get_equipment_customer` antes de chamar `contract_unblock`.
  - Formulário do wizard atualizado (rótulos indicando onde achar a chave —
    Empresa > Parâmetros > Web Services).
  Suite: 11/11 verde, typecheck limpo.

### P1 — Religue por confiança
- [ ] Testar `trust_unlock_policies` com tenant real (verificar fallback para DEFAULT_POLICY se não existir)
- [ ] Testar `trust_unlocks` auditando o fluxo ponta-a-ponta com WhatsApp

### P1 — Notificação de falha em massa
- [x] Criar rota `POST /api/v2/outages/notify` — criada em 2026-07-12 (`outage-notifier.routes.ts`)
- [ ] Validar `outage_notifier.service.ts` enviando notificações reais via Evolution

### P3 — Funil de vendas
- [~] `checkViability` no IXC — implementado com `/webservice/v1/viabilidade`, precisa teste com instância real
- [~] `getPlans` no IXC — implementado com `/webservice/v1/plano_acesso`, precisa teste com instância real
- [~] `createPreRegistration` no IXC — implementado com `POST /webservice/v1/cliente`, precisa teste
- [~] `scheduleInstallation` no IXC — implementado com `POST /webservice/v1/os`, precisa teste

---

## WIZARD DE ONBOARDING (UX)

- [x] **P0 — Wizard "conecte em 15 minutos" — CONFIRMADO já resolvido (2026-08-23).**
  Investigado a fundo: existem TRÊS coisas diferentes chamadas "wizard" no repo, e a
  redação original deste item confundia elas:
  1. `onboarding/wizard.ts` (a que este item pedia pra "reusar") é uma máquina de
     estados de 6 etapas (dados_provedor → plano_saas → integracao_erp → whatsapp →
     base_conhecimento → revisao) que **é código morto** — só o próprio teste chama
     `nextStep`/`wizardProgress`/`canActivate`; nenhuma rota HTTP nem tela usa.
  2. `src/pages/OnboardingWizardPage.tsx` (F6-05) — página REAL, já roteada em
     `/onboarding`, com fluxo próprio de 5 passos (conectar WhatsApp → importar
     histórico → rodar análise → conectar ERP → ver relatório "dinheiro vazando").
     Não usa `wizard.ts`, tem estado local próprio.
  3. Wizard de credenciais ERP (P0-01, `erp-admin.routes.ts`) — API já implementada
     e consumida em `SettingsPage.tsx` → Configurações → Integrações.
  Juntando `SignupPage.tsx` (cadastro + escolha de plano) com o
  `OnboardingWizardPage.tsx`, a experiência "conecte em 15 minutos" **já existe e
  funciona em produção hoje** — só não passa pela máquina de estados `wizard.ts`
  que o texto original deste item citava. A "UX coordenada com Onda 4" que
  bloqueava isso também já foi fechada (Plano C UIUX Operacional, 2026-07-12).
  **Decisão do Lucas:** fechar como resolvido; `wizard.ts` fica como código morto
  pequeno e inofensivo (sem custo de manutenção real), sem deletar por ora.

---

## TABELAS SUPABASE — Dados iniciais necessários para ativação

- [ ] **`trust_unlock_policies`** — inserir 1 linha por tenant piloto com a política personalizada (ou deixar vazio para usar DEFAULT: 2x/ano, R$200)
- [ ] **`negotiation_policies`** — inserir configuração de desconto/parcelamento por tenant piloto
- [ ] **`tenant_meta_pages`** — inserir `page_id + page_access_token` para cada tenant que usar Instagram/Messenger
- [ ] **`tenant_email_inboxes`** — inserir e-mail de entrada por tenant que usar e-mail
- [ ] **`tenant_erp_credentials`** — inserir credenciais criptografadas via `POST /api/v2/erp/credentials` (rota admin já existe)
- [ ] **`plans`** — inserir planos disponíveis para tenants sem ERP configurado (fallback do `getAvailablePlans`)

---

## P4 — Portal do assinante

- [ ] **`customers.cpf`** — popular campo `cpf` e `legacy_id` nos registros de clientes para tenants piloto (lookupSubscriberByCpf depende disso)
- [ ] **`customers.legacy_id`** — mapear nº contrato ERP para todos os clientes ativos (pode ser exportado do IXC/Voalle)
- [x] **Domínio do PWA portal do assinante — DECIDIDO 2026-08-23:** `portal.astrumlabs.online`
  (consistente com o padrão já em uso — `astrumlabs.online` é o app, `api.astrumlabs.online`
  é a API, ambos via Cloudflare Tunnel + Vercel). "Onda 4" que bloqueava isso já fechou
  (Plano C UIUX Operacional, 2026-07-12). **Falta:** configurar o subdomínio no Cloudflare
  DNS + adicionar como domínio no projeto Vercel — ação do Lucas (acesso aos painéis
  externos, fora do alcance das minhas ferramentas hoje). Depois disso, é só apontar o
  build do PWA (P4-01 frontend, ainda não construído) pra esse domínio.

---

## INTEGRAÇÕES EXTERNAS (acordos comerciais)

- [ ] **P6 — OZmap** — contrato de API para integração de planta (grafo de rede)
- [ ] **P6 — Anlix/Flashman** — contrato para telemetria CPE
- [x] **P5-05 — Landing trial — CONCLUÍDO 2026-08-23.** Página `/trial` construída
  (também acessível em `/register`, mesmo componente — `src/pages/SignupPage.tsx`).
  Descoberta no caminho: a página JÁ existia e já chamava `POST /api/v2/trial/signup`,
  mas estava quebrada — descartava o JWT retornado (redirect pra `/dashboard` sem
  sessão, bounce pro login) e 3 das 5 etapas do wizard coletavam dado que nunca era
  enviado no payload (CNPJ/cidade, ERP/clientes, tom de voz da IA — fricção de graça).
  Reescrita: formulário único (nome do provedor + e-mail + senha), sem etapas
  fantasma; sessão real acontece no login normal pós-signup (não tenta reaproveitar
  o JWT `role:'trial'`, que tem escopo próprio — só `GET /trial/insight` e
  `POST /trial/connect-erp`); tokens semânticos do `LoginScreen.tsx` (D-010) em vez
  de cores hardcoded. **Bug real achado e corrigido na verificação:** `AnimatePresence
  mode="wait"` (framer-motion) deixava a UI travada pra sempre em "Criando conta…"
  mesmo com o `setDone(true)` executando certo (confirmado via log de render) — o
  commit no DOM nunca acontecia. Removido, virou renderização condicional direta.
  4 testes novos (`SignupPage.test.tsx`, incluindo regressão do bug acima), suíte
  completa do frontend 617/617 verde, typecheck limpo.

  **🔴 P0 REAL — 3 bugs achados e corrigidos 2026-08-24, pedido "confere se o /trial
  ainda funciona com o login antigo".** O teste de 2026-08-23 (acima) só validou o
  signup em si (formulário, JWT `role:'trial'`); ninguém tinha testado o LOGIN NORMAL
  pós-signup até agora. Resultado: **nunca funcionou de verdade em produção.** Três
  bugs empilhados, achados nessa ordem:
  1. `trial.service.ts` gravava em `tenants`/`users`/`trial_tenants` com o client
     Supabase ANÔNIMO (`supabase`, não `supabaseAdmin`) — a RLS dessas 3 tabelas não
     tem policy pra `public`/`anon` em INSERT, então TODA gravação falhava
     silenciosamente (o código não checava `error`) e a rota devolvia 201 + JWT
     válido mesmo sem nenhuma linha gravada. Confirmado via Supabase MCP: 0 linhas
     pro e-mail de teste. Mesmo bug em `integration-secrets.routes.ts` (Configurações
     → Integrações) e no `tenant-keys.ts` novo desta sessão (BYOK). Fix: os 3 passam
     a usar `supabaseAdmin` (padrão já usado em `login.route.ts`/
     `evolution-webhook.routes.ts`).
  2. Depois de destravar a RLS, apareceu o erro de verdade por trás do 500 genérico:
     `Could not find the 'enabled_modules' column of 'tenants'`. Nenhuma migration
     jamais criou `tenants.enabled_modules` nem `tenants.integration_keys` — código
     assumia que existiam desde que foi escrito. Migration `109_tenants_integration_
     keys_enabled_modules.sql` cria as duas (`jsonb default '{}'`), aplicada via MCP.
  3. `PUT/GET /api/v2/settings/integration-keys` sempre devolvia "Sem tenant" pra
     qualquer usuário logado — lia `user?.tenant_id` (snake_case) mas o JWT do
     apps/api usa `tenantId` (camelCase; confirmado decodificando um JWT real e
     comparando com o padrão de 17 outras rotas que já tratam os dois:
     `tenantId ?? tenant_id`). Mesmo bug (sem fallback) achado em MAIS 10 rotas:
     `erp-admin`, `browse-admin`, `constitution`, `edge`, `labeling`, `mcp-admin`,
     `ocr-review`, `anomaly`, `voice-consent`, `voice` — todas rejeitavam usuário
     autenticado de verdade desde que foram escritas. Corrigido nos 11 arquivos.

  **Validado ao vivo em produção, ponta a ponta, depois dos 3 fixes:** signup real
  (201, `tenantId` de verdade no JWT) → login normal (200, tokens reais) → salvar
  chave em Configurações → Integrações (200 `{ok:true}`) → GET status reflete
  `true` → confirmado no Supabase que o valor está cifrado (`iv:tag:cipher`) no
  banco. Dados de teste (usuários/tenants `QA *`) limpos depois — 3 tenants de
  teste não foram removidos (erro de FK/RLS pré-existente em `ai_decision_log`,
  não relacionado a esta sessão; inofensivos, `plan=radar_trial`, sem dado real).

  Suite completa `apps/api` 2614/2614 verde, typecheck limpo. As 10 rotas do item
  3 não tinham teste dedicado antes (gap pré-existente) — corrigidas sem teste
  novo de rota; registrado como follow-up.

  **✅ RESOLVIDO 2026-08-26 (commit `2880100`).** Auditoria confirmou 45 arquivos
  (não ~54) ainda usando o client anônimo — e, direto no Postgres, que `anon`
  não tem NENHUM grant em NENHUMA tabela desde a 092 (`authenticated` tem 791).
  Ou seja: não era "alguns podem ter o mesmo bug" — todos os 45 tinham, sem
  exceção; a única variável era se a falha aparecia (erro checado, 500 visível)
  ou ficava escondida (erro ignorado, `200 OK` com dado zerado/vazio). 27 dos 45
  eram do tipo silencioso — portal do assinante 100% fora do ar, guardrail
  financeiro de negociação bypassado, dashboard de ROI sempre zerado, painel de
  segurança mostrando falso "tudo ok", app do técnico com 404 pra técnico real,
  entre outros. Fix mecânico idêntico ao dos 3 já corrigidos (`supabaseAdmin as
  supabase`) nos 45 + 14 arquivos de teste que mockavam só o `default` export.
  Suite completa 2763/2763 verde. Ver `astrum-anon-client-fix` na memória do
  Claude Code pro relatório completo (achados + severidade por arquivo).
  **✅ Follow-up também RESOLVIDO 2026-08-26 (commit `f4c4f74`, mesma sessão).**
  38 arquivos tinham `error` ignorado silenciosamente (leitura virando
  `[]`/`0`/`200 OK` mentiroso, ou escrita nunca persistindo sem ninguém
  saber) — corrigidos arquivo por arquivo (não mecânico, cada um com o
  tratamento certo pro seu contexto: throw, log, ou fail-closed deliberado
  em `negotiation-policy.service.ts` — erro na contagem de isenção de multa
  agora bloqueia por segurança em vez de liberar). Suite 2763/2763 verde.
  Ver `astrum-anon-client-fix` na memória pro detalhe completo.

---

---

## S74 — Shadow mode + cutover do atendimento

> **ATUALIZADO 2026-08-17 (decisão do Lucas):** o plano original (shadow 3–7d + replay ≥95%
> ANTES de virar a chave) foi abandonado porque nunca houve tráfego real pra observar
> (0 instâncias Evolution conectadas — ver abaixo) e não há sentido travar o motor v2
> esperando validação contra um legado que também nunca serviu cliente real por esse canal.
> `ATENDIMENTO_ENGINE=v2` **já estava setado no `.env` local desde 2026-08-12** (achado
> nesta sessão — os docs estavam desatualizados, o flag já tinha sido virado sem o gate
> formal). Decisão: manter v2 como default, sem bloquear em validação.

### Pré-condições (histórico)

- [x] **Aplicar migrations** `023_shadow_results.sql` e `047_replay.sql` — já estavam aplicadas; 068 e 069 aplicadas em 2026-07-11
- [x] **`FASTIFY_INTERNAL_URL`** — padrão `http://localhost:3001` funciona para co-localizado; em Docker usar URL do container `api`
- [x] **Subir o `message.worker`** — `createMessageWorker()` adicionado ao boot do Fastify em `apps/api/src/server.ts` (commit 9dcb7dd)
- [x] **`ATENDIMENTO_ENGINE=v2`** — já ativo em produção (`.env` linha 29, desde 2026-08-12)

### ✅ Chaves conectadas (2026-08-18) — mas replay ainda bloqueado (créditos)

- [x] **`OPENAI_API_KEY`** e **`GEMINI_API_KEY`** reais adicionadas ao `.env` (Lucas forneceu).
- [x] **`SUPABASE_SERVICE_ROLE_KEY`** também era placeholder (`iss: supabase-demo`) — achado
  e corrigido na mesma sessão. Isso é mais sério do que o LLM: sem essa chave, **nenhum
  processo local (incluindo o backend de produção nesta máquina) conseguia gravar/ler o
  Supabase real** — só o MCP (credencial própria do Claude) conseguia. Corrigido com uma
  chave `service_role` real fornecida pelo Lucas (formato novo `sb_secret_...`). Testado:
  `supabaseAdmin.from('tenants').select(...)` retorna dado real agora.
- [x] **🐛 BUG REAL achado e corrigido:** `CustomerIntentSchema.extracted_data` (schema Zod
  em `vercel-ai.service.ts`, usado pelo node de classificação de intenção do LangGraph) tinha
  campos `.optional()` dentro de um objeto aninhado — o modo `strict:true` da OpenAI
  Structured Outputs **exige que toda chave apareça em `required`** (não existe "opcional"
  de verdade nesse modo). Isso quebrava **100% das chamadas do motor v2**, mesmo com chave
  válida — todo `classifyIntent()` falhava com `400 invalid_json_schema`. Corrigido trocando
  `.optional()` → `.nullable()` (mesma semântica, mas aceito pelo schema strict). Testes
  atualizados (`vercel-ai.service.test.ts`, 11/11 verdes), typecheck limpo.
- [x] **🐛 2º BUG REAL achado e corrigido (`model-router.ts`):** `getProviderApiKey('google')`
  resolvia `GOOGLE_API_KEY`/`GEMINI_API_KEY`, mas `buildLanguageModel` chamava o `google()`
  default do `@ai-sdk/google` sem passar a key — esse SDK só reconhece
  `GOOGLE_GENERATIVE_AI_API_KEY` por conta própria. `getProviderApiKey()` virava teatro:
  dizia "tem key" (não pulava no failover) mas o client subia sem nenhuma → `LoadAPIKeyError`.
  Corrigido: `buildLanguageModel` agora usa `createOpenAI/createAnthropic/
  createGoogleGenerativeAI({apiKey})` explicitamente pra todos os 3 providers, em vez de
  confiar no lookup implícito de env var de cada SDK. Teste de regressão adicionado
  (`model-router.test.ts`, 36/36 verdes).
- [x] **🐛 3º achado (config, não bug de lógica):** `TIER_MODELS.google` apontava pra
  `gemini-2.5-flash`/`gemini-2.5-pro` — aposentados pela Google
  ("no longer available to new users"). Atualizado pra `gemini-3.6-flash`/`gemini-3.6-pro`
  (flash confirmado pela própria mensagem de erro da API; pro inferido pela convenção, não
  confirmado — revisar se a Google não seguir esse padrão exato).
- [x] **Geração de resposta do motor v2 confirmada funcionando de ponta a ponta via Gemini**
  (2026-08-18) — rodei o smoke-test 3 vezes até esgotar os bugs de credencial/schema/model-id
  acima; a última rodada teve **zero erros de schema/chave/modelo** nas 20 mensagens reais.
- [x] **Judge do replay portado pro failover — CONFIRMADO 2026-08-23.** `judgeOnePair()`
  já usava `withFailover('mini', ...)` desde o commit `6ac5033` (2026-08-18); este item
  do checklist tinha ficado desatualizado (a limpeza de 2026-08-23 não pegou esse texto).
  `.env` já tem `PROVIDER_FAILOVER_ENABLED=true` + `PROVIDER_ORDER=openai,google`.
- [x] **🔴 P0 REAL achado e corrigido rodando o smoke-test pra validar o item acima
  (2026-08-23):** o failover cross-provider **não funcionava de verdade pra NENHUMA
  chamada** (`classifyIntent`, `judgeOnePair`, geração de resposta), mesmo com
  `withFailover` no código certo. Causa: `generateObject`/`streamText` do AI SDK
  esgotam as PRÓPRIAS tentativas internas e embrulham o erro original num `RetryError`
  (`.lastError`) antes de propagar — `isRetryableError()` só reconhecia `APICallError`
  direto, então um `RetryError` (que é o que sempre chega até nós, na prática) caía como
  "não-retryable" e o `withFailover` nunca tentava o próximo provider. Corrigido
  desembrulhando `RetryError.lastError` recursivamente em
  `model-router.ts::isRetryableError`. Corrigido também um segundo problema: o
  `streamWithTools()` (geração de resposta real do chat) usa `getModel()`, não
  `withFailover()` — por design, pra não trocar de modelo no meio de um stream já
  iniciado — mas `getModel()` só checava "essa key existe?", nunca o circuit breaker;
  uma key presente mas sem crédito nunca era pulada. Corrigido: `getModel()` agora
  consulta o circuit breaker (mesmo Redis do `withFailover`) e pula provider com
  circuito aberto, mantendo a escolha ANTES do 1º token (não quebra a regra de UX).
  6 testes novos em `model-router.test.ts` (68 total no arquivo), 42/42 verdes,
  typecheck limpo.
- [x] **Validado com dado real (2026-08-23):** rodei
  `npx tsx -r dotenv/config scripts/replay/run-replay-smoke.ts` duas vezes. ANTES do
  fix: 20/20 pares morriam com `candidate_response: null`, erro OpenAI puro, nunca
  tentava o Gemini. DEPOIS do fix: logs mostram `model-router: skip (circuito aberto)`
  pro `openai`, failover tentando `google`, 11/20 pares geraram resposta candidata real
  via Gemini. O restante falhou porque o **Gemini também bateu em quota** (`"You
  exceeded your current quota"`) — esperado, o smoke-test disparou ~60 chamadas reais
  em poucos segundos contra o tier gratuito. Não é mais bug de código, é limite de
  conta: **hoje nenhum dos dois providers tem capacidade sobrando** (OpenAI: zero
  crédito; Google: rate-limit do próprio teste, deve resetar). `pass_rate` real só sai
  quando pelo menos um provider tiver fôlego — **ação do Lucas:** crédito OpenAI
  (`platform.openai.com/settings/organization/billing`) resolve de vez; sem isso, só
  rodar o smoke-test fora de rajada (poucos pares, espaçados) já deve passar pelo
  Gemini sozinho. **Nota 2026-08-24:** isso vale pro smoke-test interno da Astrum
  (conta própria de dev/teste); em produção, cada tenant paga a própria conta de
  IA (BYOK, ver seção "Credenciais" acima) — não é mais um bloqueio de produto.
- [x] **Gap técnico RESOLVIDO (verificado 2026-08-23):** `createReplayWorker()`
  (`packages/queue/src/workers/replay.worker.ts`) já está importado e chamado
  incondicionalmente no boot (`apps/api/src/server.ts:749-750`), com `setupDLQ`+Sentry, gate
  próprio por `REPLAY_ENGINE_ENABLED` (=`true` no `.env` local). Consumidor real existe — a
  fila `astrum-replay` não fica mais presa em `queued` pra sempre. Não achei o commit exato
  (provavelmente entrou na sessão-maré de 17-18/08), só o registro aqui estava desatualizado.
- [x] **Chaves antigas no processo — RESOLVIDO por efeito colateral (2026-08-23):** o backend
  foi reiniciado várias vezes hoje (restart manual + teste ao vivo do healthcheck monitor, ver
  `astrum-backend-caiu-sem-monitoramento` na memória) — todo processo novo carrega o `.env`
  atual, então as chaves reais (Supabase/OpenAI/Gemini) já valem em produção agora.

### Realidade de tráfego (por que o risco de ter virado cedo é baixo)

- [x] **0 instâncias Evolution conectadas** (`tenant_evolution_instances` vazia) — nenhum
  tenant recebe mensagem real de WhatsApp hoje, então não há cliente afetado pela troca.
- [x] Os 2 tenants existentes têm dados claramente de seed/demo (mensagens em lote, mesmo
  timestamp) — não é tráfego de cliente real.

### Decisão de cutover — feita, mas sem evidência formal

- [x] **`ATENDIMENTO_ENGINE=v2`** já em produção — decisão tomada 2026-08-17 sem o gate de
  equivalência ≥95% (aceito pelo Lucas, dado que não havia como gerar essa evidência sem
  tráfego real nem chave de LLM).
- [x] **🔴 P0 REAL #2 achado e corrigido (2026-08-23) — rodando o smoke-test de novo, sem
  esperar crédito OpenAI (decisão do Lucas: o failover já existe pra isso).** Dessa vez
  a chamada chegou longe o suficiente na OpenAI pra revelar um bug DIFERENTE do de
  failover: as 10 tools do agente (`agentTools` em `vercel-ai.service.ts` — suspend_signal,
  check_invoice, create_ticket etc.) declaravam o schema em `parameters: z.object(...)`,
  mas o `ai@6.0.197` (major version em uso) lê `tool.inputSchema` em runtime, não
  `tool.parameters` — renomeado entre majors do AI SDK. Toda tool virava schema vazio.
  A OpenAI Responses API validou estrito o suficiente pra rejeitar com 400 "schema must
  be a JSON Schema of type object, got type None" assim que uma chamada real de
  tool-calling chegou nela — nunca tinha acontecido antes porque toda chamada morria
  mais cedo (sem crédito). Corrigido: `parameters` → `inputSchema` nas 10 tools + tipo em
  `ai.port.ts`. 2 testes de regressão novos (verificam que a conversão REAL do AI SDK
  produz `type:"object"` pra cada tool — não só que o campo existe). Suite completa do
  apps/api: 2523/2523 verde.
- [x] **Validado ao vivo em produção (2026-08-23):** testei o fluxo `/trial` de ponta a
  ponta direto em `astrumlabs.online/trial` (não só local) — signup real, sucesso real,
  sem erros de console. No caminho, achei e descartei um falso-alarme de CORS
  (`www.astrumlabs.online` rejeitado) que era só o preflight cacheado numa aba de
  navegador que já tinha testado contra um processo de backend antigo/reiniciando —
  confirmado via curl direto que o CORS sempre esteve correto no processo atual
  (`ALLOWED_ORIGINS` no `.env` já incluía a variante `www.`).
- [x] **🔴 Testado — rollback está QUEBRADO (achado 2026-08-23, pós Fase 4).** A Fase 4
  (17-18/08) apagou `server.ts` raiz e `src/routes/evolutionWebhook.ts` (Express) por completo.
  Isso destruiu o caminho de rollback sem ninguém perceber: `resolveEvolutionWebhookMode()`
  (`engine-flags.ts`) — a função que decidia "processa local + espelha" vs "repassa pro v2" —
  **não tem mais nenhum caller em código de produção** (só aparece no próprio teste unitário
  do engine-flags; `evolution-webhook.routes.ts`, a rota v2 real, nunca a chama). Da mesma
  forma, `shouldBootWorker('atendimento', 'legacy')` também só existe no teste — nenhum lugar
  do `server.ts` chama isso pra decidir se sobe o `messageWorker.ts` legado. **Na prática, hoje
  `ATENDIMENTO_ENGINE=legacy` não restaura o atendimento antigo — só põe o worker v2 em modo
  sombra (processa mas não envia nada).** Ou seja: setar essa env de volta pra `legacy` hoje
  = desligar as respostas automáticas, não reverter pro comportamento antigo. `src/workers/
  messageWorker.ts` (67KB) ainda existe no disco mas está órfão — nada mais o invoca.
  **Risco real:** baixo hoje (0 instâncias Evolution conectadas, nenhum tenant real usa
  WhatsApp ainda — ver "Realidade de tráfego" acima), mas isso precisa ficar resolvido
  ANTES do primeiro tenant real ir pro ar, porque a rede de segurança "rollback = trocar a
  env" que o plano original prometia não existe mais.
  **RESOLVIDO 2026-08-23 — decisão do Lucas: opção (a).** Deletado de vez, R5 permite (v2 é
  quem recebe tráfego de produção hoje, não sobrava "legado" de verdade pra reverter):
  `decideSend`/`SendDecisionInput`/`SendDecision` (`shadow-mode.ts`), `getAtendimentoEngine`
  (`engine-flags.ts`), `buildShadowRecord` + `processShadowMessage` (`message.worker.ts`,
  órfão sem `decideSend`), campo `isShadow` no `MessageJobData` e o handling de header
  `x-shadow` em `evolution-webhook.routes.ts` (nada mais o envia — o espelho era o Express,
  já apagado). `computeEquivalenceRate` (usado por `replay.service.ts`) foi mantido —
  não fazia parte do roteamento real-vs-shadow, é só a métrica do replay histórico.
  `message.worker.shadow.test.ts` removido; `engine-flags.test.ts`, `shadow-mode.test.ts`,
  `evolution-webhook.test.ts` atualizados. `CLAUDE.md` e `.env.example` atualizados pra não
  citar mais `ATENDIMENTO_ENGINE` como flag de engine — o freio de emergência real
  (`emergency-stop.service.ts`) já é quem cumpre esse papel. Suíte completa `apps/api`
  (2514/2514) + `packages/queue` (77/77) verdes, typecheck limpo. `messageWorker.ts`
  (`src/workers/`, Express legado) já tinha sido removido em sessão anterior no mesmo dia.

---

*Última atualização: 2026-08-23 (2º P0 real do dia: agentTools usava `parameters` em vez
de `inputSchema` — ai@6 rejeitava toda tool-calling silenciosamente até a OpenAI validar
estrito o suficiente pra revelar; corrigido + validado ao vivo em produção via /trial).*
