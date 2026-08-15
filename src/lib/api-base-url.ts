const DEFAULT_DEV_API_BASE_URL = "http://127.0.0.1:8000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const PLACEHOLDER_PATTERN = /example\.com|replace|placeholder|changeme|change-me|todo/i;

export function resolveApiBaseUrl(value: string | undefined, isDev: boolean): string {
  const candidate = value?.trim();
  if (!candidate) {
    if (isDev) return DEFAULT_DEV_API_BASE_URL;
    throw new Error("EXPO_PUBLIC_API_BASE_URL is required in a production mobile build");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL");
  }

  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS");
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must contain only an API origin and optional path");
  }

  if (!isDev) {
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") {
      throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS in production");
    }
    if (LOCAL_HOSTS.has(hostname)) {
      throw new Error("EXPO_PUBLIC_API_BASE_URL must not point to localhost in production");
    }
    if (PLACEHOLDER_PATTERN.test(candidate)) {
      throw new Error("EXPO_PUBLIC_API_BASE_URL must not use a placeholder production host");
    }
  }

  return parsed.toString().replace(/\/+$/, "");
}
