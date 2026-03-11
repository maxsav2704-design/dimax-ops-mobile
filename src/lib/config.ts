export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const AUTH_STORAGE_KEYS = {
  accessToken: "dimax_mobile_access_token",
  refreshToken: "dimax_mobile_refresh_token",
  companyId: "dimax_mobile_company_id",
  email: "dimax_mobile_email",
} as const;

export const LOCALE_STORAGE_KEY = "dimax_mobile_locale";
