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

  // Fetch the user session on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUser(session.user);
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

  // Signup function
  const signup = async (email, password) => {
    try {
      const result = await authService.signUp(email, password);
      if (result.error) throw result.error;
      // Create user in our database via backend API
      if (result.session) {
        try {
          const apiRes = await fetch("/api/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${result.session.access_token}`,
            },
            body: JSON.stringify({
              id: result.user.id,
              email: result.user.email,
            }),
          });
          if (!apiRes.ok) {
            console.error("Failed to create user in DB:", await apiRes.text());
          }
        } catch (e) {
          console.error("User DB creation error:", e);
        }
      }
      setUser(result.user);
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
      console.error('Logout error:', error);
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