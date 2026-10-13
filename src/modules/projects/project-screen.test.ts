import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalProjectWorkspace } from "./local-workspace";

const mocks = vi.hoisted(() => ({
  params: { id: "project-a" } as { id: string; doorId?: string },
  focused: true,
  syncVersion: 0,
  locale: "en" as "en" | "ru" | "he",
  load: vi.fn(), refresh: vi.fn(), earnings: vi.fn(), sync: vi.fn(),
  install: vi.fn(), notInstalled: vi.fn(), addon: vi.fn(), push: vi.fn(),
  haptic: vi.fn(),
}));

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("expo-haptics", () => ({
  notificationAsync: mocks.haptic, impactAsync: vi.fn(),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" }, ImpactFeedbackStyle: { Light: "light" },
}));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    router: { push: mocks.push, back: vi.fn() },
    useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]);
    },
  };
});
vi.mock("@/providers/AppProviders", () => ({
  useI18n: () => ({ locale: mocks.locale }),
  useAuth: () => ({ syncVersion: mocks.syncVersion }),
}));
vi.mock("@/modules/projects/local-workspace", async (original) => ({
  ...await original<typeof import("./local-workspace")>(), loadLocalProjectWorkspace: mocks.load,
}));
vi.mock("@/modules/projects/repository", () => ({}));
vi.mock("@/modules/prices/repository", () => ({}));
vi.mock("@/lib/workspace-context", () => ({}));
vi.mock("@/modules/projects/service", () => ({
  canRefreshProjectDetails: (pending: number) => pending === 0,
  isProjectAccessRevoked: () => false,
  refreshProjectDetails: mocks.refresh,
}));
vi.mock("@/modules/projects/external-actions", () => ({ buildProjectExternalActions: () => [], openProjectExternalAction: vi.fn() }));
vi.mock("@/modules/doors/actions", () => ({
  markDoorInstalled: mocks.install, markDoorNotInstalled: mocks.notInstalled, addAddonFact: mocks.addon,
}));
vi.mock("@/modules/earnings/service", () => ({ loadInstallerEarnings: mocks.earnings }));
vi.mock("@/modules/sync/service", () => ({ runSync: mocks.sync }));

import ProjectDetailsScreen from "../../../app/project/[id]";
import { createEmptyLocalProjectWorkspace } from "./local-workspace";

let tree: ReactTestRenderer;
let workspace: LocalProjectWorkspace;
const event = {} as never;
const buttons = (label: string) => tree.root.findAllByType("pressable" as never)
  .filter((node) => node.props.accessibilityLabel === label && node.props.accessibilityRole === "button");
const button = (label: string) => {
  const node = buttons(label)[0];
  if (!node) throw new Error(`Button not found: ${label}`);
  return node;
};
const input = (label: string) => tree.root.findAllByType("input" as never)
  .find((node) => node.props.accessibilityLabel === label)!;
const tabs = (label: string) => tree.root.findAllByType("pressable" as never)
  .filter((node) => node.props.accessibilityLabel === label && node.props.accessibilityRole === "tab");
const doorRows = () => tree.root.findAllByType("pressable" as never)
  .filter((node) => node.props.accessibilityRole === "button" && node.props.accessibilityState?.selected !== undefined);
const sheets = () => tree.root.findAllByType("modal" as never);
const openFirstDoor = () => act(() => doorRows()[0].props.onPress(event));
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never)
  .flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
async function mount() {
  await act(async () => {
    tree = create(React.createElement(ProjectDetailsScreen));
  });
}
async function focus(value: boolean) {
  mocks.focused = value;
  await act(async () => { tree.update(React.createElement(ProjectDetailsScreen)); });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.params = { id: "project-a" };
  mocks.focused = true;
  mocks.syncVersion = 0;
  mocks.locale = "en";
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  workspace = {
    ...createEmptyLocalProjectWorkspace("project-a"),
    project: { id: "project-a", name: "Tower A", address: "Test address", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "NORMAL", waze_url: null },
    doors: [{ id: "door-a", project_id: "project-a", door_type_id: "entrance", unit_label: "A-201", floor_label: "2", apartment_number: "201", house_number: "A", order_number: null, location_code: null, door_marking: null, status: "PENDING", is_locked: false, reason_id: null, comment: null, version: 1, updated_at: null }],
    doorTypes: [{ id: "entrance", code: "ENTRANCE", name: "Entrance" }],
    reasons: [{ id: "reason-a", code: "NO_ACCESS", name: "No access" }],
    addonTypes: [{ id: "addon-a", name: "Adjustment", unit: "pcs", qty_planned: "3" }],
    queueSummary: { total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null },
  };
  mocks.load.mockImplementation(async () => workspace);
  mocks.earnings.mockResolvedValue({ snapshot: null, source: "unavailable", message: null });
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); });

describe("project execution screen", () => {
  function confirmedPrices() {
    workspace.factoryPrices = { status: "ready", snapshot: {
      price_list_id: "price-list-v2", version: 2, currency: "ILS", effective_from: "2026-01-01T00:00:00Z",
      items: [
        { kind: "DOOR", target_id: "entrance", unit: "pcs", rate: "250.00" },
        { kind: "ADDON", target_id: "addon-a", unit: "pcs", rate: "9.00" },
      ],
    } };
  }
  const priceText = (id: string) => text(tree.root.findByProps({ testID: id }));

  it("shows read-only confirmed rates and estimates without passing money into work commands", async () => {
    confirmedPrices();
    await mount(); openFirstDoor();
    expect(priceText("door-work-price")).toContain("250.00 ILS");
    expect(priceText("door-work-price")).toContain("Factory confirmed");
    expect(tree.root.findByProps({ testID: "door-work-price" }).findAllByType("input" as never)).toHaveLength(0);
    act(() => input("Completed quantity").props.onChangeText("1,50"));
    expect(priceText("addon-work-price")).toContain("13.50 ILS");
    expect(priceText("addon-work-price")).toContain("Estimated, not accrued");
    await act(async () => button("Save completed add-on").props.onPress(event));
    expect(mocks.addon).toHaveBeenCalledExactlyOnceWith("project-a", "addon-a", "1.50", "");
    await act(async () => button("Installed").props.onPress(event));
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith("project-a", "door-a");
    expect(mocks.haptic).toHaveBeenLastCalledWith("success");
  });

  it("does not present the current rate as the earning for an already installed door", async () => {
    confirmedPrices();
    workspace.doors[0].status = "INSTALLED";
    workspace.doors[0].is_locked = true;
    await mount(); openFirstDoor();
    expect(priceText("door-work-price")).not.toContain("250.00");
    act(() => button("View project earnings").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/earnings?project_id=project-a");
  });

  it("opens the saved conflict without estimating it from a newer price list", async () => {
    confirmedPrices();
    workspace.doors[0].status = "INSTALLED";
    workspace.pendingEvents = [{ client_event_id: "event-1", project_id: "project-a", type: "DOOR_SET_STATUS",
      payload: { door_id: "door-a", status: "INSTALLED", price_list_id: "price-list-v1" },
      status: "BLOCKED", error: "CONFLICT_FACTORY_PRICE", attempts: 1, happened_at: "2026-01-02T10:00:00Z",
      created_at: "2026-01-02T10:00:00Z", next_retry_at: null, last_attempt_at: null }];
    await mount(); openFirstDoor();
    expect(priceText("door-work-price")).toContain("Price needs review");
    expect(priceText("door-work-price")).not.toContain("250.00");
    act(() => button("Open work queue").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/sync-queue");
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("updates price availability when selecting a different add-on", async () => {
    confirmedPrices();
    workspace.addonTypes.push({ id: "addon-b", name: "Different work", unit: "m", qty_planned: null });
    await mount();
    expect(priceText("addon-work-price")).toContain("9.00 ILS");
    act(() => tabs("Different work")[0].props.onPress(event));
    expect(priceText("addon-work-price")).toContain("no rate");
    expect(priceText("addon-work-price")).not.toContain("9.00 ILS");
  });

  it.each(["ru", "he"] as const)("renders price labels in %s", async (locale) => {
    confirmedPrices(); mocks.locale = locale;
    await mount(); openFirstDoor();
    const content = priceText("door-work-price");
    expect(content).toContain(locale === "ru" ? "Подтверждено заводом" : "באישור המפעל");
    expect(content).not.toContain("Factory confirmed");
  });

  it("opens a linked door's sheet once and does not reopen it after closing on later sync updates", async () => {
    mocks.params.doorId = "door-a";
    await mount();
    expect(sheets()).toHaveLength(1);
    expect(text(tree.root.findByProps({ testID: "project-door-details" }))).toContain("A-201");
    act(() => sheets()[0].props.onRequestClose());
    expect(sheets()).toHaveLength(0);
    mocks.syncVersion += 1;
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(sheets()).toHaveLength(0);
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it("keeps the sheet closed on an ordinary project visit or for an unavailable linked door", async () => {
    await mount();
    expect(sheets()).toHaveLength(0);
    expect(buttons("Installed")).toHaveLength(0);
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    mocks.params.doorId = "missing";
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(sheets()).toHaveLength(0);
  });
  it("opens the sheet again for a new exact door link in the same project", async () => {
    workspace.doors.push({ ...workspace.doors[0], id: "door-b", unit_label: "A-202" });
    mocks.params.doorId = "door-a";
    await mount();
    act(() => sheets()[0].props.onRequestClose());
    mocks.params = { id: "project-a", doorId: "door-b" };
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(sheets()).toHaveLength(1);
    expect(text(tree.root.findByProps({ testID: "project-door-details" }))).toContain("A-202");
  });
  it("opens the sheet from a door row, closes it from the backdrop and keeps the row selected", async () => {
    await mount();
    openFirstDoor();
    expect(sheets()).toHaveLength(1);
    expect(buttons("Installed")).toHaveLength(1);
    act(() => button("Close door card").props.onPress(event));
    expect(sheets()).toHaveLength(0);
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    openFirstDoor();
    act(() => button("Back to doors").props.onPress(event));
    expect(sheets()).toHaveLength(0);
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it("selects an exact linked door even when labels are duplicated", async () => {
    workspace.doors.push({ ...workspace.doors[0], id: "door-b" });
    mocks.params.doorId = "door-b";
    await mount();
    await act(async () => button("Installed").props.onPress(event));
    expect(mocks.install).toHaveBeenCalledWith("project-a", "door-b");
  });
  it("does not select another door for a missing door ID", async () => {
    mocks.params.doorId = "missing";
    await mount();
    expect(text()).toContain("The linked door is no longer assigned");
    expect(buttons("Installed")).toHaveLength(0);
  });
  it("preserves a later manual door selection when returning to a linked project", async () => {
    workspace.doors.push({ ...workspace.doors[0], id: "door-b", unit_label: "A-202" });
    mocks.params.doorId = "door-b"; await mount();
    act(() => doorRows().find((row) => row.props.accessibilityLabel.includes("A-201"))!.props.onPress(event));
    await focus(false); await focus(true);
    await act(async () => button("Installed").props.onPress(event));
    expect(mocks.install).toHaveBeenCalledWith("project-a", "door-a");
  });
  it("offers the next open door in display order and wraps around the floor list", async () => {
    workspace.doors.push(
      { ...workspace.doors[0], id: "door-b", unit_label: "A-202", apartment_number: "202", status: "PENDING" },
      { ...workspace.doors[0], id: "door-c", unit_label: "A-203", apartment_number: "203", status: "INSTALLED", is_locked: true },
    );
    await mount(); openFirstDoor();
    const details = () => text(tree.root.findByProps({ testID: "project-door-details" }));
    expect(details()).toContain("A-201");
    const next = () => tree.root.findAllByType("pressable" as never).find((node) => node.props.testID === "project-next-door");
    expect(next()!.props.accessibilityLabel).toBe("Next door: A-202 · 2 left");
    act(() => next()!.props.onPress(event));
    expect(details()).toContain("A-202");
    expect(doorRows().find((row) => row.props.accessibilityLabel.includes("A-202"))!.props.accessibilityState.selected).toBe(true);
    expect(next()!.props.accessibilityLabel).toBe("Next door: A-201 · 2 left");
    mocks.install.mockResolvedValue(undefined);
    await act(async () => button("Installed").props.onPress(event));
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith("project-a", "door-b");
    expect(details()).toContain("A-202");
  });

  it("celebrates a floor the installer just finished, once, and offers the next floor", async () => {
    workspace.doors.push({ ...workspace.doors[0], id: "door-b", unit_label: "A-301", floor_label: "3", apartment_number: "301" });
    mocks.install.mockImplementation(async () => {
      workspace = { ...workspace, doors: workspace.doors.map((door) => door.id === "door-a" ? { ...door, status: "INSTALLED", is_locked: true } : door) };
    });
    await mount(); openFirstDoor();
    expect(text()).not.toContain("Floor 2 complete");
    await act(async () => button("Installed").props.onPress(event));
    expect(sheets()).toHaveLength(0);
    expect(text()).toContain("Floor 2 complete");
    expect(text()).toContain("1 / 1 doors installed");
    expect(mocks.haptic).toHaveBeenCalledWith("success");
    act(() => button("Next floor: 3").props.onPress(event));
    expect(tabs("Floor 3. Doors: 1")[0].props.accessibilityState.selected).toBe(true);
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    expect(text()).not.toContain("Floor 2 complete");
    mocks.syncVersion += 1;
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(text()).not.toContain("Floor 2 complete");
  });

  it("celebrates the whole project instead of its last floor and never on a plain visit", async () => {
    workspace.doors[0] = { ...workspace.doors[0], status: "INSTALLED", is_locked: true };
    await mount();
    expect(text()).not.toContain("Project complete");
    expect(text()).not.toContain("Floor 2 complete");
    workspace = { ...workspace, doors: [...workspace.doors, { ...workspace.doors[0], id: "door-b", unit_label: "A-301", floor_label: "3", status: "PENDING", is_locked: false }] };
    mocks.syncVersion += 1;
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    act(() => tabs("Floor 3. Doors: 1")[0].props.onPress(event));
    openFirstDoor();
    mocks.install.mockImplementation(async () => {
      workspace = { ...workspace, doors: workspace.doors.map((door) => ({ ...door, status: "INSTALLED", is_locked: true })) };
    });
    await act(async () => button("Installed").props.onPress(event));
    expect(text()).toContain("Project complete");
    expect(text()).not.toContain("Floor 3 complete");
    expect(buttons("Next floor: 2")).toHaveLength(0);
    act(() => button("Dismiss").props.onPress(event));
    expect(text()).not.toContain("Project complete");
  });

  it("keeps the compact progress summary expandable without changing door selection", async () => {
    await mount();
    expect(button("Door progress").props.accessibilityState.expanded).toBe(false);
    act(() => button("Door progress").props.onPress(event));
    expect(button("Door progress").props.accessibilityState.expanded).toBe(true);
    expect(text()).toContain("0 Locked");
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("switches floors and opens the exact door without recording any work", async () => {
    workspace.doors.push({ ...workspace.doors[0], id: "door-b", floor_label: "3", unit_label: "A-301-ENTRANCE-DOOR-01", apartment_number: "301" });
    await mount();
    expect(doorRows()).toHaveLength(1);
    act(() => tabs("Floor 3. Doors: 1")[0].props.onPress(event));
    expect(doorRows()).toHaveLength(1);
    expect(text(doorRows()[0])).toContain("A-301-ENTRANCE-DOOR-01");
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    act(() => tabs("Show all floors")[0].props.onPress(event));
    expect(doorRows()).toHaveLength(2);
    act(() => doorRows()[0].props.onPress(event));
    expect(doorRows()[0].props.accessibilityState.selected).toBe(true);
    expect(mocks.install).not.toHaveBeenCalled();
    await act(async () => button("Installed").props.onPress(event));
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith("project-a", "door-a");
  });

  it("keeps advanced filters applied when collapsed and resets them from an empty result", async () => {
    workspace.doors[0].order_number = "ORDER-A";
    workspace.doors[0].location_code = "ENTRANCE";
    workspace.doors.push({ ...workspace.doors[0], id: "door-b", unit_label: "A-202", apartment_number: "202", order_number: "ORDER-B", location_code: "TECHNICAL" });
    await mount();
    expect(tabs("ORDER-B")).toHaveLength(0);
    act(() => button("Advanced filters").props.onPress(event));
    expect(button("Advanced filters").props.accessibilityState.expanded).toBe(true);
    act(() => tabs("ORDER-B")[0].props.onPress(event));
    expect(doorRows()).toHaveLength(1);
    expect(text(doorRows()[0])).toContain("A-202");
    act(() => button("Advanced filters").props.onPress(event));
    expect(tabs("ORDER-B")).toHaveLength(0);
    expect(doorRows()).toHaveLength(1);
    act(() => input("Search doors").props.onChangeText("not-found"));
    expect(text()).toContain("No matching doors");
    act(() => button("Reset filters").props.onPress(event));
    expect(doorRows()).toHaveLength(2);
    expect(input("Search doors").props.value).toBe("");
  });

  it("keeps issue counts visible and expands the list without losing navigation", async () => {
    workspace.issues = [{ id: "issue-a", project_id: "project-a", door_id: "door-a", status: "OPEN", title: "Access blocked", details: "Call the supervisor" }];
    await mount();
    expect(text()).toContain("Open: 1");
    expect(button("Project issues").props.accessibilityState.expanded).toBe(false);
    expect(buttons("Access blocked. A-201")).toHaveLength(0);
    act(() => button("Project issues").props.onPress(event));
    expect(buttons("Access blocked. A-201")).toHaveLength(1);
    act(() => button("Access blocked. A-201").props.onPress(event));
    expect(input("Search doors").props.value).toBe("A-201");
    act(() => button("All project issues").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/issues?projectId=project-a");
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("keeps closed issue history without marking its floor or door as problematic", async () => {
    workspace.issues = [{ id: "issue-a", project_id: "project-a", door_id: "door-a", status: "CLOSED", title: "Resolved access", details: null }];
    await mount();
    expect(text()).toContain("Open: 0");
    expect(tabs("Floor 2. Doors: 1")).toHaveLength(1);
    act(() => tabs("Issues")[0].props.onPress(event));
    expect(doorRows()).toHaveLength(0);
    expect(workspace.issues[0].status).toBe("CLOSED");
  });

  it.each([
    ["ru", "Этаж 2. Двери: 1", "Двери: 1"],
    ["he", "קומה 2. דלתות: 1", "דלתות: 1"],
  ] as const)("keeps floor names and counts localized in %s", async (locale, floorLabel, countLabel) => {
    mocks.locale = locale;
    await mount();
    expect(tabs(floorLabel)).toHaveLength(1);
    expect(text()).toContain(countLabel);
    expect(text()).not.toContain("1 дверей");
  });

  it("queues an add-on once for a double tap before React rerenders", async () => {
    const pending = deferred();
    mocks.addon.mockReturnValue(pending.promise);
    await mount();
    const press = button("Save completed add-on").props.onPress;
    act(() => { press(event); press(event); });
    expect(mocks.addon).toHaveBeenCalledExactlyOnceWith("project-a", "addon-a", "1", "");
    expect(button("Save completed add-on").props.disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(text()).toContain("Saved on this device");
  });

  it("queues the selected door once and blocks sync until saving finishes", async () => {
    const pending = deferred();
    mocks.install.mockReturnValue(pending.promise);
    await mount(); openFirstDoor();
    const install = button("Installed").props.onPress;
    const sync = button("Sync now").props.onPress;
    act(() => { install(event); install(event); sync(event); });
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith("project-a", "door-a");
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(tabs("Floor 2. Doors: 1")[0].props.disabled).toBe(true);
    await act(async () => pending.resolve());
  });

  it("keeps failed add-on input for retry and shows the error next to the action", async () => {
    mocks.addon.mockRejectedValueOnce(new Error("Local storage unavailable"));
    await mount();
    act(() => {
      input("Completed quantity").props.onChangeText("2");
      input("Add-on comment").props.onChangeText("Second visit");
    });
    await act(async () => button("Save completed add-on").props.onPress(event));
    expect(input("Completed quantity").props.value).toBe("2");
    const notice = tree.root.findByProps({ testID: "project-action-addon" });
    expect(text(notice)).toContain("Local storage unavailable");
    expect(mocks.haptic).toHaveBeenCalledExactlyOnceWith("error");
    await act(async () => button("Save completed add-on").props.onPress(event));
    expect(mocks.addon).toHaveBeenCalledTimes(2);
  });

  it("does not report an already saved add-on as failed when reloading the view fails", async () => {
    await mount();
    mocks.load.mockRejectedValueOnce(new Error("View reload failed"));
    await act(async () => button("Save completed add-on").props.onPress(event));
    expect(mocks.addon).toHaveBeenCalledOnce();
    expect(text()).toContain("Saved on this device");
    expect(text()).toContain("Could not refresh the view");
    expect(mocks.haptic.mock.calls).toEqual([["success"], ["warning"]]);
    expect(input("Completed quantity").props.value).toBe("1");
  });

  it("submits the not-installed reason and comment once", async () => {
    const pending = deferred();
    mocks.notInstalled.mockReturnValue(pending.promise);
    await mount(); openFirstDoor();
    act(() => button("Not installed").props.onPress(event));
    act(() => input("Door comment").props.onChangeText("Apartment closed"));
    const press = button("Confirm not installed").props.onPress;
    act(() => { press(event); press(event); });
    expect(mocks.notInstalled).toHaveBeenCalledExactlyOnceWith("project-a", "door-a", "reason-a", "Apartment closed");
    await act(async () => pending.resolve());
    expect(buttons("Confirm not installed")).toHaveLength(0);
  });

  it("reloads local status when returning from the sync queue", async () => {
    await mount(); openFirstDoor();
    expect(buttons("Installed")).toHaveLength(1);
    act(() => button("Open queue").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/sync-queue");
    await focus(false);
    workspace = { ...workspace, doors: workspace.doors.map((door) => ({ ...door, status: "INSTALLED", is_locked: true })) };
    await focus(true);
    expect(buttons("Installed")).toHaveLength(0);
  });

  it("updates the focused project after background sync", async () => {
    await mount(); openFirstDoor();
    workspace = { ...workspace, doors: workspace.doors.map((door) => ({ ...door, status: "INSTALLED", is_locked: true })) };
    mocks.syncVersion += 1;
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(buttons("Installed")).toHaveLength(0);
  });

  it("shows the saved door and queued action without requesting a server snapshot", async () => {
    await mount(); openFirstDoor();
    mocks.refresh.mockClear();
    mocks.install.mockImplementation(async () => {
      workspace = {
        ...workspace,
        doors: workspace.doors.map((door) => ({ ...door, status: "INSTALLED", is_locked: true })),
        pendingEvents: [{ client_event_id: "local-1", type: "DOOR_SET_STATUS", project_id: "project-a", payload: { door_id: "door-a", status: "INSTALLED" }, status: "PENDING", happened_at: null, error: null, attempts: 0, next_retry_at: null, last_attempt_at: null, created_at: "2026-09-26T10:00:00Z" }],
        queueSummary: { total: 1, pending: 1, failed: 0, blocked: 0, ready_to_send: 1, next_retry_at: null },
      };
    });
    await act(async () => button("Installed").props.onPress(event));
    expect(buttons("Installed")).toHaveLength(0);
    expect(text()).toContain("1 queued");
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => button("Open queue").props.onPress(event));
    expect(mocks.push).toHaveBeenCalledWith("/sync-queue");
  });

  it("keeps a completed save acknowledgement when navigation hides the screen", async () => {
    const pending = deferred();
    mocks.addon.mockReturnValue(pending.promise);
    await mount();
    act(() => input("Completed quantity").props.onChangeText("2"));
    act(() => button("Save completed add-on").props.onPress(event));
    await focus(false);
    await act(async () => pending.resolve());
    await focus(true);
    expect(text()).toContain("Saved on this device");
    expect(input("Completed quantity").props.value).toBe("1");
    expect(mocks.addon).toHaveBeenCalledOnce();
  });

  it("loads another project during a save without attaching the old result to it", async () => {
    const pending = deferred();
    mocks.addon.mockReturnValue(pending.promise);
    await mount();
    act(() => button("Save completed add-on").props.onPress(event));
    mocks.params = { id: "project-b" };
    workspace = { ...workspace, projectId: "project-b", project: { ...workspace.project!, id: "project-b", name: "Tower B" }, doors: [] };
    await act(async () => tree.update(React.createElement(ProjectDetailsScreen)));
    expect(text()).toContain("Tower B");
    await act(async () => pending.resolve());
    expect(text()).not.toContain("Saved on this device");
  });
});
