import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { authService } from '../services/auth';

// Define the shape of our auth context
export const AuthContext = createContext(null);

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Register user in our backend DB and create default list
  const registerInBackend = async (token) => {
    try {
      const res = await fetch("/api/users/register", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to register in backend:", body.error || res.status);
        return false;
      }
      return true;
    } catch (e) {
      console.error("registerInBackend error:", e);
      return false;
    }
  };

  // Ensure user exists in our database (call register on first login)
  const ensureUserInDb = async (token) => {
    try {
      const res = await fetch("/api/users/me", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.status === 403) {
        // User not registered in our backend yet — register them
        const registered = await registerInBackend(token);
        if (!registered) {
          console.error("Failed to auto-register user after signup");
        }
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Failed to get user profile:", body.error || res.status);
      }
    } catch (e) {
      console.error("ensureUserInDb error:", e);
    }
  };

  // Fetch the user session on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUser(session.user);
          await ensureUserInDb(session.access_token);
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
          if (event === 'SIGNED_IN') {
            await ensureUserInDb(session.access_token);
          }
        } else {
          setUser(null);
        }
      }
    );

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      const { data, error } = await authService.signIn(email, password);
      if (error) throw error;
      setUser(data.user);
      return { success: true, data };
    } catch (error) {
      return { success: false, error };
    }
  };

  // Signup function — email confirmation is disabled, so session is always returned
  const signup = async (email, password) => {
    try {
      const result = await authService.signUp(email, password);
      if (result.error) throw result.error;
      if (result.user) {
        setUser(result.user);
      }
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await authService.signOut();
      setUser(null);
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  // Update user metadata (e.g., name, avatar)
  const updateUser = async (userData) => {
    try {
      const { data, error } = await authService.updateUser(userData);
      if (error) throw error;
      setUser(data);
      return { success: true, data };
    } catch (error) {
      return { success: false, error };
    }
  };

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
