import { describe, expect, it } from "vitest";
import {
  buildEventSummary,
  buildQueueResolution,
  canRetrySyncEvent,
  getQueueReadState,
  needsSyncAttention,
  getStatusTone,
} from "@/modules/sync/presentation";
import { MAX_AUTO_RETRY_ATTEMPTS } from "@/modules/sync/policy";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";

function makeEvent(partial: Partial<PendingSyncEvent>): PendingSyncEvent {
  return {
    client_event_id: "evt-1",
    type: "DOOR_SET_STATUS",
    project_id: "project-1",
    happened_at: "2026-03-01T12:00:00Z",
    payload: {},
    status: "PENDING",
    error: null,
    attempts: 0,
    next_retry_at: null,
    last_attempt_at: null,
    created_at: "2026-03-01T12:00:00Z",
    ...partial,
  };
}

describe("sync queue presentation", () => {
  it.each(["en", "ru", "he"] as const)("protects unresolved price work in %s", (locale) => {
    const resolution = buildQueueResolution(makeEvent({ status: "BLOCKED", error: "CONFLICT_FACTORY_PRICE" }), locale);
    expect(resolution.retryAllowed).toBe(false);
    expect(resolution.dropAllowed).toBe(false);
    expect(resolution.title).not.toContain("CONFLICT");
    expect(resolution.detail.length).toBeGreaterThan(20);
  });

  const emptySummary: SyncQueueSummary = {
    total: 0, pending: 0, failed: 0, blocked: 0, ready_to_send: 0, next_retry_at: null,
  };

  it.each([
    { status: "PENDING" as const, attempts: 0, expected: false },
    { status: "PENDING" as const, attempts: MAX_AUTO_RETRY_ATTEMPTS, expected: true },
    { status: "FAILED" as const, attempts: 1, expected: true },
    { status: "BLOCKED" as const, attempts: 1, expected: true },
  ])("classifies $status at $attempts attempts in attention/waiting filters", ({ status, attempts, expected }) => {
    expect(needsSyncAttention(makeEvent({ status, attempts }))).toBe(expected);
  });

  it.each([
    { summary: null, loading: true, failed: false, expected: "loading" },
    { summary: null, loading: false, failed: false, expected: "error" },
    { summary: null, loading: false, failed: true, expected: "error" },
    { summary: emptySummary, loading: true, failed: false, expected: "loading" },
    { summary: emptySummary, loading: false, failed: true, expected: "error" },
    { summary: emptySummary, loading: false, failed: false, expected: "ready" },
    { summary: { ...emptySummary, total: 1, failed: 1 }, loading: false, failed: false, expected: "ready" },
  ])("does not report success before a valid queue read: $expected", ({ summary, loading, failed, expected }) => {
    expect(getQueueReadState(summary, loading, failed)).toBe(expected);
  });

  it.each(["PENDING", "FAILED"] as const)("explains exhausted %s items even without an error string", (status) => {
    const event = makeEvent({ status, attempts: MAX_AUTO_RETRY_ATTEMPTS, error: null });
    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Retry limit reached");
    expect(resolution.detail).toContain("automatic retries stopped");
    expect(resolution.detail).toContain("sent again by itself once the server answers");
    expect(resolution.retryAllowed).toBe(true);
    expect(resolution.dropAllowed).toBe(false);
    expect(buildQueueResolution(event, "ru").title).toBe("Лимит повторов исчерпан");
    expect(buildQueueResolution(event, "he").title).toBe("הגעתם למגבלת הניסיונות");
  });

  it.each(["AUTH_REQUIRED", "CONFLICT_ASSIGNMENT_CHANGED", "CONFLICT_INVALID_TRANSITION", "CONFLICT_FACTORY_PRICE"])(
    "keeps %s protection ahead of retry-limit recovery", (error) => {
      const event = makeEvent({ status: "BLOCKED", attempts: MAX_AUTO_RETRY_ATTEMPTS, error });
      expect(buildQueueResolution(event).retryAllowed).toBe(false);
      expect(buildQueueResolution(event).title).not.toBe("Retry limit reached");
    },
  );

  it("renders a useful door status summary", () => {
    const event = makeEvent({
      type: "DOOR_SET_STATUS",
      payload: { door_id: "door-12", status: "NOT_INSTALLED" },
    });

    expect(buildEventSummary(event)).toBe("Door door-12 -> Not installed");
  });

  it("renders a door stage summary without any price", () => {
    const event = makeEvent({
      type: "DOOR_STAGE_COMPLETE",
      payload: { door_id: "door-12", stage_code: "FRAME", previous_version: 1 },
    });

    expect(buildEventSummary(event)).toBe("Door door-12 · stage FRAME done");
    expect(buildEventSummary(event, "ru", { doorLabel: "A-201" })).toBe("Дверь A-201 · этап FRAME выполнен");
  });

  it("renders an issue fix report summary", () => {
    const event = makeEvent({ type: "ISSUE_FIX_REPORT", payload: { issue_id: "issue-1", door_id: "door-12" } });
    expect(buildEventSummary(event)).toBe("Door door-12 · issue fixed");
  });

  it("renders a useful add-on summary", () => {
    const event = makeEvent({
      type: "ADDON_FACT_CREATE",
      payload: { addon_type_id: "addon-44", qty_done: "3" },
    });

    expect(buildEventSummary(event)).toBe("Add-on addon-44 qty 3");
  });

  it("renders a useful issue summary", () => {
    const event = makeEvent({
      type: "ISSUE_CREATE",
      payload: { title: "Opening is blocked" },
    });

    expect(buildEventSummary(event)).toBe("Issue: Opening is blocked");
  });

  it("falls back to safe defaults when payload is incomplete", () => {
    const event = makeEvent({
      type: "DOOR_SET_STATUS",
      payload: {},
    });

    expect(buildEventSummary(event)).toBe("Door door -> UNKNOWN");
  });

  it("maps queue statuses to consistent tones", () => {
    expect(getStatusTone("PENDING")).toBe("#2D8F4E");
    expect(getStatusTone("FAILED")).toBe("#A65300");
    expect(getStatusTone("BLOCKED")).toBe("#C0392B");
  });

  it("explains assignment conflicts and prevents blind retry", () => {
    const event = makeEvent({
      status: "BLOCKED",
      error: "CONFLICT_ASSIGNMENT_CHANGED",
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Assignment changed");
    expect(resolution.action).toContain("Sync to refresh assignments");
    expect(resolution.retryAllowed).toBe(false);
    expect(resolution.dropAllowed).toBe(true);
    expect(canRetrySyncEvent(event)).toBe(false);
  });

  it("explains invalid status transitions as stale queue items", () => {
    const event = makeEvent({
      status: "BLOCKED",
      error: "CONFLICT_INVALID_TRANSITION",
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Status step is no longer valid");
    expect(resolution.retryAllowed).toBe(false);
    expect(resolution.dropAllowed).toBe(true);
  });

  it("prevents dropping auth-blocked work because the installer must sign in again", () => {
    const event = makeEvent({
      status: "BLOCKED",
      error: "AUTH_REQUIRED",
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Sign in again");
    expect(resolution.retryAllowed).toBe(false);
    expect(resolution.dropAllowed).toBe(false);
  });

  it("lets an auth-looking transport error retry once its auto retries are exhausted", () => {
    // Regression (audit A3): "HTTP 401 ... (auto retry limit reached)" had neither retry nor drop.
    const event = makeEvent({ status: "BLOCKED", attempts: MAX_AUTO_RETRY_ATTEMPTS,
      error: "HTTP 401 Unauthorized (auto retry limit reached)" });
    const resolution = buildQueueResolution(event);
    expect(resolution.retryAllowed).toBe(true);
    expect(resolution.dropAllowed).toBe(true); // same as any exhausted item
    expect(buildQueueResolution(makeEvent({ status: "BLOCKED", error: "AUTH_REQUIRED" })).retryAllowed).toBe(false);
  });

  it("allows manual retry for auto retry limit failures", () => {
    const event = makeEvent({
      status: "BLOCKED",
      error: "Network timeout (auto retry limit reached)",
      attempts: 8,
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Retry limit reached");
    expect(resolution.retryAllowed).toBe(true);
    expect(resolution.dropAllowed).toBe(true);
    expect(canRetrySyncEvent(event)).toBe(true);
  });

  it("explains failed items as temporary sync failures", () => {
    const event = makeEvent({
      status: "FAILED",
      error: "Network timeout",
      attempts: 2,
      next_retry_at: "2026-03-01T12:05:00Z",
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Temporary sync failure");
    expect(resolution.retryAllowed).toBe(true);
    expect(resolution.dropAllowed).toBe(false);
  });

  it("does not allow blind retry for blocked items that need manual review", () => {
    const event = makeEvent({
      status: "BLOCKED",
      error: "Office review needed",
      attempts: 2,
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Manual review needed");
    expect(resolution.action).toContain("Do not retry blindly");
    expect(resolution.retryAllowed).toBe(false);
    expect(resolution.dropAllowed).toBe(true);
  });

  it("keeps pending work retryable but not droppable from the worker queue", () => {
    const event = makeEvent({
      status: "PENDING",
      error: null,
    });

    const resolution = buildQueueResolution(event);

    expect(resolution.title).toBe("Waiting for sync");
    expect(resolution.retryAllowed).toBe(true);
    expect(resolution.dropAllowed).toBe(false);
  });

  it("renders Russian queue summaries without mojibake", () => {
    const event = makeEvent({
      type: "DOOR_SET_STATUS",
      payload: { door_id: "door-12", status: "INSTALLED" },
      status: "BLOCKED",
      error: "CONFLICT_ASSIGNMENT_CHANGED",
    });

    expect(buildEventSummary(event, "ru")).toBe("Дверь door-12 → Установлено");
    expect(buildQueueResolution(event, "ru").title).toBe("Назначение изменилось");
  });

  it("renders Hebrew queue summaries and resolutions", () => {
    const event = makeEvent({
      type: "ISSUE_CREATE",
      payload: { title: "פתח חסום" },
      status: "PENDING",
    });

    expect(buildEventSummary(event, "he")).toBe("תקלה: פתח חסום");
    expect(buildQueueResolution(event, "he").title).toBe("ממתין לסנכרון");
  });
});
