import { useState } from 'react';
import { supabase } from '../services/supabase.js';

export function Login({ onSignup }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try to sign in
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (!signInError && data?.user) {
        // Login successful — AuthContext will pick up the session via onAuthStateChange
        return;
      }

      // Supabase returns the same "Invalid login" error for both wrong password
      // and non-existent account (intentionally, for security). Since we can't
      // reliably distinguish the two cases on the client, we show a combined message
      // that guides the user to try signup if they don't have an account.
      setError('Email ou password inválidos. Se não tens conta, cria uma primeiro.');
    } catch (err) {
      setError('Ocorreu um erro ao tentar entrar. Tenta novamente.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Entrar na Lista de Compras</h2>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <div className="login-footer">
            <p>Não tem conta? <button type="button" className="link-button" onClick={onSignup}>Criar conta</button></p>
          </div>
        </form>
      </div>
    </div>
  );
}
