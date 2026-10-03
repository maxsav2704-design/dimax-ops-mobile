import type { PendingSyncEvent } from "./types";

export function commandPayload(event: Pick<PendingSyncEvent, "type" | "payload">): Record<string, unknown> {
  const payload = { ...event.payload };
  if (event.type === "DOOR_SET_STATUS") {
    // Undo data stays in SQLite; previous_version remains the server concurrency guard.
    delete payload.previous_status;
    delete payload.previous_reason_id;
    delete payload.previous_comment;
    delete payload.previous_is_locked;
  }
  return payload;
}
