import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ reduced: true, loop: vi.fn(), stop: vi.fn() }));

vi.mock("react-native", async () => {
  const base = await (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock();
  return {
    ...base,
    AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(native.reduced), addEventListener: () => ({ remove: vi.fn() }) },
    Animated: { ...base.Animated, loop: (animation: unknown) => { native.loop(animation); return { start: vi.fn(), stop: native.stop }; } },
  };
});
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: "en", isRTL: false }) }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));

import { MotionProvider } from "./motion";
import { SkeletonList } from "./skeleton";

let tree: ReactTestRenderer;
const items = () => tree.root.findAllByProps({ testID: "loading-item" }).filter((node) => typeof node.type === "string");
const text = () => tree.root.findAllByType("text" as never).flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");
async function mount(element: React.ReactElement) {
  await act(async () => { tree = create(React.createElement(MotionProvider, null, element)); });
}

beforeEach(() => { native.reduced = true; native.loop.mockReset(); native.stop.mockReset(); });
afterEach(() => { act(() => tree?.unmount()); });

describe("SkeletonList", () => {
  it("shapes placeholders per variant and keeps the loading text for readers and tests", async () => {
    await mount(React.createElement(SkeletonList, { variant: "rows", rows: 4, label: "Loading issues", testID: "loading" }));
    expect(items()).toHaveLength(4);
    expect(text()).toContain("Loading issues");
    const host = tree.root.findAllByProps({ testID: "loading" }).find((node) => typeof node.type === "string")!;
    expect(host.props.accessibilityLiveRegion).toBe("polite");
    expect(host.props.accessibilityLabel).toBe("Loading issues");
    await act(async () => tree.update(React.createElement(MotionProvider, null,
      React.createElement(SkeletonList, { variant: "tiles", rows: 9, label: "Loading earnings", testID: "loading" }))));
    expect(items()).toHaveLength(3);
    await act(async () => tree.update(React.createElement(MotionProvider, null,
      React.createElement(SkeletonList, { variant: "cards", rows: 2, label: "Loading plan", testID: "loading" }))));
    expect(items()).toHaveLength(2);
  });

  it("holds still with reduced motion and pulses otherwise, stopping on unmount", async () => {
    await mount(React.createElement(SkeletonList, { rows: 1, label: "Loading" }));
    expect(native.loop).not.toHaveBeenCalled();
    act(() => tree.unmount());
    native.reduced = false;
    await mount(React.createElement(SkeletonList, { rows: 1, label: "Loading" }));
    expect(native.loop).toHaveBeenCalledTimes(3);
    act(() => tree.unmount());
    expect(native.stop).toHaveBeenCalledTimes(3);
  });
});
