import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getProjectMock,
  listProjectDoorsMock,
  listDoorTypesMock,
  listProjectIssuesMock,
  listReasonsMock,
  listProjectAddonTypesMock,
  listProjectAddonFactsMock,
  listPendingEventsMock,
  getSyncQueueSummaryMock,
  readPricesMock,
  assertContextMock,
  guardMock,
} = vi.hoisted(() => ({
  getProjectMock: vi.fn(),
  listProjectDoorsMock: vi.fn(),
  listDoorTypesMock: vi.fn(),
  listProjectIssuesMock: vi.fn(),
  listReasonsMock: vi.fn(),
  listProjectAddonTypesMock: vi.fn(),
  listProjectAddonFactsMock: vi.fn(),
  listPendingEventsMock: vi.fn(),
  getSyncQueueSummaryMock: vi.fn(),
  readPricesMock: vi.fn(),
  assertContextMock: vi.fn(),
  guardMock: vi.fn(),
}));

vi.mock("@/modules/prices/repository", () => ({ readFactoryPrices: readPricesMock }));
vi.mock("@/lib/workspace-context", () => ({
  captureWorkspaceContext: () => "account-a",
  assertWorkspaceContext: assertContextMock,
  withWorkspaceDatabase: guardMock,
}));

vi.mock("@/modules/projects/repository", () => ({
  getProject: getProjectMock,
  listProjectDoors: listProjectDoorsMock,
  listDoorTypes: listDoorTypesMock,
  listProjectIssues: listProjectIssuesMock,
  listReasons: listReasonsMock,
  listProjectAddonTypes: listProjectAddonTypesMock,
  listProjectAddonFacts: listProjectAddonFactsMock,
}));

vi.mock("@/modules/sync/service", () => ({
  listPendingEvents: listPendingEventsMock,
  getSyncQueueSummary: getSyncQueueSummaryMock,
}));

import {
  createEmptyLocalProjectWorkspace,
  loadLocalProjectWorkspace,
} from "@/modules/projects/local-workspace";
import { SessionChangedError } from "@/lib/errors";

describe("local project workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guardMock.mockImplementation((_context, operation) => operation());
    readPricesMock.mockResolvedValue(null);
    getProjectMock.mockResolvedValue({ id: "project-1", name: "Tower A" });
    listProjectDoorsMock.mockResolvedValue([
      { id: "door-1", project_id: "project-1" },
      { id: "door-2", project_id: "project-1" },
    ]);
    listDoorTypesMock.mockResolvedValue([{ id: "type-1", code: "entrance", name: "Entrance" }]);
    listProjectIssuesMock.mockResolvedValue([]);
    listReasonsMock.mockResolvedValue([]);
    listProjectAddonTypesMock.mockResolvedValue([]);
    listProjectAddonFactsMock.mockResolvedValue([]);
    listPendingEventsMock.mockResolvedValue([]);
    getSyncQueueSummaryMock.mockResolvedValue({
      total: 0,
      pending: 0,
      failed: 0,
      blocked: 0,
      ready_to_send: 0,
    });
  });

  it("returns one project-bound snapshot with its cached doors", async () => {
    const workspace = await loadLocalProjectWorkspace("project-1");

    expect(workspace.projectId).toBe("project-1");
    expect(workspace.project?.name).toBe("Tower A");
    expect(workspace.doors).toHaveLength(2);
    expect(workspace.queueSummary?.total).toBe(0);
    expect(workspace.factoryPrices).toEqual({ status: "ready", snapshot: null });
    expect(guardMock).toHaveBeenCalledWith("account-a", expect.any(Function));
    expect(assertContextMock).toHaveBeenCalledWith("account-a");
    expect(getProjectMock).toHaveBeenCalledWith("project-1");
    expect(listProjectDoorsMock).toHaveBeenCalledWith("project-1");
    expect(listProjectIssuesMock).toHaveBeenCalledWith("project-1");
    expect(listPendingEventsMock).toHaveBeenCalledWith("project-1");
  });

  it("loads the confirmed price cache under the same account guard", async () => {
    const snapshot = { price_list_id: "list-a", version: 1, currency: "ILS", items: [] };
    readPricesMock.mockResolvedValue(snapshot);
    await expect(loadLocalProjectWorkspace("project-1")).resolves.toMatchObject({
      factoryPrices: { status: "ready", snapshot },
    });
  });

  it("keeps the door workspace usable if only the price cache is damaged", async () => {
    readPricesMock.mockRejectedValue(new Error("Invalid snapshot"));
    await expect(loadLocalProjectWorkspace("project-1")).resolves.toMatchObject({
      project: { id: "project-1" }, factoryPrices: { status: "unavailable", snapshot: null },
    });
  });

  it("never publishes a snapshot after the active account changes", async () => {
    assertContextMock.mockImplementation(() => { throw new SessionChangedError(); });
    await expect(loadLocalProjectWorkspace("project-1")).rejects.toBeInstanceOf(SessionChangedError);
  });

  it("does not swallow a session change as a missing price", async () => {
    readPricesMock.mockRejectedValue(new SessionChangedError());
    await expect(loadLocalProjectWorkspace("project-1")).rejects.toBeInstanceOf(SessionChangedError);
  });

  it("does not publish a partial snapshot while one local query is pending", async () => {
    let resolveDoors!: (value: Array<{ id: string; project_id: string }>) => void;
    listProjectDoorsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDoors = resolve;
      })
    );

    const result = loadLocalProjectWorkspace("project-1");
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDoors([{ id: "door-1", project_id: "project-1" }]);
    await expect(result).resolves.toMatchObject({
      projectId: "project-1",
      project: { id: "project-1" },
      doors: [{ id: "door-1", project_id: "project-1" }],
    });
  });

  it("creates isolated empty snapshots for route changes and access revocation", () => {
    const first = createEmptyLocalProjectWorkspace("project-1");
    const second = createEmptyLocalProjectWorkspace("project-2");

    first.doors.push({ id: "door-1" } as never);
    expect(second).toEqual({
      projectId: "project-2",
      project: null,
      doors: [],
      doorTypes: [],
      issues: [],
      reasons: [],
      addonTypes: [],
      addonFacts: [],
      pendingEvents: [],
      queueSummary: null,
      factoryPrices: { status: "loading", snapshot: null },
    });
  });
});
