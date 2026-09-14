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
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from "react-native";
import { SessionStorageError } from "@/lib/errors";
import { LOCALE_STORAGE_KEY } from "@/lib/config";
import { installerTheme } from "@/lib/theme";
import {
  isRtlLocale,
  t as translate,
  type MobileLocale,
  type MobileTranslationKey,
} from "@/lib/i18n";
import {
  authMe,
  getAuthSessionGeneration,
  login as loginRequest,
  logout as logoutRequest,
  persistAuthenticatedUser,
  type AuthMe,
} from "@/lib/api";
import { activateDbForIdentity } from "@/lib/db";
import {
  getStoredSession,
  getStoredUser,
  isValidCachedInstaller,
} from "@/modules/auth/session";
import { clearAuthWorkspace } from "@/modules/auth/workspace";
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

  const clearWorkspace = (expectedEpoch: number, forgetSessionGeneration?: number) =>
    clearAuthWorkspace({
      isCurrent: () => authEpoch.current === expectedEpoch,
      forgetSessionGeneration,
      onCleared: () => {
        queryClient.clear();
        setUser(null);
        setSyncVersion(0);
      },
    });

  const clearWorkspaceIfSessionMissing = async (expectedEpoch: number) => {
    if (authEpoch.current !== expectedEpoch) return;
    try {
      if (!(await getStoredSession())) await clearWorkspace(expectedEpoch);
    } catch {
      // Uncertain storage reads must not discard a verified offline identity.
    }
  };

  const refreshUserFromServer = async (expectedEpoch = authEpoch.current) => {
    const generation = getAuthSessionGeneration();
    const session = await getStoredSession();
    if (authEpoch.current !== expectedEpoch) {
      return;
    }
    if (!session) {
      await clearWorkspace(expectedEpoch);
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
      await clearWorkspace(expectedEpoch, generation);
      throw new Error("The authenticated account cannot use the installer application");
    }

    await persistAuthenticatedUser(me, generation);
    if (authEpoch.current !== expectedEpoch) {
      return;
    }
    await activateDbForIdentity(me.company_id, me.id);
    if (authEpoch.current !== expectedEpoch) {
      return;
    }
    setUser(me);
  };

  useEffect(() => {
    const expectedEpoch = authEpoch.current;
    const generation = getAuthSessionGeneration();
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

        if (authEpoch.current !== expectedEpoch) {
          return;
        }
        if (!isValidCachedInstaller(session, cachedUser)) {
          await clearWorkspace(expectedEpoch, generation);
          return;
        }

        await activateDbForIdentity(cachedUser.company_id, cachedUser.id);
        if (authEpoch.current !== expectedEpoch) {
          return;
        }
        setUser(cachedUser);
        void refreshUserFromServer(expectedEpoch).catch(() =>
          clearWorkspaceIfSessionMissing(expectedEpoch),
        );
      } catch {
        await clearWorkspace(expectedEpoch).catch(() => undefined);
      } finally {
        if (authEpoch.current === expectedEpoch) {
          setLoading(false);
        }
      }
    })();
    return () => { authEpoch.current += 1; };
  }, []);

  useEffect(() => {
    if (!user || loading) {
      return;
    }

    let active = true;
    const expectedEpoch = authEpoch.current;
    const isCurrent = () => active && authEpoch.current === expectedEpoch;
    const syncSafe = async () => {
      if (!isCurrent()) return;
      try {
        await runSync();
        if (isCurrent()) {
          setSyncVersion((version) => version + 1);
        }
      } catch {
        // Transient failures keep the offline workspace active. A rejected refresh
        // clears SecureStore in the API layer, so return to login immediately.
        try {
          const session = await getStoredSession();
          if (isCurrent() && !session) {
            const cleanupEpoch = ++authEpoch.current;
            await clearWorkspace(cleanupEpoch).finally(() => {
              if (authEpoch.current === cleanupEpoch) setLoading(false);
            });
          }
        } catch {
          // A temporary SecureStore read failure must not destroy the offline session.
        }
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
  }, [user, loading]);

  const signOut = async (): Promise<void> => {
    const expectedEpoch = ++authEpoch.current;
    setLoading(true);
    let storageFailed = false;
    try {
      await logoutRequest();
    } catch (error) {
      storageFailed = error instanceof SessionStorageError;
    } finally {
      await clearWorkspace(expectedEpoch).catch(() => undefined);
      if (authEpoch.current === expectedEpoch) setLoading(false);
    }
    if (storageFailed && authEpoch.current === expectedEpoch) {
      Alert.alert(
        translate(locale, "logout.storageTitle"),
        translate(locale, "logout.storageMessage"),
        [
          { text: translate(locale, "logout.dismiss"), style: "cancel" },
          {
            text: translate(locale, "logout.retry"),
            onPress: () => {
              if (authEpoch.current === expectedEpoch) void signOut();
            },
          },
        ],
      );
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      syncVersion,
      signIn: async (companyId, email, password) => {
        const expectedEpoch = ++authEpoch.current;
        setLoading(true);
        const request = loginRequest({ companyId, email, password });
        const generation = getAuthSessionGeneration();
        try {
          const me = await request;
          if (authEpoch.current !== expectedEpoch) {
            return;
          }
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
          setUser(me);
        } catch (error) {
          await clearWorkspace(expectedEpoch, generation).catch(() => undefined);
          throw error;
        } finally {
          if (authEpoch.current === expectedEpoch) {
            setLoading(false);
          }
        }
      },
      signOut,
      refreshUser: async () => {
        const expectedEpoch = authEpoch.current;
        setLoading(true);
        try {
          await refreshUserFromServer(expectedEpoch);
        } catch (error) {
          await clearWorkspaceIfSessionMissing(expectedEpoch);
          throw error;
        } finally {
          if (authEpoch.current === expectedEpoch) {
            setLoading(false);
          }
        }
      },
    }),
    [user, loading, syncVersion, locale]
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
          <View
            style={[
              styles.providerRoot,
              isRtlLocale(locale) ? styles.providerRootRtl : styles.providerRootLtr,
            ]}
          >
            {children}
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={installerTheme.primary} />
              </View>
            ) : null}
          </View>
        </AuthContext.Provider>
      </I18nContext.Provider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  providerRoot: {
    flex: 1,
    backgroundColor: installerTheme.background,
  },
  providerRootLtr: {
    direction: "ltr",
  },
  providerRootRtl: {
    direction: "rtl",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: installerTheme.background,
  },
});

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
