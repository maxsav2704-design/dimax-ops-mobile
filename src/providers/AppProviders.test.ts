import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(), me: vi.fn(), session: vi.fn(), cachedUser: vi.fn(),
  valid: vi.fn(), clear: vi.fn(), sync: vi.fn(), mounted: vi.fn(),
}));
vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => "en", setItemAsync: vi.fn() }));
vi.mock("@/lib/config", () => ({ LOCALE_STORAGE_KEY: "test-locale" }));
vi.mock("@/lib/api", () => ({
  authMe: mocks.me, getAuthSessionGeneration: () => 1,
  login: vi.fn(), logout: vi.fn(), persistAuthenticatedUser: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ activateDbForIdentity: mocks.activate }));
vi.mock("@/modules/auth/session", () => ({
  getStoredSession: mocks.session, getStoredUser: mocks.cachedUser, isValidCachedInstaller: mocks.valid,
}));
vi.mock("@/modules/auth/workspace", () => ({ clearAuthWorkspace: mocks.clear }));
vi.mock("@/modules/sync/service", () => ({ runSync: mocks.sync }));

import { AppProviders, useAuth } from "./AppProviders";

const user = { id: "installer-a", company_id: "company-a", role: "INSTALLER", is_active: true };
let tree: ReactTestRenderer;
let auth: ReturnType<typeof useAuth>;
function RouteProbe() {
  auth = useAuth();
  React.useEffect(() => { mocks.mounted(); }, []);
  return null;
}
async function mount() {
  await act(async () => { tree = create(React.createElement(AppProviders, null, React.createElement(RouteProbe))); });
}
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ companyId: "company-a" });
  mocks.cachedUser.mockResolvedValue(user);
  mocks.valid.mockReturnValue(true);
  mocks.clear.mockImplementation(async ({ onCleared }) => onCleared());
  mocks.me.mockRejectedValue(new Error("Offline"));
  mocks.sync.mockRejectedValue(new Error("Offline"));
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("native route bootstrap", () => {
  it("does not mount a deep-linked screen before its offline database is activated", async () => {
    const activation = deferred();
    mocks.activate.mockReturnValue(activation.promise);
    await mount();
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith("company-a", "installer-a");
    expect(mocks.mounted).not.toHaveBeenCalled();
    await act(async () => activation.resolve());
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
    expect(auth.user).toEqual(user);
    expect(auth.loading).toBe(false);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("finishes bootstrap without an identity when cached credentials are invalid", async () => {
    mocks.valid.mockReturnValue(false);
    await mount();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.mounted).toHaveBeenCalledOnce();
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
  });

  it("finishes bootstrap safely if the account database cannot be opened", async () => {
    mocks.activate.mockRejectedValue(new Error("Storage unavailable"));
    await mount();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
  });

  it("preserves mounted screens and offline identity during a later failed refresh", async () => {
    await mount();
    const refresh = deferred();
    mocks.me.mockReturnValue(refresh.promise);
    let request!: Promise<void>;
    await act(async () => { request = auth.refreshUser().catch(() => undefined); });
    expect(auth.loading).toBe(true);
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
    await act(async () => { refresh.reject(new Error("Offline")); await request; });
    expect(auth.loading).toBe(false);
    expect(auth.user).toEqual(user);
    expect(mocks.mounted).toHaveBeenCalledTimes(1);
  });
});
