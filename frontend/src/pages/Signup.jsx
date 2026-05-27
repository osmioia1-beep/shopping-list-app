import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export function Signup({ onBackToLogin }) {
  const { signup, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsConfirmation(false);
    try {
      const result = await signup(email, password);
      if (result?.needsConfirmation) {
        setNeedsConfirmation(true);
      } else if (!result?.success) {
        setError(result?.error?.message || 'Erro ao criar conta');
      }
      // On success with auto-login, auth context updates user → MainApp shows App
    } catch (err) {
      const msg = err?.error_description || err?.message || '';
      if (msg.includes('rate limit')) {
        setError('Muitas tentativas. Aguarda uns minutos e tenta de novo.');
      } else if (msg.includes('already registered') || msg.includes('already exists')) {
        setError('Este email já tem conta. Faz login.');
      } else {
        setError(msg || 'Erro ao criar conta. Tenta novamente.');
      }
      console.error('Signup error:', err);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>✉️ Verifica o teu email</h2>
          <p style={{ textAlign: 'center', margin: '1rem 0', lineHeight: 1.6 }}>
            Enviámos um email de confirmação para <strong>{email}</strong>.<br /><br />
            Clica no link do email para confirmares a tua conta e depois faz login.
          </p>
          <button
            type="button"
            className="login-button"
            onClick={onBackToLogin}
            style={{ marginTop: '1rem' }}
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Criar Conta</h2>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="signup-email">Email</label>
            <input
              type="email"
              id="signup-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="signup-password">Password (mín. 6 caracteres)</label>
            <input
              type="password"
              id="signup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'A criar conta...' : 'Criar conta'}
          </button>
          <div className="login-footer">
            <p>Já tem conta? <button type="button" className="link-button" onClick={onBackToLogin}>Entrar</button></p>
          </div>
        </form>
      </div>
    </div>
  );
}
