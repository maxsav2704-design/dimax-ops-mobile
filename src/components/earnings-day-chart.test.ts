import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: "en", isRTL: false }) }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));

import { installerTheme } from "@/lib/theme";
import { EarningsDayChart, buildEarningsDayChart } from "./earnings-day-chart";

const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("buildEarningsDayChart", () => {
  it("groups rows by day in calendar order using exact decimal sums", () => {
    expect(buildEarningsDayChart([
      { work_date: "2026-09-27", amount: "0.10" },
      { work_date: "2026-09-25", amount: "100.00" },
      { work_date: "2026-09-27", amount: "0.20" },
      { work_date: "2026-09-26", amount: "-40.00" },
    ])).toEqual([
      { date: "2026-09-25", amount: 100, rows: 1 },
      { date: "2026-09-26", amount: -40, rows: 1 },
      { date: "2026-09-27", amount: 0.3, rows: 2 },
    ]);
  });
});

describe("EarningsDayChart", () => {
  it("scales bars to the peak day, colours deductions, marks today and selects a day on press", () => {
    const onSelect = vi.fn();
    const bars = buildEarningsDayChart([
      { work_date: "2026-09-25", amount: "100.00" }, { work_date: "2026-09-26", amount: "-40.00" }, { work_date: "2026-09-27", amount: "50.00" },
    ]);
    act(() => {
      tree = create(React.createElement(EarningsDayChart, {
        bars, selectedDate: "2026-09-25", today: "2026-09-27", testID: "chart", onSelect,
        dateLabel: (date) => `Day ${date}`, money: (amount) => `${amount.toFixed(2)} ILS`,
      }));
    });
    const columns = tree.root.findAllByType("pressable" as never);
    expect(columns.map((column) => column.props.accessibilityLabel)).toEqual([
      "Day 2026-09-25. 100.00 ILS", "Day 2026-09-26. -40.00 ILS", "Day 2026-09-27. 50.00 ILS",
    ]);
    const fills = columns.map((column) => flatten(column.findAllByType("view" as never)[1].props.style));
    expect(fills.map((fill) => fill.height)).toEqual([72, 29, 36]);
    expect(fills.map((fill) => fill.backgroundColor)).toEqual([installerTheme.accent, installerTheme.danger, installerTheme.info]);
    expect(columns[0].props.accessibilityState.selected).toBe(true);
    act(() => columns[2].props.onPress({}));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-09-27");
  });
});
