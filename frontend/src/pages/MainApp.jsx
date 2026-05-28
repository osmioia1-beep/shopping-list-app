import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Login } from './Login.jsx';
import { Signup } from './Signup.jsx';
import { AcceptInvite } from './AcceptInvite.jsx';
import App from '../App.jsx';

export default function MainApp() {
  const { user, loading, logout } = useAuth();
  const [authView, setAuthView] = useState('login');

  // Check if this is an invite link
  const inviteMatch = window.location.pathname.match(/^\/accept-invite\/(.+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  // If there's an invite token, show the accept invite page
  if (inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={() => {
          // Remove the invite from URL and reload
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }}
      />
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
