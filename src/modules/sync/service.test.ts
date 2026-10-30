import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/errors";

const {
  apiFetchMock,
  dbRef,
  getStateMock,
  getOrCreateDeviceIdMock,
  initDbMock,
  setStateMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  dbRef: { current: null as any },
  getStateMock: vi.fn(),
  getOrCreateDeviceIdMock: vi.fn(),
  initDbMock: vi.fn(),
  setStateMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getAuthSessionGeneration: () => 0,
}));

vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: getOrCreateDeviceIdMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: async () => dbRef.current,
  getDatabaseContext: () => dbRef.current,
  withDatabaseContext: async (_context: unknown, operation: () => Promise<unknown>) => operation(),
  getState: getStateMock,
  initDb: initDbMock,
  setState: setStateMock,
}));

vi.mock("@/modules/projects/repository", () => ({
  hydrateProjectDetails: vi.fn(),
  replaceProjects: vi.fn(),
}));

import {
  bootstrapOnlineData,
  dropPendingEvent,
  forceColdResync,
  getSyncQueueSummary,
  queueAddonFactEvent,
  queueDoorStageCompleteEvent,
  queueDoorStatusEvent,
  queueIssueCreateEvent,
  releaseAuthBlockedEvents,
  retryPendingEventNow,
  runSync,
} from "@/modules/sync/service";
import { MAX_AUTO_RETRY_ATTEMPTS } from "@/modules/sync/policy";
import { commandPayload } from "./command-payload";

function makeDb() {
  return {
    getAllAsync: vi.fn().mockResolvedValue([]),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    runAsync: vi.fn().mockResolvedValue(undefined),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
  };
}

describe("mobile sync service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbRef.current = makeDb();
    getStateMock.mockImplementation(async (key: string) => key === "factory_prices_v1" ? null : "0");
    getOrCreateDeviceIdMock.mockResolvedValue("test-device-id");
    initDbMock.mockResolvedValue(undefined);
    setStateMock.mockResolvedValue(undefined);
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:00:00Z",
      next_cursor: 1,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [],
    });
  });

  const prices = {
    price_list_id: "00000000-0000-0000-0000-000000000001", version: 1, currency: "ILS",
    effective_from: "2026-10-01T08:00:00Z", items: [],
  };

  it.each([false, true])("checks a blocked price decision without replaying work; resolved=%s", async (resolved) => {
    const original = { client_event_id: "price-event-1", type: "ADDON_FACT_CREATE", project_id: "project-1",
      happened_at: "2026-10-01T08:00:00Z", payload_json: JSON.stringify({ addon_type_id: "addon-1", qty_done: "1.50" }),
      status: "BLOCKED", error: "CONFLICT_FACTORY_PRICE" };
    dbRef.current.getAllAsync.mockImplementation(async (sql: string) => sql.includes("error = 'CONFLICT_FACTORY_PRICE'")
      ? [{ client_event_id: original.client_event_id }] : []);
    dbRef.current.getFirstAsync.mockResolvedValue(original);
    apiFetchMock.mockResolvedValue({ server_time: "2026-10-04T08:00:00Z", next_cursor: 1, changes: [],
      acks: resolved ? [{ client_event_id: original.client_event_id, ok: true, applied: false, error: null }] : [] });
    await runSync();
    const request = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(request.events).toEqual([]);
    expect(request.price_resolution_checks).toEqual([original.client_event_id]);
    const commands = dbRef.current.runAsync.mock.calls;
    expect(commands.some(([sql]: [string]) => sql.includes("DELETE FROM pending_events"))).toBe(resolved);
    expect(commands.some(([sql]: [string]) => sql.includes("UPDATE pending_events"))).toBe(false);
    expect(commands.some(([sql]: [string]) => sql.includes("SET payload_json"))).toBe(false);
  });

  it("retains a blocked price decision on network failure without retrying or dropping the work", async () => {
    dbRef.current.getAllAsync.mockImplementation(async (sql: string) => sql.includes("error = 'CONFLICT_FACTORY_PRICE'")
      ? [{ client_event_id: "price-event-1" }] : []);
    apiFetchMock.mockRejectedValueOnce(new NetworkError("Offline"));
    await expect(runSync()).rejects.toThrow();
    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it.each(["DOOR", "ADDON"])("captures the cached version once for %s and never reprices a retry", async (kind) => {
    getStateMock.mockImplementation(async (key: string) => key === "factory_prices_v1" ? JSON.stringify(prices) : "0");
    if (kind === "DOOR") {
      dbRef.current.getFirstAsync.mockResolvedValueOnce({
        project_id: "project-1", status: "IN_PROGRESS", is_locked: 0, version: 3,
      });
      await queueDoorStatusEvent({ projectId: "project-1", doorId: "door-1", status: "INSTALLED" });
    } else {
      dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 1 });
      await queueAddonFactEvent({ projectId: "project-1", addonTypeId: "addon-1", qtyDone: "1,50" });
    }
    const insert = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO pending_events"));
    const [id, project, at, json] = insert![1];
    const payload = JSON.parse(json);
    expect(payload.price_list_id).toBe(prices.price_list_id);
    expect(payload).not.toHaveProperty("rate");
    expect(payload).not.toHaveProperty("amount");
    const type = kind === "DOOR" ? "DOOR_SET_STATUS" : "ADDON_FACT_CREATE";
    dbRef.current.getAllAsync.mockResolvedValue([{
      client_event_id: id, project_id: project, happened_at: at, created_at: at, type,
      payload_json: json, status: "PENDING", attempts: 0, error: null,
    }]);
    getStateMock.mockImplementation(async (key: string) => key === "factory_prices_v1"
      ? JSON.stringify({ ...prices, version: 2, price_list_id: "00000000-0000-0000-0000-000000000002" }) : "0");
    await runSync();
    await runSync({ forceRetry: true });
    const requests = apiFetchMock.mock.calls.map(([, request]) => JSON.parse(request.body).events);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0][0]).toEqual({ client_event_id: id, project_id: project, happened_at: at, type,
      payload: commandPayload({ type, payload }) });
    expect(requests[0][0].payload.price_list_id).toBe(prices.price_list_id);
    expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("SET payload_json"))).toBe(false);
  });

  it.each([undefined, null, prices])("handles missing, inactive and active price contracts: %j", async (factory_prices) => {
    apiFetchMock.mockResolvedValue({ server_time: "2026-10-03T08:00:00Z", next_cursor: 2,
      reset_required: false, snapshot: null, acks: [], changes: [], factory_prices });
    await runSync();
    if (factory_prices === undefined) {
      expect(setStateMock.mock.calls.some(([key]) => key === "factory_prices_v1")).toBe(false);
    } else {
      expect(setStateMock).toHaveBeenCalledWith("factory_prices_v1", factory_prices === null ? null : JSON.stringify(prices));
    }
  });

  it("rejects a malformed price response before consuming acknowledgements or the cursor", async () => {
    apiFetchMock.mockResolvedValue({ server_time: "2026-10-03T08:00:00Z", next_cursor: 9,
      reset_required: false, changes: [], factory_prices: { ...prices, version: -1 },
      acks: [{ client_event_id: "event", ok: true, applied: true, error: null }] });
    await expect(runSync()).rejects.toThrow("Invalid confirmed price snapshot");
    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it.each([undefined, "project-1"])("excludes exhausted attempts from next retry for %s", async (projectId) => {
    const counts = { total: 1, pending: 0, failed: 1, blocked: 0, ready_to_send: 0 };
    dbRef.current.getFirstAsync.mockResolvedValueOnce(counts).mockResolvedValueOnce(null);

    const summary = await getSyncQueueSummary(projectId);
    const [sql, parameters] = dbRef.current.getFirstAsync.mock.calls[1];

    expect(sql).toContain("status = 'FAILED'");
    expect(sql).toContain("AND attempts < ?");
    expect(sql).toContain("AND next_retry_at IS NOT NULL");
    expect(sql).toContain("ORDER BY next_retry_at ASC");
    expect(parameters).toEqual(projectId ? [projectId, MAX_AUTO_RETRY_ATTEMPTS] : [MAX_AUTO_RETRY_ATTEMPTS]);
    if (projectId) expect(sql).toContain("WHERE project_id = ?");
    else expect(sql).not.toContain("project_id = ?");
    expect(summary).toEqual({ ...counts, next_retry_at: null });
  });

  it("preserves the next retry timestamp for eligible work", async () => {
    const nextRetry = "2026-09-11T12:00:00.000Z";
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({ total: 1, failed: 1 })
      .mockResolvedValueOnce({ next_retry_at: nextRetry });
    expect(await getSyncQueueSummary()).toEqual({
      total: 1, pending: 0, failed: 1, blocked: 0, ready_to_send: 0, next_retry_at: nextRetry,
    });
  });

  it("cold resync replaces stale projects and never stores add-on prices", async () => {
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:00:00Z",
      next_cursor: 42,
      reset_required: true,
      snapshot: {
        projects: [
          {
            id: "project-1",
            name: "Tower A",
            address: "Haifa 1",
            status: "OK",
            lifecycle_status: "ACTIVE",
            health_status: "NORMAL",
            waze_url: null,
            updated_at: "2026-04-26T07:58:00Z",
          },
        ],
        doors: [
          {
            id: "door-1",
            project_id: "project-1",
            door_type_id: "door-type-1",
            unit_label: "A-101",
            order_number: "ORD-1",
            house_number: "1",
            floor_label: "2",
            apartment_number: "21",
            location_code: "DIRA",
            door_marking: "A",
            status: "NOT_INSTALLED",
            reason_id: "reason-1",
            comment: "Frame is missing",
            is_locked: true,
            version: 2,
            updated_at: "2026-04-26T07:59:00Z",
          },
        ],
        door_types: [{ id: "door-type-1", code: "entrance", name: "Entrance" }],
        reasons: [],
        addon_types: [{ id: "addon-1", name: "Extra frame", unit: "unit" }],
        addon_plans: [
          {
            project_id: "project-1",
            addon_type_id: "addon-1",
            qty_planned: "2",
            client_price: "999.00",
            installer_price: "111.00",
          },
        ],
        addon_facts: [],
        issues: [
          {
            id: "issue-1",
            door_id: "door-1",
            project_id: "project-1",
            status: "OPEN",
            title: "Opening is blocked",
            details: "Concrete work is incomplete",
          },
        ],
      },
      acks: [],
      changes: [],
    });

    await runSync();

    const calls = dbRef.current.runAsync.mock.calls as Array<[string, unknown[]?]>;
    expect(calls.some(([sql]) => sql.includes("DELETE FROM projects"))).toBe(true);

    const projectCall = calls.find(([sql]) => sql.includes("INSERT INTO projects"));
    expect(projectCall?.[1]).toEqual([
      "project-1",
      "Tower A",
      "Haifa 1",
      "OK",
      "ACTIVE",
      "NORMAL",
      null,
      "2026-04-26T07:58:00Z",
    ]);

    const doorCall = calls.find(([sql]) => sql.includes("INSERT INTO doors"));
    expect(doorCall?.[0]).toContain("reason_id = excluded.reason_id");
    expect(doorCall?.[0]).toContain("is_locked = excluded.is_locked");
    expect(doorCall?.[0]).toContain("version = excluded.version");
    expect(doorCall?.[1]?.slice(-5)).toEqual([
      "reason-1",
      "Frame is missing",
      1,
      2,
      "2026-04-26T07:59:00Z",
    ]);

    const planCall = calls.find(([sql]) => sql.includes("INSERT INTO addon_plans"));
    expect(planCall?.[0]).not.toContain("client_price");
    expect(planCall?.[0]).not.toContain("installer_price");
    expect(planCall?.[1]).toEqual(["project-1", "addon-1", "2"]);
    expect(JSON.stringify(calls)).not.toContain("999.00");
    expect(JSON.stringify(calls)).not.toContain("111.00");
    const issueCall = calls.find(([sql]) => sql.includes("INSERT INTO issues"));
    expect(issueCall?.[1]).toEqual([
      "issue-1",
      "door-1",
      "project-1",
      "OPEN",
      "Opening is blocked",
      "Concrete work is incomplete",
    ]);
    expect(setStateMock).toHaveBeenCalledWith("sync_cursor", "42");
  });

  it("stores door stages from the snapshot and from DOOR_STAGES changes, keeping a queued completion visible", async () => {
    const entry = {
      door_id: "door-1", project_id: "project-1", plan_version: 2,
      stages: [
        { stage_code: "FRAME", name: "Frame", required: true, sequence: 1, assigned_to_me: true, completed_at: null, completed_by_me: false },
        { stage_code: "LEAF", name: "Leaf", required: true, sequence: 2, assigned_to_me: false, completed_at: "2026-10-20T08:00:00Z", completed_by_me: false },
      ],
    };
    apiFetchMock.mockResolvedValue({
      server_time: "2026-10-26T08:00:00Z", next_cursor: 7, reset_required: true,
      snapshot: { projects: [], doors: [], door_types: [], reasons: [], addon_types: [], addon_plans: [], addon_facts: [], issues: [], door_stages: [entry] },
      acks: [], changes: [{ cursor_id: 7, change_type: "DOOR_STAGES", payload: { ...entry, stages: [{ ...entry.stages[0], completed_at: "2026-10-26T07:00:00Z", completed_by_me: true }] } }],
    });
    // One FRAME completion is still waiting in the outbox: the local view keeps it as done by me.
    dbRef.current.getAllAsync.mockImplementation(async (sql: string) => sql.includes("type = 'DOOR_STAGE_COMPLETE'")
      ? [{ happened_at: "2026-10-26T06:30:00Z", payload_json: JSON.stringify({ door_id: "door-1", stage_code: "FRAME", previous_version: 1 }) }] : []);

    await runSync();

    const calls = dbRef.current.runAsync.mock.calls as Array<[string, unknown[]?]>;
    expect(calls.some(([sql]) => sql === "DELETE FROM door_stages")).toBe(true);
    const inserts = calls.filter(([sql]) => sql.includes("INSERT INTO door_stages"));
    expect(inserts).toHaveLength(3);
    expect(inserts[0][1]).toEqual(["door-1", "FRAME", "project-1", "Frame", 1, 1, 1, null, 0, 2]);
    expect(inserts[1][1]).toEqual(["door-1", "LEAF", "project-1", "Leaf", 1, 2, 0, "2026-10-20T08:00:00Z", 0, 2]);
    expect(inserts[2][1]).toEqual(["door-1", "FRAME", "project-1", "Frame", 1, 1, 1, "2026-10-26T07:00:00Z", 1, 2]);
    const marks = calls.filter(([sql]) => sql.includes("UPDATE door_stages") && sql.includes("COALESCE(completed_at, ?)"));
    expect(marks.length).toBeGreaterThanOrEqual(2);
    expect(marks[0][1]).toEqual(["2026-10-26T06:30:00Z", "door-1", "FRAME"]);
    expect(JSON.stringify(calls)).not.toMatch(/price|rate|amount/i);
  });

  it("queues a stage completion with door, stage and version only, and refuses stages that are not mine", async () => {
    dbRef.current.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM doors")) return { status: "NOT_INSTALLED", project_id: "project-1", is_locked: 0, version: 3 };
      if (sql.includes("FROM door_stages")) return { assigned_to_me: 1, completed_at: null };
      if (sql.includes("COUNT(*)")) return { total: 0 };
      return null;
    });
    await queueDoorStageCompleteEvent({ projectId: "project-1", doorId: "door-1", stageCode: "frame" });
    const insert = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO pending_events"));
    expect(insert?.[0]).toContain("'DOOR_STAGE_COMPLETE'");
    expect(JSON.parse(insert?.[1]?.[3] as string)).toEqual({ door_id: "door-1", stage_code: "FRAME", previous_version: 3 });
    expect(commandPayload({ type: "DOOR_STAGE_COMPLETE", payload: JSON.parse(insert?.[1]?.[3] as string) }))
      .toEqual({ door_id: "door-1", stage_code: "FRAME", previous_version: 3 });
    const mark = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("UPDATE door_stages"));
    expect(mark?.[1]?.slice(1)).toEqual(["door-1", "FRAME"]);

    dbRef.current.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM doors")) return { status: "NOT_INSTALLED", project_id: "project-1", is_locked: 0, version: 3 };
      if (sql.includes("FROM door_stages")) return { assigned_to_me: 0, completed_at: null };
      return null;
    });
    await expect(queueDoorStageCompleteEvent({ projectId: "project-1", doorId: "door-1", stageCode: "LEAF" }))
      .rejects.toThrow("This stage is not assigned to you. Refresh data before continuing.");
    dbRef.current.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM doors")) return { status: "NOT_INSTALLED", project_id: "project-1", is_locked: 0, version: 3 };
      if (sql.includes("FROM door_stages")) return { assigned_to_me: 1, completed_at: "2026-10-20T08:00:00Z" };
      return null;
    });
    await expect(queueDoorStageCompleteEvent({ projectId: "project-1", doorId: "door-1", stageCode: "FRAME" }))
      .rejects.toThrow("This stage is already recorded as done.");
  });

  it("force cold resync resets the cursor before requesting a snapshot", async () => {
    getStateMock.mockResolvedValue("1507");
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:10:00Z",
      next_cursor: 1510,
      reset_required: true,
      snapshot: {
        projects: [],
        doors: [],
        door_types: [],
        reasons: [],
        addon_types: [],
        addon_plans: [],
        addon_facts: [],
        issues: [],
      },
      acks: [],
      changes: [],
    });

    await forceColdResync();

    expect(setStateMock).toHaveBeenNthCalledWith(1, "sync_cursor", "0");
    expect(dbRef.current.getAllAsync).toHaveBeenCalledTimes(2);
    expect(dbRef.current.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("error = 'CONFLICT_FACTORY_PRICE'"),
    );
    expect(dbRef.current.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at DESC"),
    );
    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/sync", expect.objectContaining({
      method: "POST",
    }));
    const body = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(body.since_cursor).toBe(0);
    expect(body.events).toEqual([]);
    expect(body.app_version).toBe("mobile-0.1.0");
    expect(setStateMock).toHaveBeenLastCalledWith("last_sync_at", "2026-04-26T08:10:00Z");
  });

  it("blocks a cold resync while unresolved offline work remains", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 1 });

    await expect(forceColdResync()).rejects.toThrow(
      "Cold resync is blocked while unsynced work remains on this device."
    );

    expect(setStateMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("uses the canonical cold sync contract for legacy bootstrap calls", async () => {
    await bootstrapOnlineData();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(body.since_cursor).toBe(0);
    expect(body.events).toEqual([]);
  });

  it("serializes overlapping sync requests before they can open SQLite transactions", async () => {
    let releaseFirstRequest!: () => void;
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    let requestCount = 0;
    let activeRequests = 0;
    let maxActiveRequests = 0;

    apiFetchMock.mockImplementation(async () => {
      requestCount += 1;
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      if (requestCount === 1) {
        await firstRequestGate;
      }
      activeRequests -= 1;
      return {
        server_time: "2026-04-26T08:00:00Z",
        next_cursor: requestCount,
        reset_required: false,
        snapshot: null,
        acks: [],
        changes: [],
      };
    });

    const firstSync = runSync();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const secondSync = runSync({ forceRetry: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    releaseFirstRequest();
    await Promise.all([firstSync, secondSync]);

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(maxActiveRequests).toBe(1);
  });

  it("coalesces overlapping automatic sync requests", async () => {
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    apiFetchMock.mockImplementation(async () => {
      await requestGate;
      return {
        server_time: "2026-04-26T08:00:00Z",
        next_cursor: 1,
        reset_required: false,
        snapshot: null,
        acks: [],
        changes: [],
      };
    });

    const firstSync = runSync();
    const secondSync = runSync();
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    expect(secondSync).toBe(firstSync);
    releaseRequest();
    await Promise.all([firstSync, secondSync]);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("reapplies pending optimistic work after a cold resync snapshot", async () => {
    dbRef.current.getFirstAsync.mockResolvedValue({
      status: "NOT_INSTALLED",
      is_locked: 0,
      attempts: 1,
    });
    dbRef.current.getAllAsync.mockResolvedValue([
      {
        client_event_id: "door-event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "INSTALLED",
          reason_id: null,
          comment: "Done offline",
          previous_version: 0,
        }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
      {
        client_event_id: "addon-event-1",
        type: "ADDON_FACT_CREATE",
        project_id: "project-1",
        happened_at: "2026-04-26T08:02:00Z",
        payload_json: JSON.stringify({
          addon_type_id: "addon-1",
          qty_done: "2,50",
          comment: "Extra offline",
        }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:02:00Z",
      },
    ]);
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:03:00Z",
      next_cursor: 43,
      reset_required: true,
      snapshot: {
        projects: [
          {
            id: "project-1",
            name: "Tower A",
            address: "Haifa 1",
            status: "OK",
            lifecycle_status: "ACTIVE",
            health_status: "NORMAL",
            waze_url: null,
          },
        ],
        doors: [
          {
            id: "door-1",
            project_id: "project-1",
            door_type_id: "door-type-1",
            unit_label: "A-101",
            order_number: "ORD-1",
            house_number: "1",
            floor_label: "2",
            apartment_number: "21",
            location_code: "DIRA",
            door_marking: "A",
            status: "NOT_INSTALLED",
            reason_id: null,
            comment: null,
            is_locked: false,
            version: 0,
            updated_at: "2026-04-26T08:00:00Z",
          },
        ],
        door_types: [{ id: "door-type-1", code: "entrance", name: "Entrance" }],
        reasons: [],
        addon_types: [{ id: "addon-1", name: "Extra frame", unit: "unit" }],
        addon_plans: [],
        addon_facts: [],
      },
      acks: [],
      changes: [],
    });

    await runSync();

    const [, request] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(request.body).events.map((event: { client_event_id: string }) => event.client_event_id)).toEqual([
      "door-event-1",
      "addon-event-1",
    ]);

    const calls = dbRef.current.runAsync.mock.calls as Array<[string, unknown[]?]>;
    const snapshotDoorIndex = calls.findIndex(
      ([sql, params]) => sql.includes("INSERT INTO doors") && params?.[0] === "door-1"
    );
    const reappliedDoorIndex = calls.findIndex(
      ([sql, params]) => sql.includes("UPDATE doors") && params?.[0] === "INSTALLED" && params?.[6] === "door-1"
    );
    expect(snapshotDoorIndex).toBeGreaterThanOrEqual(0);
    expect(reappliedDoorIndex).toBeGreaterThan(snapshotDoorIndex);
    expect(calls[reappliedDoorIndex][1]?.slice(0, 6)).toEqual([
      "INSTALLED",
      null,
      "Done offline",
      1,
      1,
      expect.any(String),
    ]);

    const addonDeleteIndex = calls.findIndex(([sql]) => sql.includes("DELETE FROM addon_facts"));
    const localFactIndex = calls.findIndex(
      ([sql, params]) => sql.includes("INSERT INTO addon_facts") && params?.[0] === "local:addon-event-1"
    );
    expect(addonDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(localFactIndex).toBeGreaterThan(addonDeleteIndex);
    expect(calls[localFactIndex][1]).toEqual([
      "local:addon-event-1",
      "project-1",
      "addon-1",
      "2.50",
      "2026-04-26T08:02:00Z",
      "Extra offline",
      "2026-04-26T08:02:00Z",
    ]);

    const failedCalls = calls.filter(([sql]) => sql.includes("SET status = 'FAILED'"));
    expect(failedCalls).toHaveLength(2);
  });

  it("does not reapply a pending door status after cold resync when the door is locked", async () => {
    dbRef.current.getAllAsync.mockResolvedValue([
      {
        client_event_id: "door-event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "INSTALLED",
          reason_id: null,
          comment: "Done offline",
        }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
    ]);
    dbRef.current.getFirstAsync.mockResolvedValue({
      status: "LOCKED",
      is_locked: 1,
      attempts: 1,
    });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:03:00Z",
      next_cursor: 43,
      reset_required: true,
      snapshot: {
        projects: [
          {
            id: "project-1",
            name: "Tower A",
            address: "Haifa 1",
            status: "OK",
            lifecycle_status: "ACTIVE",
            health_status: "NORMAL",
            waze_url: null,
          },
        ],
        doors: [
          {
            id: "door-1",
            project_id: "project-1",
            door_type_id: "door-type-1",
            unit_label: "A-101",
            order_number: "ORD-1",
            house_number: "1",
            floor_label: "2",
            apartment_number: "21",
            location_code: "DIRA",
            door_marking: "A",
            status: "LOCKED",
            reason_id: null,
            comment: null,
            is_locked: true,
            version: 1,
            updated_at: "2026-04-26T08:00:00Z",
          },
        ],
        door_types: [{ id: "door-type-1", code: "entrance", name: "Entrance" }],
        reasons: [],
        addon_types: [],
        addon_plans: [],
        addon_facts: [],
      },
      acks: [],
      changes: [],
    });

    await runSync();

    const optimisticDoorUpdate = dbRef.current.runAsync.mock.calls.find(
      ([sql, params]: [string, unknown[]]) => sql.includes("UPDATE doors") && params?.[0] === "INSTALLED"
    );
    expect(optimisticDoorUpdate).toBeUndefined();
  });

  it("does not advance the cursor when a cold resync response has no snapshot", async () => {
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:04:00Z",
      next_cursor: 44,
      reset_required: true,
      snapshot: null,
      acks: [],
      changes: [],
    });

    await expect(runSync()).rejects.toThrow("Sync reset requested without snapshot");

    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM projects");
    expect(setStateMock).not.toHaveBeenCalledWith("sync_cursor", "44");
    expect(setStateMock).not.toHaveBeenCalledWith("last_sync_at", "2026-04-26T08:04:00Z");
  });

  it("keeps pending events retryable when backend omits their acknowledgement", async () => {
    getStateMock.mockResolvedValue("7");
    dbRef.current.getAllAsync.mockResolvedValueOnce([
      {
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({ door_id: "door-1", status: "INSTALLED" }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
    ]);
    dbRef.current.getFirstAsync.mockResolvedValue({ attempts: 1 });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:02:00Z",
      next_cursor: 8,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [],
    });

    await runSync();

    const [, request] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(request.body).device_id).toBe("test-device-id");
    expect(JSON.parse(request.body).events).toEqual([
      {
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload: { door_id: "door-1", status: "INSTALLED" },
      },
    ]);

    const failedCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("SET status = 'FAILED'")
    );
    expect(failedCall?.[1]?.[0]).toBe("Sync response missed event acknowledgement");
  });

  it.each(["network", "server", "missing-ack"])(
    "retries the identical event after %s response loss and accepts a duplicate acknowledgement",
    async (failure) => {
      const event = {
        client_event_id: "persisted-installation", type: "DOOR_SET_STATUS", project_id: "project-1",
        happened_at: "2026-09-11T10:00:00Z", created_at: "2026-09-11T10:00:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1", status: "INSTALLED", previous_status: "IN_PROGRESS", previous_version: 0,
        }),
        status: "PENDING", error: null, attempts: 0, next_retry_at: null, last_attempt_at: null,
      };
      const original = structuredClone(event);
      getStateMock.mockResolvedValue("7");
      dbRef.current.getAllAsync.mockResolvedValue([event]);
      dbRef.current.getFirstAsync.mockImplementation(async (sql: string) => (
        sql.includes("SELECT attempts") ? { attempts: 1 } : event
      ));
      if (failure === "network") {
        apiFetchMock.mockRejectedValueOnce(new NetworkError("Response connection lost"));
      } else if (failure === "server") {
        apiFetchMock.mockRejectedValueOnce(new ApiError("Gateway unavailable", 503, ""));
      }

      if (failure === "missing-ack") {
        await runSync();
      } else {
        await expect(runSync()).rejects.toThrow();
        expect(setStateMock).not.toHaveBeenCalled();
      }
      expect(event).toEqual(original);
      expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("SET status = 'FAILED'"))).toBe(true);
      expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("DELETE FROM pending_events"))).toBe(false);
      expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("UPDATE doors"))).toBe(false);
      const firstRequest = JSON.parse(apiFetchMock.mock.calls[0][1].body);

      apiFetchMock.mockResolvedValueOnce({
        server_time: "2026-09-11T10:01:00Z", next_cursor: 8, reset_required: false,
        snapshot: null, changes: [],
        acks: [{ client_event_id: event.client_event_id, ok: true, applied: false, error: null }],
      });
      await runSync({ forceRetry: true });

      const retryRequest = JSON.parse(apiFetchMock.mock.calls[1][1].body);
      expect(retryRequest.events).toEqual(firstRequest.events);
      expect(retryRequest.events).toEqual([{
        client_event_id: original.client_event_id, type: original.type, project_id: original.project_id,
        happened_at: original.happened_at, payload: commandPayload({ type: "DOOR_SET_STATUS", payload: JSON.parse(original.payload_json) }),
      }]);
      expect(dbRef.current.runAsync.mock.calls.filter(([sql]: [string]) => sql.includes("DELETE FROM pending_events")))
        .toEqual([["DELETE FROM pending_events WHERE client_event_id = ?", [event.client_event_id]]]);
      expect(setStateMock).toHaveBeenCalledWith("sync_cursor", "8");
      expect(setStateMock).toHaveBeenCalledWith("last_sync_at", "2026-09-11T10:01:00Z");
    },
  );

  it.each([
    { failure: new NetworkError("Offline"), attempts: 1, status: "FAILED", message: "Offline" },
    { failure: new NetworkError("Offline"), attempts: MAX_AUTO_RETRY_ATTEMPTS, status: "BLOCKED", message: "Offline (auto retry limit reached)" },
    { failure: new ApiError("Forbidden", 403, ""), attempts: 1, status: "BLOCKED", message: "Forbidden" },
  ])("preserves the original $failure and records $status after deferred failure handling", async ({ failure, attempts, status, message }) => {
    const event = {
      client_event_id: "retained-work", type: "DOOR_SET_STATUS", project_id: "project-1",
      happened_at: "2026-09-11T10:00:00Z", created_at: "2026-09-11T10:00:00Z",
      payload_json: JSON.stringify({ door_id: "door-1", status: "INSTALLED" }),
      status: "PENDING", error: null, attempts: attempts - 1, next_retry_at: null, last_attempt_at: null,
    };
    dbRef.current.getAllAsync.mockResolvedValue([event]);
    dbRef.current.getFirstAsync.mockImplementation(async () => {
      await Promise.resolve();
      return { attempts };
    });
    apiFetchMock.mockRejectedValueOnce(failure);

    await expect(runSync()).rejects.toBe(failure);

    const updates = dbRef.current.runAsync.mock.calls;
    const failureUpdate = updates.find(([sql]: [string]) => sql.includes(`SET status = '${status}'`));
    expect(failureUpdate?.[1][0]).toBe(message);
    expect(updates.some(([sql]: [string]) => sql.includes("DELETE FROM pending_events"))).toBe(false);
    expect(updates.some(([sql]: [string]) => sql.includes("UPDATE doors"))).toBe(false);
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it.each(["CONFLICT_ASSIGNMENT_CHANGED", "CONFLICT_INVALID_TRANSITION", "CONFLICT_FACTORY_PRICE"])(
    "retains the queued payload when backend rejects the door event with %s", async (errorCode) => {
    dbRef.current.getAllAsync.mockResolvedValueOnce([
      {
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "INSTALLED",
          previous_status: "NOT_INSTALLED",
          previous_reason_id: null,
          previous_comment: "Needs adjustment",
          previous_version: 4,
        }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
    ]);
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      client_event_id: "event-1",
      type: "DOOR_SET_STATUS",
      project_id: "project-1",
      payload_json: JSON.stringify({
        door_id: "door-1",
        previous_status: "NOT_INSTALLED",
        previous_reason_id: null,
        previous_comment: "Needs adjustment",
        previous_version: 4,
      }),
    });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:02:00Z",
      next_cursor: 9,
      reset_required: false,
      snapshot: null,
      acks: [
        {
          client_event_id: "event-1",
          ok: false,
          applied: false,
          error: errorCode,
        },
      ],
      changes: [],
    });

    await runSync();

    const updateDoorCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE doors")
    );
    expect(updateDoorCall?.[1]?.slice(0, 6)).toEqual([
      "NOT_INSTALLED",
      null,
      "Needs adjustment",
      0,
      4,
      expect.any(String),
    ]);
    expect(updateDoorCall?.[1]?.[6]).toBe("door-1");

    const blockedCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("SET status = 'BLOCKED'")
    );
    expect(blockedCall?.[1]).toEqual([errorCode, "event-1"]);
    expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("DELETE FROM pending_events"))).toBe(false);
  });

  it("applies door sync changes with reason and lock metadata", async () => {
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:03:00Z",
      next_cursor: 10,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [
        {
          cursor_id: 10,
          change_type: "DOOR",
          payload: {
            id: "door-1",
            project_id: "project-1",
            door_type_id: "door-type-1",
            unit_label: "A-101",
            order_number: "ORD-1",
            house_number: "1",
            floor_label: "2",
            apartment_number: "21",
            location_code: "DIRA",
            door_marking: "A",
            status: "NOT_INSTALLED",
            reason_id: "reason-1",
            comment: "Frame is missing",
            is_locked: true,
            version: 9,
            updated_at: "2026-04-26T08:03:00Z",
          },
        },
      ],
    });

    await runSync();

    const doorCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("INSERT INTO doors")
    );
    expect(doorCall?.[0]).toContain("project_id = excluded.project_id");
    expect(doorCall?.[0]).toContain("reason_id = excluded.reason_id");
    expect(doorCall?.[0]).toContain("is_locked = excluded.is_locked");
    expect(doorCall?.[0]).toContain("version = excluded.version");
    expect(doorCall?.[1]?.slice(-5)).toEqual([
      "reason-1",
      "Frame is missing",
      1,
      9,
      "2026-04-26T08:03:00Z",
    ]);
  });

  it.each(["OPEN", "CLOSED"])("applies incremental %s issues without dropping queued work", async (status) => {
    apiFetchMock.mockResolvedValue({
      server_time: "2026-10-01T19:00:00Z", next_cursor: 10,
      reset_required: false, snapshot: null, acks: [], changes: [{
        cursor_id: 10, change_type: "ISSUE", payload: {
          id: "issue-1", door_id: "door-1", project_id: "project-1",
          status, title: "Access", details: "Office update",
        },
      }],
    });
    await runSync();
    const write = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("INSERT INTO issues"));
    expect(write?.[1]).toEqual(["issue-1", "door-1", "project-1", status, "Access", "Office update"]);
    expect(write?.[0]).toContain("ON CONFLICT(id) DO UPDATE SET");
    const cleanup = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("id LIKE 'local:%'"));
    expect(cleanup?.[0]).toContain("NOT EXISTS");
    expect(cleanup?.[0]).toContain("'local:' || client_event_id = issues.id");
    expect(cleanup?.[1]).toEqual(["door-1"]);
    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM pending_events");
    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM issues");
  });

  it("removes a project shell when assignment removal leaves no local doors", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 0 });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:03:00Z",
      next_cursor: 10,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [
        {
          cursor_id: 10,
          change_type: "PROJECT_ASSIGNMENTS",
          payload: {
            kind: "removed_from_you",
            project_id: "project-1",
            affected_door_ids: ["door-1", "door-2"],
          },
        },
      ],
    });

    await runSync();

    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM doors WHERE id = ?", ["door-1"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM doors WHERE id = ?", ["door-2"]);
    expect(dbRef.current.getFirstAsync).toHaveBeenCalledWith(
      "SELECT COUNT(*) as total FROM doors WHERE project_id = ?",
      ["project-1"]
    );
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM issues WHERE project_id = ?", ["project-1"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM addon_plans WHERE project_id = ?", ["project-1"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM addon_facts WHERE project_id = ?", ["project-1"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM projects WHERE id = ?", ["project-1"]);
  });

  it("blocks queued project events when assignment removal removes the project", async () => {
    dbRef.current.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          client_event_id: "door-event-1",
          type: "DOOR_SET_STATUS",
          payload_json: JSON.stringify({ door_id: "door-1", status: "INSTALLED" }),
        },
        {
          client_event_id: "addon-event-1",
          type: "ADDON_FACT_CREATE",
          payload_json: JSON.stringify({ addon_type_id: "addon-1", qty_done: "1.00" }),
        },
      ]);
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 0 });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:05:00Z",
      next_cursor: 12,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [
        {
          cursor_id: 12,
          change_type: "PROJECT_ASSIGNMENTS",
          payload: {
            kind: "removed_from_you",
            project_id: "project-1",
            affected_door_ids: ["door-1"],
          },
        },
      ],
    });

    await runSync();

    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM addon_facts WHERE id = ?", [
      "local:addon-event-1",
    ]);
    const blockCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE pending_events") && sql.includes("client_event_id IN")
    );
    expect(blockCall?.[1]).toEqual([
      "CONFLICT_ASSIGNMENT_CHANGED",
      "door-event-1",
      "addon-event-1",
    ]);
  });

  it("blocks only affected door events when assignment removal keeps the project", async () => {
    dbRef.current.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          client_event_id: "door-event-1",
          type: "DOOR_SET_STATUS",
          payload_json: JSON.stringify({ door_id: "door-1", status: "INSTALLED" }),
        },
        {
          client_event_id: "addon-event-1",
          type: "ADDON_FACT_CREATE",
          payload_json: JSON.stringify({ addon_type_id: "addon-1", qty_done: "1.00" }),
        },
      ]);
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 1 });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:06:00Z",
      next_cursor: 13,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [
        {
          cursor_id: 13,
          change_type: "PROJECT_ASSIGNMENTS",
          payload: {
            kind: "removed_from_you",
            project_id: "project-1",
            affected_door_ids: ["door-1"],
          },
        },
      ],
    });

    await runSync();

    const blockCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE pending_events") && sql.includes("client_event_id IN")
    );
    expect(blockCall?.[1]).toEqual(["CONFLICT_ASSIGNMENT_CHANGED", "door-event-1"]);
    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM addon_facts WHERE id = ?", [
      "local:addon-event-1",
    ]);
  });

  it("keeps the project when assignment removal leaves other local doors", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 1 });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:04:00Z",
      next_cursor: 11,
      reset_required: false,
      snapshot: null,
      acks: [],
      changes: [
        {
          cursor_id: 11,
          change_type: "PROJECT_ASSIGNMENTS",
          payload: {
            kind: "removed_from_you",
            project_id: "project-1",
            affected_door_ids: ["door-1"],
          },
        },
      ],
    });

    await runSync();

    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM doors WHERE id = ?", ["door-1"]);
    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM projects WHERE id = ?", ["project-1"]);
  });

  it("dropping a pending door status event restores the previous local door state", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      client_event_id: "event-1",
      type: "DOOR_SET_STATUS",
      project_id: "project-1",
      payload_json: JSON.stringify({
        door_id: "door-1",
        previous_status: "NOT_INSTALLED",
        previous_reason_id: "reason-1",
        previous_comment: "Waiting for frame",
        previous_version: 6,
      }),
    });

    await dropPendingEvent("event-1");

    const updateCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE doors")
    );
    expect(updateCall?.[1]?.slice(0, 6)).toEqual([
      "NOT_INSTALLED",
      "reason-1",
      "Waiting for frame",
      0,
      6,
      expect.any(String),
    ]);
    expect(updateCall?.[1]?.[6]).toBe("door-1");
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      "DELETE FROM pending_events WHERE client_event_id = ?",
      ["event-1"]
    );
  });

  it("queues door status with the previous local door state", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      status: "NOT_INSTALLED",
      reason_id: "reason-1",
      comment: "Waiting for frame",
      project_id: "project-1",
      is_locked: 0,
      version: 4,
    });

    await queueDoorStatusEvent({
      projectId: "project-1",
      doorId: "door-1",
      status: "INSTALLED",
      comment: "Done offline",
    });

    const eventCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("INSERT INTO pending_events")
    );
    const payload = JSON.parse(eventCall?.[1]?.[3] as string);
    expect(eventCall?.[1]?.[1]).toBe("project-1");
    expect(payload).toMatchObject({
      door_id: "door-1",
      status: "INSTALLED",
      reason_id: null,
      comment: "Done offline",
      previous_status: "NOT_INSTALLED",
      previous_reason_id: "reason-1",
      previous_comment: "Waiting for frame",
      previous_is_locked: 0,
      previous_version: 4,
    });

    const updateCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE doors")
    );
    expect(dbRef.current.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(updateCall?.[1]?.slice(0, 6)).toEqual([
      "INSTALLED",
      null,
      "Done offline",
      1,
      5,
      expect.any(String),
    ]);
    expect(updateCall?.[1]?.[6]).toBe("door-1");
  });

  it("rejects a duplicate unresolved status event for the same door", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        status: "NOT_INSTALLED",
        reason_id: "reason-1",
        comment: "Waiting for frame",
        project_id: "project-1",
        is_locked: 0,
        version: 4,
      })
      .mockResolvedValueOnce({ total: 1 });

    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "NOT_INSTALLED",
        reasonId: "reason-2",
      })
    ).rejects.toThrow("already waiting in the sync queue");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects another door status when the previous offline install already locked it locally", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      status: "INSTALLED",
      reason_id: null,
      comment: "Done offline",
      project_id: "project-1",
      is_locked: 1,
      version: 5,
    });

    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "NOT_INSTALLED",
        reasonId: "reason-1",
      })
    ).rejects.toThrow("Door is locked");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects not-installed queueing without a reason before touching local data", async () => {
    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "NOT_INSTALLED",
      })
    ).rejects.toThrow("reason_id is required for NOT_INSTALLED");

    expect(dbRef.current.getFirstAsync).not.toHaveBeenCalled();
    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects door status queueing when the local door is no longer assigned", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce(null);

    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "INSTALLED",
      })
    ).rejects.toThrow("Door is no longer assigned to you");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects door status queueing when the local door moved to another project", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      status: "NOT_INSTALLED",
      reason_id: null,
      comment: null,
      project_id: "project-2",
      is_locked: 0,
    });

    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "INSTALLED",
      })
    ).rejects.toThrow("Door is no longer assigned to you");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects door status queueing when the local door is locked", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      status: "LOCKED",
      reason_id: null,
      comment: null,
      project_id: "project-1",
      is_locked: 1,
    });

    await expect(
      queueDoorStatusEvent({
        projectId: "project-1",
        doorId: "door-1",
        status: "INSTALLED",
      })
    ).rejects.toThrow("Door is locked");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("queues an issue with an optimistic offline local row", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ project_id: "project-1" });

    await queueIssueCreateEvent({
      projectId: "project-1",
      doorId: "door-1",
      title: "Opening is blocked",
      details: "Concrete work is not complete",
    });

    const calls = dbRef.current.runAsync.mock.calls as Array<[string, unknown[]?]>;
    const eventCall = calls.find(([sql]) => sql.includes("INSERT INTO pending_events"));
    const clientEventId = eventCall?.[1]?.[0] as string;
    const payload = JSON.parse(eventCall?.[1]?.[3] as string);

    expect(eventCall?.[0]).toContain("'ISSUE_CREATE'");
    expect(eventCall?.[1]?.[1]).toBe("project-1");
    expect(payload).toEqual({
      door_id: "door-1",
      title: "Opening is blocked",
      details: "Concrete work is not complete",
    });

    const issueCall = calls.find(([sql]) => sql.includes("INSERT INTO issues"));
    expect(issueCall?.[1]).toEqual([
      `local:${clientEventId}`,
      "door-1",
      "project-1",
      "Opening is blocked",
      "Concrete work is not complete",
    ]);
    expect(dbRef.current.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it("rejects issue creation for a door that is no longer assigned", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce(null);

    await expect(
      queueIssueCreateEvent({
        projectId: "project-1",
        doorId: "door-1",
        title: "Opening is blocked",
      })
    ).rejects.toThrow("Door is no longer assigned to you");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("queues add-on facts with an optimistic offline local row", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 1 });

    await queueAddonFactEvent({
      projectId: "project-1",
      addonTypeId: "addon-1",
      qtyDone: "2,50",
      comment: "Extra frame",
    });

    const calls = dbRef.current.runAsync.mock.calls as Array<[string, unknown[]?]>;
    const eventCall = calls.find(([sql]) => sql.includes("INSERT INTO pending_events"));
    const clientEventId = eventCall?.[1]?.[0] as string;
    const payload = JSON.parse(eventCall?.[1]?.[3] as string);

    expect(eventCall?.[1]?.[1]).toBe("project-1");
    expect(payload).toEqual({
      addon_type_id: "addon-1",
      qty_done: "2.50",
      comment: "Extra frame",
    });

    const factCall = calls.find(([sql]) => sql.includes("INSERT INTO addon_facts"));
    expect(factCall?.[0]).toContain("'OFFLINE'");
    expect(factCall?.[1]?.[0]).toBe(`local:${clientEventId}`);
    expect(factCall?.[1]?.slice(1, 4)).toEqual(["project-1", "addon-1", "2.50"]);
    expect(factCall?.[1]?.[5]).toBe("Extra frame");
  });

  it("rejects invalid add-on quantities before creating pending events", async () => {
    await expect(
      queueAddonFactEvent({
        projectId: "project-1",
        addonTypeId: "addon-1",
        qtyDone: "0",
      })
    ).rejects.toThrow("qty_done must be > 0");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects add-on quantities that exceed the backend decimal contract", async () => {
    await expect(
      queueAddonFactEvent({
        projectId: "project-1",
        addonTypeId: "addon-1",
        qtyDone: "1.234",
      })
    ).rejects.toThrow("at most 10 integer and 2 decimal digits");

    expect(dbRef.current.getFirstAsync).not.toHaveBeenCalled();
    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects add-on facts when the local project is no longer assigned", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 0 });

    await expect(
      queueAddonFactEvent({
        projectId: "project-1",
        addonTypeId: "addon-1",
        qtyDone: "1.00",
      })
    ).rejects.toThrow("Project is no longer assigned to you");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects add-on facts when the selected add-on type is stale locally", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 0 });

    await expect(
      queueAddonFactEvent({
        projectId: "project-1",
        addonTypeId: "addon-stale",
        qtyDone: "1.00",
      })
    ).rejects.toThrow("Add-on type is no longer available");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("rejects add-on facts for types the office has not planned on the project", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 1 })
      .mockResolvedValueOnce({ total: 0 });

    await expect(
      queueAddonFactEvent({ projectId: "project-1", addonTypeId: "addon-unplanned", qtyDone: "1.00" })
    ).rejects.toThrow("planned by the office");

    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });

  it("retrying an add-on event restores the optimistic offline local row", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        client_event_id: "event-1",
        type: "ADDON_FACT_CREATE",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          addon_type_id: "addon-1",
          qty_done: "3,50",
          comment: "Retry note",
        }),
      })
      .mockResolvedValueOnce({ total: 1 });

    await retryPendingEventNow("event-1");

    const factCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("INSERT INTO addon_facts")
    );
    expect(factCall?.[1]).toEqual([
      "local:event-1",
      "project-1",
      "addon-1",
      "3.50",
      "2026-04-26T08:01:00Z",
      "Retry note",
      "2026-04-26T08:01:00Z",
    ]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'PENDING'"),
      ["event-1"]
    );
  });

  it("does not retry an add-on event when the project was removed locally", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        client_event_id: "event-1",
        type: "ADDON_FACT_CREATE",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          addon_type_id: "addon-1",
          qty_done: "3.00",
          comment: "Removed project",
        }),
      })
      .mockResolvedValueOnce({ total: 0 });

    await retryPendingEventNow("event-1");

    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO addon_facts"),
      expect.anything()
    );
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'BLOCKED'"),
      ["CONFLICT_ASSIGNMENT_CHANGED", "event-1"]
    );
  });

  it("retrying a door status event reapplies the optimistic local door status", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "NOT_INSTALLED",
          reason_id: "reason-1",
          comment: "Retry status",
          previous_version: 8,
        }),
      })
      .mockResolvedValueOnce({ status: "NOT_INSTALLED", is_locked: 0, version: 8 });

    await retryPendingEventNow("event-1");

    const doorCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE doors")
    );
    expect(doorCall?.[1]?.slice(0, 6)).toEqual([
      "NOT_INSTALLED",
      "reason-1",
      "Retry status",
      0,
      9,
      expect.any(String),
    ]);
    expect(doorCall?.[1]?.[6]).toBe("door-1");
  });

  it("retrying an installed door status keeps its own optimistic local lock writable", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "INSTALLED",
          reason_id: null,
          comment: "Retry install",
          previous_version: 8,
        }),
      })
      .mockResolvedValueOnce({ status: "INSTALLED", is_locked: 1, version: 9 });

    await retryPendingEventNow("event-1");

    const doorCall = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) =>
      sql.includes("UPDATE doors")
    );
    expect(doorCall?.[1]?.slice(0, 6)).toEqual([
      "INSTALLED",
      null,
      "Retry install",
      1,
      9,
      expect.any(String),
    ]);
    expect(doorCall?.[1]?.[6]).toBe("door-1");
  });

  it("does not retry a door status event when the local door is locked", async () => {
    dbRef.current.getFirstAsync
      .mockResolvedValueOnce({
        client_event_id: "event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          door_id: "door-1",
          status: "INSTALLED",
          reason_id: null,
          comment: "Retry status",
        }),
      })
      .mockResolvedValueOnce({ status: "LOCKED", is_locked: 1 });

    await retryPendingEventNow("event-1");

    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE doors"),
      expect.anything()
    );
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'BLOCKED'"),
      ["CONFLICT_ASSIGNMENT_CHANGED", "event-1"]
    );
  });

  it("removes only the acknowledged local issue and retains its server replacement", async () => {
    const event = {
      client_event_id: "event-issue", type: "ISSUE_CREATE", project_id: "project-1",
      payload_json: JSON.stringify({ door_id: "door-1", title: "Access blocked" }),
      status: "PENDING", attempts: 0,
    };
    dbRef.current.getAllAsync.mockResolvedValueOnce([event]);
    dbRef.current.getFirstAsync.mockResolvedValueOnce(event);
    apiFetchMock.mockResolvedValue({
      server_time: "2026-10-01T19:00:00Z", next_cursor: 11,
      reset_required: false, snapshot: null,
      acks: [{ client_event_id: "event-issue", ok: true, applied: true, error: null }],
      changes: [{ cursor_id: 11, change_type: "ISSUE", payload: {
        id: "server-issue", door_id: "door-1", project_id: "project-1",
        status: "OPEN", title: "Access blocked", details: null,
      } }],
    });
    await runSync();
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM issues WHERE id = ?", ["local:event-issue"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM pending_events WHERE client_event_id = ?", ["event-issue"]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO issues"),
      ["server-issue", "door-1", "project-1", "OPEN", "Access blocked", null]);
    expect(dbRef.current.runAsync).not.toHaveBeenCalledWith("DELETE FROM pending_events");
  });

  it("removes the optimistic add-on fact when backend acknowledges the event", async () => {
    dbRef.current.getAllAsync.mockResolvedValueOnce([
      {
        client_event_id: "event-1",
        type: "ADDON_FACT_CREATE",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({
          addon_type_id: "addon-1",
          qty_done: "1.00",
          comment: null,
        }),
        status: "PENDING",
        error: null,
        attempts: 0,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
    ]);
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      client_event_id: "event-1",
      type: "ADDON_FACT_CREATE",
      project_id: "project-1",
      payload_json: JSON.stringify({
        addon_type_id: "addon-1",
        qty_done: "1.00",
        comment: null,
      }),
    });
    apiFetchMock.mockResolvedValue({
      server_time: "2026-04-26T08:02:00Z",
      next_cursor: 12,
      reset_required: false,
      snapshot: null,
      acks: [
        {
          client_event_id: "event-1",
          ok: true,
          applied: true,
          error: null,
        },
      ],
      changes: [
        {
          cursor_id: 12,
          change_type: "ADDON_FACT",
          payload: {
            id: "server-fact-1",
            project_id: "project-1",
            addon_type_id: "addon-1",
            installer_id: "installer-1",
            qty_done: "1.00",
            done_at: "2026-04-26T08:01:00Z",
            comment: null,
            source: "OFFLINE",
            updated_at: "2026-04-26T08:02:00Z",
          },
        },
      ],
    });

    await runSync();

    const serverFactCall = dbRef.current.runAsync.mock.calls.find(
      ([sql, params]: [string, unknown[]]) =>
        sql.includes("INSERT INTO addon_facts") && params?.[0] === "server-fact-1"
    );
    expect(serverFactCall?.[1]).toEqual([
      "server-fact-1",
      "project-1",
      "addon-1",
      "installer-1",
      "1.00",
      "2026-04-26T08:01:00Z",
      null,
      "OFFLINE",
      "2026-04-26T08:02:00Z",
    ]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM addon_facts WHERE id = ?", [
      "local:event-1",
    ]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      "DELETE FROM pending_events WHERE client_event_id = ?",
      ["event-1"]
    );
  });

  it("dropping a pending add-on fact event removes its optimistic local row", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({
      client_event_id: "event-1",
      type: "ADDON_FACT_CREATE",
      project_id: "project-1",
      payload_json: JSON.stringify({
        addon_type_id: "addon-1",
        qty_done: "1.00",
        comment: null,
      }),
    });

    await dropPendingEvent("event-1");

    expect(dbRef.current.runAsync).toHaveBeenCalledWith("DELETE FROM addon_facts WHERE id = ?", [
      "local:event-1",
    ]);
    expect(dbRef.current.runAsync).toHaveBeenCalledWith(
      "DELETE FROM pending_events WHERE client_event_id = ?",
      ["event-1"]
    );
  });

  function pendingEvent(id: string, doorId: string) {
    return {
      client_event_id: id, type: "DOOR_SET_STATUS", project_id: "project-1",
      happened_at: "2026-04-26T08:01:00Z", payload_json: JSON.stringify({ door_id: doorId, status: "INSTALLED" }),
      status: "PENDING", error: null, attempts: 0, next_retry_at: null, last_attempt_at: null,
      created_at: "2026-04-26T08:01:00Z",
    };
  }

  it("blocks only the rejected event when the server refuses the batch as a whole", async () => {
    // Regression (audit A1): one malformed event used to BLOCK every event of the batch.
    dbRef.current.getAllAsync.mockResolvedValueOnce([
      pendingEvent("event-a", "door-a"), pendingEvent("event-b", "door-b"), pendingEvent("event-c", "door-c"),
    ]);
    apiFetchMock.mockImplementation(async (_path: string, init: { body: string }) => {
      const events = JSON.parse(init.body).events as { client_event_id: string }[];
      if (events.some((event) => event.client_event_id === "event-b")) {
        throw new ApiError("validation", 422, "payload invalid");
      }
      return { server_time: "2026-04-26T08:02:00Z", next_cursor: 8, reset_required: false, snapshot: null, changes: [],
        acks: events.map((event) => ({ client_event_id: event.client_event_id, ok: true, applied: true, error: null })) };
    });

    const response = await runSync();

    expect(response.next_cursor).toBe(8);
    const sent = apiFetchMock.mock.calls.map((call: unknown[]) =>
      (JSON.parse((call[1] as { body: string }).body).events as { client_event_id: string }[]).map((event) => event.client_event_id));
    expect(sent).toEqual([["event-a", "event-b", "event-c"], ["event-a"], ["event-b", "event-c"], ["event-b"], ["event-c"]]);
    const blocked = dbRef.current.runAsync.mock.calls.filter(([sql]: [string]) => sql.includes("SET status = 'BLOCKED'"));
    expect(blocked).toHaveLength(1);
    expect(blocked[0][1]).toEqual(["validation", "event-b"]);
    const deleted = dbRef.current.runAsync.mock.calls.filter(([sql]: [string]) => sql.includes("DELETE FROM pending_events"));
    expect(deleted.map(([, params]: [string, string[]]) => params[0])).toEqual(["event-a", "event-c"]);
  });

  it("reverts the optimistic door when the server refuses its event as a whole batch", async () => {
    const event = { ...pendingEvent("event-a", "door-a"),
      payload_json: JSON.stringify({ door_id: "door-a", status: "INSTALLED", previous_status: "NOT_INSTALLED", previous_reason_id: null, previous_comment: null }),
      server_state_received: 0 };
    dbRef.current.getAllAsync.mockResolvedValueOnce([event]);
    dbRef.current.getFirstAsync.mockImplementation(async (sql: string) =>
      sql.includes("FROM pending_events WHERE client_event_id") ? event : null);
    apiFetchMock.mockRejectedValue(new ApiError("validation", 422, "payload invalid"));

    await runSync().catch(() => undefined);

    const blocked = dbRef.current.runAsync.mock.calls.filter(([sql]: [string]) => sql.includes("SET status = 'BLOCKED'"));
    expect(blocked).toHaveLength(1);
    const revert = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("UPDATE doors") && sql.includes("SET status = ?"));
    expect(revert?.[1]?.[0]).toBe("NOT_INSTALLED");
    expect(revert?.[1]?.slice(-1)[0]).toBe("door-a");
  });

  it("schedules a retry instead of blocking when the server answers 429", async () => {
    dbRef.current.getAllAsync.mockResolvedValueOnce([pendingEvent("event-a", "door-a")]);
    dbRef.current.getFirstAsync.mockResolvedValue({ attempts: 1 });
    apiFetchMock.mockRejectedValue(new ApiError("Too many requests", 429, "Too many requests"));

    await expect(runSync()).rejects.toThrow("Too many requests");

    const failed = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("SET status = 'FAILED'"));
    expect(failed?.[1]?.[0]).toBe("Too many requests");
    expect(dbRef.current.runAsync.mock.calls.some(([sql]: [string]) => sql.includes("SET status = 'BLOCKED'"))).toBe(false);
  });

  it("reschedules sent events when the response cannot be applied", async () => {
    // Regression (audit A2): a post-response failure left events PENDING with a used-up attempt.
    dbRef.current.getAllAsync.mockResolvedValueOnce([pendingEvent("event-a", "door-a")]);
    dbRef.current.getFirstAsync.mockResolvedValue({ attempts: 1 });
    apiFetchMock.mockResolvedValue({ server_time: "2026-10-03T08:00:00Z", next_cursor: 9, reset_required: false,
      changes: [], factory_prices: { ...prices, version: -1 },
      acks: [{ client_event_id: "event-a", ok: true, applied: true, error: null }] });

    await expect(runSync()).rejects.toThrow("Invalid confirmed price snapshot");

    const failed = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("SET status = 'FAILED'"));
    expect(failed?.[1]?.[0]).toBe("Invalid confirmed price snapshot");
    expect(failed?.[1]?.[2]).toBe("event-a");
    expect(setStateMock).not.toHaveBeenCalled();
  });

  it("retries an event the server could not apply because of its own fault", async () => {
    // Backend block 2: SERVER_ERROR is retryable, the optimistic door state stays.
    dbRef.current.getAllAsync.mockResolvedValueOnce([pendingEvent("event-a", "door-a")]);
    dbRef.current.getFirstAsync.mockResolvedValue({ ...pendingEvent("event-a", "door-a"), attempts: 1 });
    apiFetchMock.mockResolvedValue({ server_time: "2026-04-26T08:02:00Z", next_cursor: 8, reset_required: false,
      snapshot: null, changes: [], acks: [{ client_event_id: "event-a", ok: false, applied: false, error: "SERVER_ERROR" }] });

    await runSync();

    const calls = dbRef.current.runAsync.mock.calls;
    const failed = calls.find(([sql]: [string]) => sql.includes("SET status = 'FAILED'"));
    expect(failed?.[1]?.[0]).toBe("SERVER_ERROR");
    expect(calls.some(([sql]: [string]) => sql.includes("SET status = 'BLOCKED'"))).toBe(false);
    expect(calls.some(([sql]: [string]) => sql.includes("UPDATE doors"))).toBe(false);
  });

  it("releases AUTH_REQUIRED work once a session is active again", async () => {
    // Regression (audit A3): such items had neither retry nor drop after re-login.
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 2 });

    expect(await releaseAuthBlockedEvents()).toBe(2);

    const update = dbRef.current.runAsync.mock.calls.find(([sql]: [string]) => sql.includes("SET status = 'PENDING'"));
    expect(update?.[0]).toContain("error = 'AUTH_REQUIRED'");
    expect(update?.[0]).toContain("attempts = 0");
  });

  it("does not touch the queue when nothing is blocked by authentication", async () => {
    dbRef.current.getFirstAsync.mockResolvedValueOnce({ total: 0 });
    expect(await releaseAuthBlockedEvents()).toBe(0);
    expect(dbRef.current.runAsync).not.toHaveBeenCalled();
  });
});
