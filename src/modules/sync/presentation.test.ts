import { describe, expect, it } from "vitest";
import { buildEventSummary, getStatusTone } from "@/modules/sync/presentation";
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

    expect(buildEventSummary(event)).toBe("Door door-12 -> NOT_INSTALLED");
  });

  it("renders a useful add-on summary", () => {
    const event = makeEvent({
      type: "ADDON_FACT_CREATE",
      payload: { addon_type_id: "addon-44", qty_done: "3" },
    });

    expect(buildEventSummary(event)).toBe("Add-on addon-44 qty 3");
  });

  it("falls back to safe defaults when payload is incomplete", () => {
    const event = makeEvent({
      type: "DOOR_SET_STATUS",
      payload: {},
    });

    expect(buildEventSummary(event)).toBe("Door door -> UNKNOWN");
  });

  it("maps queue statuses to consistent tones", () => {
    expect(getStatusTone("PENDING")).toBe("#63d297");
    expect(getStatusTone("FAILED")).toBe("#ffb86b");
    expect(getStatusTone("BLOCKED")).toBe("#ff8b8b");
  });
});
