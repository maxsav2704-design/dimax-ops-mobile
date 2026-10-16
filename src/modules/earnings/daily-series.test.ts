import { describe, expect, it } from "vitest";
import { buildRecentDailyTotals } from "./daily-series";

describe("buildRecentDailyTotals", () => {
  it("returns one exact total per calendar day ending today, zero for quiet days", () => {
    const rows = [
      { work_date: "2026-10-13", amount: "0.10" }, { work_date: "2026-10-13", amount: "0.20" },
      { work_date: "2026-10-11", amount: "100.00" }, { work_date: "2026-10-01", amount: "999.00" },
    ];
    expect(buildRecentDailyTotals(rows, "2026-10-13", 7)).toEqual([0, 0, 0, 0, 100, 0, 0.3]);
  });

  it("crosses month and year boundaries", () => {
    expect(buildRecentDailyTotals([{ work_date: "2025-12-31", amount: "5" }], "2026-01-02", 3)).toEqual([5, 0, 0]);
  });
});
