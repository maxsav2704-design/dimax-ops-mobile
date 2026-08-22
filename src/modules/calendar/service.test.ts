import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.useRealTimers();
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

  it("requests complete local calendar days instead of starting at the current minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11, 15, 42, 10));
    apiFetchMock.mockResolvedValue({ items: [] });

    await loadInstallerCalendar("7d");

    const requestUrl = new URL(apiFetchMock.mock.calls[0][0], "https://mobile.local");
    const startsAt = new Date(requestUrl.searchParams.get("starts_at") as string);
    const endsAt = new Date(requestUrl.searchParams.get("ends_at") as string);
    expect(startsAt.getHours()).toBe(0);
    expect(startsAt.getMinutes()).toBe(0);
    expect(endsAt.getHours()).toBe(0);
    expect(endsAt.getDate()).toBe(18);
  });

  it("keeps fresh calendar data when the offline snapshot cannot be saved", async () => {
    apiFetchMock.mockResolvedValue({ items: [] });
    saveCalendarSnapshotMock.mockRejectedValue(new Error("database is busy"));

    const result = await loadInstallerCalendar("7d");

    expect(getCalendarSnapshotMock).not.toHaveBeenCalled();
    expect(result.source).toBe("online");
    expect(result.snapshot?.items).toEqual([]);
    expect(result.message).toContain("offline copy");
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

  it("falls back to a valid cache when the backend returns an invalid event shape", async () => {
    const cached = {
      range_key: "7d",
      starts_at: "2026-03-11T00:00:00Z",
      ends_at: "2026-03-18T00:00:00Z",
      items: [],
      generated_at: "2026-03-11T09:00:00Z",
    };
    apiFetchMock.mockResolvedValue({ items: [{ id: "broken-event" }] });
    getCalendarSnapshotMock.mockResolvedValue(cached);

    const result = await loadInstallerCalendar("7d");

    expect(saveCalendarSnapshotMock).not.toHaveBeenCalled();
    expect(result.source).toBe("cache");
    expect(result.snapshot).toEqual(cached);
  });

  it("returns a controlled unavailable state when the offline cache cannot be read", async () => {
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getCalendarSnapshotMock.mockRejectedValue(new Error("database is busy"));

    const result = await loadInstallerCalendar("7d");

    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "The calendar and its offline copy are temporarily unavailable.",
    });
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
