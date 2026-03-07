import { API_BASE_URL } from "@/lib/config";
import { ApiError, NetworkError } from "@/lib/errors";
import { clearSession, getStoredSession, persistSession, type SessionSnapshot } from "@/modules/auth/session";

export type LoginBody = {
  companyId: string;
  email: string;
  password: string;
};

export type AuthMe = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new NetworkError(error instanceof Error ? error.message : "Network request failed");
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
  const tokenPair = await rawFetch<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_id: body.companyId,
      email: body.email,
      password: body.password,
    }),
  });

  const session: SessionSnapshot = {
    accessToken: tokenPair.access_token,
    refreshToken: tokenPair.refresh_token,
    companyId: body.companyId,
    email: body.email,
  };
  await persistSession(session);
  return authMe(session.accessToken);
}

export async function authMe(accessToken?: string): Promise<AuthMe> {
  const stored = accessToken ? null : await getStoredSession();
  const token = accessToken || stored?.accessToken;
  if (!token) {
    throw new Error("Missing access token");
  }

  return rawFetch<AuthMe>("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
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
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    const refreshed = await refreshSession(stored.refreshToken);
    return doRequest(refreshed.accessToken);
  }
}

export async function refreshSession(refreshToken?: string): Promise<SessionSnapshot> {
  const stored = await getStoredSession();
  const token = refreshToken || stored?.refreshToken;
  if (!token || !stored) {
    throw new Error("Missing refresh token");
  }

  const next = await rawFetch<TokenPair>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: token }),
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
