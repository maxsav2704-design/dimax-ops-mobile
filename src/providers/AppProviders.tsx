import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, AppState, View } from "react-native";
import { LOCALE_STORAGE_KEY } from "@/lib/config";
import { isRtlLocale, t as translate, type MobileLocale } from "@/lib/i18n";
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
type I18nContextValue = {
  locale: MobileLocale;
  isRTL: boolean;
  setLocale: (locale: MobileLocale) => Promise<void>;
  t: (key: keyof ReturnType<typeof getEnglishKeys>) => string;
};

function getEnglishKeys() {
  return {
    "title.login": "",
    "title.projects": "",
    "title.calendar": "",
    "title.earnings": "",
    "title.syncQueue": "",
    "title.project": "",
    "login.subtitle": "",
    "login.companyId": "",
    "login.email": "",
    "login.password": "",
    "login.signIn": "",
    "login.signingIn": "",
    "login.failed": "",
    "workspace.title": "",
    "workspace.lastSync": "",
    "workspace.never": "",
    "workspace.pendingOffline": "",
    "workspace.queueHealth": "",
    "workspace.readyNow": "",
    "common.loading": "",
    "common.logout": "",
    "locale.en": "",
    "locale.ru": "",
    "locale.he": "",
  };
}

const I18nContext = createContext<I18nContextValue | null>(null);
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocaleState] = useState<MobileLocale>("en");

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
        const storedLocale = await SecureStore.getItemAsync(LOCALE_STORAGE_KEY);
        if (storedLocale === "en" || storedLocale === "ru" || storedLocale === "he") {
          setLocaleState(storedLocale);
        }
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

  const i18nValue = useMemo<I18nContextValue>(
    () => ({
      locale,
      isRTL: isRtlLocale(locale),
      setLocale: async (nextLocale) => {
        setLocaleState(nextLocale);
        await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, nextLocale);
      },
      t: (key) => translate(locale, key),
    }),
    [locale]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nContext.Provider value={i18nValue}>
        <AuthContext.Provider value={value}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#04111f" }}>
              <ActivityIndicator size="large" color="#5aa8ff" />
            </View>
          ) : (
            children
          )}
        </AuthContext.Provider>
      </I18nContext.Provider>
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

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside AppProviders");
  }
  return ctx;
}
