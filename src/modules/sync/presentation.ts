import { translateEnum, type MobileLocale } from "@/lib/i18n";
import type { PendingSyncEvent } from "@/modules/sync/types";

export function buildEventSummary(event: PendingSyncEvent, locale: MobileLocale = "en"): string {
  if (event.type === "DOOR_SET_STATUS") {
    const doorId = typeof event.payload.door_id === "string" ? event.payload.door_id : locale === "ru" ? "дверь" : "door";
    const status =
      typeof event.payload.status === "string"
        ? locale === "ru"
          ? translateEnum(locale, event.payload.status)
          : event.payload.status
        : locale === "ru"
          ? "Неизвестно"
          : "UNKNOWN";
    return locale === "ru" ? `Дверь ${doorId} → ${status}` : `Door ${doorId} -> ${status}`;
  }
  if (event.type === "ADDON_FACT_CREATE") {
    const addonTypeId = typeof event.payload.addon_type_id === "string" ? event.payload.addon_type_id : locale === "ru" ? "допработа" : "addon";
    const qtyDone = typeof event.payload.qty_done === "string" ? event.payload.qty_done : "-";
    return locale === "ru" ? `Допработа ${addonTypeId}, кол-во ${qtyDone}` : `Add-on ${addonTypeId} qty ${qtyDone}`;
  }
  return translateEnum(locale, event.type);
}

export function getStatusTone(status: PendingSyncEvent["status"]): string {
  if (status === "BLOCKED") return "#ff8b8b";
  if (status === "FAILED") return "#ffb86b";
  return "#63d297";
}
