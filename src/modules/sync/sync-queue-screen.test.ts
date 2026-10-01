import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSyncEvent } from "./types";

const mocks = vi.hoisted(() => ({
  focused: true, locale: "en", syncVersion: 0, loading: false, user: { id: "a", company_id: "a" }, context: { ownerKey: "a:a" },
  pending: vi.fn(), summary: vi.fn(), projects: vi.fn(), project: vi.fn(), doors: vi.fn(), addons: vi.fn(), lastSync: vi.fn(),
  retry: vi.fn(), drop: vi.fn(), sync: vi.fn(), push: vi.fn(), resume: undefined as undefined | ((state: string) => void),
}));
vi.mock("react-native", async () => ({
  ...await (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock(),
  AppState: { addEventListener: (_: string, callback: (state: string) => void) => { mocks.resume = callback; return { remove: vi.fn() }; } },
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { router: { push: mocks.push }, useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]) };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user, loading: mocks.loading, syncVersion: mocks.syncVersion }) }));
vi.mock("@/lib/db", () => ({
  getDatabaseContext: () => mocks.context,
  withDatabaseContext: async (context: unknown, operation: () => Promise<unknown>) => {
    if (context !== mocks.context) throw new Error("Session changed");
    return operation();
  },
}));
vi.mock("@/modules/projects/repository", () => ({ listProjects: mocks.projects, getProject: mocks.project, listProjectDoors: mocks.doors, listProjectAddonTypes: mocks.addons }));
vi.mock("@/modules/sync/service", () => ({ listPendingEvents: mocks.pending, getSyncQueueSummary: mocks.summary, getLastSyncAt: mocks.lastSync, retryPendingEventNow: mocks.retry, dropPendingEvent: mocks.drop, runSync: mocks.sync }));

import SyncQueueScreen from "../../../app/sync-queue";

let tree: ReactTestRenderer;
let rows: PendingSyncEvent[];
const event = {} as never;
const makeEvent = (fields: Partial<PendingSyncEvent> = {}): PendingSyncEvent => ({
  client_event_id: "event-a", type: "DOOR_SET_STATUS", project_id: "project-a", payload: { door_id: "door-a", status: "INSTALLED" },
  status: "PENDING", error: null, attempts: 0, created_at: "2026-10-01T09:00:00Z", happened_at: null, last_attempt_at: null, next_retry_at: null, ...fields,
});
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((child) => child.children.filter((item) => typeof item === "string")).join(" ");
const controls = (label: string) => tree.root.findAllByType("pressable" as never).filter((node) => node.props.accessibilityLabel === label);
const button = (label: string) => { const node = controls(label)[0]; if (!node) throw Error(`Missing button: ${label}`); return node; };
const press = (label: string) => act(() => button(label).props.onPress(event));
const confirm = () => tree.root.findAllByType("modal" as never).find((node) => node.props.visible)!.findAllByType("pressable" as never).find((node) => node.props.accessibilityLabel === "Discard")!;
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
async function mount() { await act(async () => { tree = create(React.createElement(SyncQueueScreen)); }); }
async function update() { await act(async () => tree.update(React.createElement(SyncQueueScreen))); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.focused = true; mocks.locale = "en"; mocks.syncVersion = 0; mocks.loading = false;
  mocks.user = { id: "a", company_id: "a" }; mocks.context = { ownerKey: "a:a" }; rows = [makeEvent()];
  mocks.pending.mockImplementation(async () => structuredClone(rows));
  mocks.summary.mockImplementation(async () => ({ total: rows.length, pending: rows.filter((row) => row.status === "PENDING").length, failed: 0, blocked: rows.filter((row) => row.status === "BLOCKED").length, ready_to_send: rows.length, next_retry_at: null }));
  mocks.projects.mockResolvedValue([{ id: "project-a", name: "Tower A" }]); mocks.project.mockResolvedValue(null);
  mocks.doors.mockResolvedValue([{ id: "door-a", unit_label: "A-201 / fire door" }]); mocks.addons.mockResolvedValue([{ id: "addon-a", name: "Adjustment" }]);
  mocks.lastSync.mockResolvedValue(null); mocks.retry.mockResolvedValue(undefined); mocks.drop.mockResolvedValue(undefined); mocks.sync.mockResolvedValue({ server_time: "2026-10-01T10:00:00Z" });
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("sync queue screen", () => {
  it("shows work labels, exact navigation and expandable technical IDs", async () => {
    await mount(); expect(text()).toContain("A-201 / fire door"); expect(text()).toContain("Tower A"); expect(text()).not.toContain("event-a");
    press("Open linked work"); expect(mocks.push).toHaveBeenCalledWith("/project/project-a?doorId=door-a&doorStatus=ALL");
    press("Technical details"); expect(text()).toContain("event-a"); expect(text()).toContain("door-a");
  });
  it("resolves add-on names and keeps their project navigation", async () => {
    rows = [makeEvent({ type: "ADDON_FACT_CREATE", payload: { addon_type_id: "addon-a", qty_done: "3" } })]; await mount();
    expect(text()).toContain("Adjustment qty 3"); press("Open linked work"); expect(mocks.push).toHaveBeenCalledWith("/project/project-a");
  });
  it("does not substitute another door for a removed assignment", async () => {
    mocks.doors.mockResolvedValue([]); await mount(); expect(text()).toContain("Door unavailable"); expect(controls("Open linked work")).toHaveLength(0);
  });
  it("distinguishes loading and read failure from an empty queue", async () => {
    const pending = deferred<PendingSyncEvent[]>(); mocks.pending.mockReturnValueOnce(pending.promise); await mount();
    expect(text()).toContain("Loading queue"); expect(text()).not.toContain("Queue is empty");
    await act(async () => pending.reject(new Error("Disk read failed")));
    expect(text()).toContain("Unable to read queue"); expect(button("Sync now").props.disabled).toBe(true);
    await act(async () => button("Refresh queue").props.onPress(event)); expect(text()).toContain("A-201 / fire door");
  });
  it("allows a pull when there is no local work to send", async () => {
    rows = []; await mount(); expect(button("Sync now").props.disabled).toBe(false);
    await act(async () => button("Sync now").props.onPress(event)); expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it("rejects double taps and competing bulk/row actions in the same frame", async () => {
    const pending = deferred<void>(); mocks.retry.mockReturnValue(pending.promise); await mount();
    const retry = button("Retry now").props.onPress, sync = button("Sync now").props.onPress;
    await act(async () => { retry(event); retry(event); sync(event); });
    expect(mocks.retry).toHaveBeenCalledTimes(1); expect(mocks.sync).not.toHaveBeenCalled(); expect(button("Sync now").props.disabled).toBe(true);
    await act(async () => pending.resolve()); expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it("does not open a destructive confirmation while syncing", async () => {
    rows.push(makeEvent({ client_event_id: "blocked", status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED" }));
    const pending = deferred<unknown>(); mocks.sync.mockReturnValue(pending.promise); await mount();
    const drop = button("Discard").props.onPress; press("Sync now"); act(() => drop(event));
    expect(tree.root.findAllByType("modal" as never).some((node) => node.props.visible)).toBe(false);
    await act(async () => pending.resolve({})); expect(mocks.drop).not.toHaveBeenCalled();
  });
  it("rechecks retry policy against the latest stored event", async () => {
    await mount(); rows[0] = makeEvent({ status: "BLOCKED", error: "AUTH_REQUIRED" });
    await act(async () => button("Retry now").props.onPress(event));
    expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled(); expect(text()).toContain("This action changed");
  });
  it("includes work in confirmation and supports cancelling without a write", async () => {
    rows = [makeEvent({ status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED" })]; await mount(); press("Discard");
    expect(text()).toContain("Discard queued action?"); expect(text()).toContain("Tower A"); press("Cancel"); expect(mocks.drop).not.toHaveBeenCalled();
  });
  it("does not delete when policy changes while confirmation is open", async () => {
    rows = [makeEvent({ status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED" })]; await mount(); press("Discard"); rows[0] = makeEvent({ error: "AUTH_REQUIRED" });
    await act(async () => confirm().props.onPress(event)); expect(mocks.drop).not.toHaveBeenCalled(); expect(text()).toContain("This action changed");
  });
  it("performs only one confirmed discard and prevents dismissal during it", async () => {
    rows = [makeEvent({ status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED" })];
    const pending = deferred<void>(); mocks.drop.mockReturnValue(pending.promise); await mount(); press("Discard");
    const drop = confirm().props.onPress; await act(async () => { drop(event); drop(event); });
    expect(mocks.drop).toHaveBeenCalledTimes(1); expect(button("Cancel").props.disabled).toBe(true);
    rows = []; await act(async () => pending.resolve()); expect(text()).toContain("Queue is empty"); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("ignores an event already acknowledged before retry", async () => {
    await mount(); rows = []; await act(async () => button("Retry now").props.onPress(event)); expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("only bulk-retries items still eligible, not new blocked work", async () => {
    rows = [makeEvent({ status: "BLOCKED", error: "timeout (auto retry limit reached)" })]; await mount();
    rows = [makeEvent({ status: "BLOCKED", error: "AUTH_REQUIRED" }), makeEvent({ client_event_id: "new", status: "BLOCKED", error: "timeout (auto retry limit reached)" })];
    await act(async () => button("Retry blocked actions").props.onPress(event)); expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("does not claim a successful sync if the following queue read fails", async () => {
    await mount(); mocks.pending.mockRejectedValue(new Error("Read failed"));
    await act(async () => button("Sync now").props.onPress(event)); expect(text()).toContain("Unable to read queue"); expect(text()).not.toContain("Queue is empty");
  });
  it("preserves queued work after an offline failure and unlocks controls", async () => {
    mocks.sync.mockRejectedValue(new Error("Offline")); await mount(); await act(async () => button("Sync now").props.onPress(event));
    expect(text()).toContain("Offline"); expect(text()).toContain("A-201 / fire door"); expect(button("Sync now").props.disabled).toBe(false); expect(mocks.drop).not.toHaveBeenCalled();
  });
  it("masks the old account immediately and prevents delayed mutation from starting sync", async () => {
    const pending = deferred<void>(); mocks.retry.mockReturnValue(pending.promise); await mount(); await act(async () => button("Retry now").props.onPress(event));
    mocks.user = { id: "b", company_id: "b" }; mocks.context = { ownerKey: "b:b" }; rows = []; await update();
    await act(async () => pending.resolve()); expect(text()).not.toContain("A-201 / fire door"); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("does not read a database belonging to a different identity", async () => {
    mocks.context = { ownerKey: "other:other" }; await mount(); expect(mocks.pending).not.toHaveBeenCalled(); expect(text()).toContain("Unable to read queue");
  });
  it("refreshes when returning to the screen and resuming the app", async () => {
    await mount(); mocks.focused = false; await update(); rows = []; mocks.focused = true; await update(); expect(text()).toContain("Queue is empty");
    rows = [makeEvent()]; await act(async () => mocks.resume?.("active")); expect(text()).toContain("A-201 / fire door");
  });
  it.each([["ru", "Синхронизация"], ["he", "תור סנכרון"]])("renders localized controls in %s", async (locale, title) => {
    mocks.locale = locale; await mount(); expect(text()).toContain(title); expect(text()).not.toContain("Technical details");
  });
});
