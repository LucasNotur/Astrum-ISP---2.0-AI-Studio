# -*- coding: utf-8 -*-
"""
Gerador do Relatório de Auditoria de Segurança — AstrumISP.

Ambiente isolado (venv em ./.venv). Regenerar:
    ./.venv/Scripts/python.exe gerar_relatorio.py

Saída: relatorio-auditoria-seguranca.pdf (A4, margens ~2cm, cabeçalho/rodapé).
Dependências: reportlab, matplotlib (instaladas no venv, nada global).
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")
DATA = "2026-09-01"
PROJ = "AstrumISP"

# ── Paleta (spec do pedido) ───────────────────────────────────────────────────
COR = {
    "critica": "#B91C1C",
    "alta":    "#EA580C",
    "media":   "#D97706",
    "baixa":   "#2563EB",
    "forte":   "#059669",
}
INK = "#0B1220"
MUTED = "#5B6472"
LINE = "#D8DEE9"
BG_SOFT = "#F4F6FA"

SEV_LABEL = {"critica": "CRÍTICA", "alta": "ALTA", "media": "MÉDIA", "baixa": "BAIXA", "info": "INFO"}
SEV_COR = {"critica": COR["critica"], "alta": COR["alta"], "media": COR["media"], "baixa": COR["baixa"], "info": COR["baixa"]}

# ── Achados ───────────────────────────────────────────────────────────────────
# categorias: 1=isolamento, 2=permissao-navegador, 3=idor, 4=segredos, 5=xss
FINDINGS = [
    {
        "id": 1,
        "sev": "alta",
        "cats": [1, 3],
        "titulo": "IDOR e quebra de isolamento de tenant no consentimento de biometria de voz",
        "arquivos": [
            "apps/api/src/domain/ia/voice-consent.routes.ts:23-35",
            "apps/api/src/domain/atendimento/voice-verify.service.ts:14-51",
        ],
        "trecho": (
            "app.delete('/api/v2/ia/voice/consent/:customerId', async (req, reply) => {\n"
            "  const customerId = (req.params as any).customerId;\n"
            "  await revokeConsent(customerId);      // <- sem tenantId\n"
            "});\n"
            "// voice-verify.service.ts\n"
            "export async function revokeConsent(customerId: string) {\n"
            "  await supabaseAdmin.from('voice_biometry_consents')\n"
            "    .update({ revoked_at: ... }).eq('customer_id', customerId);   // sem tenant_id\n"
            "  await supabaseAdmin.from('voice_prints').delete()\n"
            "    .eq('customer_id', customerId);                               // DELETE cross-tenant\n"
            "}"
        ),
        "porque": (
            "O mecanismo de isolamento do projeto é o filtro manual por tenant_id no código "
            "(o backend usa supabaseAdmin com service_role, que BYPASSA a RLS do Postgres). "
            "Os handlers GET e DELETE de consentimento recebem customerId direto do path e chamam "
            "hasConsent(customerId)/revokeConsent(customerId) — nenhum dos dois recebe ou aplica tenant_id. "
            "As funções do service filtram apenas por customer_id. O POST, para comparação, exige e aplica "
            "tenantId corretamente. Qualquer operador autenticado (de qualquer tenant) pode consultar/alterar "
            "o consentimento de um cliente de OUTRO provedor apenas informando o customerId (UUID)."
        ),
        "impacto": (
            "Leitura cross-tenant do status de consentimento LGPD de qualquer cliente e, no DELETE, "
            "revogação do consentimento + EXCLUSÃO das voice_prints (dado biométrico) de clientes de outros "
            "tenants — operação destrutiva e irreversível entre inquilinos."
        ),
        "correcao": (
            "Exigir tenantId do JWT nos três handlers e propagá-lo ao service; alterar as assinaturas para "
            "hasConsent(customerId, tenantId) e revokeConsent(customerId, tenantId), adicionando "
            ".eq('tenant_id', tenantId) em TODAS as queries (voice_biometry_consents e voice_prints). "
            "Idealmente validar posse (canAccessResource) antes de operar."
        ),
        "aceite": [
            "GET/DELETE /api/v2/ia/voice/consent/:customerId retornam 404/nada quando o customer pertence a outro tenant",
            "revokeConsent e hasConsent recebem tenantId e aplicam .eq('tenant_id') em toda query",
            "DELETE de voice_prints filtra por customer_id E tenant_id",
            "Teste Vitest cobrindo tentativa cross-tenant (deve falhar/isolar)",
        ],
    },
    {
        "id": 2,
        "sev": "alta",
        "cats": [2],
        "titulo": "WebSocket aceita token de assinante em canais de operador (autorização insuficiente)",
        "arquivos": [
            "apps/api/src/domain/realtime/websocket.routes.ts:233-246",
            "apps/api/src/domain/realtime/websocket.routes.ts:51-146",
        ],
        "trecho": (
            "async function wsAuthenticate(request, reply) {\n"
            "  const token = request.headers.authorization?.replace('Bearer ', '') ?? request.query.token;\n"
            "  if (!token) return reply.status(401)...;\n"
            "  const payload = request.server.jwt.verify(token);  // só valida ASSINATURA\n"
            "  request.user = payload;                            // sem checar aud/role\n"
            "}\n"
            "// /ws/conversations/:id e /ws/notifications não checam role"
        ),
        "porque": (
            "O decorator HTTP `authenticate` (server.ts:90-97) já bloqueia token de assinante e exige "
            "iss='astrum-api' + aud='astrum-operator' (correções AUTH-01/AUTH-05). Mas as rotas WebSocket usam "
            "um verificador próprio, wsAuthenticate, que apenas valida a assinatura do JWT. Como o token do "
            "portal do assinante (role:'subscriber', aud:'subscriber-portal') é assinado com o MESMO JWT_SECRET, "
            "ele passa em wsAuthenticate. /ws/conversations/:id e /ws/notifications não fazem checagem de role "
            "(só /ws/operator-panel checa). O canal usado é prefixado pelo tenantId do próprio token."
        ),
        "impacto": (
            "Um assinante (cliente final), com seu token de 24h do portal, conecta em /ws/notifications e recebe "
            "as notificações operacionais do ISP (ex.: payment_received com invoiceId e valor de TODOS os clientes) "
            "e em /ws/conversations/:id lê mensagens ao vivo de QUALQUER conversa do provedor iterando conversationId. "
            "É exatamente a classe de furo que a AUTH-01 fechou no REST (inbox de operador), reaberta no WS."
        ),
        "correcao": (
            "Reaproveitar a mesma verificação do decorator `authenticate` no wsAuthenticate: rejeitar "
            "role==='subscriber'/aud==='subscriber-portal' e exigir iss='astrum-api' + aud='astrum-operator'. "
            "Aplicar checagem de role mínima também em /ws/conversations e /ws/notifications. Evitar token em "
            "query string (fica em logs); preferir subprotocolo/header."
        ),
        "aceite": [
            "wsAuthenticate rejeita tokens com aud='subscriber-portal' ou role='subscriber' (403)",
            "wsAuthenticate exige iss='astrum-api' e aud='astrum-operator'",
            "/ws/conversations/:id e /ws/notifications exigem papel de operador+",
            "Teste conectando com token de assinante retorna 401/403",
        ],
    },
    {
        "id": 3,
        "sev": "alta",
        "cats": [2],
        "titulo": "Rotas de configuração privilegiada sem verificação de papel no servidor",
        "arquivos": [
            "apps/api/src/domain/provedor/integration-secrets.routes.ts:24-52",
            "apps/api/src/domain/provedor/settings-page.routes.ts:57-298 (SSO :170, modules, theme, vector-store, embedding)",
            "apps/api/src/domain/provedor/ai-config.routes.ts:35-53",
            "src/pages/SettingsPage.tsx:52 (gate de UI: isAstrum = currentUserRole === 'admin')",
        ],
        "trecho": (
            "// integration-secrets.routes.ts — grava BYOK (OpenAI/Evolution) cifrado\n"
            "app.put('/api/v2/settings/integration-keys', { onRequest: auth }, ...)  // só authenticate\n"
            "// settings-page.routes.ts\n"
            "app.put('/api/v2/settings/sso', { onRequest: auth }, ...)               // só authenticate\n"
            "// ai-config.routes.ts\n"
            "app.put('/api/v2/ai-config/cobrai-settings', { onRequest: auth }, ...)  // só authenticate\n"
            "// Frontend esconde por papel:\n"
            "const isAstrum = currentUserRole === 'admin';  // SettingsPage.tsx:52"
        ),
        "porque": (
            "O RBAC do projeto (requirePermission) é aplicado corretamente em rotas equivalentes (team-page usa "
            "users:write; negotiation usa billing:write; documents usa ai_config:write). Mas estas rotas de "
            "configuração do provedor têm apenas `onRequest: authenticate` — sem requirePermission. O frontend "
            "esconde a tela de Settings por papel (isAstrum === 'admin'), então a permissão só existe no navegador. "
            "Qualquer usuário autenticado do tenant (viewer/operator) pode chamar os endpoints diretamente."
        ),
        "impacto": (
            "Escalonamento de privilégio dentro do tenant: um viewer/operator pode (a) sobrescrever as chaves de "
            "integração BYOK (OpenAI/Evolution) — DoS da IA/WhatsApp ou desvio para chaves do atacante; "
            "(b) alterar o domínio de SSO (settings/sso) — risco de tomada de conta se o login por SSO confiar no "
            "domínio; (c) mudar cadência/limites da régua CobrAI, tema, vector-store e módulos habilitados."
        ),
        "correcao": (
            "Adicionar preHandler requirePermission ao gate de escrita destas rotas (ex.: ai_config:write para "
            "ai-config; um recurso 'settings'/'users' com ação admin para settings e integration-keys). Modelar "
            "'settings' no ROLE_PERMISSIONS. Nunca depender do gate de UI para autorização."
        ),
        "aceite": [
            "PUT em /settings/*, /ai-config/* e /settings/integration-keys exigem papel admin+ no servidor",
            "viewer/operator recebem 403 nesses endpoints (teste automatizado)",
            "Recurso de configuração modelado no RBAC (ROLE_PERMISSIONS)",
            "Auditoria registrada em alterações de SSO e chaves de integração",
        ],
    },
    {
        "id": 4,
        "sev": "media",
        "cats": [4],
        "titulo": "Webhook Meta valida assinatura de forma condicional (fail-open sem FACEBOOK_APP_SECRET)",
        "arquivos": [
            "apps/api/src/adapters/meta/meta-webhook.routes.ts:104-107",
            "apps/api/src/infrastructure/security/webhook-hmac.plugin.ts:10-17",
            ".env.example:70 (FACEBOOK_APP_SECRET vazio por padrão)",
        ],
        "trecho": (
            "if (process.env.FACEBOOK_APP_SECRET &&\n"
            "    (!rawBody || !validateWebhookSignature(rawBody, signature, 'facebook'))) {\n"
            "  return reply.code(401).send({ code: 'INVALID_SIGNATURE' });\n"
            "}\n"
            "// Se FACEBOOK_APP_SECRET NÃO estiver setado, o if inteiro é pulado -> processa sem validar.\n"
            "// /api/v2/webhook/meta também não está no mapa do webhook-hmac.plugin (só /webhook/facebook)."
        ),
        "porque": (
            "A verificação de assinatura do webhook Meta só ocorre quando FACEBOOK_APP_SECRET está definido. "
            "No .env.example essa variável vem VAZIA por padrão e é opcional no validador de env, então em um "
            "ambiente onde não foi configurada a checagem é totalmente pulada (fail-open). Além disso, a rota "
            "/api/v2/webhook/meta não consta no WEBHOOK_ROUTES do plugin HMAC global — a única defesa é o if "
            "condicional do handler."
        ),
        "impacto": (
            "Quando a env não está configurada, um atacante pode injetar mensagens de entrada forjadas em qualquer "
            "tenant (resolvido por pageId) — disparando o pipeline de IA (custo, spam, poluição de conversas). "
            "Explorabilidade condicionada a: canal Meta ativo e FACEBOOK_APP_SECRET ausente (o default)."
        ),
        "correcao": (
            "Tornar a validação fail-closed: se o canal Meta estiver habilitado, exigir FACEBOOK_APP_SECRET e "
            "rejeitar (401) qualquer POST sem assinatura válida, independentemente da env estar setada. "
            "Incluir /api/v2/webhook/meta no mapa do webhook-hmac.plugin ou centralizar a checagem."
        ),
        "aceite": [
            "POST /api/v2/webhook/meta sem assinatura válida retorna 401 mesmo sem FACEBOOK_APP_SECRET (fail-closed)",
            "Boot valida presença de FACEBOOK_APP_SECRET quando o canal Meta está habilitado",
            "Rota meta coberta pela verificação HMAC central",
            "Teste com payload forjado é rejeitado",
        ],
    },
    {
        "id": 5,
        "sev": "baixa",
        "cats": [4],
        "titulo": "Defaults inseguros de configuração sem validação fail-closed universal",
        "arquivos": [
            "apps/api/src/infrastructure/database/supabase.client.ts:5-18",
            "apps/api/src/infrastructure/config/env.validator.ts:188-196",
            "infra/sql/create-zep-user.sql:6",
        ],
        "trecho": (
            "const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ... || 'placeholder';\n"
            "const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ... || 'placeholder_service_role_key';\n"
            "if (supabaseServiceRoleKey === 'placeholder_service_role_key') console.warn(...);  // só AVISA\n"
            "// env.validator: fora de 'produção-like', env inválida degrada-open\n"
            "// create-zep-user.sql: CREATE USER zep_user WITH PASSWORD 'SENHA_FORTE_AQUI';"
        ),
        "porque": (
            "Não há segredos reais commitados (o .env não é versionado; .env.example e docker-compose usam "
            "placeholders/${VAR}). Porém há defaults que só emitem warn (supabase.client) e o validador de env "
            "degrada-open fora de ambiente 'produção-like'. O script SQL do Zep traz uma senha placeholder literal "
            "que vira credencial fraca real se executado sem edição."
        ),
        "impacto": (
            "Baixo em produção (o env.validator faz fail-fast em produção-like e o JWT_SECRET tem fail-fast). "
            "Risco de operar degradado em ambientes mal rotulados (staging/preview) e de credencial fraca se o "
            "script SQL for rodado verbatim. Endurecimento defensivo, não vazamento direto."
        ),
        "correcao": (
            "Rejeitar no boot valores placeholder de chaves Supabase (fail-closed) em qualquer ambiente não-local; "
            "remover a senha placeholder do SQL (exigir via variável) e documentar geração via generate-secrets.sh."
        ),
        "aceite": [
            "Boot aborta se SUPABASE_SERVICE_ROLE_KEY == 'placeholder_service_role_key' fora de dev",
            "Script create-zep-user.sql não contém senha literal",
            "Documentação aponta generate-secrets.sh como fonte dos segredos",
        ],
    },
]

STRONG = [
    ("Segredos fora do versionamento", "`.env` não é rastreado pelo git (apenas `.env.example` com placeholders); nenhum segredo real encontrado no histórico. `docker-compose.yml` usa apenas interpolação `${VAR}`."),
    ("Isolamento de tenant consistente", "A esmagadora maioria das rotas aplica `.eq('tenant_id', tenantId)` ou repassa o tenantId ao serviço: customers, team, notifications, departments, documents, hsm-templates, negotiation, settings (dados), voice/calls, network-twin, campaigns, subscriber-twin, foundry, playbook, cobrai-dispatch."),
    ("Autenticação endurecida", "O decorator `authenticate` (server.ts) bloqueia token de assinante e exige iss/aud de operador (AUTH-01/AUTH-05); JWT_SECRET < 32 chars aborta o boot."),
    ("RBAC presente nas rotas críticas", "requirePermission aplicado em team, negotiation, documents, hsm-templates, campaigns; gate super_admin correto em super-admin.routes (só super_admin passa em reports:admin)."),
    ("Webhooks defensivos", "HMAC valida contra rawBody cru com timingSafeEqual e fail-closed (webhook-hmac.plugin); Asaas usa token estático em comparação timing-safe fail-closed."),
    ("Regras de negócio anti-abuso", "negotiation recomputa valores no servidor e exige auditoria imutável fail-closed antes de afrouxar alçada; /security/unmask nega o reveal se a auditoria não gravar."),
    ("Superfície de XSS mínima", "Sem dangerouslySetInnerHTML com dado de usuário; innerHTML só em templates estáticos (mapa/marcadores); URLs de anexo passam por assinatura server-side (useSignedMediaUrls). Categoria 5 sem achado explorável."),
    ("Camadas de defesa web", "helmet com CSP, CORS por allowlist, lockout anti brute-force no portal, rate-limit e idempotência registrados globalmente."),
]

WEAK = [
    "O isolamento depende de filtro MANUAL por tenant_id (service_role bypassa a RLS) — qualquer handler que esquecer o filtro vaza entre tenants, como ocorreu em voice-consent.",
    "Autorização por papel é aplicada rota a rota; onde falta (WS, settings, ai-config, integration-keys) a permissão fica só no frontend.",
    "Validação de assinatura de webhook condicionada a env presente (Meta) — fail-open silencioso quando não configurada.",
]

RECS = [
    ("P1", "Corrigir o IDOR de voice-consent (Achado 1): tenant_id em hasConsent/revokeConsent e no DELETE de voice_prints. Impacto cross-tenant destrutivo."),
    ("P1", "Fechar o WS (Achado 2): aplicar a mesma verificação de aud/role do decorator authenticate no wsAuthenticate e exigir papel de operador nos canais."),
    ("P1", "Aplicar RBAC no servidor nas rotas de configuração (Achado 3): integration-keys, settings/*, ai-config/*."),
    ("P2", "Tornar a validação do webhook Meta fail-closed (Achado 4) e cobri-la pelo HMAC central."),
    ("P2", "Adicionar um guard de CI (STRICT_TENANT_GUARD/lint) que falhe o build quando uma query tenant-scoped não filtra por tenant_id, prevenindo regressões do tipo Achado 1."),
    ("P3", "Endurecer defaults (Achado 5): rejeitar placeholders de Supabase no boot fora de dev; remover senha literal do SQL do Zep."),
    ("P3", "Adicionar guard de esquema (bloquear javascript:) em href/src derivados de dados, como reforço defensivo em ChatPage/PortalPage."),
]

# ── Gráficos ───────────────────────────────────────────────────────────────────
def _hex(c):
    return c

def grafico_rosca(path):
    contagem = {}
    for f in FINDINGS:
        contagem[f["sev"]] = contagem.get(f["sev"], 0) + 1
    ordem = ["critica", "alta", "media", "baixa", "info"]
    labels, valores, cores = [], [], []
    for s in ordem:
        if contagem.get(s):
            labels.append(f"{SEV_LABEL[s]} ({contagem[s]})")
            valores.append(contagem[s])
            cores.append(SEV_COR[s])
    fig, ax = plt.subplots(figsize=(4.6, 3.4), dpi=200)
    wedges, _ = ax.pie(valores, colors=cores, startangle=90,
                       wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2))
    ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(0.98, 0.5),
              frameon=False, fontsize=9)
    ax.text(0, 0, f"{sum(valores)}\nachados", ha="center", va="center",
            fontsize=13, fontweight="bold", color=INK)
    ax.set(aspect="equal")
    ax.set_title("Achados por severidade", fontsize=11, fontweight="bold", color=INK, pad=8)
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight", transparent=True)
    plt.close(fig)

def grafico_barras(path):
    nomes = {
        1: "1. Isolamento\nde tenant",
        2: "2. Permissão no\nnavegador",
        3: "3. IDOR",
        4: "4. Segredos/\nconfig",
        5: "5. XSS",
    }
    contagem = {k: 0 for k in nomes}
    for f in FINDINGS:
        for c in f["cats"]:
            contagem[c] += 1
    xs = list(nomes.keys())
    ys = [contagem[k] for k in xs]
    # cor da barra = severidade mais alta naquela categoria
    prioridade = ["critica", "alta", "media", "baixa", "info"]
    cor_cat = {}
    for k in xs:
        sevs = [f["sev"] for f in FINDINGS if k in f["cats"]]
        cor_cat[k] = SEV_COR[next((p for p in prioridade if p in sevs), "baixa")] if sevs else "#C7CED9"
    fig, ax = plt.subplots(figsize=(5.4, 3.4), dpi=200)
    barras = ax.bar([nomes[k] for k in xs], ys,
                    color=[cor_cat[k] for k in xs], width=0.62, edgecolor="white")
    for b, v in zip(barras, ys):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.05, str(v),
                ha="center", va="bottom", fontsize=10, fontweight="bold", color=INK)
    ax.set_ylim(0, max(ys) + 1)
    ax.set_yticks(range(0, max(ys) + 2))
    ax.set_ylabel("Nº de achados", fontsize=9, color=MUTED)
    ax.set_title("Achados por categoria", fontsize=11, fontweight="bold", color=INK, pad=8)
    ax.tick_params(axis="x", labelsize=8.5)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color(LINE)
    ax.spines["bottom"].set_color(LINE)
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight", transparent=True)
    plt.close(fig)

ROSCA = os.path.join(HERE, "_rosca.png")
BARRAS = os.path.join(HERE, "_barras.png")
grafico_rosca(ROSCA)
grafico_barras(BARRAS)

# ── Estilos ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name=name, **kw))

S("H1", fontName="Helvetica-Bold", fontSize=20, textColor=colors.HexColor(INK), spaceAfter=10, leading=24)
S("H2", fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor(INK), spaceBefore=14, spaceAfter=8, leading=17)
S("H3", fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor(INK), spaceBefore=8, spaceAfter=4, leading=14)
S("Body", fontName="Helvetica", fontSize=9.5, textColor=colors.HexColor(INK), leading=14, alignment=TA_JUSTIFY, spaceAfter=5)
S("BodyMuted", fontName="Helvetica", fontSize=9, textColor=colors.HexColor(MUTED), leading=13)
S("Small", fontName="Helvetica", fontSize=8, textColor=colors.HexColor(MUTED), leading=11)
S("CodeBox", fontName="Courier", fontSize=7.4, textColor=colors.HexColor("#1F2937"), leading=9.6,
  backColor=colors.HexColor(BG_SOFT), borderPadding=6, spaceBefore=3, spaceAfter=6)
S("CoverTitle", fontName="Helvetica-Bold", fontSize=26, textColor=colors.white, leading=30, alignment=TA_LEFT)
S("CoverSub", fontName="Helvetica", fontSize=12, textColor=colors.HexColor("#D8DEE9"), leading=18)
S("CellSmall", fontName="Helvetica", fontSize=8.2, textColor=colors.HexColor(INK), leading=11)
S("CellMono", fontName="Courier", fontSize=7.6, textColor=colors.HexColor("#1F2937"), leading=10)
S("Chip", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white, alignment=TA_CENTER, leading=10)
S("IssueMono", fontName="Courier", fontSize=7.6, textColor=colors.HexColor("#111827"), leading=10.5,
  backColor=colors.HexColor("#F7F8FA"), borderColor=colors.HexColor(LINE), borderWidth=0.5,
  borderPadding=8, spaceBefore=4, spaceAfter=10)

def esc(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def chip(sev):
    return Table(
        [[Paragraph(SEV_LABEL[sev], styles["Chip"])]],
        colWidths=[1.9 * cm], rowHeights=[0.52 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(SEV_COR[sev])),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]),
    )

# ── Documento ──────────────────────────────────────────────────────────────────
MARGIN = 2 * cm
FW = A4[0] - 2 * MARGIN

class Doc(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(path, pagesize=A4,
                         leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=MARGIN + 0.4 * cm, bottomMargin=MARGIN)
        frame = Frame(self.leftMargin, self.bottomMargin,
                      self.width, self.height, id="main")
        cover = PageTemplate(id="cover", frames=[frame], onPage=self._cover_bg)
        normal = PageTemplate(id="normal", frames=[frame], onPage=self._header_footer)
        self.addPageTemplates([cover, normal])

    def _cover_bg(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#0B1220"))
        canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
        canvas.setFillColor(colors.HexColor(COR["alta"]))
        canvas.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
        canvas.restoreState()

    def _header_footer(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(MARGIN, A4[1] - MARGIN + 0.15 * cm,
                          "Relatório de Auditoria de Segurança — %s" % PROJ)
        canvas.setStrokeColor(colors.HexColor(LINE))
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, A4[1] - MARGIN, A4[0] - MARGIN, A4[1] - MARGIN)
        canvas.line(MARGIN, MARGIN - 0.2 * cm, A4[0] - MARGIN, MARGIN - 0.2 * cm)
        canvas.drawString(MARGIN, MARGIN - 0.55 * cm, DATA + "  ·  Confidencial")
        canvas.drawRightString(A4[0] - MARGIN, MARGIN - 0.55 * cm, "Página %d" % doc.page)
        canvas.restoreState()

story = []

# ── CAPA ──
story.append(Spacer(1, 3.2 * cm))
story.append(Paragraph("Relatório de Auditoria<br/>de Segurança", styles["CoverTitle"]))
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph(PROJ, ParagraphStyle("p", parent=styles["CoverTitle"], fontSize=18, textColor=colors.HexColor(COR["alta"]))))
story.append(Spacer(1, 1.2 * cm))
story.append(Paragraph("Data: %s" % DATA, styles["CoverSub"]))
story.append(Spacer(1, 0.5 * cm))
story.append(Paragraph(
    "<b>Escopo auditado.</b> Monorepo AstrumISP — backend de produção apps/api "
    "(Fastify + DDD, ~120 arquivos de rota), frontend legado src/pages (React/Vite), "
    "pacotes packages/* e arquivos de deploy (docker-compose, infra/, scripts/, .env.example). "
    "Banco único Supabase (Postgres) acessado via service_role; Redis; Qdrant.",
    styles["CoverSub"]))
story.append(Spacer(1, 0.5 * cm))
story.append(Paragraph(
    "<b>Nota metodológica.</b> Cada categoria foi mapeada para a stack detectada: "
    "(1) Isolamento de inquilino = filtro manual por tenant_id nos handlers, já que o backend usa "
    "supabaseAdmin/service_role e BYPASSA a RLS do Postgres; (2) Permissão no navegador = cruzamento dos "
    "gates de papel do React (isAstrum/currentUserRole) com requirePermission no Fastify; (3) IDOR = varredura "
    "de todos os handlers com parâmetro de id (path/query/body); (4) Segredos = inspeção de código, configs, "
    "docker-compose, CI, scripts e histórico git; (5) XSS = busca por dangerouslySetInnerHTML/innerHTML/"
    "eval e renderização de dados em href/src no frontend.",
    styles["CoverSub"]))
story.append(PageBreak())

# muda para template com cabeçalho/rodapé
story.append(Paragraph("Resumo executivo", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(COR["alta"]), spaceAfter=10))

tot = len(FINDINGS)
cont = {}
for f in FINDINGS:
    cont[f["sev"]] = cont.get(f["sev"], 0) + 1
resumo = ("Foram identificados <b>%d achados</b>: <b>%d de severidade alta</b>, "
          "<b>%d média</b> e <b>%d baixa</b>. Nenhum achado crítico. Os riscos centrais concentram-se em "
          "<b>controle de acesso</b>: um IDOR cross-tenant destrutivo na biometria de voz, aceitação de token "
          "de assinante em canais WebSocket de operador, e rotas de configuração privilegiada sem RBAC no servidor. "
          "A base é madura (auditorias AUTH-01/05, MT-02 já aplicadas) e o isolamento por tenant é consistente "
          "na maioria das rotas — os furos são pontos específicos que escaparam ao padrão." % (
              tot, cont.get("alta", 0), cont.get("media", 0), cont.get("baixa", 0)))
story.append(Paragraph(resumo, styles["Body"]))
story.append(Spacer(1, 0.3 * cm))

charts_tbl = Table(
    [[Image(ROSCA, width=7.6 * cm, height=5.4 * cm),
      Image(BARRAS, width=8.4 * cm, height=5.4 * cm)]],
    colWidths=[8.0 * cm, 8.6 * cm],
    style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                      ("ALIGN", (0, 0), (-1, -1), "CENTER")]),
)
story.append(charts_tbl)
story.append(Spacer(1, 0.2 * cm))

# tabela-resumo
head = [Paragraph("<b>#</b>", styles["CellSmall"]),
        Paragraph("<b>Severidade</b>", styles["CellSmall"]),
        Paragraph("<b>Categoria</b>", styles["CellSmall"]),
        Paragraph("<b>Achado</b>", styles["CellSmall"])]
CATNOME = {1: "Isolamento", 2: "Permissão/navegador", 3: "IDOR", 4: "Segredos/config", 5: "XSS"}
rows = [head]
for f in FINDINGS:
    rows.append([
        Paragraph(str(f["id"]), styles["CellSmall"]),
        chip(f["sev"]),
        Paragraph(" + ".join(CATNOME[c] for c in f["cats"]), styles["CellSmall"]),
        Paragraph(esc(f["titulo"]), styles["CellSmall"]),
    ])
t = Table(rows, colWidths=[0.8 * cm, 2.1 * cm, 3.2 * cm, FW - 6.1 * cm], repeatRows=1)
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(INK)),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(BG_SOFT)]),
    ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
story.append(t)
story.append(PageBreak())

# ── PONTOS FORTES / FRACOS ──
story.append(Paragraph("Pontos fortes (o que está protegido)", styles["H2"]))
for titulo, desc in STRONG:
    story.append(Paragraph("<font color='%s'>■</font> <b>%s.</b> %s" % (COR["forte"], esc(titulo), desc), styles["Body"]))
story.append(Spacer(1, 0.2 * cm))
story.append(Paragraph("Pontos fracos (riscos centrais)", styles["H2"]))
for w in WEAK:
    story.append(Paragraph("<font color='%s'>▲</font> %s" % (COR["alta"], esc(w)), styles["Body"]))
story.append(PageBreak())

# ── ACHADOS DETALHADOS ──
story.append(Paragraph("Achados detalhados por categoria", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(COR["alta"]), spaceAfter=8))

CAT_TITULOS = {
    1: "Categoria 1 — Banco sem tranca (isolamento de inquilino)",
    2: "Categoria 2 — Permissão definida no navegador",
    3: "Categoria 3 — IDOR (acesso a objeto por id sem posse)",
    4: "Categoria 4 — Chaves expostas / defaults de segredo",
    5: "Categoria 5 — Inputs sem tratamento (XSS)",
}
CAT_NOTA = {
    5: "Não aplicável de forma explorável nesta stack: não há dangerouslySetInnerHTML/v-html com dado de "
       "usuário nem renderização de markdown sem sanitização; innerHTML aparece apenas em templates estáticos "
       "(marcadores de mapa) e URLs de anexo passam por assinatura server-side. Ver pontos fortes.",
}

for cat in [1, 2, 3, 4, 5]:
    story.append(Paragraph(CAT_TITULOS[cat], styles["H2"]))
    doscat = [f for f in FINDINGS if cat in f["cats"]]
    if not doscat:
        nota = CAT_NOTA.get(cat, "Nenhum achado nesta categoria.")
        story.append(Paragraph(esc(nota), styles["BodyMuted"]))
        continue
    # tabela severidade | arquivo:linha | descrição
    trows = [[Paragraph("<b>Sev.</b>", styles["CellSmall"]),
              Paragraph("<b>Arquivo:linha</b>", styles["CellSmall"]),
              Paragraph("<b>Descrição</b>", styles["CellSmall"])]]
    for f in doscat:
        arqs = "<br/>".join(esc(a) for a in f["arquivos"])
        trows.append([
            chip(f["sev"]),
            Paragraph(arqs, styles["CellMono"]),
            Paragraph("<b>#%d.</b> %s" % (f["id"], esc(f["titulo"])), styles["CellSmall"]),
        ])
    tt = Table(trows, colWidths=[2.0 * cm, 6.8 * cm, FW - 8.8 * cm], repeatRows=1)
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#31404F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tt)
    story.append(Spacer(1, 0.2 * cm))

# detalhamento completo de cada achado
story.append(PageBreak())
story.append(Paragraph("Detalhamento técnico dos achados", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(COR["alta"]), spaceAfter=6))
for f in FINDINGS:
    bloco = []
    cab = Table([[chip(f["sev"]),
                  Paragraph("<b>Achado #%d — %s</b>" % (f["id"], esc(f["titulo"])), styles["H3"])]],
                colWidths=[2.0 * cm, FW - 2.0 * cm],
                style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                  ("LEFTPADDING", (1, 0), (1, 0), 6)]))
    bloco.append(cab)
    bloco.append(Paragraph("<b>Categorias:</b> " + ", ".join(CATNOME[c] for c in f["cats"]), styles["Small"]))
    bloco.append(Paragraph("<b>Local:</b> " + "; ".join(esc(a) for a in f["arquivos"]), styles["Small"]))
    bloco.append(Spacer(1, 0.15 * cm))
    bloco.append(Paragraph(esc(f["trecho"]).replace("\n", "<br/>"), styles["CodeBox"]))
    bloco.append(Paragraph("<b>Por que é explorável.</b> " + esc(f["porque"]), styles["Body"]))
    bloco.append(Paragraph("<b>Impacto.</b> " + esc(f["impacto"]), styles["Body"]))
    bloco.append(Paragraph("<b>Correção sugerida.</b> " + esc(f["correcao"]), styles["Body"]))
    story.append(KeepTogether(bloco))
    story.append(Spacer(1, 0.25 * cm))
    story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor(LINE), spaceAfter=8))

# ── RECOMENDAÇÕES ──
story.append(PageBreak())
story.append(Paragraph("Recomendações priorizadas", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(COR["alta"]), spaceAfter=8))
prio_cor = {"P1": COR["critica"], "P2": COR["media"], "P3": COR["baixa"]}
rrows = [[Paragraph("<b>Prioridade</b>", styles["CellSmall"]), Paragraph("<b>Ação</b>", styles["CellSmall"])]]
for p, txt in RECS:
    tag = Table([[Paragraph(p, styles["Chip"])]], colWidths=[1.3 * cm], rowHeights=[0.5 * cm],
                style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(prio_cor[p])),
                                  ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                  ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    rrows.append([tag, Paragraph(esc(txt), styles["CellSmall"])])
tr = Table(rrows, colWidths=[2.2 * cm, FW - 2.2 * cm], repeatRows=1)
tr.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(INK)),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(BG_SOFT)]),
    ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
story.append(tr)

# ── ISSUES GITHUB ──
story.append(PageBreak())
story.append(Paragraph("Issues para o GitHub", styles["H1"]))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(COR["alta"]), spaceAfter=6))
story.append(Paragraph(
    "Texto pronto para copiar e colar. Cada issue está delimitada por marcadores "
    "<b>--- ISSUE n ---</b> / <b>--- FIM ISSUE n ---</b>.", styles["BodyMuted"]))
story.append(Spacer(1, 0.2 * cm))

def issue_md(f):
    labels = "security, %s" % SEV_LABEL[f["sev"]].lower()
    linhas = []
    linhas.append("--- ISSUE %d ---" % f["id"])
    linhas.append("Título: [Segurança] %s" % f["titulo"])
    linhas.append("Labels: %s" % labels)
    linhas.append("")
    linhas.append("## Problema")
    linhas.append(f["porque"])
    linhas.append("")
    linhas.append("## Evidência")
    for a in f["arquivos"]:
        linhas.append("- `%s`" % a)
    linhas.append("")
    linhas.append("```ts")
    linhas.extend(f["trecho"].split("\n"))
    linhas.append("```")
    linhas.append("")
    linhas.append("## Impacto")
    linhas.append(f["impacto"])
    linhas.append("")
    linhas.append("## Correção sugerida")
    linhas.append(f["correcao"])
    linhas.append("")
    linhas.append("## Critérios de aceite")
    for c in f["aceite"]:
        linhas.append("- [ ] %s" % c)
    linhas.append("")
    linhas.append("--- FIM ISSUE %d ---" % f["id"])
    return "\n".join(linhas)

for f in FINDINGS:
    md = issue_md(f)
    story.append(Paragraph(esc(md).replace("\n", "<br/>"), styles["IssueMono"]))

# ── build ──
doc = Doc(OUT_PDF)
# primeiro flow usa cover; força a troca de template após a capa
from reportlab.platypus import NextPageTemplate
final = []
final.append(NextPageTemplate("normal"))
final.extend(story)
doc.build(final)
print("PDF gerado:", OUT_PDF)

# limpeza dos PNGs temporários
for p in (ROSCA, BARRAS):
    try:
        os.remove(p)
    except OSError:
        pass
