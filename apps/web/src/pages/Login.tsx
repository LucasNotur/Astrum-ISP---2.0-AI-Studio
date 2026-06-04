import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { apiClient } from '../lib/api-client';

export default function Login() {
  const loginAction = useAuthStore(state => state.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/api/v2/auth/login', { email, password });
      
      const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
      
      loginAction({
        id: payload.userId,
        name: payload.name || '',
        email: email,
        tenantId: payload.tenantId,
        tenantName: payload.tenantName || '',
        role: payload.role,
        plan: payload.plan || 'starter'
      }, data.accessToken, data.refreshToken);

      navigate('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.message ?? 'Email ou senha incorretos.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-icon">✦</span>
          <h1>Astrum</h1>
          <p>Plataforma ISP Enterprise</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@seuprovedor.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
