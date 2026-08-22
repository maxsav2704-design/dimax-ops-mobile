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

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
};

const refreshInFlight = new Map<string, Promise<SessionSnapshot>>();
let authGeneration = 0;
let authStorageTail: Promise<void> = Promise.resolve();
const AUTH_LOGIN_TIMEOUT_MS = 30000;
const AUTH_IDENTITY_TIMEOUT_MS = 30000;
const AUTH_REFRESH_TIMEOUT_MS = 30000;

class SessionChangedError extends Error {
  constructor() {
    super("Mobile session changed while the request was in progress");
    this.name = "SessionChangedError";
  }
}

function normalizeSessionEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSameSessionIdentity(
  left: SessionSnapshot,
  right: SessionSnapshot
): boolean {
  return (
    left.companyId === right.companyId &&
    normalizeSessionEmail(left.email) === normalizeSessionEmail(right.email)
  );
}

function isSameSessionRevision(
  left: SessionSnapshot,
  right: SessionSnapshot
): boolean {
  return (
    isSameSessionIdentity(left, right) &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}

function getRefreshFlightKey(session: SessionSnapshot, generation: number): string {
  return [
    generation,
    session.companyId,
    normalizeSessionEmail(session.email),
    session.accessToken,
    session.refreshToken,
  ].join("\u0000");
}

function enqueueAuthStorageMutation<T>(
  generation: number,
  operation: () => Promise<T>
): Promise<T> {
  const result = authStorageTail.then(async () => {
    if (generation !== authGeneration) {
      throw new SessionChangedError();
    }
    return operation();
  });
  authStorageTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function assertSessionContextCurrent(
  expected: SessionSnapshot,
  generation: number
): Promise<void> {
  if (generation !== authGeneration) {
    throw new SessionChangedError();
  }
  const current = await getStoredSession();
  if (
    generation !== authGeneration ||
    !current ||
    !isSameSessionIdentity(current, expected)
  ) {
    throw new SessionChangedError();
  }
}

async function clearSessionIfCurrent(
  expected: SessionSnapshot,
  generation: number
): Promise<void> {
  try {
    await enqueueAuthStorageMutation(generation, async () => {
      const current = await getStoredSession();
      if (current && isSameSessionRevision(current, expected)) {
        await clearSession();
      }
    });
  } catch (error) {
    if (!(error instanceof SessionChangedError)) {
      throw error;
    }
  }
}

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

async function rawFetch<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const { timeoutMs = 10000, ...fetchInit } = init || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (fetchInit.signal) {
    if (fetchInit.signal.aborted) {
      controller.abort();
    } else {
      fetchInit.signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(fetchInit.headers || {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError("Request timed out");
    }
    throw new NetworkError(error instanceof Error ? error.message : "Network request failed");
  } finally {
    clearTimeout(timeout);
    fetchInit.signal?.removeEventListener("abort", abortFromCaller);
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
  const generation = ++authGeneration;
  const deviceId = await getOrCreateDeviceId();
  const tokenPair = await rawFetch<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_id: body.companyId,
      email: body.email,
      password: body.password,
      device_id: deviceId,
    }),
    timeoutMs: AUTH_LOGIN_TIMEOUT_MS,
  });

  const session: SessionSnapshot = {
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token,
    companyId: body.companyId,
    email: body.email,
  };
  const me = await authMe(session.accessToken);
  await enqueueAuthStorageMutation(generation, async () => {
    await persistSession(session);
    if (generation !== authGeneration) {
      throw new SessionChangedError();
    }
    await persistStoredUser(me);
  });
  return me;
}

export async function authMe(accessToken?: string): Promise<AuthMe> {
  if (!accessToken) {
    return apiFetch<AuthMe>("/api/v1/auth/me");
  }

  return rawFetch<AuthMe>("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: AUTH_IDENTITY_TIMEOUT_MS,
  });
}

async function performSessionRefresh(
  expected: SessionSnapshot,
  refreshToken: string,
  generation: number
): Promise<SessionSnapshot> {
  const deviceId = await getOrCreateDeviceId();
  const next = await rawFetch<TokenPair>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken, device_id: deviceId }),
    timeoutMs: AUTH_REFRESH_TIMEOUT_MS,
  });

  return enqueueAuthStorageMutation(generation, async () => {
    const current = await getStoredSession();
    if (!current || !isSameSessionIdentity(current, expected)) {
      throw new SessionChangedError();
    }
    if (!isSameSessionRevision(current, expected)) {
      return current;
    }

    const session: SessionSnapshot = {
      accessToken: next.access_token,
      refreshToken: next.refresh_token,
      companyId: expected.companyId,
      email: expected.email,
    };
    await persistSession(session);
    return session;
  });
}

function refreshSessionSnapshot(
  expected: SessionSnapshot,
  refreshToken: string,
  generation: number
): Promise<SessionSnapshot> {
  const key = getRefreshFlightKey(expected, generation);
  const existing = refreshInFlight.get(key);
  if (existing) {
    return existing;
  }

  const operation = performSessionRefresh(expected, refreshToken, generation).finally(() => {
    if (refreshInFlight.get(key) === operation) {
      refreshInFlight.delete(key);
    }
  });
  refreshInFlight.set(key, operation);
  return operation;
}

async function refreshSessionForRetry(
  previous: SessionSnapshot,
  generation: number
): Promise<SessionSnapshot> {
  if (generation !== authGeneration) {
    throw new SessionChangedError();
  }
  const latest = await getStoredSession();
  if (
    generation !== authGeneration ||
    !latest ||
    !isSameSessionIdentity(latest, previous)
  ) {
    throw new SessionChangedError();
  }
  if (!isSameSessionRevision(latest, previous)) {
    return latest;
  }
  return refreshSessionSnapshot(latest, latest.refreshToken, generation);
}

export async function apiFetch<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const generation = authGeneration;
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
    const result = await doRequest(stored.accessToken);
    await assertSessionContextCurrent(stored, generation);
    return result;
  } catch (error) {
    if (!shouldRefreshSession(error)) {
      throw error;
    }
    let refreshed: SessionSnapshot;
    try {
      refreshed = await refreshSessionForRetry(stored, generation);
    } catch (refreshError) {
      if (isRejectedRefresh(refreshError)) {
        await clearSessionIfCurrent(stored, generation);
      }
      throw refreshError;
    }
    const result = await doRequest(refreshed.accessToken);
    await assertSessionContextCurrent(refreshed, generation);
    return result;
  }
}

export async function refreshSession(refreshToken?: string): Promise<SessionSnapshot> {
  const generation = authGeneration;
  const stored = await getStoredSession();
  const token = refreshToken || stored?.refreshToken;
  if (!token || !stored) {
    throw new Error("Missing refresh token");
  }
  if (token !== stored.refreshToken) {
    throw new SessionChangedError();
  }
  return refreshSessionSnapshot(stored, token, generation);
}

export async function logout(): Promise<void> {
  const generation = ++authGeneration;
  const stored = await getStoredSession();
  if (generation !== authGeneration) {
    return;
  }
  try {
    if (stored) {
      await rawFetch("/api/v1/auth/logout-refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
    }
  } finally {
    try {
      await enqueueAuthStorageMutation(generation, clearSession);
    } catch (error) {
      if (!(error instanceof SessionChangedError)) {
        throw error;
      }
    }
  }
}
