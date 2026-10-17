import { resolveApiBaseUrl } from "@/lib/api-base-url";
import packageMetadata from "../../package.json";

const IS_DEV = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, IS_DEV, process.env.EXPO_PUBLIC_BUILD_PROFILE);
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
// Only a development bundle may carry test credentials; a production bundle must
// not inline them even when the variables are present at build time.
const E2E_LOGIN: { companyId: string; email: string; password: string } = IS_DEV
  ? {
      companyId: process.env.EXPO_PUBLIC_E2E_COMPANY_ID?.trim() || "",
      email: process.env.EXPO_PUBLIC_E2E_EMAIL?.trim() || "",
      password: process.env.EXPO_PUBLIC_E2E_PASSWORD || "",
    }
  : { companyId: "", email: "", password: "" };

export const DEV_AUTO_LOGIN = {
  // Test login must never choose a company or API through development defaults.
  enabled: IS_DEV && asBool(process.env.EXPO_PUBLIC_E2E_AUTO_LOGIN) && Boolean(
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() &&
    E2E_LOGIN.companyId && E2E_LOGIN.email && E2E_LOGIN.password.trim(),
  ),
  ...E2E_LOGIN,
} as const;
