import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_KEYS } from "@/lib/config";

export type SessionSnapshot = {
  accessToken: string;
  refreshToken: string;
  companyId: string;
  email: string;
};

export type CachedAuthUser = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

export function isValidCachedInstaller(
  session: SessionSnapshot | null,
  user: CachedAuthUser | null,
): user is CachedAuthUser {
  return Boolean(
    session && user &&
    user.id.trim() &&
    user.is_active &&
    user.role === "INSTALLER" &&
    user.company_id === session.companyId &&
    session.email.trim() &&
    user.email.trim().toLowerCase() === session.email.trim().toLowerCase(),
  );
}

export async function getStoredSession(): Promise<SessionSnapshot | null> {
  const [accessToken, refreshToken, companyId, email] = await Promise.all([
    SecureStore.getItemAsync(AUTH_STORAGE_KEYS.accessToken),
    SecureStore.getItemAsync(AUTH_STORAGE_KEYS.refreshToken),
    SecureStore.getItemAsync(AUTH_STORAGE_KEYS.companyId),
    SecureStore.getItemAsync(AUTH_STORAGE_KEYS.email),
  ]);

  if (!accessToken || !refreshToken || !companyId || !email) {
    return null;
  }

  return { accessToken, refreshToken, companyId, email };
}

async function settleCredentialMutations(operations: Promise<void>[]): Promise<void> {
  // A rejected operation must not release the auth queue while other writes run.
  const results = await Promise.allSettled(operations);
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
}

export async function persistSession(session: SessionSnapshot): Promise<void> {
  await settleCredentialMutations([
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.accessToken, session.accessToken),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.refreshToken, session.refreshToken),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.companyId, session.companyId),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.email, session.email),
  ]);
}

export async function getStoredUser(): Promise<CachedAuthUser | null> {
  const raw = await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.userProfile);
  if (!raw) {
    return null;
  }

  try {
    const user = JSON.parse(raw) as Partial<CachedAuthUser>;
    if (
      typeof user.id !== "string" ||
      typeof user.company_id !== "string" ||
      typeof user.email !== "string" ||
      typeof user.full_name !== "string" ||
      typeof user.role !== "string" ||
      typeof user.is_active !== "boolean"
    ) {
      return null;
    }
    return user as CachedAuthUser;
  } catch {
    return null;
  }
}

export async function persistStoredUser(user: CachedAuthUser): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.userProfile, JSON.stringify(user));
}

export async function clearSession(): Promise<void> {
  await settleCredentialMutations([
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.accessToken),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.refreshToken),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.companyId),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.email),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.userProfile),
  ]);
}
