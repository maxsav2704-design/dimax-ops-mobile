import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hydrateProjectDetails,
  listProjectAddonFacts,
  listProjects,
  replaceProjects,
} from "@/modules/projects/repository";

const { deriveProjectExternalLinksMock } = vi.hoisted(() => ({
  deriveProjectExternalLinksMock: vi.fn(),
}));
const runAsyncMock = vi.fn();
const getAllAsyncMock = vi.fn();
const withTransactionAsyncMock = vi.fn(async (callback: () => Promise<void>) => callback());

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    getAllAsync: getAllAsyncMock,
    runAsync: runAsyncMock,
    withTransactionAsync: withTransactionAsyncMock,
  }),
}));

vi.mock("@/modules/projects/external-actions", () => ({
  deriveProjectExternalLinks: deriveProjectExternalLinksMock,
}));

describe("replaceProjects", () => {
  beforeEach(() => {
    runAsyncMock.mockReset();
    getAllAsyncMock.mockReset();
    withTransactionAsyncMock.mockClear();
    deriveProjectExternalLinksMock.mockReset();
  });

  it("persists whatsapp and call links from the installer project list payload", async () => {
    await replaceProjects([
      {
        id: "project-1",
        name: "Mobile Test Alpha",
        address: "Harbor 11, Ashdod",
        status: "OK",
        lifecycle_status: "ACTIVE",
        health_status: "NORMAL",
        waze_url: "https://waze.com/ul?q=Harbor+11&navigate=yes",
        whatsapp_url: "https://wa.me/972501110001?text=Hello",
        call_url: "tel:+972501110001",
      },
    ]);

    expect(withTransactionAsyncMock).toHaveBeenCalledTimes(1);
    expect(runAsyncMock).toHaveBeenCalledTimes(1);

    const [sql, params] = runAsyncMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("whatsapp_url");
    expect(sql).toContain("call_url");
    expect(sql).toContain("COALESCE(excluded.whatsapp_url, projects.whatsapp_url)");
    expect(sql).toContain("COALESCE(excluded.call_url, projects.call_url)");
    expect(params).toEqual([
      "project-1",
      "Mobile Test Alpha",
      "Harbor 11, Ashdod",
      "OK",
      "ACTIVE",
      "NORMAL",
      "https://waze.com/ul?q=Harbor+11&navigate=yes",
      "https://wa.me/972501110001?text=Hello",
      "tel:+972501110001",
    ]);
  });

  it("lists project add-on facts with catalog names and local offline rows", async () => {
    getAllAsyncMock.mockResolvedValueOnce([
      {
        id: "local:event-1",
        project_id: "project-1",
        addon_type_id: "addon-1",
        addon_name: "Extra frame",
        unit: "pcs",
        qty_done: "2.50",
        done_at: "2026-04-26T08:01:00Z",
        comment: "Left tower",
        source: "OFFLINE",
        updated_at: "2026-04-26T08:01:00Z",
      },
    ]);

    const rows = await listProjectAddonFacts("project-1");

    expect(rows).toEqual([
      {
        id: "local:event-1",
        project_id: "project-1",
        addon_type_id: "addon-1",
        addon_name: "Extra frame",
        unit: "pcs",
        qty_done: "2.50",
        done_at: "2026-04-26T08:01:00Z",
        comment: "Left tower",
        source: "OFFLINE",
        updated_at: "2026-04-26T08:01:00Z",
      },
    ]);

    const [sql, params] = getAllAsyncMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM addon_facts");
    expect(sql).toContain("LEFT JOIN addon_types");
    expect(sql).toContain("ORDER BY addon_facts.done_at DESC");
    expect(params).toEqual(["project-1"]);
  });

  it("loads lifecycle and health status with every cached project", async () => {
    getAllAsyncMock.mockResolvedValueOnce([]);

    await listProjects();

    const [sql] = getAllAsyncMock.mock.calls[0] as [string];
    expect(sql).toContain("lifecycle_status");
    expect(sql).toContain("health_status");
  });

  it("keeps detail hydration compatible with an older backend payload", async () => {
    deriveProjectExternalLinksMock.mockReturnValue({
      waze_url: null,
      whatsapp_url: null,
      call_url: null,
    });

    await hydrateProjectDetails({
      id: "project-1",
      name: "Alpha",
      address: "Street 1",
      status: "OK",
      lifecycle_status: undefined as never,
      health_status: undefined as never,
      waze_url: null,
      server_time: "2026-08-28T13:00:00Z",
      doors: [],
      issues_open: [],
      door_types_catalog: [],
      reasons_catalog: [],
      addons: { types: [], plan: [], facts: [] },
    });

    const [sql, params] = runAsyncMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO projects");
    expect(params[4]).toBe("ACTIVE");
    expect(params[5]).toBe("NORMAL");
  });
});
