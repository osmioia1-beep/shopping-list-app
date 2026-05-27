import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Login } from './Login.jsx';
import App from '../App.jsx';

export default function MainApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <App />;
}
