import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isRTL: false }));

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.isRTL ? "he" : "en", isRTL: mocks.isRTL }) }));

import { DirectionalChevron, chevronIcon } from "./directional-chevron";

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

describe("chevronIcon", () => {
  it("points along the reading direction in both scripts", () => {
    expect(chevronIcon(false)).toBe("chevron-forward");
    expect(chevronIcon(false, "back")).toBe("chevron-back");
    expect(chevronIcon(true)).toBe("chevron-back");
    expect(chevronIcon(true, "back")).toBe("chevron-forward");
  });
});

describe("DirectionalChevron", () => {
  it("flips with the active locale without the caller checking it", () => {
    mocks.isRTL = true;
    act(() => { tree = create(React.createElement(DirectionalChevron, { color: "#fff", size: 12 })); });
    expect(tree.root.findByType("icon" as never).props).toMatchObject({ name: "chevron-back", size: 12, color: "#fff" });
    mocks.isRTL = false;
    act(() => { tree.update(React.createElement(DirectionalChevron, { color: "#fff", direction: "back" })); });
    expect(tree.root.findByType("icon" as never).props).toMatchObject({ name: "chevron-back", size: 16 });
  });
});
