import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionChangedError } from "@/lib/errors";

const { apiFetchMock, dbRef, authRef, setStateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  dbRef: { current: null as any },
  authRef: { generation: 0 },
  setStateMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getAuthSessionGeneration: () => authRef.generation,
}));
vi.mock("@/lib/device-id", () => ({ getOrCreateDeviceId: async () => "isolation-test-device" }));
vi.mock("@/lib/db", () => ({
  getDb: async () => dbRef.current,
  getDatabaseContext: () => dbRef.current,
  withDatabaseContext: async (context: unknown, operation: () => Promise<unknown>) => {
    if (context !== dbRef.current) {
      throw new Error("Mobile session changed while the request was in progress");
    }
    return operation();
  },
  initDb: async () => undefined,
  getState: async () => "1",
  setState: setStateMock,
}));

import { forceColdResync, runSync } from "./service";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeDb(withEvent = false) {
  return {
    getAllAsync: vi.fn().mockResolvedValue(withEvent ? [{
      client_event_id: "event-a", type: "DOOR_SET_STATUS", project_id: "project-a",
      happened_at: "2026-09-11T10:00:00Z", created_at: "2026-09-11T10:00:00Z",
      payload_json: JSON.stringify({ door_id: "door-a", status: "INSTALLED", previous_version: 1 }),
      status: "PENDING", attempts: 0, error: null, next_retry_at: null, last_attempt_at: null,
    }] : []),
    getFirstAsync: vi.fn().mockResolvedValue({ attempts: 1 }),
    runAsync: vi.fn().mockResolvedValue(undefined),
    withTransactionAsync: vi.fn(async (operation: () => Promise<void>) => operation()),
  };
}

const response = {
  server_time: "2026-09-11T10:01:00Z", next_cursor: 2,
  reset_required: false, snapshot: null, acks: [],
  changes: [{ cursor_id: 2, change_type: "PROJECT_BASE", payload: {
    id: "project-a", name: "Account A project", address: null, status: "OK", waze_url: null,
  } }],
};

describe("sync account isolation during asynchronous requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbRef.current = makeDb();
    authRef.generation = 0;
    apiFetchMock.mockResolvedValue(response);
  });

  it("does not apply an old response to a newly activated database", async () => {
    const started = deferred<void>();
    const reply = deferred<typeof response>();
    apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
    const result = runSync().then(() => null, (error: unknown) => error);
    await started.promise;
    const databaseB = makeDb();
    dbRef.current = databaseB;
    reply.resolve(response);

    expect(await result).toBeInstanceOf(Error);
    expect(databaseB.runAsync).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it("does not mark another account's queue after a late network failure", async () => {
    dbRef.current = makeDb(true);
    const started = deferred<void>();
    const reply = deferred<typeof response>();
    apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
    const result = runSync().catch((error: unknown) => error);
    await started.promise;
    const databaseB = makeDb(true);
    dbRef.current = databaseB;
    reply.reject(new Error("Connection lost"));

    await result;
    expect(databaseB.runAsync).not.toHaveBeenCalled();
    expect(databaseB.getFirstAsync).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it.each(["retry", "cold reset"])("rejects queued %s from the old context instead of running it as the new account", async (mode) => {
    const started = deferred<void>();
    const reply = deferred<typeof response>();
    apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
    const first = runSync().catch((error: unknown) => error);
    await started.promise;
    const queued = (mode === "retry" ? runSync({ forceRetry: true }) : forceColdResync())
      .then(() => null, (error: unknown) => error);
    const databaseB = makeDb();
    dbRef.current = databaseB;
    reply.resolve(response);

    await first;
    expect(await queued).toBeInstanceOf(Error);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(databaseB.runAsync).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it.each(["database", "login"])("does not coalesce automatic sync across a %s change", async (change) => {
    const started = deferred<void>();
    const reply = deferred<typeof response>();
    const nextResponse = { ...response, changes: [] };
    apiFetchMock.mockResolvedValue(nextResponse);
    apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
    const first = runSync();
    const firstResult = first.catch((error: unknown) => error);
    await started.promise;
    if (change === "database") dbRef.current = makeDb();
    else authRef.generation += 1;
    const second = runSync();
    const secondResult = second.catch((error: unknown) => error);
    reply.resolve(response);

    expect(await firstResult).toBeInstanceOf(Error);
    expect(await secondResult).toEqual(nextResponse);
    expect(second).not.toBe(first);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains unresolved events when authentication invalidates the in-flight request", async () => {
    const databaseA = makeDb(true);
    dbRef.current = databaseA;
    apiFetchMock.mockRejectedValueOnce(new SessionChangedError());

    await expect(runSync()).rejects.toBeInstanceOf(SessionChangedError);

    const statements = databaseA.runAsync.mock.calls.map((call) => String(call[0]));
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("SET attempts = attempts + 1");
    expect(statements[0]).not.toContain("status =");
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it("binds the outgoing request to the login generation captured before queueing", async () => {
    authRef.generation = 42;
    await runSync();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/sync", expect.objectContaining({
      expectedAuthGeneration: 42,
    }));
  });
});
