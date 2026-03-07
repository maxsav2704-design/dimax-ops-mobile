import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { authMe, login as loginRequest, logout as logoutRequest, type AuthMe } from "@/lib/api";
import { initDb } from "@/lib/db";
import { getStoredSession } from "@/modules/auth/session";
import { runSync } from "@/modules/sync/service";

type AuthContextValue = {
  user: AuthMe | null;
  loading: boolean;
  signIn: (companyId: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const session = await getStoredSession();
    if (!session) {
      setUser(null);
      return;
    }
    const me = await authMe(session.accessToken);
    setUser(me);
  };

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await refreshUser();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const syncSafe = async () => {
      try {
        await runSync();
      } catch {
        // Ignore transient network failures; pending events remain local.
      }
    };

    syncSafe();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncSafe();
      }
    });

    const interval = setInterval(() => {
      void syncSafe();
    }, 60000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async (companyId, email, password) => {
        setLoading(true);
        try {
          const me = await loginRequest({ companyId, email, password });
          setUser(me);
        } finally {
          setLoading(false);
        }
      },
      signOut: async () => {
        setLoading(true);
        try {
          await logoutRequest();
          setUser(null);
        } finally {
          setLoading(false);
        }
      },
      refreshUser: async () => {
        setLoading(true);
        try {
          await refreshUser();
        } finally {
          setLoading(false);
        }
      },
    }),
    [user, loading]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#04111f" }}>
            <ActivityIndicator size="large" color="#5aa8ff" />
          </View>
        ) : (
          children
        )}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AppProviders");
  }
  return ctx;
}
