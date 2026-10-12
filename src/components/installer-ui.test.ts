import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ locale: "he" as "en" | "ru" | "he", pathname: "/projects" }));

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("expo-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => children, usePathname: () => mocks.pathname }));
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale, isRTL: mocks.locale === "he" }) }));
vi.mock("@/components/sync-status-bar", () => ({ SyncStatusBar: () => null }));

import { InstallerBottomNav } from "./installer-ui";

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });
const tabLabels = () => tree.root.findAllByType("pressable" as never)
  .filter((node) => node.props.accessibilityRole === "tab").map((node) => node.props.accessibilityLabel as string);

describe("InstallerBottomNav", () => {
  it("gives every tab a distinct label in each language", () => {
    for (const locale of ["en", "ru", "he"] as const) {
      mocks.locale = locale;
      act(() => { tree = create(React.createElement(InstallerBottomNav)); });
      const labels = tabLabels();
      expect(labels).toHaveLength(5);
      expect(new Set(labels).size).toBe(5);
      act(() => tree.unmount());
    }
  });

  it("names the plan tab distinctly from the work journal in Hebrew", () => {
    mocks.locale = "he";
    act(() => { tree = create(React.createElement(InstallerBottomNav)); });
    expect(tabLabels()).toEqual(["עבודות", "תכנית", "יומן עבודה", "שכר", "אני"]);
  });
});
