import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getOrCreateDeviceIdMock,
  getStoredSessionMock,
  persistSessionMock,
  persistStoredUserMock,
  clearSessionMock,
} = vi.hoisted(() => ({
  getOrCreateDeviceIdMock: vi.fn(),
  getStoredSessionMock: vi.fn(),
  persistSessionMock: vi.fn(),
  persistStoredUserMock: vi.fn(),
  clearSessionMock: vi.fn(),
}));

vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: getOrCreateDeviceIdMock,
}));

vi.mock("@/modules/auth/session", () => ({
  getStoredSession: getStoredSessionMock,
  persistSession: persistSessionMock,
  persistStoredUser: persistStoredUserMock,
  clearSession: clearSessionMock,
}));

import { apiFetch, authMe, login, logout, refreshSession } from "@/lib/api";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("mobile api auth payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    getOrCreateDeviceIdMock.mockResolvedValue("test-mobile-device-id");
    getStoredSessionMock.mockResolvedValue({
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      companyId: "company-1",
      email: "installer@dimax.dev",
    });
    persistSessionMock.mockResolvedValue(undefined);
    persistStoredUserMock.mockResolvedValue(undefined);
    clearSessionMock.mockResolvedValue(undefined);
  });

  it("sends device_id during login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "bearer",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "user-1",
          company_id: "company-1",
          email: "installer@dimax.dev",
          full_name: "Installer",
          role: "installer",
          is_active: true,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    await login({
      companyId: "company-1",
      email: "installer@dimax.dev",
      password: "installer12345",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          company_id: "company-1",
          email: "installer@dimax.dev",
          password: "installer12345",
          device_id: "test-mobile-device-id",
        }),
      })
    );
  });

  it("sends device_id during refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "next-access",
        refresh_token: "next-refresh",
        token_type: "bearer",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await refreshSession("stored-refresh");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          refresh_token: "stored-refresh",
          device_id: "test-mobile-device-id",
        }),
      })
    );
  });

  it("authMe still uses bearer token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "user-1",
        company_id: "company-1",
        email: "installer@dimax.dev",
        full_name: "Installer",
        role: "installer",
        is_active: true,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await authMe("stored-access");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer stored-access",
        }),
      })
    );
  });

  it("keeps auth identity lookup alive beyond the default request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = authMe("stored-access");
    let settled = false;
    void request.catch(() => undefined).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10001);
    expect(settled).toBe(false);

    const rejection = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(20000);

    await rejection;
    vi.useRealTimers();
  });

  it("honours a longer timeout for snapshot sync requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = apiFetch("/api/v1/installer/sync", { timeoutMs: 30000 });
    let settled = false;
    void request.catch(() => undefined).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10001);
    expect(settled).toBe(false);

    const rejection = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    vi.useRealTimers();
  });

  it("keeps installer login alive beyond the default request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = login({
      companyId: "company-1",
      email: "installer@dimax.dev",
      password: "installer12345",
    });
    let settled = false;
    void request.catch(() => undefined).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10001);
    expect(settled).toBe(false);

    const rejection = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    vi.useRealTimers();
  });

  it("keeps token rotation alive beyond the default request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = refreshSession("stored-refresh");
    let settled = false;
    void request.catch(() => undefined).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10001);
    expect(settled).toBe(false);

    const rejection = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    vi.useRealTimers();
  });

  it("refreshes the session when backend reports token expired as 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "next-access",
          refresh_token: "next-refresh",
          token_type: "bearer",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/api/v1/installer/calendar/events");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          refresh_token: "stored-refresh",
          device_id: "test-mobile-device-id",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8000/api/v1/installer/calendar/events",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer next-access",
        }),
      })
    );
  });

  it("deduplicates concurrent refresh attempts after access token expiry", async () => {
    let storedSession = {
      accessToken: "stored-access",
      refreshToken: "stored-refresh",
      companyId: "company-1",
      email: "installer@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    persistSessionMock.mockImplementation(async (session: typeof storedSession) => {
      storedSession = session;
    });
    const endpointAttempts = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "next-access",
            refresh_token: "next-refresh",
            token_type: "bearer",
          }),
        };
      }

      const attempts = endpointAttempts.get(url) || 0;
      endpointAttempts.set(url, attempts + 1);
      if (attempts === 0) {
        return {
          ok: false,
          status: 403,
          text: async () => '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith("/api/v1/installer/projects")
            ? { projects: true }
            : { calendar: true },
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const [projects, calendar] = await Promise.all([
      apiFetch<{ projects: boolean }>("/api/v1/installer/projects"),
      apiFetch<{ calendar: boolean }>("/api/v1/installer/calendar/events"),
    ]);

    expect(projects).toEqual({ projects: true });
    expect(calendar).toEqual({ calendar: true });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/auth/refresh"))
    ).toHaveLength(1);
  });

  it("authMe refreshes a cached expired session when no explicit token is provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "next-access",
          refresh_token: "next-refresh",
          token_type: "bearer",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "user-1",
          company_id: "company-1",
          email: "installer@dimax.dev",
          full_name: "Installer",
          role: "installer",
          is_active: true,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await authMe();

    expect(result.email).toBe("installer@dimax.dev");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:8000/api/v1/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer next-access",
        }),
      })
    );
  });

  it("clears the cached session when refresh token is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"error":{"code":"UNAUTHORIZED","message":"Refresh token rejected","field":null,"meta":null}}',
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: boolean }>("/api/v1/installer/sync")).rejects.toThrow("Refresh token rejected");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an API response that completes after the active account changes", async () => {
    let storedSession = {
      accessToken: "account-a-access",
      refreshToken: "account-a-refresh",
      companyId: "company-a",
      email: "installer-a@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    const response = createDeferred<{
      ok: boolean;
      status: number;
      json: () => Promise<{ projects: string[] }>;
    }>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));

    const request = apiFetch<{ projects: string[] }>("/api/v1/installer/projects");
    const rejection = expect(request).rejects.toThrow(
      "Mobile session changed while the request was in progress"
    );
    storedSession = {
      accessToken: "account-b-access",
      refreshToken: "account-b-refresh",
      companyId: "company-b",
      email: "installer-b@dimax.dev",
    };
    response.resolve({
      ok: true,
      status: 200,
      json: async () => ({ projects: ["project-a"] }),
    });

    await rejection;
    expect(persistSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it("does not retry with or overwrite another account during refresh", async () => {
    let storedSession = {
      accessToken: "account-a-access",
      refreshToken: "account-a-refresh",
      companyId: "company-a",
      email: "installer-a@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    persistSessionMock.mockImplementation(async (session: typeof storedSession) => {
      storedSession = session;
    });
    const refreshResponse = createDeferred<{
      ok: boolean;
      status: number;
      json: () => Promise<{
        access_token: string;
        refresh_token: string;
        token_type: string;
      }>;
    }>();
    const refreshStarted = createDeferred<void>();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      return {
        ok: false,
        status: 403,
        text: async () =>
          '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = apiFetch<{ ok: boolean }>("/api/v1/installer/sync");
    const rejection = expect(request).rejects.toThrow(
      "Mobile session changed while the request was in progress"
    );
    await refreshStarted.promise;
    storedSession = {
      accessToken: "account-b-access",
      refreshToken: "account-b-refresh",
      companyId: "company-b",
      email: "installer-b@dimax.dev",
    };
    refreshResponse.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "rotated-a-access",
        refresh_token: "rotated-a-refresh",
        token_type: "bearer",
      }),
    });

    await rejection;
    expect(persistSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/installer/sync"))).toHaveLength(1);
  });

  it("does not clear another account when an old refresh token is rejected", async () => {
    let storedSession = {
      accessToken: "account-a-access",
      refreshToken: "account-a-refresh",
      companyId: "company-a",
      email: "installer-a@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    const refreshResponse = createDeferred<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
    }>();
    const refreshStarted = createDeferred<void>();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      return {
        ok: false,
        status: 403,
        text: async () =>
          '{"error":{"code":"FORBIDDEN","message":"Token expired","field":null,"meta":null}}',
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = apiFetch<{ ok: boolean }>("/api/v1/installer/sync");
    const rejection = expect(request).rejects.toThrow("Refresh token rejected");
    await refreshStarted.promise;
    storedSession = {
      accessToken: "account-b-access",
      refreshToken: "account-b-refresh",
      companyId: "company-b",
      email: "installer-b@dimax.dev",
    };
    refreshResponse.resolve({
      ok: false,
      status: 401,
      text: async () => "Refresh token rejected",
    });

    await rejection;
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(persistSessionMock).not.toHaveBeenCalled();
  });

  it("prevents a slower earlier login from replacing the latest account", async () => {
    let storedSession = {
      accessToken: "initial-access",
      refreshToken: "initial-refresh",
      companyId: "company-initial",
      email: "initial@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    persistSessionMock.mockImplementation(async (session: typeof storedSession) => {
      storedSession = session;
    });
    const firstLoginResponse = createDeferred<{
      ok: boolean;
      status: number;
      json: () => Promise<{
        access_token: string;
        refresh_token: string;
        token_type: string;
      }>;
    }>();
    const firstLoginStarted = createDeferred<void>();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/auth/login")) {
        const body = JSON.parse(String(init?.body)) as { email: string };
        if (body.email === "installer-a@dimax.dev") {
          firstLoginStarted.resolve();
          return firstLoginResponse.promise;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "account-b-access",
            refresh_token: "account-b-refresh",
            token_type: "bearer",
          }),
        };
      }
      if (url.endsWith("/api/v1/auth/me")) {
        const authorization = (init?.headers as Record<string, string>).Authorization;
        const account = authorization === "Bearer account-a-access" ? "a" : "b";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: `installer-${account}`,
            company_id: `company-${account}`,
            email: `installer-${account}@dimax.dev`,
            full_name: `Installer ${account.toUpperCase()}`,
            role: "INSTALLER",
            is_active: true,
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstLogin = login({
      companyId: "company-a",
      email: "installer-a@dimax.dev",
      password: "password-a",
    });
    const firstLoginRejection = expect(firstLogin).rejects.toThrow(
      "Mobile session changed while the request was in progress"
    );
    await firstLoginStarted.promise;
    const latestUser = await login({
      companyId: "company-b",
      email: "installer-b@dimax.dev",
      password: "password-b",
    });
    firstLoginResponse.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "account-a-access",
        refresh_token: "account-a-refresh",
        token_type: "bearer",
      }),
    });

    await firstLoginRejection;
    expect(latestUser.id).toBe("installer-b");
    expect(storedSession).toEqual({
      accessToken: "account-b-access",
      refreshToken: "account-b-refresh",
      companyId: "company-b",
      email: "installer-b@dimax.dev",
    });
    expect(persistSessionMock).toHaveBeenCalledTimes(1);
    expect(persistStoredUserMock).toHaveBeenCalledTimes(1);
    expect(persistStoredUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "installer-b", company_id: "company-b" })
    );
  });

  it("prevents a delayed logout from clearing a newer login", async () => {
    let storedSession = {
      accessToken: "account-a-access",
      refreshToken: "account-a-refresh",
      companyId: "company-a",
      email: "installer-a@dimax.dev",
    };
    getStoredSessionMock.mockImplementation(async () => storedSession);
    persistSessionMock.mockImplementation(async (session: typeof storedSession) => {
      storedSession = session;
    });
    const logoutResponse = createDeferred<{ ok: boolean; status: number }>();
    const logoutStarted = createDeferred<void>();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/auth/logout-refresh")) {
        logoutStarted.resolve();
        return logoutResponse.promise;
      }
      if (url.endsWith("/api/v1/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "account-b-access",
            refresh_token: "account-b-refresh",
            token_type: "bearer",
          }),
        };
      }
      if (url.endsWith("/api/v1/auth/me")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          "Bearer account-b-access"
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "installer-b",
            company_id: "company-b",
            email: "installer-b@dimax.dev",
            full_name: "Installer B",
            role: "INSTALLER",
            is_active: true,
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const logoutRequest = logout();
    await logoutStarted.promise;
    await login({
      companyId: "company-b",
      email: "installer-b@dimax.dev",
      password: "password-b",
    });
    logoutResponse.resolve({ ok: true, status: 204 });
    await logoutRequest;

    expect(storedSession).toEqual({
      accessToken: "account-b-access",
      refreshToken: "account-b-refresh",
      companyId: "company-b",
      email: "installer-b@dimax.dev",
    });
    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(persistStoredUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "installer-b", company_id: "company-b" })
    );
  });
});
