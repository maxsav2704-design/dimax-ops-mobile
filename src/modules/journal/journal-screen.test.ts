import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { journalFixture as journal } from "./test-fixtures";
import type { InstallerJournalDetails } from "./types";

const mocks = vi.hoisted(() => ({
  focused: true, syncVersion: 0, locale: "en", params: { id: "journal-a" } as { id?: string },
  user: { id: "installer-a", company_id: "company-a" }, resume: new Set<(state: string) => void>(),
  load: vi.fn(), workspace: vi.fn(), prepare: vi.fn(), refresh: vi.fn(), ready: vi.fn(), open: vi.fn(), pdf: vi.fn(),
  push: vi.fn(), replace: vi.fn(), back: vi.fn(),
}));
vi.mock("react-native", async () => ({
  ...await (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock(),
  AppState: { addEventListener: (_name: string, listener: (state: string) => void) => {
    mocks.resume.add(listener); return { remove: () => mocks.resume.delete(listener) };
  } },
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({ default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@/components/installer-ui", () => ({ InstallerBottomNav: () => null }));
vi.mock("expo-router", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const router = { push: mocks.push, replace: mocks.replace, back: mocks.back };
  return { router, useRouter: () => router, useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => mocks.focused ? effect() : undefined, [effect, mocks.focused]) };
});
vi.mock("@/providers/AppProviders", () => ({ useI18n: () => ({ locale: mocks.locale }), useAuth: () => ({ user: mocks.user, syncVersion: mocks.syncVersion }) }));
vi.mock("@/modules/journal/service", () => ({ loadInstallerJournal: mocks.load, prepareInstallerJournal: mocks.prepare, refreshInstallerJournal: mocks.refresh, markInstallerJournalReady: mocks.ready, openJournalUrl: mocks.open, openSignedJournalPdf: mocks.pdf }));
vi.mock("@/modules/journal/workspace", () => ({ loadJournalWorkspace: mocks.workspace }));

import JournalScreen from "../../../app/journal";
import JournalDetailsScreen from "../../../app/journal/[id]";

let tree: ReactTestRenderer;
let Screen = JournalDetailsScreen;
const event = {} as never;
const view = (data = journal, source: "online" | "cache" = "online") => ({ data, source, message: null });
const text = (node: ReactTestInstance = tree.root) => node.findAllByType("text" as never).flatMap((item) => item.children.filter((child) => typeof child === "string")).join(" ");
const targets = () => tree.root.findAllByType("pressable" as never);
const target = (label: string) => targets().find((item) => item.props.accessibilityLabel === label)!;
const byId = (id: string) => targets().find((item) => item.props.testID === id)!;
const press = async (label: string) => { await act(async () => { target(label).props.onPress(event); }); };
const modal = () => tree.root.findByType("modal" as never);
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
async function mount(screen = JournalDetailsScreen) { Screen = screen; await act(async () => { tree = create(React.createElement(Screen)); }); }
async function update() { await act(async () => tree.update(React.createElement(Screen))); }
const signingLink = { signing_url: "https://example.test/acceptance/test", public_token_expires_at: "2026-10-01T12:00:00Z" };

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  mocks.focused = true; mocks.syncVersion = 0; mocks.locale = "en"; mocks.params = { id: journal.id };
  mocks.resume.clear(); mocks.user = { id: "installer-a", company_id: "company-a" };
  mocks.load.mockResolvedValue(view()); mocks.prepare.mockResolvedValue(journal); mocks.refresh.mockResolvedValue(journal);
  mocks.ready.mockResolvedValue(signingLink); mocks.open.mockResolvedValue(undefined); mocks.pdf.mockResolvedValue(undefined);
  mocks.workspace.mockResolvedValue({ data: { projects: [{ id: journal.project_id, name: journal.project_name, address: journal.project_address, installedLocally: 2 }], journals: [journal], localUnavailable: false }, source: "online", message: null });
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.useRealTimers(); });

describe("journal document screen", () => {
  it("does not show a draft, zero doors or completed workflow while loading", async () => {
    mocks.load.mockReturnValue(new Promise(() => {})); await mount();
    expect(text()).toContain("Loading document"); expect(text()).not.toContain("Draft"); expect(text()).not.toContain("No completed doors");
  });
  it("offers retry and a way back for a failed or absent ID", async () => {
    mocks.params = {}; await mount(); expect(text()).toContain("Document unavailable");
    expect(target("Retry")).toBeDefined(); await press("Back to journal"); expect(mocks.replace).toHaveBeenCalledWith("/journal");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("does not transfer a document until the user confirms", async () => {
    await mount(); await press("Send for developer signature");
    expect(mocks.ready).not.toHaveBeenCalled(); expect(text(modal())).toContain("does not sign the document or send an email");
    await press("Cancel"); expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    await press("Send for developer signature"); act(() => modal().props.onRequestClose());
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });
  it("locks every write immediately and prevents rapid duplicate submission", async () => {
    const pending = deferred<typeof signingLink>(); mocks.ready.mockReturnValue(pending.promise);
    await mount(); await press("Send for developer signature");
    const confirm = target("Create signing link"); act(() => { confirm.props.onPress(event); confirm.props.onPress(event); });
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    expect(target("Update completed work").props.disabled).toBe(true);
    expect(target("Create signing link").props.disabled).toBe(true);
    await act(async () => pending.resolve(signingLink));
    expect(text()).toContain("Awaiting signature"); expect(target("Send for developer signature")).toBeUndefined();
    expect(mocks.load).toHaveBeenCalledTimes(1); expect(mocks.open).toHaveBeenCalledWith(signingLink.signing_url);
  });
  it("keeps a successful ACTIVE transition even if opening the browser fails", async () => {
    mocks.open.mockRejectedValue(new Error("No browser")); await mount();
    await press("Send for developer signature"); await press("Create signing link");
    expect(text()).toContain("Awaiting signature"); expect(text()).toContain("link is ready but did not open");
    expect(target("Open signing page")).toBeDefined(); expect(mocks.ready).toHaveBeenCalledTimes(1);
  });
  it("reports an unconfirmed write without inventing success", async () => {
    mocks.ready.mockRejectedValue(new Error("timeout")); await mount(); await press("Send for developer signature"); await press("Create signing link");
    expect(mocks.open).not.toHaveBeenCalled(); expect(text()).toContain("Action not confirmed"); expect(text()).not.toContain("Awaiting signature");
    expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
  });
  it("blocks stale offline signing and PDF actions but allows a status refresh", async () => {
    mocks.load.mockResolvedValue(view(journal, "cache")); await mount();
    expect(target("Send for developer signature").props.disabled).toBe(true); expect(target("Update completed work").props.disabled).toBe(true);
    mocks.load.mockResolvedValue(view({ ...journal, status: "ARCHIVED", can_submit: false }, "cache")); await press("Check status");
    expect(target("Open signed PDF").props.disabled).toBe(true); expect(text()).toContain("Saved copy");
  });
  it("explains missing or expired links rather than leaving a dead action section", async () => {
    mocks.load.mockResolvedValue(view({ ...journal, status: "ACTIVE", can_submit: false })); await mount();
    expect(text()).toContain("Signing link unavailable or expired"); expect(target("Open signing page")).toBeUndefined();
    mocks.load.mockResolvedValue(view({ ...journal, status: "ACTIVE", ...signingLink, public_token_expires_at: "2026-01-01T00:00:00Z" })); await press("Check status");
    expect(target("Open signing page").props.disabled).toBe(true);
  });
  it("opens only the requested signed PDF and prevents repeated launches", async () => {
    const pending = deferred<void>(); mocks.pdf.mockReturnValue(pending.promise);
    mocks.load.mockResolvedValue(view({ ...journal, status: "ARCHIVED", can_submit: false, email_delivery_status: "FAILED" })); await mount();
    const button = target("Open signed PDF"); act(() => { button.props.onPress(event); button.props.onPress(event); });
    expect(mocks.pdf).toHaveBeenCalledOnce(); expect(mocks.pdf).toHaveBeenCalledWith(journal.id); expect(text()).toContain("signed document is preserved");
    await act(async () => pending.resolve());
  });
  it("recovers PDF failure without displaying email delivery success", async () => {
    mocks.pdf.mockRejectedValue(new Error("offline")); mocks.load.mockResolvedValue(view({ ...journal, status: "ARCHIVED", can_submit: false, email_delivery_status: "PENDING" }));
    await mount(); await press("Open signed PDF"); expect(text()).toContain("Could not open the document"); expect(text()).toContain("sending"); expect(target("Open signed PDF").props.disabled).toBe(false);
  });
  it("refreshes after returning from signing and on synchronization", async () => {
    await mount(); mocks.load.mockResolvedValue(view({ ...journal, status: "ARCHIVED", can_submit: false }));
    await act(async () => mocks.resume.forEach((listener) => listener("active"))); expect(text()).toContain("Signed");
    mocks.syncVersion += 1; await update(); expect(mocks.load).toHaveBeenCalledTimes(3);
  });
  it("ignores old reads and hides a previous account and its confirmation", async () => {
    await mount(); await press("Send for developer signature");
    const pending = deferred<ReturnType<typeof view>>(); mocks.load.mockReturnValueOnce(pending.promise);
    mocks.user = { id: "installer-b", company_id: "company-b" }; await update();
    expect(text()).not.toContain(journal.project_name); expect(tree.root.findAllByType("modal" as never)).toHaveLength(0);
    mocks.load.mockResolvedValue(view({ ...journal, project_name: "New assignment" })); mocks.syncVersion += 1; await update();
    await act(async () => pending.resolve(view())); expect(text()).toContain("New assignment"); expect(text()).not.toContain("Tower A");
  });
  it("does not navigate or expose the previous account after a delayed write", async () => {
    const pending = deferred<typeof signingLink>(); mocks.ready.mockReturnValue(pending.promise);
    await mount(); await press("Send for developer signature"); await press("Create signing link");
    mocks.user = { id: "installer-b", company_id: "company-b" }; mocks.load.mockResolvedValue(view({ ...journal, project_name: "Other company" })); await update();
    await act(async () => pending.resolve(signingLink)); expect(mocks.open).not.toHaveBeenCalled(); expect(text()).toContain("Other company");
  });
  it("shows full long positions and exposes doors beyond the first page", async () => {
    const doors = Array.from({ length: 35 }, (_, index) => ({ ...journal.doors[0], unit_label: `Long position building A floor 22 apartment ${index}` }));
    mocks.load.mockResolvedValue(view({ ...journal, doors, completed_doors: 35 })); await mount();
    expect(text()).not.toContain("apartment 34"); await press("Show more doors"); expect(text()).toContain("apartment 34");
    await press("Project"); expect(mocks.push).toHaveBeenCalledWith("/project/project-a");
  });
  it("uses Hebrew direction in the screen and the signing confirmation", async () => {
    mocks.locale = "he"; await mount(); await press("שליחה לחתימת היזם");
    expect(tree.root.findByType("safe-area" as never).props.style).toContainEqual({ direction: "rtl" });
    expect(modal().findAllByType("view" as never).some((node) => Array.isArray(node.props.style) && node.props.style.some((style: { direction?: string }) => style?.direction === "rtl"))).toBe(true);
  });
});

describe("journal project list screen", () => {
  it("shows loading rather than zero documents or an empty result", async () => {
    mocks.workspace.mockReturnValue(new Promise(() => {})); await mount(JournalScreen);
    expect(text()).toContain("Loading journal"); expect(text()).not.toContain("No documents in this filter");
  });
  it("shows unavailable with retry when neither source can be read", async () => {
    mocks.workspace.mockRejectedValue(new Error("database busy")); await mount(JournalScreen);
    expect(text()).toContain("Journal unavailable"); expect(target("Retry")).toBeDefined();
  });
  it("keeps all documents for one project clickable and filters them correctly", async () => {
    mocks.workspace.mockResolvedValue({ data: { projects: [], journals: [journal, { ...journal, id: "signed", status: "ARCHIVED" }], localUnavailable: false }, source: "online", message: null });
    await mount(JournalScreen); expect(byId("journal-document-journal-a")).toBeDefined(); expect(byId("journal-document-signed")).toBeDefined();
    await press("Archive"); expect(byId("journal-document-journal-a")).toBeUndefined();
    act(() => byId("journal-document-signed").props.onPress(event)); expect(mocks.push).toHaveBeenCalledWith("/journal/signed");
  });
  it("prepares only the chosen project once and navigates to the returned act", async () => {
    const pending = deferred<InstallerJournalDetails>(); mocks.prepare.mockReturnValue(pending.promise);
    mocks.workspace.mockResolvedValue({ data: { projects: [{ id: journal.project_id, name: journal.project_name, installedLocally: 1 }], journals: [], localUnavailable: false }, source: "online", message: null });
    await mount(JournalScreen); const button = target("Prepare acceptance"); act(() => { button.props.onPress(event); button.props.onPress(event); });
    expect(mocks.prepare).toHaveBeenCalledOnce(); expect(mocks.prepare).toHaveBeenCalledWith(journal.project_id, "en");
    await act(async () => pending.resolve(journal)); expect(mocks.push).toHaveBeenCalledWith("/journal/journal-a");
  });
  it("refreshes the project list on focus and hides it when account changes", async () => {
    await mount(JournalScreen); mocks.focused = false; await update(); mocks.focused = true; await update();
    expect(mocks.workspace).toHaveBeenCalledTimes(2);
    mocks.workspace.mockReturnValue(new Promise(() => {})); mocks.user = { id: "other", company_id: "other" }; await update(); expect(text()).not.toContain(journal.project_name);
  });
});
