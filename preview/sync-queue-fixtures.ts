import type { PendingSyncEvent } from "../src/modules/sync/types";
import { canRetrySyncEvent } from "../src/modules/sync/presentation";

// Disposable, in-memory data. No network, credentials or device database.
export type QueuePreviewMode = "mixed" | "offline" | "unavailable" | "empty";
let mode: QueuePreviewMode = "mixed";
let events: PendingSyncEvent[] = [];
let syncedAt: string | null = null;
export function resetQueuePreview(value: QueuePreviewMode) {
  mode = value; syncedAt = null;
  const base: PendingSyncEvent = {
    client_event_id: "preview-event-201", project_id: "preview-project", type: "DOOR_SET_STATUS",
    payload: { door_id: "door-201", status: "INSTALLED" }, status: "PENDING", error: null, attempts: 0,
    created_at: "2026-10-01T08:30:00Z", happened_at: null, last_attempt_at: null, next_retry_at: null,
  };
  events = value === "empty" ? [] : [
    base,
    { ...base, client_event_id: "preview-event-202", payload: { door_id: "door-202", status: "INSTALLED" }, status: "BLOCKED", error: "CONFLICT_ASSIGNMENT_CHANGED", attempts: 1 },
    { ...base, client_event_id: "preview-event-addon", type: "ADDON_FACT_CREATE", payload: { addon_type_id: "adjustment", qty_done: "3" }, status: "FAILED", error: "TEST: connection unavailable", attempts: 2, next_retry_at: "2026-10-01T08:35:00Z" },
  ];
  if (value !== "empty" && new URLSearchParams(window.location.search).get("prices") === "conflict") {
    events = [{ ...base, status: "BLOCKED", error: "CONFLICT_FACTORY_PRICE", attempts: 1,
      happened_at: "2026-09-30T10:12:00Z",
      payload: { ...base.payload, price_list_id: "00000000-0000-4000-8000-000000000001" } }];
  }
}
resetQueuePreview("mixed");
export async function listPendingEvents() {
  if (mode === "unavailable") throw new Error("TEST: local queue unavailable");
  return structuredClone(events);
}
export async function getSyncQueueSummary() {
  await listPendingEvents();
  return { total: events.length, pending: events.filter((row) => row.status === "PENDING").length, failed: events.filter((row) => row.status === "FAILED").length, blocked: events.filter((row) => row.status === "BLOCKED").length, ready_to_send: events.filter(canRetrySyncEvent).length, next_retry_at: null };
}
export const getLastSyncAt = async () => syncedAt;
export async function retryPendingEventNow(id: string) {
  events = events.map((event) => event.client_event_id === id ? { ...event, status: "PENDING", attempts: 0, error: null, next_retry_at: null } : event);
}
export async function dropPendingEvent(id: string) { events = events.filter((event) => event.client_event_id !== id); }
export async function syncQueuePreview() {
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (mode === "offline") throw new Error("TEST: offline / нет связи / אין חיבור");
  events = events.filter((event) => !canRetrySyncEvent(event));
  syncedAt = new Date().toISOString();
  return { server_time: syncedAt };
}
const project = { id: "preview-project", name: "DIMAX / North Tower A", address: "14 Herzl", status: "ACTIVE", lifecycle_status: "ACTIVE" as const, health_status: "NORMAL" as const, waze_url: null };
export const listProjects = async () => [project];
export const getProject = async (id: string) => id === project.id ? project : null;
export const listProjectDoors = async (_id: string) => [{ id: "door-201", unit_label: "A-2-201 / EN-201" }, { id: "door-202", unit_label: "A-2-202 / FIRE-RESISTANT-DOOR-202" }];
export const listProjectAddonTypes = async (_id: string) => [{ id: "adjustment", name: "Adjustment / Регулировка / כיוון" }];
export const listProjectIssues = async (_id: string) => [];
