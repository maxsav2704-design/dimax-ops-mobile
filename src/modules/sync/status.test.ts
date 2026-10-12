import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "@/lib/errors";
import { buildSyncStatusPresentation } from "./presentation";
import {
  getSyncStatusState, markSyncFinished, markSyncStarted, notifySyncQueueChanged, resetSyncStatus, setSyncSnapshot, subscribeSyncStatus,
} from "./status";

const queue = (total: number, blocked = 0) => ({ total, pending: total - blocked, failed: 0, blocked, ready_to_send: 0, next_retry_at: null });

describe("sync status store", () => {
  beforeEach(() => resetSyncStatus());

  it("tracks overlapping sync runs and marks the workspace offline only after a network failure", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncStatus(listener);
    markSyncStarted();
    markSyncStarted();
    expect(getSyncStatusState().syncing).toBe(true);
    markSyncFinished(null);
    expect(getSyncStatusState().syncing).toBe(true);
    markSyncFinished(new NetworkError());
    expect(getSyncStatusState()).toMatchObject({ syncing: false, offline: true, queueVersion: 2 });
    markSyncStarted();
    markSyncFinished(null);
    expect(getSyncStatusState()).toMatchObject({ syncing: false, offline: false, queueVersion: 3 });
    markSyncStarted();
    markSyncFinished(new Error("HTTP 500"));
    expect(getSyncStatusState().offline).toBe(false);
    unsubscribe();
    notifySyncQueueChanged();
    expect(listener).toHaveBeenCalledTimes(7);
    expect(getSyncStatusState().queueVersion).toBe(5);
  });

  it("stores the latest snapshot without touching the run flags", () => {
    markSyncStarted();
    setSyncSnapshot({ queue: queue(3, 1), lastSyncAt: "2026-10-12T09:30:00Z" });
    expect(getSyncStatusState()).toMatchObject({ syncing: true, queue: queue(3, 1), lastSyncAt: "2026-10-12T09:30:00Z" });
  });
});

describe("buildSyncStatusPresentation", () => {
  const base = { queue: queue(0), lastSyncAt: "2026-10-12T09:30:00Z", syncing: false, offline: false };

  it("orders syncing, offline, blocked, queued, never-synced and synced states", () => {
    expect(buildSyncStatusPresentation({ ...base, syncing: true, queue: queue(2, 1) }, "en")).toMatchObject({ tone: "info", label: "Synchronizing" });
    expect(buildSyncStatusPresentation({ ...base, offline: true, queue: queue(2) }, "ru")).toMatchObject({ tone: "warning", label: "Офлайн · 2 в очереди" });
    expect(buildSyncStatusPresentation({ ...base, offline: true }, "he")).toMatchObject({ tone: "warning", label: "לא מקוון" });
    expect(buildSyncStatusPresentation({ ...base, queue: queue(3, 1) }, "en")).toMatchObject({ tone: "danger", label: "1 blocked" });
    expect(buildSyncStatusPresentation({ ...base, queue: queue(3) }, "en")).toMatchObject({ tone: "accent", label: "3 queued", icon: "cloud-upload-outline" });
    expect(buildSyncStatusPresentation({ ...base, lastSyncAt: null }, "en")).toMatchObject({ tone: "neutral", label: "Not synced yet", detail: null });
    expect(buildSyncStatusPresentation(base, "ru")).toMatchObject({ tone: "success", label: "Синхронизировано" });
  });

  it("formats the last sync time in the active locale", () => {
    const view = buildSyncStatusPresentation(base, "en");
    expect(view.detail).toMatch(/^\d{2}:\d{2}$/);
  });
});
