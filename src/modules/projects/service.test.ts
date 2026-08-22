import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUseProjectCacheAfterSyncFailure,
  canRefreshProjectDetails,
  isProjectAccessRevoked,
  refreshProjectDetails,
} from "@/modules/projects/service";
import { ApiError, NetworkError } from "@/lib/errors";

const apiFetchMock = vi.fn();
const hydrateProjectDetailsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/modules/projects/repository", () => ({
  hydrateProjectDetails: (...args: unknown[]) => hydrateProjectDetailsMock(...args),
}));

describe("refreshProjectDetails", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    hydrateProjectDetailsMock.mockReset();
  });

  it("hydrates the cached project with the latest backend detail payload", async () => {
    const payload = {
      id: "project-1",
      name: "Alpha",
      address: "Street 1",
      status: "OK",
      server_time: "2026-04-18T10:00:00Z",
      waze_url: "https://waze.com/ul?q=Street+1&navigate=yes",
      whatsapp_url: "https://wa.me/972500000009",
      call_url: "tel:+972500000009",
      doors: [],
      issues_open: [],
      door_types_catalog: [],
      reasons_catalog: [],
      addons: {
        types: [],
        plan: [],
        facts: [],
      },
    };
    apiFetchMock.mockResolvedValue(payload);
    hydrateProjectDetailsMock.mockResolvedValue(undefined);

    await refreshProjectDetails("project-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/projects/project-1");
    expect(hydrateProjectDetailsMock).toHaveBeenCalledWith(payload);
  });

  it("does not allow a backend snapshot to overwrite pending offline work", () => {
    expect(canRefreshProjectDetails(1)).toBe(false);
    expect(canRefreshProjectDetails(3)).toBe(false);
    expect(canRefreshProjectDetails(0)).toBe(true);
  });

  it("uses the project cache only for a network failure with cached assignments", () => {
    expect(canUseProjectCacheAfterSyncFailure(new NetworkError(), 20)).toBe(true);
    expect(canUseProjectCacheAfterSyncFailure(new NetworkError(), 0)).toBe(false);
    expect(canUseProjectCacheAfterSyncFailure(new Error("invalid payload"), 20)).toBe(false);
  });

  it("recognizes a confirmed project access revocation", () => {
    expect(isProjectAccessRevoked(new ApiError("forbidden", 403, ""))).toBe(true);
    expect(isProjectAccessRevoked(new ApiError("missing", 404, ""))).toBe(true);
    expect(isProjectAccessRevoked(new ApiError("server error", 500, ""))).toBe(false);
    expect(isProjectAccessRevoked(new NetworkError("offline"))).toBe(false);
  });
});
