import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/errors";
import { loadInstallerEarnings } from "@/modules/earnings/service";

const apiFetchMock = vi.fn();
const getLatestEarningsSnapshotMock = vi.fn();
const saveEarningsSnapshotMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/modules/earnings/repository", () => ({
  getLatestEarningsSnapshot: (...args: unknown[]) => getLatestEarningsSnapshotMock(...args),
  saveEarningsSnapshot: (...args: unknown[]) => saveEarningsSnapshotMock(...args),
}));

describe("loadInstallerEarnings", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getLatestEarningsSnapshotMock.mockReset();
    saveEarningsSnapshotMock.mockReset();
  });

  it("returns online snapshot when backend contract exists", async () => {
    const payload = {
      period_key: "2026-03",
      currency: "ILS",
      today_total: "120.00",
      month_total: "4200.00",
      days: [],
      install_types: [],
      rows: [],
      generated_at: "2026-03-11T10:00:00Z",
    };
    apiFetchMock.mockResolvedValue(payload);

    const result = await loadInstallerEarnings("2026-03");

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/earnings/summary?period=2026-03");
    expect(saveEarningsSnapshotMock).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      snapshot: payload,
      source: "online",
      message: null,
    });
  });

  it("falls back to cache on network failure", async () => {
    const cached = {
      period_key: "2026-03",
      currency: "ILS",
      today_total: "95.00",
      month_total: "3900.00",
      days: [],
      install_types: [],
      rows: [],
      generated_at: "2026-03-10T10:00:00Z",
    };
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getLatestEarningsSnapshotMock.mockResolvedValue(cached);

    const result = await loadInstallerEarnings();

    expect(result.source).toBe("cache");
    expect(result.snapshot).toEqual(cached);
  });

  it("returns unavailable when backend contract is missing and no cache exists", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("not found", 404, ""));
    getLatestEarningsSnapshotMock.mockResolvedValue(null);

    const result = await loadInstallerEarnings();

    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "Earnings contract is not connected yet on the backend.",
    });
  });
});
