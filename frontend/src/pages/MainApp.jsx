import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Login } from './Login.jsx';
import { Signup } from './Signup.jsx';
import App from '../App.jsx';

export default function MainApp() {
  const { user, loading, logout } = useAuth();
  const [authView, setAuthView] = useState('login');

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    if (authView === 'signup') {
      return <Signup onBackToLogin={() => setAuthView('login')} />;
    }
    return <Login onSignup={() => setAuthView('signup')} />;
  }

  return <App onLogout={logout} />;
}
