import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshProjectDetails } from "@/modules/projects/service";

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
});
