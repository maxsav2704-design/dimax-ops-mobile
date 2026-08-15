import { describe, expect, it } from "vitest";
import {
  buildEventSummary,
  buildQueueResolution,
  canRetrySyncEvent,
  getStatusTone,
} from "@/modules/sync/presentation";
import type { PendingSyncEvent } from "@/modules/sync/types";

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
  it("renders a useful door status summary", () => {
    const event = makeEvent({
      type: "DOOR_SET_STATUS",
      payload: { door_id: "door-12", status: "NOT_INSTALLED" },
    });

    expect(buildEventSummary(event)).toBe("Door door-12 -> Not installed");
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
    expect(resolution.action).toContain("Refresh data first");
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
