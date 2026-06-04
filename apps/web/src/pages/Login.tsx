import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AstrumButton } from '../components/ui/astrum-button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuthStore } from '../store/auth.store';
import { apiClient } from '../lib/api-client';
import { Wifi, Zap } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data } = await apiClient.post('/api/v2/auth/login', { email, password });
      login(data.user, data.accessToken, data.refreshToken);
      navigate('/dashboard');
    } catch {
      setError('Email ou senha incorretos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-blue/5 rounded-full blur-3xl" />
      </div>

      <div className="glass-card p-8 w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-brand-500/10 rounded-lg border border-brand-500/20">
            <Wifi className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Astrum</h1>
            <p className="text-xs text-gray-500">AI Engine para ISPs</p>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Entrar</h2>
          <p className="text-gray-400 text-sm">Acesse seu painel de gestão</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              className="bg-surface-800 border-surface-600 text-white placeholder:text-gray-600 focus:border-brand-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-gray-300 text-sm">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-surface-800 border-surface-600 text-white placeholder:text-gray-600 focus:border-brand-500"
              required
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <AstrumButton
            type="submit"
            isLoading={isLoading}
            className="w-full"
            leftIcon={<Zap className="w-4 h-4" />}
          >
            Entrar
          </AstrumButton>
        </form>
      </div>
    </div>
  );
}
