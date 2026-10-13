import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: "en", isRTL: false }) }));

import { translateEnum } from "@/lib/i18n";
import { installerTheme } from "@/lib/theme";
import type { InstallerDoor } from "@/modules/projects/types";
import { FloorHeatmap } from "./floor-heatmap";

const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
const door = (id: string, floor: string, status = "PENDING"): InstallerDoor => ({
  id, project_id: "p", door_type_id: "t", unit_label: id.toUpperCase(), floor_label: floor, apartment_number: null, house_number: null,
  order_number: null, location_code: null, door_marking: null, status: status as InstallerDoor["status"], is_locked: false, reason_id: null, comment: null, version: 1, updated_at: null,
});
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("FloorHeatmap", () => {
  it("draws one isometric tile per door, lights it by status and opens the door on press", () => {
    const onOpenDoor = vi.fn();
    const floors: Array<[string, InstallerDoor[]]> = [["2", [door("a", "2", "INSTALLED"), door("b", "2")]], ["3", [door("c", "3")]]];
    act(() => {
      tree = create(React.createElement(FloorHeatmap, {
        floors, selectedDoorId: "b", issueDoorIds: new Set(["c"]), busy: false, locale: "en", onOpenDoor, testID: "map",
      }));
    });
    const cells = tree.root.findAllByType("pressable" as never).filter((node) => node.props.accessibilityRole === "imagebutton");
    expect(cells.map((cell) => cell.props.accessibilityLabel)).toEqual([
      `A, ${translateEnum("en", "INSTALLED")}`, `B, ${translateEnum("en", "PENDING")}`, `C, ${translateEnum("en", "ISSUE_OPEN")}`,
    ]);
    expect(cells.map((cell) => cell.props.accessibilityState.selected)).toEqual([false, true, false]);
    const tileOf = (index: number) => flatten(cells[index].findAllByType("view" as never)[1].props.style);
    expect(tileOf(0).transform).toEqual([{ rotateX: "58deg" }, { rotateZ: "45deg" }]);
    expect(tileOf(0).borderColor).toBe(installerTheme.success);
    expect(tileOf(1).borderColor).toBe(installerTheme.accent);
    expect(tileOf(1).borderWidth).toBe(2);
    expect(tileOf(2).borderColor).toBe(installerTheme.danger);
    expect(cells[2].findAllByType("view" as never)).toHaveLength(3);
    act(() => cells[2].props.onPress({}));
    expect(onOpenDoor).toHaveBeenCalledExactlyOnceWith("c");
    expect(tree.root.findAllByType("text" as never).map((node) => node.children.join(""))).toEqual(["2", "3"]);
  });
});
