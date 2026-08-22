import { resolveApiBaseUrl } from "@/lib/api-base-url";
import packageMetadata from "../../package.json";

const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, IS_DEV);
export const MOBILE_APP_VERSION = packageMetadata.version;

function asBool(value: string | undefined): boolean {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

export const AUTH_STORAGE_KEYS = {
  accessToken: "dimax_mobile_access_token",
  refreshToken: "dimax_mobile_refresh_token",
  companyId: "dimax_mobile_company_id",
  email: "dimax_mobile_email",
  userProfile: "dimax_mobile_user_profile",
} as const;

export const LOCALE_STORAGE_KEY = "dimax_mobile_locale";
export const DEVICE_ID_STORAGE_KEY = "dimax_mobile_device_id";
const DEV_SEEDED_LOGIN = {
  companyId: process.env.EXPO_PUBLIC_E2E_COMPANY_ID || "1f16d537-5617-4c4b-a944-dafba2bcead9",
  email: process.env.EXPO_PUBLIC_E2E_EMAIL || "installer1@dimax.dev",
  password: process.env.EXPO_PUBLIC_E2E_PASSWORD || "installer12345",
} as const;

export const DEV_AUTO_LOGIN = {
  // Keep mobile device smoke unblocked in __DEV__ even when Metro was launched
  // without explicit E2E env vars.
  enabled: IS_DEV && asBool(process.env.EXPO_PUBLIC_E2E_AUTO_LOGIN ?? "1"),
  companyId: DEV_SEEDED_LOGIN.companyId,
  email: DEV_SEEDED_LOGIN.email,
  password: DEV_SEEDED_LOGIN.password,
} as const;
