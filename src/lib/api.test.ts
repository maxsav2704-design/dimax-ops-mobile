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

import { apiFetch, authMe, login, refreshSession } from "@/lib/api";

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

  it("times out stalled network requests", async () => {
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
    const rejection = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(10001);

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
});
