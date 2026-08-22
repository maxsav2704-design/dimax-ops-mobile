import { apiFetch } from "@/lib/api";
import { addLocalDays } from "@/lib/date-key";
import { ApiError, NetworkError } from "@/lib/errors";
import { getCalendarSnapshot, saveCalendarSnapshot } from "@/modules/calendar/repository";
import type { InstallerCalendarSnapshot, InstallerCalendarViewModel } from "@/modules/calendar/types";

type CalendarEventsResponse = {
  items: InstallerCalendarSnapshot["items"];
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCalendarEventsResponse(payload: unknown): payload is CalendarEventsResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return Array.isArray(candidate.items) && candidate.items.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const event = item as Record<string, unknown>;
    return (
      typeof event.id === "string" &&
      typeof event.title === "string" &&
      typeof event.event_type === "string" &&
      typeof event.starts_at === "string" &&
      typeof event.ends_at === "string" &&
      isNullableString(event.location) &&
      isNullableString(event.waze_url) &&
      isNullableString(event.description) &&
      isNullableString(event.project_id) &&
      Array.isArray(event.installer_ids) &&
      event.installer_ids.every((id) => typeof id === "string")
    );
  });
}

function isCalendarSnapshot(payload: unknown): payload is InstallerCalendarSnapshot {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.range_key === "string" &&
    typeof candidate.starts_at === "string" &&
    typeof candidate.ends_at === "string" &&
    isNullableString(candidate.generated_at) &&
    isCalendarEventsResponse({ items: candidate.items })
  );
}

function buildRange(days: number) {
  const starts = new Date();
  starts.setHours(0, 0, 0, 0);
  const ends = addLocalDays(starts, days);
  return {
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
  };
}

export async function loadInstallerCalendar(rangeKey = "7d"): Promise<InstallerCalendarViewModel> {
  const days = rangeKey === "today" ? 1 : rangeKey === "30d" ? 30 : 7;
  const range = buildRange(days);
  const path =
    `/api/v1/installer/calendar/events?starts_at=${encodeURIComponent(range.starts_at)}` +
    `&ends_at=${encodeURIComponent(range.ends_at)}`;

  try {
    const response = await apiFetch<unknown>(path);
    if (!isCalendarEventsResponse(response)) {
      throw new Error("Calendar response does not match the mobile contract.");
    }
    const snapshot: InstallerCalendarSnapshot = {
      range_key: rangeKey,
      starts_at: range.starts_at,
      ends_at: range.ends_at,
      items: response.items,
      generated_at: new Date().toISOString(),
    };
    try {
      await saveCalendarSnapshot(snapshot);
    } catch {
      return {
        snapshot,
        source: "online",
        message: "The current calendar is loaded, but its offline copy could not be updated.",
      };
    }
    return {
      snapshot,
      source: "online",
      message: null,
    };
  } catch (error) {
    let cached: InstallerCalendarSnapshot | null = null;
    try {
      cached = await getCalendarSnapshot(rangeKey);
    } catch {
      return {
        snapshot: null,
        source: "unavailable",
        message: "The calendar and its offline copy are temporarily unavailable.",
      };
    }
    if (cached && isCalendarSnapshot(cached)) {
      return {
        snapshot: cached,
        source: "cache",
        message:
          error instanceof NetworkError
            ? "Showing cached calendar while the network is unavailable."
            : "Showing last cached calendar snapshot.",
      };
    }

    if (error instanceof ApiError && error.status === 404) {
      return {
        snapshot: null,
        source: "unavailable",
        message: "Calendar contract is not connected yet on the backend.",
      };
    }

    return {
      snapshot: null,
      source: "unavailable",
      message: error instanceof Error ? error.message : "Failed to load calendar.",
    };
  }
}
