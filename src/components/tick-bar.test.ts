import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));

import { Sparkline, sparklinePath } from "./sparkline";
import { TickBar } from "./tick-bar";

const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("TickBar", () => {
  it("renders one tick per unit and fills the first `filled` ticks in the given colour", () => {
    act(() => { tree = create(React.createElement(TickBar, { total: 5, filled: 3, color: "#0f0", testID: "bar" })); });
    const ticks = tree.root.findAllByProps({ testID: "bar-tick" }).filter((node) => typeof node.type === "string");
    expect(ticks).toHaveLength(5);
    const fills = ticks.map((tick) => tick.findAllByType("animated-view" as never).length);
    expect(fills).toEqual([1, 1, 1, 0, 0]);
    expect(flatten(ticks[0].findByType("animated-view" as never).props.style).backgroundColor).toBe("#0f0");
    expect(flatten(ticks[0].findByType("animated-view" as never).props.style).opacity.value).toBe(3);
  });

  it("falls back to a plain fill for very long floors and renders nothing for empty ones", () => {
    act(() => { tree = create(React.createElement(TickBar, { total: 40, filled: 10, color: "#0f0", testID: "bar" })); });
    expect(tree.root.findAllByProps({ testID: "bar-tick" })).toHaveLength(0);
    expect(tree.root.findAllByType("animated-view" as never)).toHaveLength(1);
    act(() => { tree.update(React.createElement(TickBar, { total: 0, filled: 0, color: "#0f0", testID: "bar" })); });
    expect(tree.root.findAllByProps({ testID: "bar" }).filter((node) => typeof node.type === "string")).toHaveLength(0);
  });
});

describe("Sparkline", () => {
  it("scales points into the box and lights the last point", () => {
    expect(sparklinePath([0, 50, 100], 100, 20)).toBe("M2.0 18.0 L50.0 10.0 L98.0 2.0");
    expect(sparklinePath([], 100, 20)).toBe("");
    act(() => { tree = create(React.createElement(Sparkline, { points: [0, 50, 100], width: 100, height: 20, color: "#fa0", testID: "spark" })); });
    const paths = tree.root.findAllByType("path" as never);
    expect(paths).toHaveLength(3);
    expect(paths[2].props.stroke).toBe("#fa0");
    const dots = tree.root.findAllByType("circle" as never);
    expect(dots.map((dot) => [dot.props.cx, dot.props.cy])).toEqual([[98, 2], [98, 2]]);
  });
});
