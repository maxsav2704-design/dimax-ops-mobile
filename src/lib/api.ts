import { API_BASE_URL } from "@/lib/config";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { ApiError, NetworkError } from "@/lib/errors";
import {
  clearSession,
  getStoredSession,
  persistSession,
  persistStoredUser,
  type CachedAuthUser,
  type SessionSnapshot,
} from "@/modules/auth/session";

export type LoginBody = {
  companyId: string;
  email: string;
  password: string;
};

export type AuthMe = CachedAuthUser;

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

let refreshInFlight: Promise<SessionSnapshot> | null = null;

function shouldRefreshSession(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.status === 401) {
    return true;
  }
  if (error.status !== 403) {
    return false;
  }
  const text = `${error.message}\n${error.body}`;
  return /token expired/i.test(text);
}

function isRejectedRefresh(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const abortFromCaller = () => controller.abort();
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError("Request timed out");
    }
    throw new NetworkError(error instanceof Error ? error.message : "Network request failed");
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || `HTTP ${response.status}`, response.status, text);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(body: LoginBody): Promise<AuthMe> {
  const deviceId = await getOrCreateDeviceId();
  const tokenPair = await rawFetch<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_id: body.companyId,
      email: body.email,
      password: body.password,
      device_id: deviceId,
    }),
  });

  const session: SessionSnapshot = {
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token,
    companyId: body.companyId,
    email: body.email,
  };
  await persistSession(session);
  const me = await authMe(session.accessToken);
  await persistStoredUser(me);
  return me;
}

export async function authMe(accessToken?: string): Promise<AuthMe> {
  if (!accessToken) {
    return apiFetch<AuthMe>("/api/v1/auth/me");
  }

  return rawFetch<AuthMe>("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function refreshSessionForRetry(previous: SessionSnapshot): Promise<SessionSnapshot> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const latest = await getStoredSession();
    if (latest && latest.accessToken !== previous.accessToken) {
      return latest;
    }
    return refreshSession(latest?.refreshToken || previous.refreshToken);
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const stored = await getStoredSession();
  if (!stored) {
    throw new Error("No mobile session");
  }

  const doRequest = async (token: string) => {
    return rawFetch<T>(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  };

  try {
    return await doRequest(stored.accessToken);
  } catch (error) {
    if (!shouldRefreshSession(error)) {
      throw error;
    }
    let refreshed: SessionSnapshot;
    try {
      refreshed = await refreshSessionForRetry(stored);
    } catch (refreshError) {
      if (isRejectedRefresh(refreshError)) {
        await clearSession();
      }
      throw refreshError;
    }
    return doRequest(refreshed.accessToken);
  }
}

export async function refreshSession(refreshToken?: string): Promise<SessionSnapshot> {
  const stored = await getStoredSession();
  const token = refreshToken || stored?.refreshToken;
  if (!token || !stored) {
    throw new Error("Missing refresh token");
  }
  const deviceId = await getOrCreateDeviceId();

  const next = await rawFetch<TokenPair>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: token, device_id: deviceId }),
  });

  const session: SessionSnapshot = {
    accessToken: next.access_token,
    refreshToken: next.refresh_token,
    companyId: stored.companyId,
    email: stored.email,
  };
  await persistSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    const stored = await getStoredSession();
    if (stored) {
      await rawFetch("/api/v1/auth/logout-refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
    }
  } finally {
    await clearSession();
  }
}
