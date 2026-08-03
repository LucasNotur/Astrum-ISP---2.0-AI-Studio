import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

/** Ícones de marca dos provedores sociais (inline — lucide não tem brand icons). */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.57-5.17 3.57-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" />
      <path fill="#fff" d="M16.67 15.47 17.2 12h-3.32V9.75c0-.95.46-1.87 1.95-1.87h1.51V4.93s-1.37-.24-2.68-.24c-2.74 0-4.53 1.66-4.53 4.67V12H7.08v3.47h3.04v8.38a12.1 12.1 0 0 0 3.76 0v-8.38h2.79Z" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className="text-foreground">
      <path fill="currentColor" d="M16.37 12.76c.03 3.24 2.84 4.32 2.87 4.33-.02.08-.45 1.53-1.48 3.04-.89 1.3-1.81 2.6-3.27 2.62-1.43.03-1.89-.85-3.53-.85-1.63 0-2.14.83-3.5.88-1.4.05-2.47-1.4-3.37-2.7C2.26 17.42.85 12.5 2.74 9.24a5.25 5.25 0 0 1 4.44-2.69c1.38-.03 2.69.93 3.53.93.85 0 2.43-1.15 4.1-.98.7.03 2.66.28 3.92 2.13-.1.06-2.34 1.37-2.36 4.13ZM13.7 4.74c.75-.9 1.25-2.16 1.11-3.41-1.08.04-2.38.72-3.15 1.62-.69.8-1.3 2.08-1.13 3.3 1.2.1 2.42-.61 3.17-1.51Z" />
    </svg>
  );
}

/** Glifo mínimo da marca (dois quadrados sobrepostos, como no print de referência). */
function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="text-foreground">
      <rect x="2" y="10" width="12" height="12" rx="3" fill="currentColor" />
      <rect x="13" y="3" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

interface LoginScreenProps {
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
}

/** D-010 — tela de login em duas colunas (réplica do print de referência #4). */
export function LoginScreen({ email, password, onEmailChange, onPasswordChange, onSubmit }: LoginScreenProps) {
  const socialSoon = () => toast.info('Login social em breve — use seu e-mail e senha.');

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center p-6 md:p-10">
      <div className="grid lg:grid-cols-2 gap-10 xl:gap-16 w-full max-w-6xl items-center">
        {/* Coluna esquerda — formulário */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end"
        >
          <BrandMark />
          <h1 className="font-display text-3xl font-bold tracking-tight mt-5">Bem-vindo de volta!</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-sm">
            Capacitamos provedores de internet a atender, cobrar e operar
            com fluxos guiados por IA — tudo em um só lugar
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-sm font-semibold">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="seuemail@seudominio.com"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                className="h-11 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-sm font-semibold">Senha</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                className="h-11 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 rounded-stable-lg bg-secondary border border-border text-sm font-semibold hover:bg-secondary/80 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Entrar
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button type="button" onClick={socialSoon} aria-label="Entrar com Google"
              className="h-12 rounded-stable-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors duration-fast flex items-center justify-center">
              <GoogleIcon />
            </button>
            <button type="button" onClick={socialSoon} aria-label="Entrar com Facebook"
              className="h-12 rounded-stable-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors duration-fast flex items-center justify-center">
              <FacebookIcon />
            </button>
            <button type="button" onClick={socialSoon} aria-label="Entrar com Apple"
              className="h-12 rounded-stable-lg bg-secondary/60 border border-border hover:bg-secondary transition-colors duration-fast flex items-center justify-center">
              <AppleIcon />
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Não tem uma conta?{' '}
            <Link to="/register" className="text-astrum-lemon font-semibold hover:underline underline-offset-2">
              Cadastre-se
            </Link>
          </p>
        </motion.div>

        {/* Coluna direita — painel de arte com depoimento (demo) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08 }}
          className="hidden lg:block relative h-[560px] rounded-stable-xl overflow-hidden login-art"
        >
          {/* formas decorativas no topo */}
          <div aria-hidden className="absolute -top-10 right-10 h-48 w-40 rounded-3xl bg-black/25 border border-white/5 rotate-[24deg]" />
          <div aria-hidden className="absolute -top-16 right-40 h-56 w-40 rounded-3xl bg-black/20 border border-white/5 rotate-[24deg]" />

          <div className="absolute bottom-7 left-7 right-7 space-y-3">
            <div className="flex gap-2">
              <span className="px-2.5 py-1 rounded-md bg-black/45 border border-white/15 text-white text-xs font-medium backdrop-blur-sm">
                Provedores de Internet
              </span>
              <span className="px-2.5 py-1 rounded-md bg-black/45 border border-white/15 text-white text-xs font-medium backdrop-blur-sm">
                Operação com IA
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
