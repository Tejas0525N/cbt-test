import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authAPI } from "@/lib/api";

type UserRole = "admin" | "user";

interface User {
  id: string;
  email: string;
  full_name?: string;
  position_rank?: string;
  role?: UserRole;
}

interface AuthContextType {
  session: string | null;
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const token = authAPI.getToken();
    const currentUser = authAPI.getCurrentUser();
    
    if (token && currentUser) {
      setSession(token);
      setUser(currentUser);
      setRole(currentUser.role || null);
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user } = await authAPI.login(email, password);
      setSession(token);
      setUser(user);
      setRole(user.role || null);
      setLoading(false);
      return { error: null };
    } catch (error: unknown) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    authAPI.logout();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
