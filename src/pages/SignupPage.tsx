import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { GlowButton } from '@/src/components/ui/glow-button';
import { IconTile } from '@/src/components/ui/icon-tile';
import { BrandMark } from '@/src/components/LoginScreen';
import { API_BASE_URL } from '@/src/lib/apiClient';
import { CheckCircle, Loader2, Rocket, MessageSquare, Wallet, Users } from 'lucide-react';

/**
 * P5-05 — Trial sem fricção, "conecte em 15 minutos".
 * D-010 — mesma família visual do LoginScreen (duas colunas, tokens semânticos).
 *
 * Um único formulário (nome do provedor + e-mail + senha) chama
 * POST /api/v2/trial/signup direto — sem etapas que não alimentam a API.
 * Depois do sucesso, a sessão real acontece no login normal (email+senha
 * recém-criados), não pelo JWT role:'trial' — evita misturar esse token
 * (escopo próprio: só GET /trial/insight e POST /trial/connect-erp) com o
 * resto do app autenticado.
 */

const NEXT_STEPS = [
  { icon: MessageSquare, tone: 'fiber' as const, text: 'Conecte seu WhatsApp Business' },
  { icon: Wallet, tone: 'signal' as const, text: 'Vincule seu ERP para ver o primeiro insight' },
  { icon: Users, tone: 'lemon' as const, text: 'Convide sua equipe de suporte' },
];

interface FormState {
  ispName: string;
  email: string;
  password: string;
}

export function SignupPage() {
  const [form, setForm] = useState<FormState>({ ispName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.ispName.trim()) { toast.error('Informe o nome do seu provedor'); return; }
    if (!form.email.trim()) { toast.error('Informe seu e-mail'); return; }
    if (form.password.length < 8) { toast.error('A senha precisa ter ao menos 8 caracteres'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/trial/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ispName: form.ispName.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Erro ao criar o provedor. Tente novamente.');
      }

      setDone(true);
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center p-6 md:p-10">
      <div className="grid lg:grid-cols-2 gap-10 xl:gap-16 w-full max-w-6xl items-center">
        {/* Coluna esquerda — formulário / confirmação */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end"
        >
          <BrandMark />

          {!done ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              <h1 className="font-display text-3xl font-bold tracking-tight mt-5">
                Conecte em 15 minutos
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-sm">
                Crie sua conta e comece a operar com IA hoje — 14 dias grátis,
                sem reunião de vendas e sem cartão.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="trial-isp" className="text-sm font-semibold">Nome do provedor</Label>
                  <Input
                    id="trial-isp"
                    autoComplete="organization"
                    placeholder="ISP Conecta Fibra Ltda"
                    value={form.ispName}
                    onChange={(e) => set('ispName', e.target.value)}
                    className="h-11 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial-email" className="text-sm font-semibold">E-mail</Label>
                  <Input
                    id="trial-email"
                    type="email"
                    autoComplete="email"
                    placeholder="voce@seuisp.com.br"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    className="h-11 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial-password" className="text-sm font-semibold">Senha (mín. 8 caracteres)</Label>
                  <Input
                    id="trial-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Crie uma senha"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    className="h-11 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-stable-sm bg-astrum-signal/20 text-astrum-signal border border-astrum-signal/30 text-[11px] font-medium">
                    14 dias grátis
                  </span>
                  <span className="px-2.5 py-1 rounded-stable-sm bg-astrum-fiber/20 text-astrum-fiber border border-astrum-fiber/30 text-[11px] font-medium">
                    Sem cartão de crédito
                  </span>
                </div>

                <GlowButton
                  type="submit"
                  disabled={loading}
                  color="fiber"
                  icon={loading ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                  className="w-full justify-center [&>button]:w-full [&>button]:justify-center"
                >
                  {loading ? 'Criando conta…' : 'Criar conta'}
                </GlowButton>
              </form>

              <p className="text-center text-xs text-muted-foreground mt-6">
                Já tem uma conta?{' '}
                <Link to="/" className="text-astrum-lemon font-semibold hover:underline underline-offset-2">
                  Fazer login
                </Link>
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-5"
            >
              <IconTile icon={<CheckCircle size={22} />} tone="signal" size="xl" />
              <h1 className="font-display text-3xl font-bold tracking-tight mt-5">
                Trial ativo, {form.ispName}!
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-sm">
                Sua conta foi criada com 14 dias de trial completo. Faça login com o
                e-mail e a senha que você acabou de criar para continuar.
              </p>

              <div className="mt-6 space-y-2.5">
                {NEXT_STEPS.map((s) => (
                  <div key={s.text} className="flex items-center gap-3 rounded-stable-lg border border-border bg-secondary/40 p-3">
                    <IconTile icon={<s.icon size={16} />} tone={s.tone} size="sm" />
                    <span className="text-sm text-foreground">{s.text}</span>
                  </div>
                ))}
              </div>

              <GlowButton
                color="lemon"
                className="w-full justify-center mt-6 [&>button]:w-full [&>button]:justify-center"
                onClick={() => { window.location.assign('/'); }}
              >
                Entrar agora
              </GlowButton>
            </motion.div>
          )}
        </motion.div>

        {/* Coluna direita — painel de arte (mesma identidade do LoginScreen, D-010) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08 }}
          className="hidden lg:block relative h-[560px] rounded-stable-xl overflow-hidden login-art"
        >
          <div aria-hidden className="absolute -top-10 right-10 h-48 w-40 rounded-3xl bg-black/25 border border-white/5 rotate-[24deg]" />
          <div aria-hidden className="absolute -top-16 right-40 h-56 w-40 rounded-3xl bg-black/20 border border-white/5 rotate-[24deg]" />

          <div className="absolute bottom-7 left-7 right-7 space-y-3">
            <div className="flex gap-2">
              <span className="px-2.5 py-1 rounded-md bg-black/45 border border-white/15 text-white text-xs font-medium backdrop-blur-sm">
                Provedores de Internet
              </span>
              <span className="px-2.5 py-1 rounded-md bg-black/45 border border-white/15 text-white text-xs font-medium backdrop-blur-sm">
                Trial de 14 dias
              </span>
            </div>
            <figure className="rounded-stable-lg bg-black/40 border border-white/10 backdrop-blur-md p-5">
              <blockquote className="text-sm text-white/95 font-medium leading-relaxed">
                O CobrAI mudou completamente a nossa operação. O que tomava horas
                da equipe toda semana hoje roda sozinho, do lembrete à baixa do pagamento.
              </blockquote>
              <figcaption className="mt-3 text-xs text-white/60">
                Marina Duarte
                <span className="block mt-0.5">Head de Operações, <strong className="text-white/80">Vela Telecom</strong></span>
              </figcaption>
            </figure>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
