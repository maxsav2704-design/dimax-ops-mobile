import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_KEYS } from "@/lib/config";

export type SessionSnapshot = {
  accessToken: string;
  refreshToken: string;
  companyId: string;
  email: string;
};

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

export async function persistSession(session: SessionSnapshot): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.accessToken, session.accessToken),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.refreshToken, session.refreshToken),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.companyId, session.companyId),
    SecureStore.setItemAsync(AUTH_STORAGE_KEYS.email, session.email),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.accessToken),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.refreshToken),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.companyId),
    SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.email),
  ]);
}
