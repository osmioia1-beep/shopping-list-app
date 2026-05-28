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

      // Login failed — Supabase returns generic "Invalid login credentials"
      // We need to distinguish: wrong password vs account doesn't exist
      // Approach: try resetPasswordForEmail — Supabase always returns OK for this
      // (even for non-existent emails, for security). So we can't rely on that.
      // Instead: try to sign up with a dummy password to see if email is taken.
      // If signUp returns "User already registered" → account exists → wrong password
      // If signUp succeeds → account didn't exist → prompt to create account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: '___temp_check_password_12345___'
      });

      if (signUpError) {
        if (
          signUpError.message?.includes('already registered') ||
          signUpError.message?.includes('already been registered') ||
          signUpError.message?.includes('user_already_exists')
        ) {
          setError('Password incorreta. Tenta novamente ou recupera a password.');
        } else {
          setError('Email ou password inválidos.');
        }
      } else if (signUpData?.user) {
        // The account didn't exist and we just created it with a temp password
        // This means the original login attempt was with a non-existent account
        setError('Este email não está registado. Cria uma conta para continuares.');
      } else {
        setError('Email ou password inválidos.');
      }
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
