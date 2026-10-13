import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));

import { installerTheme } from "@/lib/theme";
import { DoorGlyph } from "./door-glyph";
import { ProjectSkyline, buildSkyline } from "./project-skyline";

const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("buildSkyline", () => {
  it("derives one bar per project from real summaries and never exceeds the door count", () => {
    const bars = buildSkyline(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      { a: { total: 10, remaining: 4, issues: 1 }, b: { total: 3, remaining: 9, issues: 0 } },
    );
    expect(bars).toEqual([
      { id: "a", total: 10, installed: 6, issues: 1 },
      { id: "b", total: 3, installed: 0, issues: 0 },
      { id: "c", total: 0, installed: 0, issues: 0 },
    ]);
  });

  it("caps the skyline at twelve projects", () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}` }));
    expect(buildSkyline(projects, {})).toHaveLength(12);
  });
});

describe("ProjectSkyline", () => {
  it("scales bar height by door count and fill by installed share, warning when issues are open", () => {
    act(() => {
      tree = create(React.createElement(ProjectSkyline, {
        testID: "skyline", height: 100,
        bars: [{ id: "a", total: 10, installed: 5, issues: 0 }, { id: "b", total: 5, installed: 5, issues: 2 }, { id: "c", total: 0, installed: 0, issues: 0 }],
      }));
    });
    const bars = tree.root.findAllByProps({ testID: "skyline-bar" }).filter((node) => typeof node.type === "string");
    expect(bars.map((bar) => flatten(bar.props.style).height)).toEqual([100, 50, 18]);
    const fills = bars.map((bar) => flatten(bar.children[0] && typeof bar.children[0] !== "string" ? bar.children[0].props.style : {}));
    expect(fills.map((fill) => fill.height)).toEqual(["50%", "100%", "0%"]);
    expect(fills.map((fill) => fill.backgroundColor)).toEqual([installerTheme.success, installerTheme.warning, installerTheme.success]);
  });
});

describe("DoorGlyph", () => {
  it("tints the leaf by status, scales with width and flags open issues", () => {
    const tone = { background: "#111", border: "#222", text: "#3f3" };
    act(() => {
      tree = create(React.createElement(DoorGlyph, { testID: "door", width: 108, tone, hasIssue: true, icon: "checkmark" }));
    });
    const root = tree.root.findAllByProps({ testID: "door" }).find((node) => typeof node.type === "string")!;
    expect(flatten(root.props.style)).toMatchObject({ width: 114, height: 142 });
    const edge = tree.root.findAllByProps({ testID: "door-edge" }).find((node) => typeof node.type === "string")!;
    expect(flatten(edge.props.style)).toMatchObject({ width: 108, height: 136, top: 6, borderColor: "#3f3" });
    const leaf = root.findAll((node) => typeof node.type === "string" && flatten(node.props.style).backgroundColor === "#111")[0];
    expect(flatten(leaf.props.style)).toMatchObject({ width: 108, height: 136, borderColor: "#3f3" });
    expect(leaf.findAllByType("gradient" as never)).toHaveLength(1);
    expect(tree.root.findAllByProps({ testID: "door-issue" }).filter((node) => typeof node.type === "string")).toHaveLength(1);
    act(() => { tree.update(React.createElement(DoorGlyph, { testID: "door", tone, hasIssue: false })); });
    expect(tree.root.findAllByProps({ testID: "door-issue" })).toHaveLength(0);
    expect(tree.root.findAllByType("icon" as never)).toHaveLength(0);
  });
});
