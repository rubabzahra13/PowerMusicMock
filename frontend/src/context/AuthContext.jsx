import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

const fetchUserProfile = async (accessToken) => {
  const response = await fetch('http://localhost:8000/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    throw new Error('Failed to retrieve user role from database.');
  }
  return response.json();
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // 1. Get initial session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!active) return;
      setSession(initialSession);
      const currentUser = initialSession?.user ?? null;
      setUser(currentUser);

      if (initialSession) {
        try {
          const profileData = await fetchUserProfile(initialSession.access_token);
          if (active) {
            setRole(profileData.role);
            setProfile(profileData);
          }
        } catch (err) {
          console.error('Error fetching initial profile:', err);
          await supabase.auth.signOut();
          if (active) {
            setUser(null);
            setSession(null);
            setRole(null);
            setProfile(null);
          }
        }
      } else {
        if (active) {
          setRole(null);
          setProfile(null);
        }
      }
      if (active) {
        setLoading(false);
      }
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);

      if (currentSession) {
        try {
          const profileData = await fetchUserProfile(currentSession.access_token);
          if (active) {
            setRole(profileData.role);
            setProfile(profileData);
          }
        } catch (err) {
          console.error('Error fetching updated profile:', err);
          await supabase.auth.signOut();
          if (active) {
            setSession(null);
            setUser(null);
            setRole(null);
            setProfile(null);
          }
        }
      } else {
        if (active) {
          setRole(null);
          setProfile(null);
        }
      }
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password, expectedRole) => {
    setLoading(true);
    try {
      // 1. Force logout first to guarantee clean session transition
      await supabase.auth.signOut();
      
      // 2. Perform authentication
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // 3. Fetch verified database role from backend
      const profileData = await fetchUserProfile(data.session.access_token);
      
      // 4. Validate role
      if (profileData.role !== expectedRole) {
        await supabase.auth.signOut();
        throw new Error(`Access Denied: You do not have permission to access the ${expectedRole} portal.`);
      }

      setUser(data.user);
      setSession(data.session);
      setRole(profileData.role);
      setProfile(profileData);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email, password, metadata = {}) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            ...metadata
          }
        }
      });
      if (error) throw error;
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setSession(null);
      setRole(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
