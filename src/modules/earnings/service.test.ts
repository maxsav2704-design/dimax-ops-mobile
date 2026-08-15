import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/lib/errors";
import { loadInstallerEarnings } from "@/modules/earnings/service";

const apiFetchMock = vi.fn();
const getEarningsSnapshotMock = vi.fn();
const saveEarningsSnapshotMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/modules/earnings/repository", () => ({
  getEarningsSnapshot: (...args: unknown[]) => getEarningsSnapshotMock(...args),
  saveEarningsSnapshot: (...args: unknown[]) => saveEarningsSnapshotMock(...args),
}));

describe("loadInstallerEarnings", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getEarningsSnapshotMock.mockReset();
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

    const result = await loadInstallerEarnings("month");

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/earnings/summary?period=month");
    expect(saveEarningsSnapshotMock).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      snapshot: payload,
      source: "online",
      message: null,
    });
  });

  it("normalizes decimal quantity strings from the backend contract", async () => {
    const payload = {
      period_key: "2026-06",
      currency: "ILS",
      today_total: "0.00",
      month_total: "80.00",
      days: [{ date: "2026-06-15", amount: "80.00", jobs_count: "1.00" }],
      install_types: [{ code: "SMOKE", label: "Smoke door", amount: "80.00", quantity: "1.00" }],
      rows: [{
        id: "row-1",
        work_date: "2026-06-15",
        project_id: "project-1",
        project_name: "Project 1",
        door_label: "D-1",
        install_type_code: "SMOKE",
        install_type_label: "Smoke door",
        quantity: "1.00",
        rate: "80.00",
        amount: "80.00",
      }],
      generated_at: "2026-06-15T10:00:00Z",
    };
    apiFetchMock.mockResolvedValue(payload);

    const result = await loadInstallerEarnings("month", "2026-06-15");

    expect(result.snapshot?.days[0].jobs_count).toBe(1);
    expect(result.snapshot?.install_types[0].quantity).toBe(1);
    expect(result.snapshot?.rows[0].quantity).toBe(1);
    expect(saveEarningsSnapshotMock).toHaveBeenCalledWith(result.snapshot);
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
    getEarningsSnapshotMock.mockResolvedValue(cached);

    const result = await loadInstallerEarnings("month", "2026-03-11");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/earnings/summary?period=month&date=2026-03-11"
    );
    expect(getEarningsSnapshotMock).toHaveBeenCalledWith("2026-03");
    expect(result.source).toBe("cache");
    expect(result.snapshot).toEqual(cached);
    expect(result.message).toBe("Showing cached earnings for 2026-03 while the network is unavailable.");
  });

  it("requests an anchored payroll month for a selected calendar day", async () => {
    const payload = {
      period_key: "2026-05",
      currency: "ILS",
      today_total: "120.00",
      month_total: "4200.00",
      days: [],
      install_types: [],
      rows: [],
      generated_at: "2026-05-08T10:00:00Z",
    };
    apiFetchMock.mockResolvedValue(payload);

    const result = await loadInstallerEarnings("month", "2026-05-03");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/earnings/summary?period=month&date=2026-05-03"
    );
    expect(result.source).toBe("online");
  });

  it("does not fall back to a different cached payroll period", async () => {
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getEarningsSnapshotMock.mockResolvedValue(null);

    const result = await loadInstallerEarnings("month", "2026-05-03");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/earnings/summary?period=month&date=2026-05-03"
    );
    expect(getEarningsSnapshotMock).toHaveBeenCalledWith("2026-05");
    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "No cached earnings are available for 2026-05.",
    });
  });

  it("uses the backend week period key when falling back to cache", async () => {
    const cached = {
      period_key: "2026-05-04..2026-05-10",
      currency: "ILS",
      today_total: "120.00",
      month_total: "4200.00",
      days: [],
      install_types: [],
      rows: [],
      generated_at: "2026-05-08T10:00:00Z",
    };
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getEarningsSnapshotMock.mockResolvedValue(cached);

    const result = await loadInstallerEarnings("week", "2026-05-08");

    expect(getEarningsSnapshotMock).toHaveBeenCalledWith("2026-05-04..2026-05-10");
    expect(result.snapshot).toEqual(cached);
  });

  it("returns unavailable when backend contract is missing and no cache exists", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("not found", 404, ""));
    getEarningsSnapshotMock.mockResolvedValue(null);

    const result = await loadInstallerEarnings();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/earnings/summary?period=month");
    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "Earnings contract is not connected yet on the backend.",
    });
  });

  it("returns unavailable when backend responds with a different summary shape", async () => {
    apiFetchMock.mockResolvedValue({
      total: "120.00",
      jobs_count: 1,
      by_install_type: [],
      by_project: [],
      weekly_breakdown: [],
    });
    getEarningsSnapshotMock.mockResolvedValue(null);

    const result = await loadInstallerEarnings();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/installer/earnings/summary?period=month");
    expect(saveEarningsSnapshotMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      snapshot: null,
      source: "unavailable",
      message: "Mobile earnings view is waiting for the canonical backend summary shape.",
    });
  });
});
