import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/errors";
import { getCalendarSnapshot, saveCalendarSnapshot } from "@/modules/calendar/repository";
import type { InstallerCalendarSnapshot, InstallerCalendarViewModel } from "@/modules/calendar/types";

type CalendarEventsResponse = {
  items: InstallerCalendarSnapshot["items"];
};

function buildRange(days: number) {
  const starts = new Date();
  const ends = new Date(starts.getTime() + days * 24 * 60 * 60 * 1000);
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
    const response = await apiFetch<CalendarEventsResponse>(path);
    const snapshot: InstallerCalendarSnapshot = {
      range_key: rangeKey,
      starts_at: range.starts_at,
      ends_at: range.ends_at,
      items: response.items || [],
      generated_at: new Date().toISOString(),
    };
    await saveCalendarSnapshot(snapshot);
    return {
      snapshot,
      source: "online",
      message: null,
    };
  } catch (error) {
    const cached = await getCalendarSnapshot(rangeKey);
    if (cached) {
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
