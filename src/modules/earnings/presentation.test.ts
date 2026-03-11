import { describe, expect, it } from "vitest";
import { buildEarningsFocusContext, buildProjectEarningsContext } from "@/modules/earnings/presentation";

describe("buildProjectEarningsContext", () => {
  it("builds project-scoped totals and install type summary", () => {
    const context = buildProjectEarningsContext(
      {
        period_key: "2026-03",
        currency: "ILS",
        today_total: "100.00",
        month_total: "3000.00",
        days: [],
        install_types: [],
        rows: [
          {
            id: "row-1",
            work_date: "2026-03-11",
            project_id: "project-1",
            project_name: "Alpha",
            door_label: "A-1",
            install_type_code: "INSTALL",
            install_type_label: "Install",
            quantity: 1,
            rate: "120.00",
            amount: "120.00",
          },
          {
            id: "row-2",
            work_date: "2026-03-11",
            project_id: "project-1",
            project_name: "Alpha",
            door_label: "A-2",
            install_type_code: "SERVICE",
            install_type_label: "Service",
            quantity: 1,
            rate: "80.00",
            amount: "80.00",
          },
          {
            id: "row-3",
            work_date: "2026-03-10",
            project_id: "project-1",
            project_name: "Alpha",
            door_label: "A-3",
            install_type_code: "INSTALL",
            install_type_label: "Install",
            quantity: 2,
            rate: "120.00",
            amount: "240.00",
          },
          {
            id: "row-4",
            work_date: "2026-03-11",
            project_id: "project-2",
            project_name: "Beta",
            door_label: "B-1",
            install_type_code: "INSTALL",
            install_type_label: "Install",
            quantity: 1,
            rate: "120.00",
            amount: "120.00",
          },
        ],
        generated_at: "2026-03-11T10:00:00Z",
      },
      "project-1",
      "2026-03-11"
    );

    expect(context?.todayTotal).toBe("200.00");
    expect(context?.monthTotal).toBe("440.00");
    expect(context?.rows).toHaveLength(3);
    expect(context?.todayRows).toHaveLength(2);
    expect(context?.installTypeSummary[0]).toEqual({
      code: "INSTALL",
      label: "Install",
      amount: 360,
      quantity: 3,
    });
  });

  it("returns empty scoped context when project has no earnings rows", () => {
    const context = buildProjectEarningsContext(
      {
        period_key: "2026-03",
        currency: "ILS",
        today_total: "0.00",
        month_total: "0.00",
        days: [],
        install_types: [],
        rows: [],
        generated_at: null,
      },
      "project-404",
      "2026-03-11"
    );

    expect(context).toEqual({
      todayTotal: "0.00",
      monthTotal: "0.00",
      currency: "ILS",
      rows: [],
      todayRows: [],
      installTypeSummary: [],
    });
  });

  it("builds focused earnings context for a selected day", () => {
    const context = buildEarningsFocusContext(
      {
        period_key: "2026-03",
        currency: "ILS",
        today_total: "100.00",
        month_total: "3000.00",
        days: [],
        install_types: [],
        rows: [
          {
            id: "row-1",
            work_date: "2026-03-11",
            project_id: "project-1",
            project_name: "Alpha",
            door_label: "A-1",
            install_type_code: "INSTALL",
            install_type_label: "Install",
            quantity: 1,
            rate: "120.00",
            amount: "120.00",
          },
          {
            id: "row-2",
            work_date: "2026-03-10",
            project_id: "project-2",
            project_name: "Beta",
            door_label: "B-1",
            install_type_code: "SERVICE",
            install_type_label: "Service",
            quantity: 1,
            rate: "80.00",
            amount: "80.00",
          },
        ],
        generated_at: "2026-03-11T10:00:00Z",
      },
      "2026-03-11",
      "DAY",
      "2026-03-10"
    );

    expect(context?.selectedDay).toBe("2026-03-10");
    expect(context?.total).toBe("80.00");
    expect(context?.rows).toHaveLength(1);
    expect(context?.installTypeSummary[0]).toEqual({
      code: "SERVICE",
      label: "Service",
      amount: 80,
      quantity: 1,
    });
  });
});
