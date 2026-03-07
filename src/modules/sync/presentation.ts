import type { PendingSyncEvent } from "@/modules/sync/types";

export function buildEventSummary(event: PendingSyncEvent): string {
  if (event.type === "DOOR_SET_STATUS") {
    const doorId = typeof event.payload.door_id === "string" ? event.payload.door_id : "door";
    const status = typeof event.payload.status === "string" ? event.payload.status : "UNKNOWN";
    return `Door ${doorId} -> ${status}`;
  }
  if (event.type === "ADDON_FACT_CREATE") {
    const addonTypeId = typeof event.payload.addon_type_id === "string" ? event.payload.addon_type_id : "addon";
    const qtyDone = typeof event.payload.qty_done === "string" ? event.payload.qty_done : "-";
    return `Add-on ${addonTypeId} qty ${qtyDone}`;
  }
  return event.type;
}

export function getStatusTone(status: PendingSyncEvent["status"]): string {
  if (status === "BLOCKED") return "#ff8b8b";
  if (status === "FAILED") return "#ffb86b";
  return "#63d297";
}
