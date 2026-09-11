import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSyncEvent, SyncResponse, SyncSnapshot } from "./types";

const { apiFetchMock, dbRef, setStateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  dbRef: { current: null as any },
  setStateMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock, getAuthSessionGeneration: () => 0 }));
vi.mock("@/lib/device-id", () => ({ getOrCreateDeviceId: async () => "reset-test-device" }));
vi.mock("@/lib/db", () => ({
  getDb: async () => dbRef.current,
  getDatabaseContext: () => dbRef.current,
  withDatabaseContext: async (_context: unknown, operation: () => Promise<unknown>) => operation(),
  getState: async () => "1",
  initDb: async () => undefined,
  setState: setStateMock,
}));

import { dropPendingEvent, retryPendingEventNow, runSync } from "./service";

type QueueRow = Omit<PendingSyncEvent, "payload"> & { payload_json: string };

function queuedEvent(
  id: string,
  type: PendingSyncEvent["type"],
  payload: Record<string, unknown>,
  overrides: Partial<QueueRow> = {},
): QueueRow {
  return {
    client_event_id: id,
    type,
    project_id: "project-1",
    payload_json: JSON.stringify(payload),
    happened_at: "2026-09-11T10:00:00Z",
    created_at: "2026-09-11T10:00:00Z",
    status: "PENDING",
    error: null,
    attempts: 0,
    next_retry_at: null,
    last_attempt_at: null,
    ...overrides,
  };
}

function snapshot(): SyncSnapshot {
  return {
    projects: [{
      id: "project-1", name: "Synthetic tower", address: null, status: "OK",
      lifecycle_status: "ACTIVE", health_status: "NORMAL", waze_url: null,
    }],
    doors: [{
      id: "door-1", project_id: "project-1", door_type_id: "type-1", unit_label: "101",
      order_number: null, house_number: null, floor_label: "1", apartment_number: "101",
      location_code: null, door_marking: null, status: "PENDING", reason_id: null,
      comment: null, is_locked: false, version: 2,
    }],
    door_types: [{ id: "type-1", code: "entrance", name: "Entrance" }],
    reasons: [],
    addon_types: [{ id: "addon-1", name: "Extra frame", unit: "unit" }],
    addon_plans: [], addon_facts: [], issues: [],
  };
}

function arrangeReset(sent: QueueRow[], remaining: QueueRow[], state = snapshot()) {
  const response: SyncResponse = {
    reset_required: true, snapshot: state, acks: [], changes: [],
    next_cursor: 50, server_time: "2026-09-11T10:01:00Z",
  };
  dbRef.current.getAllAsync.mockResolvedValueOnce(sent).mockResolvedValue(remaining);
  dbRef.current.getFirstAsync.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM doors")) {
      const door = state.doors.find((item) => item.id === params[0]);
      return door ? { ...door, is_locked: door.is_locked ? 1 : 0 } : null;
    }
    if (sql.includes("FROM pending_events")) {
      return [...sent, ...remaining].find((item) => item.client_event_id === params[0]) ?? null;
    }
    return null;
  });
  apiFetchMock.mockResolvedValue(response);
  return response;
}

function writes(fragment: string): Array<[string, unknown[]]> {
  return dbRef.current.runAsync.mock.calls.filter(([sql]: [string]) => sql.includes(fragment));
}

describe("cold resync preserves the complete unresolved outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbRef.current = {
      getAllAsync: vi.fn().mockResolvedValue([]),
      getFirstAsync: vi.fn().mockResolvedValue(null),
      runAsync: vi.fn().mockResolvedValue(undefined),
      withTransactionAsync: vi.fn(async (operation: () => Promise<void>) => operation()),
    };
  });

  it("restores a failed door update even while its retry backoff prevents sending", async () => {
    const event = queuedEvent("delayed-door", "DOOR_SET_STATUS", {
      door_id: "door-1", status: "INSTALLED", previous_version: 2,
    }, { status: "FAILED", attempts: 2, next_retry_at: "2099-01-01T00:00:00Z" });
    arrangeReset([], [event]);

    await runSync();

    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body).events).toEqual([]);
    expect(writes("UPDATE doors").map(([, params]) => [params[0], params[4], params[6]]))
      .toEqual([["INSTALLED", 3, "door-1"]]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
    expect(writes("SET status = 'FAILED'")).toEqual([]);
  });

  it("restores entries beyond the 500-event send batch without sending them early", async () => {
    const events = Array.from({ length: 501 }, (_, index) => queuedEvent(`addon-${index}`, "ADDON_FACT_CREATE", {
      addon_type_id: "addon-1", qty_done: "1.00",
    }));
    arrangeReset(events.slice(0, 500), events);

    await runSync();

    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body).events).toHaveLength(500);
    expect(writes("INSERT INTO addon_facts")).toHaveLength(501);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
  });

  it("restores work added while the sync request was in flight", async () => {
    const newEvent = queuedEvent("new-issue", "ISSUE_CREATE", {
      door_id: "door-1", title: "Damaged frame",
    });
    const response = arrangeReset([], []);
    apiFetchMock.mockImplementationOnce(async () => {
      dbRef.current.getAllAsync.mockResolvedValue([newEvent]);
      return response;
    });

    await runSync();

    expect(JSON.parse(apiFetchMock.mock.calls[0][1].body).events).toEqual([]);
    expect(writes("INSERT INTO issues").map(([, params]) => params[0])).toEqual(["local:new-issue"]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
  });

  it("does not recreate optimistic work explicitly removed while awaiting the response", async () => {
    const event = queuedEvent("removed-addon", "ADDON_FACT_CREATE", { addon_type_id: "addon-1", qty_done: "1" });
    arrangeReset([event], []);

    await runSync();

    expect(writes("INSERT INTO addon_facts")).toEqual([]);
  });

  it("does not restore blocked events or silently delete their payloads", async () => {
    const event = queuedEvent("blocked-addon", "ADDON_FACT_CREATE", {
      addon_type_id: "addon-1", qty_done: "1",
    }, { status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED" });
    arrangeReset([], [event]);

    await runSync();

    expect(writes("INSERT INTO addon_facts")).toEqual([]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
  });

  it("preserves the server door state when an event is rejected in the reset response", async () => {
    const state = snapshot();
    state.doors[0] = { ...state.doors[0], status: "NOT_INSTALLED", reason_id: "reason-current", version: 7 };
    const event = queuedEvent("rejected-door", "DOOR_SET_STATUS", {
      door_id: "door-1", status: "INSTALLED", previous_status: "PENDING", previous_version: 2,
    });
    const response = arrangeReset([event], [{ ...event, status: "BLOCKED" }], state);
    response.acks = [{ client_event_id: event.client_event_id, ok: false, applied: false, error: "CONFLICT_INVALID_TRANSITION" }];

    await runSync();

    expect(writes("INSERT INTO doors")[0][1][10]).toBe("NOT_INSTALLED");
    expect(writes("UPDATE doors")).toEqual([]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
    expect(writes("SET status = 'BLOCKED'")).toEqual([
      [expect.any(String), ["CONFLICT_INVALID_TRANSITION", "rejected-door"]],
    ]);
  });

  it("keeps accepted work only in the server snapshot instead of recreating a local copy", async () => {
    const event = queuedEvent("accepted-addon", "ADDON_FACT_CREATE", { addon_type_id: "addon-1", qty_done: "1" });
    const state = snapshot();
    state.addon_facts = [{
      id: "server-fact", project_id: "project-1", addon_type_id: "addon-1", installer_id: "installer-1",
      qty_done: "1.00", done_at: event.happened_at!, comment: null, source: "OFFLINE",
    }];
    const response = arrangeReset([event], [], state);
    response.acks = [{ client_event_id: event.client_event_id, ok: true, applied: true, error: null }];

    await runSync();

    expect(writes("INSERT INTO addon_facts").map(([, params]) => params[0])).toEqual(["server-fact"]);
    expect(writes("DELETE FROM pending_events")).toEqual([[expect.any(String), ["accepted-addon"]]]);
  });

  it.each([
    ["ADDON_FACT_CREATE", { addon_type_id: "addon-1", qty_done: "1" }, "INSERT INTO addon_facts"],
    ["ISSUE_CREATE", { door_id: "removed-door", title: "Frame issue" }, "INSERT INTO issues"],
    ["DOOR_SET_STATUS", { door_id: "removed-door", status: "INSTALLED" }, "UPDATE doors"],
  ] as const)("blocks %s outside the snapshot assignment without erasing the queued work", async (type, payload, sql) => {
    const state = snapshot();
    const event = queuedEvent("revoked-event", type, payload, {
      project_id: type === "ADDON_FACT_CREATE" ? "removed-project" : "project-1",
    });
    arrangeReset([event], [event], state);

    await runSync();

    expect(writes(sql)).toEqual([]);
    expect(writes("SET status = 'BLOCKED'")).toEqual([
      [expect.any(String), ["CONFLICT_ASSIGNMENT_CHANGED", "revoked-event"]],
    ]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
  });

  it("does not recreate an issue when its door belongs to another project", async () => {
    const state = snapshot();
    state.doors[0].project_id = "different-project";
    const event = queuedEvent("moved-issue", "ISSUE_CREATE", { door_id: "door-1", title: "Frame issue" });
    arrangeReset([event], [event], state);

    await runSync();

    expect(writes("INSERT INTO issues")).toEqual([]);
    expect(writes("SET status = 'BLOCKED'")).toEqual([
      [expect.any(String), ["CONFLICT_ASSIGNMENT_CHANGED", "moved-issue"]],
    ]);
  });

  it.each([true, false])("does not overwrite newer server door data (locked=%s)", async (locked) => {
    const state = snapshot();
    state.doors[0] = { ...state.doors[0], is_locked: locked, version: 7 };
    const event = queuedEvent("stale-door", "DOOR_SET_STATUS", {
      door_id: "door-1", status: "INSTALLED", previous_version: 2,
    });
    arrangeReset([event], [event], state);

    await runSync();

    expect(writes("UPDATE doors")).toEqual([]);
    expect(writes("DELETE FROM pending_events")).toEqual([]);
  });

  it.each(["discard", "retry"])("preserves a newer server version on a later manual %s", async (action) => {
    const state = snapshot();
    state.doors[0].version = 7;
    const event = queuedEvent("stale-door", "DOOR_SET_STATUS", {
      door_id: "door-1", status: "INSTALLED", previous_status: "PENDING", previous_version: 2,
    });
    arrangeReset([], [event], state);

    if (action === "discard") {
      await dropPendingEvent(event.client_event_id);
      expect(writes("DELETE FROM pending_events")).toEqual([[expect.any(String), ["stale-door"]]]);
    } else {
      await retryPendingEventNow(event.client_event_id);
      expect(writes("SET status = 'PENDING'")).toEqual([]);
      expect(writes("DELETE FROM pending_events")).toEqual([]);
    }

    expect(writes("UPDATE doors")).toEqual([]);
  });
});
