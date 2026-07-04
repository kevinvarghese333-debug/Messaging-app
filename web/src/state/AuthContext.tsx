import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("/api/auth/me")
      .then(({ user }) => {
        setUser(user);
        connectSocket(token);
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token, user } = await api<{ token: string; user: User }>("/api/auth/login", {
      body: { email, password },
    });
    setToken(token);
    setUser(user);
    connectSocket(token);
  }

  async function register(name: string, email: string, password: string) {
    const { token, user } = await api<{ token: string; user: User }>("/api/auth/register", {
      body: { name, email, password },
    });
    setToken(token);
    setUser(user);
    connectSocket(token);
  }

  function logout() {
    clearToken();
    disconnectSocket();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
