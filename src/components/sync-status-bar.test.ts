import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/projects",
  snapshot: vi.fn(),
  user: { id: "installer-a", company_id: "company-a" } as { id: string; company_id: string } | null,
  syncVersion: 0,
}));

vi.mock("react-native", async () => (await vi.importActual<typeof import("@/test/native-ui")>("@/test/native-ui")).createNativeUiMock());
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "gradient" }));
vi.mock("react-native-svg", () => ({
  default: "svg", Circle: "circle", Defs: "defs", LinearGradient: "svg-gradient", Path: "path", Stop: "stop",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("expo-router", () => ({ router: { push: mocks.push }, usePathname: () => mocks.pathname }));
vi.mock("@/providers/AppProviders", () => ({
  useI18n: () => ({ locale: "en" }),
  useAuth: () => ({ user: mocks.user, syncVersion: mocks.syncVersion }),
}));
vi.mock("@/modules/sync/service", () => ({ getSyncStatusSnapshot: mocks.snapshot }));

import { NetworkError } from "@/lib/errors";
import { markSyncFinished, markSyncStarted, notifySyncQueueChanged, resetSyncStatus } from "@/modules/sync/status";
import { SyncStatusBar } from "./sync-status-bar";

let tree: ReactTestRenderer;
const queue = (total: number) => ({ total, pending: total, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null });
const text = () => tree.root.findAllByType("text" as never).flatMap((node) => node.children.filter((child) => typeof child === "string")).join(" ");
const bar = () => tree.root.findAllByProps({ testID: "sync-status-bar" }).find((node) => node.props.accessibilityRole === "button");
async function mount() {
  await act(async () => { tree = create(React.createElement(SyncStatusBar)); });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSyncStatus();
  mocks.pathname = "/projects";
  mocks.user = { id: "installer-a", company_id: "company-a" };
  mocks.snapshot.mockResolvedValue({ queue: queue(2), lastSyncAt: "2026-10-12T09:30:00Z" });
});
afterEach(() => { act(() => tree?.unmount()); });

describe("SyncStatusBar", () => {
  it("loads the queue snapshot, shows queued work and opens the sync queue", async () => {
    await mount();
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    expect(text()).toContain("2 queued");
    expect(bar()!.props.accessibilityLabel).toBe("Open sync queue: 2 queued");
    act(() => bar()!.props.onPress({}));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/sync-queue");
  });

  it("follows sync runs and reloads the snapshot after each one", async () => {
    await mount();
    act(() => markSyncStarted());
    expect(text()).toContain("Synchronizing");
    mocks.snapshot.mockResolvedValue({ queue: queue(0), lastSyncAt: "2026-10-12T09:45:00Z" });
    await act(async () => markSyncFinished(new NetworkError()));
    expect(text()).toContain("Offline");
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    await act(async () => { markSyncStarted(); markSyncFinished(null); });
    expect(text()).toContain("Synced");
  });

  it("reloads when the queue changes, stays quiet on the queue screen and before any snapshot", async () => {
    mocks.pathname = "/sync-queue";
    let resolve!: (value: unknown) => void;
    mocks.snapshot.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await mount();
    expect(bar()).toBeUndefined();
    await act(async () => resolve({ queue: queue(1), lastSyncAt: null }));
    expect(bar()!.props.disabled).toBe(true);
    expect(text()).toContain("1 queued");
    mocks.snapshot.mockResolvedValue({ queue: queue(0), lastSyncAt: null });
    await act(async () => notifySyncQueueChanged());
    expect(text()).toContain("Not synced yet");
  });

  it("does not read the workspace without a signed-in installer", async () => {
    mocks.user = null;
    await mount();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(bar()).toBeUndefined();
  });
});
