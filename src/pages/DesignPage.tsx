import React, { useState } from 'react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { FilterBar } from '@/src/components/ui/FilterBar';
import { DetailSheet } from '@/src/components/ui/DetailSheet';
import { FormSection } from '@/src/components/ui/FormSection';
import { DangerZone } from '@/src/components/ui/DangerZone';
import { StatCard } from '@/src/components/ui/StatCard';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';

/* ─── Helpers ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-base font-semibold text-foreground border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-8 rounded-stable border border-border shrink-0"
        style={{ background: `var(${variable})` }}
      />
      <div>
        <p className="text-xs font-medium text-foreground font-mono">{variable}</p>
        <p className="text-[10px] text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

/* ─── Página ─── */

export function DesignPage() {
  const [filterValue, setFilterValue] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="p-6 space-y-10 max-w-4xl">
      <PageHeader
        title="Design System — Astrum ISP"
        subtitle="Documentação viva · super_admin only · usa componentes reais"
        action={
          <Badge variant="outline" className="text-[10px] font-mono">
            /design
          </Badge>
        }
      />

      {/* ── Padrões de página (U1-03) ── */}
      <Section title="Padrões de página (U1-03)">
        <div className="space-y-6">
          {/* PageHeader */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;PageHeader /&gt;</p>
            <div className="rounded-stable border border-border p-4 bg-muted/30">
              <PageHeader
                title="Clientes"
                subtitle="Gerencie sua base de clientes ISP"
                action={<Button size="sm">Novo cliente</Button>}
              />
            </div>
          </div>

          {/* FilterBar */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;FilterBar /&gt;</p>
            <div className="rounded-stable border border-border p-4 bg-muted/30">
              <FilterBar
                value={filterValue}
                onValueChange={setFilterValue}
                placeholder="Buscar clientes por nome ou CPF..."
                filters={
                  <>
                    <Button variant="outline" size="sm">Ativo</Button>
                    <Button variant="outline" size="sm">Inadimplente</Button>
                  </>
                }
                sort={<Button variant="ghost" size="sm">↑ Nome</Button>}
              />
            </div>
          </div>

          {/* DetailSheet trigger */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;DetailSheet /&gt;</p>
            <div className="rounded-stable border border-border p-4 bg-muted/30 flex items-center gap-3">
              <Button size="sm" onClick={() => setSheetOpen(true)}>
                Abrir DetailSheet
              </Button>
              <span className="text-xs text-muted-foreground">Painel lateral com Esc + backdrop</span>
            </div>
            <DetailSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              title="João da Silva"
              subtitle="CPF: 000.000.000-00 · Plano Fibra 200M"
              footer={
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setSheetOpen(false)}>Cancelar</Button>
                  <Button size="sm">Salvar</Button>
                </div>
              }
            >
              <FormSection title="Dados pessoais" description="Informações cadastrais do assinante">
                <Input placeholder="Nome completo" defaultValue="João da Silva" />
                <Input placeholder="E-mail" defaultValue="joao@exemplo.com" />
              </FormSection>
              <FormSection title="Plano" className="mt-6">
                <Input placeholder="Plano" defaultValue="Fibra 200M" />
              </FormSection>
              <DangerZone
                title="Suspender assinante"
                description="O cliente perde acesso imediatamente."
                className="mt-6"
              >
                <Button variant="destructive" size="sm">Suspender</Button>
              </DangerZone>
            </DetailSheet>
          </div>

          {/* FormSection */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;FormSection /&gt;</p>
            <div className="rounded-stable border border-border p-4 bg-muted/30">
              <FormSection title="Endereço de instalação" description="Localização do ponto de acesso à fibra">
                <Input placeholder="Rua" />
                <div className="flex gap-2">
                  <Input placeholder="Número" className="w-24" />
                  <Input placeholder="Bairro" />
                </div>
              </FormSection>
            </div>
          </div>

          {/* DangerZone */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;DangerZone /&gt;</p>
            <div className="rounded-stable border border-border p-4 bg-muted/30">
              <DangerZone
                title="Zona de risco"
                description="As ações abaixo são irreversíveis. Confirme antes de prosseguir."
              >
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm">Excluir tenant</Button>
                  <Button variant="outline" size="sm">Cancelar</Button>
                </div>
              </DangerZone>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Primitivas ── */}
      <Section title="Primitivas de UI">
        <div className="space-y-6">
          {/* Buttons */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;Button /&gt; variantes</p>
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg">Large</Button>
              <Button size="sm">Small</Button>
              <Button size="icon" aria-label="ação">+</Button>
            </div>
          </div>

          {/* Badges */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;Badge /&gt; variantes</p>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </div>

          {/* StatCard */}
          <div className="space-y-2">
            <p className="text-xs font-mono text-muted-foreground">&lt;StatCard /&gt;</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard title="Clientes ativos" value="1.248" trend="+12%" up />
              <StatCard title="MRR" value="R$ 94.320" trend="+3,2%" up />
              <StatCard title="Inadimplentes" value="47" trend="+5" up={false} />
            </div>
          </div>
        </div>
      </Section>

      {/* ── Tokens ── */}
      <Section title="Tokens de cor (--color-astrum-*)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Swatch name="Signal (verde operacional)" variable="--color-astrum-signal" />
          <Swatch name="Fiber (acento tecnológico)" variable="--color-astrum-fiber" />
          <Swatch name="Amber (atenção)" variable="--color-astrum-amber" />
          <Swatch name="Orange (alerta)" variable="--color-astrum-orange" />
          <Swatch name="Red (risco/erro)" variable="--color-astrum-red" />
          <Swatch name="Slate (neutro)" variable="--color-astrum-slate" />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Swatch name="Background" variable="--color-background" />
          <Swatch name="Card" variable="--color-card" />
          <Swatch name="Muted" variable="--color-muted" />
          <Swatch name="Border" variable="--color-border" />
          <Swatch name="Primary" variable="--color-primary" />
          <Swatch name="Foreground" variable="--color-foreground" />
        </div>
      </Section>

      {/* ── Tipografia ── */}
      <Section title="Tipografia">
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground mb-1">font-display (Space Grotesk) — títulos e números-herói</p>
            <p className="font-display text-3xl font-semibold tracking-tight">R$ 94.320</p>
            <p className="font-display text-xl font-semibold">Clientes ativos</p>
            <p className="font-display text-base font-medium">Detalhe do assinante</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground mb-1">font-mono (JetBrains Mono) — valores medidos, IDs, datas</p>
            <p className="font-mono text-2xl font-semibold">1.248</p>
            <p className="font-mono text-sm">2026-07-12 · OS-00421 · tenant_id: abc</p>
          </div>
          <div>
            <p className="text-[10px] font-mono text-muted-foreground mb-1">Inter — corpo (padrão)</p>
            <p className="text-base">Texto de corpo padrão — Inter Regular. Usado em descrições, labels e conteúdo geral.</p>
            <p className="text-sm text-muted-foreground">Texto secundário (muted-foreground) — menor hierarquia.</p>
            <p className="text-xs text-muted-foreground">Texto tiny — metadados, badges de categoria.</p>
          </div>
        </div>
      </Section>

      {/* ── Anti-padrões (lista negra RN21) ── */}
      <Section title="Lista negra — anti-padrões (RN21)">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Nunca usar nas telas Astrum</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Gradiente roxo/azul genérico em hero, botão ou fundo</li>
              <li>Emoji como ícone de feature ou título de seção</li>
              <li>Grid de 3 cards idênticos com ícone em círculo colorido + frase motivacional</li>
              <li>Hero centralizado com headline gigante e subtítulo de marketing</li>
              <li>Sombra difusa grande em tudo; glassmorphism gratuito</li>
              <li>Raio de borda grande e uniforme em <em>todo</em> elemento (cara de template)</li>
              <li>Paleta default do shadcn/Tailwind intocada; roxo <code>#8B5CF6</code> em geral</li>
              <li>Texto de marketing dentro do produto (<em>"Potencialize seu negócio"</em>)</li>
              <li>Ilustrações 3D genéricas de banco de imagem</li>
              <li>Espaçamento inflado — padding de brochura, não de ferramenta</li>
            </ol>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
