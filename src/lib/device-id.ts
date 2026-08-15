import * as SecureStore from "expo-secure-store";
import { DEVICE_ID_STORAGE_KEY } from "@/lib/config";

function fallbackDeviceId(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = (await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY))?.trim();
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : fallbackDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}
