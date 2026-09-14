import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedAuthUser, SessionSnapshot } from "@/modules/auth/session";

const storage = vi.hoisted(() => ({
  getStoredSession: vi.fn(),
  persistSession: vi.fn(),
  persistStoredUser: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("@/modules/auth/session", () => storage);
vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: async () => "test-device",
}));

import {
  getAuthSessionGeneration,
  login,
  logout,
  persistAuthenticatedUser,
} from "@/lib/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function installer(id: string): CachedAuthUser {
  return {
    id, company_id: "company-1", email: `${id}@example.invalid`,
    full_name: `Installer ${id}`, role: "INSTALLER", is_active: true,
  };
}

const userA = installer("a");
const userB = installer("b");
const sessionA: SessionSnapshot = {
  accessToken: "access-a", refreshToken: "refresh-a",
  companyId: userA.company_id, email: userA.email,
};
let storedSession: SessionSnapshot | null;
let storedUser: CachedAuthUser | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  storedSession = { ...sessionA };
  storedUser = { ...userA };
  storage.getStoredSession.mockImplementation(async () => storedSession);
  storage.persistSession.mockImplementation(async (value: SessionSnapshot) => {
    storedSession = value;
  });
  storage.persistStoredUser.mockImplementation(async (value: CachedAuthUser) => {
    storedUser = value;
  });
  storage.clearSession.mockImplementation(async () => {
    storedSession = null;
    storedUser = null;
  });
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/auth/logout-refresh")) return { ok: true, status: 204 };
    if (url.endsWith("/auth/login")) return {
      ok: true, status: 200,
      json: async () => ({ access_token: "access-b", refresh_token: "refresh-b" }),
    };
    if (url.endsWith("/auth/me")) return {
      ok: true, status: 200, json: async () => userB,
    };
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("authenticated profile storage isolation", () => {
  it("updates the current profile locally and tolerates normalized email", async () => {
    const refreshed = { ...userA, email: " A@EXAMPLE.INVALID ", full_name: "Updated name" };
    await persistAuthenticatedUser(refreshed, getAuthSessionGeneration());
    expect(storedUser).toEqual(refreshed);
    expect(storedSession).toEqual(sessionA);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["missing", "company", "email"])("rejects a %s session mismatch", async (kind) => {
    storedSession = kind === "missing" ? null : {
      ...sessionA,
      ...(kind === "company" ? { companyId: "company-2" } : { email: userB.email }),
    };
    await expect(persistAuthenticatedUser(userA, getAuthSessionGeneration()))
      .rejects.toMatchObject({ name: "SessionChangedError" });
    expect(storage.persistStoredUser).not.toHaveBeenCalled();
    expect(storage.clearSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an old generation without reading or writing storage", async () => {
    const generation = getAuthSessionGeneration();
    await logout();
    vi.clearAllMocks();
    await expect(persistAuthenticatedUser(userA, generation))
      .rejects.toMatchObject({ name: "SessionChangedError" });
    expect(storage.getStoredSession).not.toHaveBeenCalled();
    expect(storage.persistStoredUser).not.toHaveBeenCalled();
  });

  it("rechecks the generation after a delayed session read", async () => {
    const read = deferred<SessionSnapshot>();
    const started = deferred<void>();
    storage.getStoredSession.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });
    const update = persistAuthenticatedUser(userA, getAuthSessionGeneration())
      .catch((error: unknown) => error);
    await started.promise;
    const exit = logout();
    read.resolve(sessionA);

    expect(await update).toMatchObject({ name: "SessionChangedError" });
    await exit;
    expect(storage.persistStoredUser).not.toHaveBeenCalled();
    expect(storedUser).toBeNull();
  });

  it("finishes an in-flight profile write before logout clears the account", async () => {
    const write = deferred<void>();
    const started = deferred<void>();
    storage.persistStoredUser.mockImplementationOnce(async (value: CachedAuthUser) => {
      started.resolve();
      await write.promise;
      storedUser = value;
    });
    const update = persistAuthenticatedUser(userA, getAuthSessionGeneration())
      .catch((error: unknown) => error);
    await started.promise;
    const exit = logout();
    expect(storage.clearSession).not.toHaveBeenCalled();
    write.resolve();

    expect(await update).toMatchObject({ name: "SessionChangedError" });
    await exit;
    expect(storedUser).toBeNull();
    expect(storedSession).toBeNull();
    expect(storage.clearSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the newer installer profile and tokens when an old write completes late", async () => {
    const write = deferred<void>();
    const started = deferred<void>();
    storage.persistStoredUser.mockImplementationOnce(async (value: CachedAuthUser) => {
      started.resolve();
      await write.promise;
      storedUser = value;
    });
    const update = persistAuthenticatedUser(userA, getAuthSessionGeneration())
      .catch((error: unknown) => error);
    await started.promise;
    const enter = login({ companyId: userB.company_id, email: userB.email, password: "test" });
    write.resolve();

    expect(await update).toMatchObject({ name: "SessionChangedError" });
    expect(await enter).toEqual(userB);
    expect(storedUser).toEqual(userB);
    expect(storedSession).toMatchObject({ accessToken: "access-b", email: userB.email });
    expect(storage.persistStoredUser.mock.calls.map(([user]) => user.id)).toEqual(["a", "b"]);
    expect(storage.clearSession).not.toHaveBeenCalled();
  });

  it("keeps the mutation queue usable after a profile storage failure", async () => {
    storage.persistStoredUser.mockRejectedValueOnce(new Error("SecureStore unavailable"));
    await expect(persistAuthenticatedUser(userA, getAuthSessionGeneration()))
      .rejects.toThrow("SecureStore unavailable");
    const refreshed = { ...userA, full_name: "Retry succeeded" };
    await persistAuthenticatedUser(refreshed, getAuthSessionGeneration());
    expect(storedUser).toEqual(refreshed);
    expect(storedSession).toEqual(sessionA);
    expect(storage.clearSession).not.toHaveBeenCalled();
  });

  it("rejects an earlier profile even after signing back into the same account", async () => {
    const generation = getAuthSessionGeneration();
    await logout();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, status: 200,
      json: async () => url.endsWith("/auth/login")
        ? { access_token: "new-access-a", refresh_token: "new-refresh-a" } : userA,
    }));
    await login({ companyId: userA.company_id, email: userA.email, password: "test" });
    storage.persistStoredUser.mockClear();

    await expect(persistAuthenticatedUser({ ...userA, full_name: "Stale name" }, generation))
      .rejects.toMatchObject({ name: "SessionChangedError" });
    expect(storedUser).toEqual(userA);
    expect(storedSession?.accessToken).toBe("new-access-a");
    expect(storage.persistStoredUser).not.toHaveBeenCalled();
  });

  it("allows a profile update after token rotation within the same session", async () => {
    const generation = getAuthSessionGeneration();
    storedSession = { ...sessionA, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
    await persistAuthenticatedUser(userA, generation);
    expect(storedUser).toEqual(userA);
    expect(storedSession.accessToken).toBe("rotated-access");
    expect(storage.persistSession).not.toHaveBeenCalled();
  });
});
