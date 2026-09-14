import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionChangedError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ clear: vi.fn(), deactivate: vi.fn() }));
vi.mock("@/lib/api", () => ({ clearAuthenticatedSession: mocks.clear }));
vi.mock("@/lib/db", () => ({ deactivateDb: mocks.deactivate }));
import { clearAuthWorkspace } from "@/modules/auth/workspace";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

let current = true;
const onCleared = vi.fn();
const options = { isCurrent: () => current, onCleared, forgetSessionGeneration: 7 };

beforeEach(() => {
  vi.resetAllMocks();
  current = true;
  mocks.clear.mockResolvedValue(undefined);
  mocks.deactivate.mockResolvedValue(undefined);
});

describe("auth workspace cleanup", () => {
  it("does nothing for an old bootstrap, failed login or logout callback", async () => {
    current = false;
    await clearAuthWorkspace(options);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.deactivate).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it("clears credentials, closes SQLite and then publishes the cleared state", async () => {
    const order: string[] = [];
    mocks.clear.mockImplementation(async () => { order.push("credentials"); });
    mocks.deactivate.mockImplementation(async () => { order.push("database"); });
    onCleared.mockImplementation(() => { order.push("state"); });
    await clearAuthWorkspace(options);
    expect(mocks.clear).toHaveBeenCalledWith(7);
    expect(order).toEqual(["credentials", "database", "state"]);
  });

  it("only detaches the workspace when credentials were already cleared by the API", async () => {
    await clearAuthWorkspace({ isCurrent: options.isCurrent, onCleared });
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.deactivate).toHaveBeenCalledOnce();
    expect(onCleared).toHaveBeenCalledOnce();
  });

  it("does not detach a newer account if the auth generation rejected cleanup", async () => {
    mocks.clear.mockRejectedValueOnce(new SessionChangedError());
    await clearAuthWorkspace(options);
    expect(mocks.deactivate).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it.each([false, true])("ignores late credential cleanup (failed=%s) after a new login", async (failed) => {
    const pending = deferred();
    mocks.clear.mockReturnValueOnce(pending.promise);
    const cleanup = clearAuthWorkspace(options);
    current = false;
    if (failed) pending.reject(new Error("Old storage error"));
    else pending.resolve();
    await cleanup;
    expect(mocks.deactivate).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not overwrite newer UI after closing an old database (failed=%s)", async (failed) => {
    const pending = deferred();
    const started = deferred();
    mocks.deactivate.mockImplementationOnce(() => { started.resolve(); return pending.promise; });
    const cleanup = clearAuthWorkspace(options);
    await started.promise;
    current = false;
    if (failed) pending.reject(new Error("Old close error"));
    else pending.resolve();
    await cleanup;
    expect(onCleared).not.toHaveBeenCalled();
  });

  it("detaches the current workspace but reports a credential deletion failure", async () => {
    mocks.clear.mockRejectedValueOnce(new Error("Delete failed"));
    await expect(clearAuthWorkspace(options)).rejects.toThrow("Delete failed");
    expect(mocks.deactivate).toHaveBeenCalledOnce();
    expect(onCleared).toHaveBeenCalledOnce();
  });

  it("clears current UI even when closing the database fails", async () => {
    mocks.deactivate.mockRejectedValueOnce(new Error("Close failed"));
    await expect(clearAuthWorkspace(options)).rejects.toThrow("Close failed");
    expect(onCleared).toHaveBeenCalledOnce();
  });
});
