import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  focused: true, syncVersion: 0, locale: "en", user: { id: "a", company_id: "a" }, params: {} as Record<string, string>,
  projects: vi.fn(), doors: vi.fn(), issues: vi.fn(), queue: vi.fn(), save: vi.fn(), sync: vi.fn(), push: vi.fn(), replace: vi.fn(), resume: undefined as undefined | ((state: string) => void),
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
  return { router: { push: mocks.push, replace: mocks.replace }, useLocalSearchParams: () => mocks.params, useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]) };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user, syncVersion: mocks.syncVersion }) }));
vi.mock("@/modules/projects/repository", () => ({ listProjects: mocks.projects, listProjectDoors: mocks.doors, listProjectIssues: mocks.issues }));
vi.mock("@/modules/sync/service", () => ({ getSyncQueueSummary: mocks.queue, queueIssueCreateEvent: mocks.save, runSync: mocks.sync }));
vi.mock("@/modules/issues/actions", () => ({ createIssue: mocks.save }));

import IssuesScreen from "../../../app/issues";

let tree: ReactTestRenderer;
const event = {} as never;
const project = { id: "project-a", name: "Tower A" };
const door = { id: "door-a", project_id: "project-a", unit_label: "A-201 / fire door" };
const issue = { id: "issue-a", project_id: "project-a", door_id: "door-a", status: "OPEN", title: "Missing handle", details: "Please provide the correct handle for the fire door." };
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((child) => child.children.filter((item) => typeof item === "string")).join(" ");
const controls = (label: string, role = "button") => tree.root.findAllByType("pressable" as never).filter((node) => node.props.accessibilityRole === role && node.props.accessibilityLabel === label);
const button = (label: string) => { const node = controls(label)[0]; if (!node) throw Error(`Missing button: ${label}`); return node; };
const input = (label: string) => tree.root.findAllByType("input" as never).find((node) => node.props.accessibilityLabel === label)!;
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const press = (label: string) => act(() => button(label).props.onPress(event));
async function mount() { await act(async () => { tree = create(React.createElement(IssuesScreen)); }); }
async function update() { await act(async () => tree.update(React.createElement(IssuesScreen))); }
function review() {
  press("Flag a new issue");
  press("Defective part. crack, bend, broken hardware");
  press("Add details");
  act(() => input("Issue description").props.onChangeText("  Crack in frame  "));
  press("Review");
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.focused = true; mocks.syncVersion = 0; mocks.locale = "en"; mocks.params = {}; mocks.user = { id: "a", company_id: "a" };
  mocks.projects.mockResolvedValue([project]); mocks.doors.mockResolvedValue([door]); mocks.issues.mockResolvedValue([issue]); mocks.queue.mockResolvedValue({ total: 0 });
  mocks.save.mockResolvedValue(undefined); mocks.sync.mockResolvedValue(undefined);
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe("installer issue screen", () => {
  it("does not show an empty success state while assignments load", async () => {
    mocks.projects.mockReturnValue(new Promise(() => {})); await mount();
    expect(text()).toContain("Loading issues"); expect(text()).not.toContain("No open issues");
    expect(button("Flag a new issue").props.disabled).toBe(true);
  });
  it("shows read failure and supports retry", async () => {
    mocks.projects.mockRejectedValueOnce(new Error("Read failed")); await mount();
    expect(text()).toContain("Issues unavailable"); expect(text()).not.toContain("No open issues");
    await act(async () => button("Try again").props.onPress(event));
    expect(text()).not.toContain("Read failed"); expect(text()).toContain("Missing handle");
  });
  it("opens full details and the exact linked door without changing work", async () => {
    await mount(); press("Missing handle. Tower A. A-201 / fire door");
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(1);
    expect(text()).toContain(issue.details);
    press("Open linked door");
    expect(mocks.push).toHaveBeenCalledWith("/project/project-a?doorId=door-a&doorStatus=ALL");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("searches full description and clears an empty result", async () => {
    await mount(); act(() => input("Search issues").props.onChangeText("  correct handle  "));
    expect(text()).toContain("Missing handle");
    act(() => input("Search issues").props.onChangeText("unknown")); expect(text()).toContain("No matching issues");
    press("Clear search"); expect(text()).toContain("Missing handle");
  });
  it("uses counts and list scoped to the requested project", async () => {
    mocks.projects.mockResolvedValue([project, { id: "project-b", name: "Tower B" }]);
    mocks.issues.mockImplementation(async (id) => id === "project-a" ? [issue] : [{ ...issue, id: "issue-b", project_id: id, title: "Other company work" }]);
    mocks.params = { projectId: "project-a" }; await mount();
    expect(text()).toContain("Open: 1"); expect(text()).not.toContain("Other company work");
  });
  it("retains an explicitly requested closed issue", async () => {
    mocks.issues.mockResolvedValue([{ ...issue, status: "CLOSED" }]); mocks.params = { issueId: "issue-a" }; await mount();
    expect(text()).toContain("Missing handle"); expect(text()).toContain("Open: 0");
  });
  it("does not offer another project for a missing deep link", async () => {
    mocks.params = { projectId: "absent", compose: "1" }; await mount();
    expect(text()).not.toContain("Missing handle"); expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    expect(button("Flag a new issue").props.disabled).toBe(true);
  });
  it("does not substitute another door for a missing deep link", async () => {
    mocks.params = { projectId: "project-a", doorId: "absent", compose: "1" }; await mount();
    expect(button("Flag a new issue").props.disabled).toBe(true); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("resolves a door-only deep link to its assigned project", async () => {
    mocks.projects.mockResolvedValue([{ id: "project-b", name: "Tower B" }, project]);
    mocks.doors.mockImplementation(async (id) => id === "project-a" ? [door] : []);
    mocks.params = { door_id: "door-a", compose: "1" }; await mount();
    press("Defective part. crack, bend, broken hardware"); press("Add details"); press("Review");
    await act(async () => button("Save issue").props.onPress(event));
    expect(mocks.save).toHaveBeenCalledWith({ projectId: "project-a", doorId: "door-a", title: "Defective part", details: "" });
  });
  it("keeps the draft when the composer is dismissed", async () => {
    await mount(); review(); press("Close"); press("Flag a new issue");
    expect(text()).toContain("Crack in frame"); expect(button("Save issue")).toBeDefined();
  });
  it("prevents duplicate writes and closing while a write is pending", async () => {
    const pending = deferred<void>(); mocks.save.mockReturnValue(pending.promise); await mount(); review();
    const save = button("Save issue").props.onPress;
    act(() => { save(event); save(event); });
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(button("Close").props.disabled).toBe(true);
    expect(button("Back").props.disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(text()).toContain("Issue saved on this phone.");
  });
  it("retains a saved result when sync and the following read fail", async () => {
    mocks.sync.mockRejectedValue(new Error("Offline")); await mount(); review();
    mocks.projects.mockRejectedValue(new Error("Read after save failed"));
    await act(async () => button("Save issue").props.onPress(event));
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(text()).toContain("Issue saved on this phone.");
    expect(text()).toContain("Read after save failed"); expect(controls("Save issue")).toHaveLength(0);
  });
  it("translates the saved acknowledgement after changing locale", async () => {
    await mount(); review(); await act(async () => button("Save issue").props.onPress(event));
    mocks.locale = "he"; await update();
    expect(text()).toContain("התקלה נשמרה בטלפון."); expect(text()).not.toContain("Issue saved on this phone.");
  });
  it("finishes a durable save when the screen loses focus without leaving it busy", async () => {
    const pending = deferred<void>(); mocks.save.mockReturnValue(pending.promise);
    await mount(); review(); press("Save issue"); mocks.focused = false; await update();
    await act(async () => pending.resolve()); mocks.focused = true; await update();
    expect(text()).toContain("Issue saved on this phone."); expect(controls("Save issue")).toHaveLength(0);
    expect(button("Flag a new issue").props.disabled).toBe(false); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("does not start sync under a different account after a delayed save", async () => {
    const pending = deferred<void>(); mocks.save.mockReturnValue(pending.promise);
    await mount(); review(); press("Save issue"); mocks.user = { id: "b", company_id: "b" }; mocks.projects.mockResolvedValue([]); await update();
    await act(async () => pending.resolve()); expect(mocks.sync).not.toHaveBeenCalled();
    expect(text()).not.toContain("Issue saved on this phone.");
  });
  it("keeps an unsaved draft on durable-write failure and allows retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Disk write failed")); await mount(); review();
    await act(async () => button("Save issue").props.onPress(event));
    expect(text()).toContain("Disk write failed"); expect(text()).toContain("Crack in frame"); expect(mocks.sync).not.toHaveBeenCalled();
    await act(async () => button("Save issue").props.onPress(event)); expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it("disables saving when an assignment disappears during review", async () => {
    await mount(); review(); mocks.doors.mockResolvedValue([]); mocks.syncVersion++; await update();
    expect(button("Save issue").props.disabled).toBe(true);
    press("Save issue"); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("refreshes on focus and app resume", async () => {
    await mount(); mocks.focused = false; await update(); mocks.issues.mockResolvedValue([]); mocks.focused = true; await update();
    expect(text()).toContain("No open issues"); mocks.issues.mockResolvedValue([issue]);
    await act(async () => mocks.resume?.("active")); expect(text()).toContain("Missing handle");
  });
  it("masks the old account and ignores its delayed read", async () => {
    const pending = deferred<unknown[]>(); mocks.projects.mockReturnValueOnce(pending.promise); await mount();
    mocks.user = { id: "b", company_id: "b" }; mocks.projects.mockResolvedValue([]); await update();
    await act(async () => pending.resolve([project])); expect(text()).not.toContain("Missing handle");
  });
  it("ignores an older failed refresh after a newer successful one", async () => {
    const pending = deferred<unknown[]>(); mocks.projects.mockReturnValueOnce(pending.promise); await mount();
    mocks.syncVersion++; await update(); await act(async () => pending.reject(new Error("Stale failure")));
    expect(text()).not.toContain("Stale failure"); expect(text()).toContain("Missing handle");
  });
  it.each([["ru", "Проблемы", "Сообщить о проблеме"], ["he", "תקלות", "דווח על תקלה"]])("localizes the screen and composer in %s", async (locale, title, createLabel) => {
    mocks.locale = locale; await mount(); expect(text()).toContain(title); press(createLabel);
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(1);
  });
});
