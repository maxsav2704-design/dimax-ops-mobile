import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/errors";
import { loadInstallerCalendar } from "@/modules/calendar/service";

const apiFetchMock = vi.fn();
const getCalendarSnapshotMock = vi.fn();
const saveCalendarSnapshotMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/modules/calendar/repository", () => ({
  getCalendarSnapshot: (...args: unknown[]) => getCalendarSnapshotMock(...args),
  saveCalendarSnapshot: (...args: unknown[]) => saveCalendarSnapshotMock(...args),
}));

describe("loadInstallerCalendar", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getCalendarSnapshotMock.mockReset();
    saveCalendarSnapshotMock.mockReset();
  });

  it("returns online snapshot when backend contract exists", async () => {
    apiFetchMock.mockResolvedValue({
      items: [
        {
          id: "evt-1",
          title: "Install A",
          event_type: "installation",
          starts_at: "2026-03-11T08:00:00Z",
          ends_at: "2026-03-11T10:00:00Z",
          location: "Tel Aviv",
          waze_url: null,
          description: null,
          project_id: "proj-1",
          installer_ids: [],
        },
      ],
    });

    const result = await loadInstallerCalendar("7d");

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(saveCalendarSnapshotMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("online");
    expect(result.snapshot?.items).toHaveLength(1);
  });

  it("falls back to cache on network failure", async () => {
    const cached = {
      range_key: "7d",
      starts_at: "2026-03-11T00:00:00Z",
      ends_at: "2026-03-18T00:00:00Z",
      items: [],
      generated_at: "2026-03-11T09:00:00Z",
    };
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getCalendarSnapshotMock.mockResolvedValue(cached);

    const result = await loadInstallerCalendar("7d");

    expect(result.source).toBe("cache");
    expect(result.snapshot).toEqual(cached);
  });

  it("returns unavailable when backend contract is missing and no cache exists", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("not found", 404, ""));
    getCalendarSnapshotMock.mockResolvedValue(null);

    const result = await loadInstallerCalendar("7d");

    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "Calendar contract is not connected yet on the backend.",
    });
  });
});
