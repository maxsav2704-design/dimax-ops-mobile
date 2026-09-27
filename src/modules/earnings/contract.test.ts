import { describe, expect, it } from "vitest";
import { parseEarningsSummary } from "./contract";
import { earningsMinorUnits, sumEarningsValues } from "./decimal";

const row = { id: "work-a", work_date: "2026-09-27", project_id: "project-a", project_name: "Tower A", door_label: "A-201", install_type_code: "ENTRANCE", install_type_label: "Entrance", quantity: "1.25", rate: "100.00", amount: "125.00" };
const summary = () => ({ period_key: "2026-09", currency: "ILS", today_total: "125.00", month_total: "125.00", days: [], install_types: [], rows: [row], generated_at: null });

describe("earnings decimals and row contract", () => {
  it("sums server amounts and fractional quantities in exact minor units", () => {
    expect(sumEarningsValues(["0.10", "0.20", "-0.30"])).toBe(0);
    expect(sumEarningsValues([0.1, 0.2])).toBe(0.3);
    expect(sumEarningsValues(["1.25", "0.75"])).toBe(2);
    expect(earningsMinorUnits("-0.01")).toBe(-1);
  });
  it.each(["NaN", "Infinity", "1junk", "1.234", "1e2", "", null, {}, "9999999999999999.00"])("rejects an invalid decimal: %j", (value) => {
    expect(earningsMinorUnits(value)).toBeNull();
  });
  it("normalizes a fractional work quantity while keeping server amounts", () => {
    expect(parseEarningsSummary(summary(), "2026-09")?.rows[0]).toEqual({ ...row, quantity: 1.25 });
  });
  it.each([
    { work_date: "2026-09-31" }, { work_date: "2026-08-31" }, { install_type_label: null },
    { rate: "3junk" }, { amount: "Infinity" }, { quantity: "-1" }, { quantity: "0" }, { quantity: "1.001" },
  ])("rejects an unusable ledger row: %j", (change) => {
    expect(parseEarningsSummary({ ...summary(), rows: [{ ...row, ...change }] }, "2026-09")).toBeNull();
  });
  it("rejects duplicate work IDs instead of double-counting pay", () => {
    expect(parseEarningsSummary({ ...summary(), rows: [row, row] }, "2026-09")).toBeNull();
  });
  it("preserves negative adjustments rather than replacing them with zero", () => {
    expect(parseEarningsSummary({ ...summary(), rows: [{ ...row, rate: "-100.00", amount: "-125.00" }] }, "2026-09")?.rows[0].amount).toBe("-125.00");
  });
});
