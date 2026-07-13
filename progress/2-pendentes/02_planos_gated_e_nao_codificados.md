# Tudo que AINDA NÃO virou código — gates e desbloqueios — ⏳

**Fontes:** PLANO_A §2/§2b, PLANO_E, PLANO_B P6, PARTE2 (GATED)

## Bloqueados em DECISÃO/AÇÃO COMERCIAL do Lucas
| Item | O que é | Desbloqueio |
|---|---|---|
| **P6 — CPE/OZmap** | Telemetria do roteador do cliente via parceria (Anlix/Flashman ou ACS do ERP) — não construir, integrar | Contato comercial |
| **Decisões de preço** | Faixas Radar/Copiloto/Autônomo, success fee, Radar grátis? | `MODELO_DE_COBRANCA_E_CENARIOS__AGUARDANDO_DECISAO.md` (5 itens) |
| **D-11 — Plataforma MCP** | Parceiros construindo sobre a API/tools da Astrum | 3 parceiros de design |

## Bloqueados na ONDA 2 (tráfego real no motor novo)
| Item | O que é |
|---|---|
| **PLANO_E (E-01..E-05)** | Cérebro noturno: replay do dia → hipóteses → experimentos em alçada → diário p/ dono |
| **D-04 — NOC autônomo** | Detecção → correlação → aviso proativo → supressão de tickets → confirmação |
| **D-05 Fase 2** | Sinal de confirmação explícita do cliente (👍) acelera geração de artigo |
| **D-14** | = PLANO_E (mesma coisa, entrada no catálogo de inéditas) |

## Bloqueados em DADOS ACUMULADOS (30–90 dias de operação)
| Item | O que é | Combustível |
|---|---|---|
| **D-02 — Backtesting de régua** | Testa política de cobrança nova contra 90d de histórico real ANTES de ligar | 90d de faturas/variantes no v2 |
| **D-08 — CFO virtual** | Previsão de caixa 90d conectada a ação (campanha) | 90d de cobrança + IA-25 |
| **D-01 — Gêmeo digital da rede** | Simula "se esta CTO cair, quem grita? quanto custa?" | 60d de telemetria + topologia via ERP |
| **D-10 — Modelo ISP-BR** | Fine-tune próprio no jargão do setor | ≥5k exemplos rotulados (IA-29) + eval ≥300 |

## Bloqueados em ESCALA (nº de tenants)
| Item | O que é | Combustível |
|---|---|---|
| **D-09 — Índice Astrum** | Benchmark federado anônimo do setor (autoridade de marca) | ≥10 tenants + LGPD ok (IA-41) |
| **D-17 — Marketplace de playbooks** | Régua campeã de um ISP vira produto instalável com prova (D-02) | ≥10 tenants + D-02 |
| **D-16 — Foundry** | Dono descreve automação em linguagem natural → IA constrói, testa e instala | ≥5 tenants pedindo coisas diferentes |
| **D-13 — Conectores auto-gerados** | Agente codificador gera adapter de ERP novo a partir da doc | 2+ pedidos de ERP fora do top-5 |

## Bloqueados em DEPENDÊNCIA TÉCNICA ESPECÍFICA
| Item | O que é | Combustível |
|---|---|---|
| **D-03 — Negociador com alçada** | IA negocia de verdade (parcela, desconto) dentro de limites do dono | Cutover + IA-20 + alçadas definidas |
| **D-06 Fases 2/3** | Checklist guiado por voz; histórico visual da planta | Conta Twilio (Lucas) |
| **D-12 — Voice-first** | 100% das ligações atendidas <1s, 60% resolvidas sem humano | Custo/chamada validado + pricing |
| **D-18 — Cartório de IA** | Certificado auditável de cada ato da IA p/ ANATEL/Procon | 1º caso real ou venda enterprise |
| **GATED IA-18/20/41** | Edge, debate multi-modelo, benchmark federado | Reavaliar na Onda 5 |

## Dever de casa consolidado do Lucas (§4 do 00_PLANO)
1. Migrations em produção · 2. Preços · 3. Tenant piloto · 4. IXC real ·
5. ADR ML/Python · 6. Twilio staging + 1 ligação · 7. Parcerias P6/D-11 · 8. Custo de voz
