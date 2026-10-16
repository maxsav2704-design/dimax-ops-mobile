import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));

import { DoorGlyph } from "./door-glyph";

const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("DoorGlyph", () => {
  it("draws a thin-line door tinted by status, scales with width and flags open issues", () => {
    const tone = { background: "#111", border: "#222", text: "#3f3" };
    act(() => {
      tree = create(React.createElement(DoorGlyph, { testID: "door", width: 108, tone, hasIssue: true, icon: "checkmark" }));
    });
    const root = tree.root.findAllByProps({ testID: "door" }).find((node) => typeof node.type === "string")!;
    expect(flatten(root.props.style)).toMatchObject({ width: 108, height: 136 });
    const svg = root.findByType("svg" as never);
    expect(svg.props).toMatchObject({ width: 108, height: 136, viewBox: "0 0 54 68" });
    const halo = tree.root.findAllByProps({ testID: "door-halo" }).find((node) => typeof node.type === "string")!;
    expect(halo.props.stroke).toBe("#3f3");
    const leaf = svg.findAllByType("path" as never).find((node) => node.props.fill === "#111")!;
    expect(leaf.props.stroke).toBe("#F3D58A");
    expect(svg.findAllByType("circle" as never)).toHaveLength(1);
    expect(svg.findAllByType("svg-gradient" as never)).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: "door-issue" }).filter((node) => typeof node.type === "string")).toHaveLength(1);
    expect(tree.root.findAllByType("icon" as never)).toHaveLength(1);
    act(() => { tree.update(React.createElement(DoorGlyph, { testID: "door", tone, hasIssue: false })); });
    expect(tree.root.findAllByProps({ testID: "door-issue" })).toHaveLength(0);
    expect(tree.root.findAllByType("icon" as never)).toHaveLength(0);
  });
});
