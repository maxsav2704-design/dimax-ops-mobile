import { dateKeyToLocalDate, formatLocalDateKey } from "@/lib/date-key";
import type { InstallerCalendarEvent } from "./types";

export function calendarDayParam(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const day = value.trim();
  return formatLocalDateKey(dateKeyToLocalDate(day)) === day ? day : null;
}

export function calendarEventDay(event: Pick<InstallerCalendarEvent, "starts_at">): string {
  return formatLocalDateKey(new Date(event.starts_at));
}

export function compareCalendarEvents(left: InstallerCalendarEvent, right: InstallerCalendarEvent): number {
  return Date.parse(left.starts_at) - Date.parse(right.starts_at) || left.id.localeCompare(right.id);
}

export function calendarEventAppearance(type: string) {
  switch (type.trim().toLowerCase()) {
    case "installation": case "install": return { label: "installation", tone: "info", icon: "briefcase-outline" } as const;
    case "inspection": return { label: "inspection", tone: "warning", icon: "search-outline" } as const;
    case "service": return { label: "service", tone: "warning", icon: "construct-outline" } as const;
    case "meeting": return { label: "meeting", tone: "purple", icon: "people-outline" } as const;
    case "consultation": return { label: "consultation", tone: "success", icon: "chatbubbles-outline" } as const;
    case "delivery": return { label: "delivery", tone: "accent", icon: "cube-outline" } as const;
    default: return { label: "other", tone: "neutral", icon: "calendar-outline" } as const;
  }
}
