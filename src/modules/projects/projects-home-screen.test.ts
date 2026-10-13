import React from "react";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectListItem } from "./types";
import { NetworkError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  focused: true, syncVersion: 0, locale: "en", user: { id: "installer-a", company_id: "company-a", full_name: "Installer A" },
  projects: vi.fn(), doors: vi.fn(), issues: vi.fn(), calendar: vi.fn(), lastSync: vi.fn(), queue: vi.fn(), sync: vi.fn(), cold: vi.fn(), push: vi.fn(), waze: vi.fn(),
}));
vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("@/components/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { useRouter: () => ({ push: mocks.push }), useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]) };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user, syncVersion: mocks.syncVersion }) }));
vi.mock("@/modules/projects/repository", () => ({ listProjects: mocks.projects, listProjectDoors: mocks.doors, listProjectIssues: mocks.issues }));
vi.mock("@/modules/projects/service", () => ({ canUseProjectCacheAfterSyncFailure: (error: unknown, count: number) => error instanceof NetworkError && count > 0 }));
vi.mock("@/modules/calendar/service", () => ({ loadInstallerCalendar: mocks.calendar }));
vi.mock("@/modules/sync/service", () => ({ runSync: mocks.sync, forceColdResync: mocks.cold, getLastSyncAt: mocks.lastSync, getSyncQueueSummary: mocks.queue }));
vi.mock("@/modules/projects/external-actions", () => ({ openProjectExternalAction: mocks.waze }));

import ProjectsScreen from "../../../app/projects";

const require = createRequire(__filename);
const imageLoader = require.extensions[".jpg"];
beforeAll(() => { require.extensions[".jpg"] = (module) => { module.exports = 1; }; });
afterAll(() => { if (imageLoader) require.extensions[".jpg"] = imageLoader; else delete require.extensions[".jpg"]; });
let tree: ReactTestRenderer;
const event = {} as never;
const emptyQueue = { total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null };
const project: ProjectListItem = { id: "project-a", name: "Tower A", address: "14 Test Street", status: "ACTIVE", lifecycle_status: "ACTIVE", health_status: "NORMAL", waze_url: "https://waze.com/ul?q=Tower+A" };
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((child) => child.children.filter((item) => typeof item === "string")).join(" ");
const controls = (label: string, role = "button") => tree.root.findAllByType("pressable" as never).filter((node) => node.props.accessibilityRole === role && node.props.accessibilityLabel === label);
const button = (label: string) => { const node = controls(label)[0]; if (!node) throw Error(`Missing button: ${label}`); return node; };
const tab = (label: string) => controls(label, "tab")[0];
const input = () => tree.root.findByType("input" as never);
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
async function mount() { await act(async () => { tree = create(React.createElement(ProjectsScreen)); }); }
async function update() { await act(async () => tree.update(React.createElement(ProjectsScreen))); }
function showProjects() { act(() => tab("Projects").props.onPress(event)); }

beforeEach(() => {
  vi.resetAllMocks(); mocks.focused = true; mocks.syncVersion = 0; mocks.locale = "en";
  mocks.user = { id: "installer-a", company_id: "company-a", full_name: "Installer A" };
  mocks.projects.mockResolvedValue([project]);
  mocks.doors.mockResolvedValue([{ id: "door-1", status: "INSTALLED" }, { id: "door-2", status: "PENDING" }]);
  mocks.issues.mockResolvedValue([]);
  mocks.lastSync.mockResolvedValue("2026-09-27T08:00:00Z"); mocks.queue.mockResolvedValue(emptyQueue);
  mocks.calendar.mockResolvedValue({ source: "online", message: null, snapshot: { items: [] } });
  mocks.waze.mockResolvedValue(undefined);
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("installer home and assigned projects", () => {
  it("shows loading instead of zero totals, empty assignments or successful sync", async () => {
    mocks.projects.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(text()).toContain("Loading assignments");
    expect(text()).not.toContain("No assigned projects");
    expect(text()).not.toContain("Synced");
    expect(controls("Overall progress")).toHaveLength(0);
  });

  it("distinguishes a read failure from no assigned work and supports retry", async () => {
    mocks.projects.mockRejectedValueOnce(new Error("Local read failed"));
    await mount();
    expect(text()).toContain("Assignments unavailable");
    expect(text()).not.toContain("No assigned projects");
    await act(async () => button("Try again").props.onPress(event));
    expect(text()).not.toContain("Local read failed");
    showProjects(); expect(button("Tower A")).toBeDefined();
  });

  it("searches assigned names and addresses, filters work and resets an empty result", async () => {
    mocks.projects.mockResolvedValue([project, { ...project, id: "project-b", name: "Completed tower", address: "88 Another Street" }]);
    mocks.doors.mockImplementation(async (id) => id === "project-b" ? [{ status: "INSTALLED" }] : [{ status: "PENDING" }]);
    mocks.issues.mockImplementation(async (id) => id === "project-b" ? [{ status: "OPEN" }] : []);
    await mount(); showProjects();
    act(() => tab("Work remaining").props.onPress(event));
    expect(controls("Tower A")).toHaveLength(1); expect(controls("Completed tower")).toHaveLength(0);
    act(() => tab("With issues").props.onPress(event));
    expect(controls("Tower A")).toHaveLength(0); expect(controls("Completed tower")).toHaveLength(1);
    act(() => tab("All projects").props.onPress(event));
    act(() => input().props.onChangeText("  another street  "));
    expect(controls("Completed tower")).toHaveLength(1);
    act(() => input().props.onChangeText("nothing"));
    expect(text()).toContain("No matching projects");
    act(() => button("Reset filters").props.onPress(event));
    expect(controls("Tower A")).toHaveLength(1); expect(controls("Completed tower")).toHaveLength(1);
  });

  it("opens the project's doors, issue context and navigation without recording work", async () => {
    mocks.issues.mockResolvedValue([{ status: "OPEN" }]);
    await mount(); showProjects();
    act(() => button("Tower A").props.onPress(event));
    expect(mocks.push).toHaveBeenLastCalledWith("/project/project-a");
    act(() => button("Issues").props.onPress(event));
    expect(mocks.push).toHaveBeenLastCalledWith("/issues?projectId=project-a");
    await act(async () => button("Waze").props.onPress(event));
    expect(mocks.waze).toHaveBeenCalledExactlyOnceWith({ kind: "waze", url: project.waze_url });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("keeps totals separate from today's plan and distinguishes an unavailable plan", async () => {
    mocks.calendar.mockResolvedValue({ source: "unavailable", message: "No network", snapshot: null });
    await mount();
    expect(text()).toContain("Plan unavailable");
    expect(text()).not.toContain("No scheduled work today");
    expect(controls("Start today's work")).toHaveLength(0);
    act(() => button("My projects").props.onPress(event));
    expect(button("Tower A")).toBeDefined();
  });

  it("reports an external navigation failure without losing the project list", async () => {
    mocks.waze.mockRejectedValue(new Error("Navigation unavailable"));
    await mount(); showProjects();
    await act(async () => button("Waze").props.onPress(event));
    expect(text()).toContain("Navigation unavailable");
    expect(button("Tower A")).toBeDefined();
  });

  it("shows the saved-plan state and routes today's assigned visit to its project", async () => {
    const starts = new Date(); starts.setHours(9, 0, 0, 0);
    mocks.calendar.mockResolvedValue({ source: "cache", message: "Offline", snapshot: { items: [{ id: "visit-1", title: "Install doors", starts_at: starts.toISOString(), ends_at: starts.toISOString(), event_type: "installation", project_id: "project-a", location: "Tower A" }] } });
    await mount();
    expect(text()).toContain("Saved plan");
    act(() => button("Start today's work").props.onPress(event));
    expect(mocks.push).toHaveBeenLastCalledWith("/project/project-a");
  });

  it("runs normal sync once for a same-frame double tap, without forcing cold resync", async () => {
    const pending = deferred<void>(); mocks.sync.mockReturnValue(pending.promise);
    await mount();
    const press = button("Sync now").props.onPress;
    act(() => { press(event); press(event); });
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ forceRetry: true });
    expect(mocks.cold).not.toHaveBeenCalled();
    expect(button("Sync now").props.disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(button("Sync now").props.disabled).toBe(false);
  });

  it("does not cold-resync while unsent work remains", async () => {
    mocks.projects.mockResolvedValue([]);
    mocks.queue.mockResolvedValue({ ...emptyQueue, pending: 1, total: 1, ready_to_send: 1 });
    mocks.sync.mockRejectedValue(new NetworkError("Offline"));
    await mount(); showProjects();
    await act(async () => button("Download assigned work").props.onPress(event));
    expect(mocks.cold).not.toHaveBeenCalled();
    expect(text()).toContain("Sync queued work before refreshing assigned projects.");
  });

  it("retains assigned projects on sync failure and shows offline state", async () => {
    mocks.sync.mockRejectedValue(new NetworkError("Offline"));
    await mount();
    await act(async () => button("Sync now").props.onPress(event));
    expect(text()).toContain("Offline mode"); showProjects();
    expect(button("Tower A")).toBeDefined();
  });

  it("reloads on return from completing a door", async () => {
    await mount(); showProjects();
    expect(text()).toContain("Remaining: 1");
    mocks.focused = false; await update();
    mocks.doors.mockResolvedValue([{ status: "INSTALLED" }, { status: "INSTALLED" }]);
    mocks.focused = true; await update();
    expect(text()).toContain("Remaining: 0");
  });

  it("hides the previous account immediately and ignores its late data", async () => {
    const pending = deferred<ProjectListItem[]>(); mocks.projects.mockReturnValueOnce(pending.promise);
    await mount();
    mocks.user = { id: "installer-b", company_id: "company-b", full_name: "Installer B" };
    mocks.projects.mockResolvedValue([{ ...project, id: "project-b", name: "Tower B" }]);
    await update(); showProjects();
    await act(async () => pending.resolve([project]));
    expect(text()).not.toContain("Tower A"); expect(button("Tower B")).toBeDefined();
  });

  it("ignores a stale failed read after a newer successful background-sync refresh", async () => {
    const old = deferred<ProjectListItem[]>(); mocks.projects.mockReturnValueOnce(old.promise);
    await mount(); mocks.syncVersion += 1; await update();
    await act(async () => old.reject(new Error("Obsolete failure")));
    expect(text()).not.toContain("Obsolete failure"); showProjects(); expect(button("Tower A")).toBeDefined();
  });

  it("masks an already loaded account while the next account is loading", async () => {
    await mount(); showProjects(); expect(button("Tower A")).toBeDefined();
    mocks.user = { id: "installer-b", company_id: "company-b", full_name: "Installer B" };
    mocks.projects.mockReturnValue(new Promise(() => {}));
    await update();
    expect(text()).not.toContain("Tower A");
    expect(text()).toContain("Loading assignments");
  });

  it.each([ ["ru", "Объекты", "Назначенные объекты"], ["he", "פרויקטים", "פרויקטים שהוקצו"] ])("localizes the project view in %s", async (locale, label, heading) => {
    mocks.locale = locale; await mount(); act(() => tab(label).props.onPress(event));
    expect(text()).toContain(heading); expect(button("Tower A")).toBeDefined();
    if (locale === "he") {
      expect(text()).toContain("הותקנו: 1 מתוך 2");
      expect(text()).not.toContain("הותקנו: 1 / 2");
    }
  });
});
