import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallerEarningsRow, InstallerEarningsViewModel } from "./types";

const mocks = vi.hoisted(() => ({
  focused: true, syncVersion: 0, locale: "en", params: {} as { day?: string; focus?: string; project_id?: string },
  user: { id: "installer-a", company_id: "company-a", full_name: "Test Installer" },
  load: vi.fn(), push: vi.fn(), replace: vi.fn(),
}));
vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { router: { push: mocks.push, replace: mocks.replace }, useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]) };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user, syncVersion: mocks.syncVersion }) }));
vi.mock("@/modules/earnings/service", () => ({ loadInstallerEarnings: mocks.load }));

import EarningsScreen from "../../../app/earnings";

let tree: ReactTestRenderer;
const event = {} as never;
const row: InstallerEarningsRow = { id: "work-a", work_date: "2026-09-27", project_id: "project-a", project_name: "Tower A", door_label: "A-201", install_type_code: "ENTRANCE", install_type_label: "Entrance", quantity: 1, rate: "250.00", amount: "250.00" };
const view = (rows = [row]): InstallerEarningsViewModel => ({ source: "online", message: null, snapshot: { period_key: "2026-09", currency: "ILS", today_total: "250.00", month_total: "250.00", generated_at: null, days: [], install_types: [], rows } });
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");
const targets = (node: ReactTestInstance = tree.root) => node.findAllByType("pressable" as never);
const target = (label: string, node: ReactTestInstance = tree.root) => targets(node).find((item) => item.props.accessibilityLabel === label)!;
const byId = (id: string) => targets().find((item) => item.props.testID === id)!;
const press = (label: string) => act(() => target(label).props.onPress(event));
const openRow = (id = "work-a") => act(() => byId(`earnings-row-${id}`).props.onPress(event));
const modal = () => tree.root.findByType("modal" as never);
const total = () => tree.root.findAllByType("text" as never).find((node) => node.props.testID === "earnings-total")!.children.join("");
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
async function mount() { await act(async () => { tree = create(React.createElement(EarningsScreen)); }); }
async function update() { await act(async () => tree.update(React.createElement(EarningsScreen))); }

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 8, 27, 12));
  mocks.focused = true; mocks.syncVersion = 0; mocks.locale = "en"; mocks.params = {};
  mocks.user = { id: "installer-a", company_id: "company-a", full_name: "Test Installer" };
  mocks.load.mockResolvedValue(view());
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.useRealTimers(); });

describe("installer earnings screen", () => {
  it("does not display zero earnings or an empty ledger while loading", async () => {
    mocks.load.mockReturnValue(new Promise(() => {})); await mount();
    expect(total()).toBe("—"); expect(text()).toContain("Loading earnings");
    expect(text()).not.toContain("No earnings in this period");
  });
  it("distinguishes unavailable data from a confirmed zero total", async () => {
    mocks.load.mockResolvedValue({ snapshot: null, source: "unavailable", message: "offline" }); await mount();
    expect(total()).toBe("—"); expect(text()).toContain("Earnings unavailable"); expect(target("Retry")).toBeDefined();
  });
  it("opens all work after the first page rather than silently dropping rows", async () => {
    mocks.load.mockResolvedValue(view(Array.from({ length: 35 }, (_, index) => ({ ...row, id: `work-${index}`, door_label: `Door ${index}` }))));
    await mount(); press("Details"); expect(byId("earnings-row-work-34")).toBeUndefined();
    press("Show more work"); expect(byId("earnings-row-work-34")).toBeDefined();
    openRow("work-34"); expect(text(modal())).toContain("Door 34");
  });
  it("can collapse an expanded project and opens its correctly scoped issues", async () => {
    await mount(); press("Projects");
    const project = () => targets().find((node) => node.props.accessibilityLabel?.startsWith("Tower A."))!;
    act(() => project().props.onPress(event)); expect(project().props.accessibilityState.expanded).toBe(true);
    act(() => project().props.onPress(event)); expect(project().props.accessibilityState.expanded).toBe(false);
    act(() => project().props.onPress(event)); press("Open issues");
    expect(mocks.push).toHaveBeenCalledWith("/issues?projectId=project-a");
  });
  it("opens the work type's detail rows with matching totals", async () => {
    mocks.load.mockResolvedValue(view([row, { ...row, id: "extra", install_type_code: "ADDON", install_type_label: "Adjustment", amount: "50.00", rate: "50.00" }]));
    await mount();
    act(() => targets().find((node) => node.props.accessibilityRole === "button" && node.props.accessibilityLabel?.startsWith("Entrance."))!.props.onPress(event));
    expect(byId("earnings-row-work-a")).toBeDefined(); expect(byId("earnings-row-extra")).toBeUndefined();
    expect(total()).toContain("250.00");
  });
  it("shows negative work as a deduction with the original server amount", async () => {
    mocks.load.mockResolvedValue(view([{ ...row, rate: "-250.00", amount: "-250.00" }]));
    await mount(); press("Details"); openRow();
    expect(text(modal())).toContain("Deduction"); expect(text(modal())).toMatch(/-[^\d]*250\.00/);
    expect(text(modal())).toContain("Tower A"); expect(text(modal())).toContain("Rate");
  });
  it.each(["Close work details", "Dismiss work details"])("releases the overlay with %s", async (label) => {
    await mount(); press("Details"); openRow(); act(() => target(label, modal()).props.onPress(event));
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });
  it("releases the overlay on Android back and before project navigation", async () => {
    await mount(); press("Details"); openRow(); act(() => modal().props.onRequestClose());
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    openRow(); act(() => target("Open project", modal()).props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/project/project-a"); expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });
  it("opens the work date's calendar and does not fabricate a door ID", async () => {
    await mount(); press("Details"); openRow(); act(() => target("Open day's calendar", modal()).props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/calendar?day=2026-09-27");
  });
  it("handles an invalid deep-link date without crashing the formatter", async () => {
    mocks.params = { focus: "DAY", day: "2026-02-30" }; await mount();
    expect(mocks.load).toHaveBeenCalledWith("month", "2026-09-27"); expect(total()).toContain("250.00");
  });
  it("does not substitute another project when the selected project has no rows", async () => {
    mocks.params = { project_id: "missing" }; await mount();
    expect(total()).toContain("0.00"); expect(text()).toContain("No earnings for this project");
    expect(text()).not.toContain("Tower A");
  });
  it("charts the whole period by day and selects a day from its bar", async () => {
    mocks.load.mockResolvedValue(view([row, { ...row, id: "work-b", work_date: "2026-09-26", amount: "100.00" }]));
    await mount();
    const bars = targets().filter((item) => String(item.props.testID || "").startsWith("earnings-day-chart-"));
    expect(bars.map((bar) => bar.props.testID)).toEqual(["earnings-day-chart-2026-09-26", "earnings-day-chart-2026-09-27"]);
    expect(bars.map((bar) => bar.props.accessibilityState.selected)).toEqual([false, false]);
    press("Today");
    expect(byId("earnings-day-chart-2026-09-27").props.accessibilityState.selected).toBe(true);
    act(() => bars[0].props.onPress(event));
    expect(total()).toContain("100.00");
    expect(byId("earnings-day-chart-2026-09-26").props.accessibilityState.selected).toBe(true);
    expect(byId("earnings-day-chart-2026-09-27")).toBeDefined();
  });
  it("disables day navigation at boundaries and keeps a selected empty day", async () => {
    mocks.params = { focus: "DAY", day: "2026-09-26" }; await mount();
    expect(total()).toContain("0.00"); expect(target("Previous day").props.disabled).toBe(true);
    expect(target("Next day").props.disabled).toBe(false);
    await act(async () => target("Next day").props.onPress(event)); expect(total()).toContain("250.00");
    expect(target("Next day").props.disabled).toBe(true);
  });
  it("refreshes on focus and sync without accepting a stale response", async () => {
    const old = deferred<InstallerEarningsViewModel>(); mocks.load.mockReturnValueOnce(old.promise); await mount();
    mocks.focused = false; await update(); mocks.focused = true; await update();
    await act(async () => old.resolve(view([{ ...row, amount: "999.00" }]))); expect(total()).toContain("250.00");
    mocks.load.mockResolvedValue(view([{ ...row, amount: "300.00" }])); mocks.syncVersion += 1; await update(); expect(total()).toContain("300.00");
  });
  it("hides the old account's pay and open work while loading a different account", async () => {
    await mount(); press("Details"); openRow(); mocks.load.mockReturnValue(new Promise(() => {}));
    mocks.user = { ...mocks.user, id: "installer-b", company_id: "company-b" }; await update();
    expect(total()).toBe("—"); expect(text()).not.toContain("Tower A"); expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });
  it("does not show the previous month as zero pay while a historical month loads", async () => {
    await mount(); const pending = deferred<InstallerEarningsViewModel>(); mocks.load.mockReturnValue(pending.promise);
    mocks.params = { focus: "DAY", day: "2025-08-31" }; await update();
    expect(total()).toBe("—"); expect(text()).toContain("2025");
    expect(mocks.load).toHaveBeenLastCalledWith("month", "2025-08-31");
    await act(async () => pending.resolve({ ...view([{ ...row, work_date: "2025-08-31" }]), snapshot: { ...view().snapshot!, period_key: "2025-08", rows: [{ ...row, work_date: "2025-08-31" }] } }));
    expect(total()).toContain("250.00");
  });
  it("marks cached data in the work details and preserves Hebrew modal direction", async () => {
    mocks.locale = "he"; mocks.load.mockResolvedValue({ ...view(), source: "cache", message: "offline" });
    await mount(); press("פירוט"); openRow();
    expect(text(modal())).toContain("עותק לא מקוון");
    expect(modal().findByType("safe-area" as never).props.style).toContainEqual({ direction: "rtl" });
  });
});
