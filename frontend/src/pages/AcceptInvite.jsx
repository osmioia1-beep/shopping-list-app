import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase.js';

export function AcceptInvite({ token, onDone }) {
  const [status, setStatus] = useState('loading'); // loading, logged_out, processing, success, error
  const [message, setMessage] = useState('');
  const [listName, setListName] = useState('');

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setStatus('logged_out');
      setMessage('Precisas de estar logado para aceitar o convite. Faz login ou cria uma conta.');
      return;
    }
    // Auto-accept if logged in
    acceptInvite(session.access_token);
  };

  const acceptInvite = async (accessToken) => {
    setStatus('processing');
    setMessage('A aceitar convite...');

    try {
      const res = await fetch(`/api/lists/accept-invite/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Erro ao aceitar convite');
        return;
      }

      setStatus('success');
      setMessage(data.message);
      setListName(data.listId);
    } catch (e) {
      setStatus('error');
      setMessage('Erro de ligação. Tenta novamente.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage('Login falhou. Verifica as credenciais.');
      return;
    }

    if (data?.session) {
      acceptInvite(data.session.access_token);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>📨 Convite para Lista</h2>

        {status === 'loading' && (
          <div className="loading"><div className="spinner" /></div>
        )}

        {status === 'processing' && (
          <div className="loading"><div className="spinner" /><p>{message}</p></div>
        )}

        {status === 'logged_out' && (
          <>
            <p className="invite-message">{message}</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" name="email" required autoComplete="email" />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" name="password" required autoComplete="current-password" />
              </div>
              <button type="submit" className="login-button">Entrar e Aceitar</button>
            </form>
          </>
        )}

        {status === 'success' && (
          <div className="invite-success">
            <div className="invite-success-icon">✅</div>
            <p>{message}</p>
            <button className="login-button" onClick={() => onDone?.(listName)}>
              Ir para a Lista
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="invite-error">
            <p>⚠️ {message}</p>
            {token && status === 'logged_out' && (
              <button className="login-button" onClick={() => checkSession()}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
