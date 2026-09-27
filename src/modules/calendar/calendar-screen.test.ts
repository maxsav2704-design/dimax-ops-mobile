import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallerCalendarEvent, InstallerCalendarViewModel } from "./types";

const mocks = vi.hoisted(() => ({
  focused: true, syncVersion: 0, locale: "en", params: {} as { day?: string }, user: { id: "installer-a", company_id: "company-a" },
  load: vi.fn(), push: vi.fn(), waze: vi.fn(),
}));
vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    router: { push: mocks.push }, useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]),
  };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ syncVersion: mocks.syncVersion, user: mocks.user }) }));
vi.mock("@/modules/calendar/service", () => ({ loadInstallerCalendar: mocks.load }));
vi.mock("@/modules/projects/external-actions", () => ({ openProjectExternalAction: mocks.waze }));

import CalendarScreen from "../../../app/calendar";

let tree: ReactTestRenderer;
const event = {} as never;
const visit: InstallerCalendarEvent = {
  id: "visit-a", title: "Install floor 2", event_type: "installation", starts_at: "2026-09-27T06:00:00Z", ends_at: "2026-09-27T07:00:00Z",
  location: "Tower A", description: "Apartment 201, entrance door", project_id: "project-a", waze_url: "https://waze.com/ul?q=Tower+A", installer_ids: ["installer-a"],
};
const view = (items: InstallerCalendarEvent[] = [visit]): InstallerCalendarViewModel => ({
  source: "online", message: null,
  snapshot: { range_key: "7d", starts_at: "2026-09-27T00:00:00Z", ends_at: "2026-10-04T00:00:00Z", generated_at: null, items },
});
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");
const buttons = (label: string, node: ReactTestInstance = tree.root) => node.findAllByType("pressable" as never)
  .filter((target) => target.props.accessibilityRole === "button" && target.props.accessibilityLabel === label);
const button = (label: string, node: ReactTestInstance = tree.root) => buttons(label, node)[0];
const openVisit = () => {
  const target = tree.root.findAllByType("pressable" as never).find((node) => node.props.accessibilityLabel?.startsWith("Install floor 2."))!;
  act(() => target.props.onPress(event));
};
const modal = () => tree.root.findByType("modal" as never);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
async function mount() { await act(async () => { tree = create(React.createElement(CalendarScreen)); }); }
async function update() { await act(async () => tree.update(React.createElement(CalendarScreen))); }

beforeEach(() => {
  vi.resetAllMocks(); mocks.focused = true; mocks.syncVersion = 0; mocks.params = {}; mocks.locale = "en";
  mocks.user = { id: "installer-a", company_id: "company-a" };
  mocks.load.mockResolvedValue(view());
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("installer calendar screen", () => {
  it("does not claim there are no assigned visits while loading", async () => {
    mocks.load.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(text()).not.toContain("No assigned visits");
    expect(text()).not.toContain("Unavailable");
    expect(text()).toContain("Loading plan");
  });

  it("distinguishes an unavailable plan from a genuinely empty plan", async () => {
    mocks.load.mockResolvedValue({ snapshot: null, source: "unavailable", message: "offline" });
    await mount();
    expect(text()).toContain("Plan unavailable");
    expect(text()).not.toContain("No assigned visits");
  });

  it("preserves the incoming day while its events are still loading", async () => {
    mocks.params = { day: "2026-09-27" };
    const pending = deferred<InstallerCalendarViewModel>();
    mocks.load.mockReturnValue(pending.promise);
    await mount();
    await act(async () => pending.resolve(view()));
    expect(mocks.load).toHaveBeenCalledWith("7d", "2026-09-27");
    expect(button("Open earnings for this day")).toBeDefined();
    act(() => button("Open earnings for this day").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/earnings?focus=DAY&day=2026-09-27");
  });

  it("presents event details above the calendar and releases the overlay on Android back", async () => {
    await mount(); openVisit();
    expect(modal().props.visible).toBe(true);
    expect(text(modal())).toContain("Apartment 201, entrance door");
    act(() => modal().props.onRequestClose());
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });

  it("preserves RTL in the Hebrew modal without reversing the time range", async () => {
    mocks.locale = "he";
    await mount(); openVisit();
    expect(modal().findByType("safe-area" as never).props.style).toContainEqual({ direction: "rtl" });
    expect(text(modal())).toMatch(/\u2066\d{2}:\d{2} – \d{2}:\d{2}\u2069/u);
  });

  it("closes the detail modal before navigating to all assigned doors", async () => {
    await mount(); openVisit();
    act(() => button("Open doors", modal()).props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/project/project-a?doorStatus=ALL");
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });

  it("opens project issues without treating the visit title as a door identifier", async () => {
    mocks.load.mockResolvedValue(view([{ ...visit, event_type: "inspection" }]));
    await mount(); openVisit();
    expect(text(modal())).toContain("Inspection");
    act(() => button("Open issues", modal()).props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/issues?projectId=project-a");
  });

  it("does not show fake project actions for an unlinked meeting", async () => {
    mocks.load.mockResolvedValue(view([{ ...visit, event_type: "meeting", project_id: null }]));
    await mount(); openVisit();
    expect(text(modal())).toContain("Meeting");
    expect(buttons("Open job", modal())).toHaveLength(0);
    expect(buttons("Open doors", modal())).toHaveLength(0);
  });

  it("shows a Waze error inside the open details", async () => {
    mocks.waze.mockRejectedValue(new Error("Waze unavailable"));
    await mount(); openVisit();
    await act(async () => button("Open Waze", modal()).props.onPress(event));
    expect(text(modal())).toContain("Waze unavailable");
    expect(modal().props.visible).toBe(true);
  });

  it("reloads on focus and background sync and ignores a stale response", async () => {
    const old = deferred<InstallerCalendarViewModel>();
    mocks.load.mockReturnValueOnce(old.promise);
    await mount();
    mocks.focused = false; await update();
    mocks.focused = true; await update();
    await act(async () => old.resolve(view([{ ...visit, title: "Obsolete visit" }])));
    expect(text()).not.toContain("Obsolete visit");
    expect(text()).toContain("Install floor 2");
    mocks.load.mockResolvedValue(view([{ ...visit, title: "Changed by admin" }]));
    mocks.syncVersion += 1; await update();
    expect(text()).toContain("Changed by admin");
  });

  it("keeps the cached plan actionable while visibly marking it offline", async () => {
    mocks.load.mockResolvedValue({ ...view(), source: "cache", message: "offline" });
    await mount(); openVisit();
    expect(text()).toContain("Offline copy");
    act(() => button("Open job", modal()).props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/project/project-a");
  });

  it.each(["Close visit details", "Dismiss visit details"])("dismisses details with %s", async (label) => {
    await mount(); openVisit();
    act(() => button(label, modal()).props.onPress(event));
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });

  it("launches Waze only once for repeated presses while opening", async () => {
    const opening = deferred<void>();
    mocks.waze.mockReturnValue(opening.promise);
    await mount(); openVisit();
    const target = button("Open Waze", modal());
    act(() => { target.props.onPress(event); target.props.onPress(event); });
    expect(mocks.waze).toHaveBeenCalledTimes(1);
    expect(button("Open Waze", modal()).props.disabled).toBe(true);
    await act(async () => opening.resolve());
    expect(button("Open Waze", modal()).props.disabled).toBe(false);
  });

  it("removes open details when the refreshed plan no longer contains the visit", async () => {
    await mount(); openVisit();
    mocks.load.mockResolvedValue(view([]));
    mocks.syncVersion += 1; await update();
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    expect(text()).toContain("No assigned visits");
  });

  it("hides the previous company's visits immediately when the account changes", async () => {
    await mount(); openVisit();
    const nextAccount = deferred<InstallerCalendarViewModel>();
    mocks.load.mockReturnValue(nextAccount.promise);
    mocks.user = { id: "installer-b", company_id: "company-b" }; await update();
    expect(text()).not.toContain("Install floor 2");
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    await act(async () => nextAccount.resolve(view([])));
    expect(text()).toContain("No assigned visits");
  });
});
