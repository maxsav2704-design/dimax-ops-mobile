import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => ({ setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("expo-secure-store", () => secureStore);

import {
  isValidCachedInstaller,
  clearSession,
  persistSession,
  type CachedAuthUser,
  type SessionSnapshot,
} from "@/modules/auth/session";

const session: SessionSnapshot = {
  accessToken: "access", refreshToken: "refresh",
  companyId: "company-1", email: "installer-a@example.invalid",
};
const user: CachedAuthUser = {
  id: "installer-a", company_id: session.companyId, email: session.email,
  full_name: "Installer A", role: "INSTALLER", is_active: true,
};

describe("offline installer identity", () => {
  it("accepts a complete matching installer profile", () => {
    expect(isValidCachedInstaller(session, user)).toBe(true);
  });

  it("normalizes email case and surrounding whitespace", () => {
    expect(isValidCachedInstaller(session, { ...user, email: " INSTALLER-A@EXAMPLE.INVALID " }))
      .toBe(true);
  });

  it("rejects another installer from the same company", () => {
    expect(isValidCachedInstaller(session, {
      ...user, id: "installer-b", email: "installer-b@example.invalid",
    })).toBe(false);
  });

  it.each([
    { company_id: "company-2" },
    { role: "ADMIN" },
    { is_active: false },
    { id: " " },
    { email: " " },
  ])("rejects an unusable cached identity: %j", (invalid) => {
    expect(isValidCachedInstaller(session, { ...user, ...invalid })).toBe(false);
  });

  it("rejects a missing session or profile", () => {
    expect(isValidCachedInstaller(null, user)).toBe(false);
    expect(isValidCachedInstaller(session, null)).toBe(false);
  });

  it("does not consider two blank email values a valid identity match", () => {
    expect(isValidCachedInstaller({ ...session, email: " " }, { ...user, email: " " }))
      .toBe(false);
  });
});

describe("credential mutation completion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    secureStore.setItemAsync.mockResolvedValue(undefined);
    secureStore.deleteItemAsync.mockResolvedValue(undefined);
  });

  it.each(["write", "clear"])("waits for every %s operation before reporting a failure", async (kind) => {
    let finish!: () => void;
    const late = new Promise<void>((resolve) => { finish = resolve; });
    const operation = kind === "write" ? secureStore.setItemAsync : secureStore.deleteItemAsync;
    operation.mockRejectedValueOnce(new Error("Storage unavailable")).mockReturnValueOnce(late);
    let settled = false;
    const result = (kind === "write" ? persistSession(session) : clearSession())
      .catch((error: unknown) => error).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const settledBeforeLastOperation = settled;
    finish();

    expect(await result).toMatchObject({ message: "Storage unavailable" });
    expect(settledBeforeLastOperation).toBe(false);
    expect(operation).toHaveBeenCalledTimes(kind === "write" ? 4 : 5);
  });
});
