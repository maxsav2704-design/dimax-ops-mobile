import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, AppState, View } from "react-native";
import { LOCALE_STORAGE_KEY } from "@/lib/config";
import { installerTheme } from "@/lib/theme";
import {
  isRtlLocale,
  t as translate,
  type MobileLocale,
  type MobileTranslationKey,
} from "@/lib/i18n";
import { authMe, login as loginRequest, logout as logoutRequest, type AuthMe } from "@/lib/api";
import { activateDbForIdentity, deactivateDb } from "@/lib/db";
import {
  clearSession,
  getStoredSession,
  getStoredUser,
  persistStoredUser,
} from "@/modules/auth/session";
import { runSync } from "@/modules/sync/service";

type AuthContextValue = {
  user: AuthMe | null;
  loading: boolean;
  syncVersion: number;
  signIn: (companyId: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
type I18nContextValue = {
  locale: MobileLocale;
  isRTL: boolean;
  setLocale: (locale: MobileLocale) => Promise<void>;
  t: (key: MobileTranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocaleState] = useState<MobileLocale>("en");
  const [syncVersion, setSyncVersion] = useState(0);
  const authEpoch = useRef(0);

  const refreshUserFromServer = async (expectedEpoch = authEpoch.current) => {
    const session = await getStoredSession();
    if (!session) {
      if (authEpoch.current === expectedEpoch) {
        queryClient.clear();
        setUser(null);
        await deactivateDb();
      }
      return;
    }

    const me = await authMe();
    if (authEpoch.current !== expectedEpoch) {
      return;
    }
    if (
      !me.is_active ||
      me.role !== "INSTALLER" ||
      me.company_id !== session.companyId
    ) {
      await clearSession();
      queryClient.clear();
      setUser(null);
      await deactivateDb();
      throw new Error("The authenticated account cannot use the installer application");
    }

    await activateDbForIdentity(me.company_id, me.id);
    if (authEpoch.current !== expectedEpoch) {
      return;
    }
    await persistStoredUser(me);
    setUser(me);
  };

  useEffect(() => {
    const expectedEpoch = authEpoch.current;
    (async () => {
      try {
        const [storedLocale, session, cachedUser] = await Promise.all([
          SecureStore.getItemAsync(LOCALE_STORAGE_KEY),
          getStoredSession(),
          getStoredUser(),
        ]);
        if (storedLocale === "en" || storedLocale === "ru" || storedLocale === "he") {
          setLocaleState(storedLocale);
        }

        const hasValidCachedIdentity =
          session !== null &&
          cachedUser !== null &&
          cachedUser.is_active &&
          cachedUser.role === "INSTALLER" &&
          cachedUser.company_id === session.companyId;
        if (!hasValidCachedIdentity) {
          await clearSession();
          await deactivateDb();
          queryClient.clear();
          setUser(null);
          return;
        }

        await activateDbForIdentity(cachedUser.company_id, cachedUser.id);
        if (authEpoch.current !== expectedEpoch) {
          return;
        }
        setUser(cachedUser);
        void refreshUserFromServer(expectedEpoch).catch(async () => {
          // Network failures keep the verified cached identity available offline.
          if (!(await getStoredSession()) && authEpoch.current === expectedEpoch) {
            queryClient.clear();
            setUser(null);
            await deactivateDb();
          }
        });
      } catch {
        queryClient.clear();
        setUser(null);
        await deactivateDb().catch(() => undefined);
      } finally {
        if (authEpoch.current === expectedEpoch) {
          setLoading(false);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    const syncSafe = async () => {
      try {
        await runSync();
        if (active) {
          setSyncVersion((version) => version + 1);
        }
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
      active = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      syncVersion,
      signIn: async (companyId, email, password) => {
        const expectedEpoch = ++authEpoch.current;
        setLoading(true);
        try {
          const me = await loginRequest({ companyId, email, password });
          if (
            !me.is_active ||
            me.role !== "INSTALLER" ||
            me.company_id !== companyId
          ) {
            throw new Error("The account is not an active installer in this company");
          }
          await activateDbForIdentity(me.company_id, me.id);
          if (authEpoch.current !== expectedEpoch) {
            return;
          }
          queryClient.clear();
          await persistStoredUser(me);
          setUser(me);
        } catch (error) {
          if (authEpoch.current === expectedEpoch) {
            await clearSession();
            await deactivateDb().catch(() => undefined);
            queryClient.clear();
            setUser(null);
          }
          throw error;
        } finally {
          if (authEpoch.current === expectedEpoch) {
            setLoading(false);
          }
        }
      },
      signOut: async () => {
        const expectedEpoch = ++authEpoch.current;
        setLoading(true);
        try {
          await logoutRequest();
        } finally {
          queryClient.clear();
          setUser(null);
          setSyncVersion(0);
          await deactivateDb().catch(() => undefined);
          if (authEpoch.current === expectedEpoch) {
            setLoading(false);
          }
        }
      },
      refreshUser: async () => {
        setLoading(true);
        try {
          await refreshUserFromServer();
        } finally {
          setLoading(false);
        }
      },
    }),
    [user, loading, syncVersion]
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
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: installerTheme.background }}>
              <ActivityIndicator size="large" color={installerTheme.primary} />
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
