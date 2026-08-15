import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("@/lib/device-id", () => ({
  getOrCreateDeviceId: getOrCreateDeviceIdMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: async () => dbRef.current,
  getState: getStateMock,
  initDb: initDbMock,
  setState: setStateMock,
}));

vi.mock("@/modules/projects/repository", () => ({
  hydrateProjectDetails: vi.fn(),
  replaceProjects: vi.fn(),
}));

import {
  dropPendingEvent,
  forceColdResync,
  queueAddonFactEvent,
  queueDoorStatusEvent,
  queueIssueCreateEvent,
  retryPendingEventNow,
  runSync,
} from "@/modules/sync/service";

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
    getStateMock.mockResolvedValue("0");
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

  it("force cold resync resets the cursor before requesting a snapshot", async () => {
    getStateMock.mockResolvedValue("1507");
    dbRef.current.getAllAsync.mockResolvedValueOnce([
      {
        client_event_id: "stale-event-1",
        type: "DOOR_SET_STATUS",
        project_id: "project-1",
        happened_at: "2026-04-26T08:01:00Z",
        payload_json: JSON.stringify({ door_id: "door-1", status: "INSTALLED" }),
        status: "FAILED",
        error: "stale retry",
        attempts: 1,
        next_retry_at: null,
        last_attempt_at: null,
        created_at: "2026-04-26T08:01:00Z",
      },
    ]);
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
    expect(dbRef.current.getAllAsync).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/sync", expect.objectContaining({
      method: "POST",
    }));
    const body = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(body.since_cursor).toBe(0);
    expect(body.events).toEqual([]);
    expect(setStateMock).toHaveBeenLastCalledWith("last_sync_at", "2026-04-26T08:10:00Z");
  });

  it("reapplies pending optimistic work after a cold resync snapshot", async () => {
    dbRef.current.getFirstAsync.mockResolvedValue({
      status: "NOT_INSTALLED",
      is_locked: 0,
      attempts: 1,
    });
    dbRef.current.getAllAsync.mockResolvedValueOnce([
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
    dbRef.current.getAllAsync.mockResolvedValueOnce([
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

  it("reverts optimistic door status when backend rejects the sync event", async () => {
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
          error: "CONFLICT_ASSIGNMENT_CHANGED",
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
    expect(blockedCall?.[1]).toEqual(["CONFLICT_ASSIGNMENT_CHANGED", "event-1"]);
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
});
