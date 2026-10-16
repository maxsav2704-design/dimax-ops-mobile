import { apiFetch } from "@/lib/api";
import { addLocalDays, currentLocalDateKey, dateKeyToLocalDate, formatLocalDateKey, parseLocalDateKey } from "@/lib/date-key";
import { ApiError, NetworkError, SessionChangedError } from "@/lib/errors";
import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";
import { getEarningsSnapshot, saveEarningsSnapshot } from "@/modules/earnings/repository";
import type { InstallerEarningsSummary, InstallerEarningsViewModel } from "@/modules/earnings/types";
import { parseEarningsSummary } from "./contract";

let requestSequence = 0;
const savedRequests = new WeakMap<object, Map<string, number>>();

function periodKeyFor(period: "day" | "week" | "month", anchorDate?: string | null): string {
  const day = parseLocalDateKey(anchorDate) || currentLocalDateKey();
  if (period === "day") {
    return day;
  }
  if (period === "month") {
    return day.slice(0, 7);
  }

  const date = dateKeyToLocalDate(day);
  const weekday = date.getDay() || 7;
  const weekStart = addLocalDays(date, 1 - weekday);
  const weekEnd = addLocalDays(weekStart, 6);
  return `${formatLocalDateKey(weekStart)}..${formatLocalDateKey(weekEnd)}`;
}

export async function loadInstallerEarnings(
  period: "day" | "week" | "month" = "month",
  anchorDate?: string | null
): Promise<InstallerEarningsViewModel> {
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const anchor = parseLocalDateKey(anchorDate);
  const requestedPeriodKey = periodKeyFor(period, anchorDate);
  const requestNumber = ++requestSequence;
  const params = new URLSearchParams({ period });
  if (anchor) {
    params.set("date", anchor);
  }
  const suffix = `?${params.toString()}`;

  try {
    const snapshot = await apiFetch<unknown>(
      `/api/v1/installer/earnings/summary${suffix}`,
      { expectedAuthGeneration: context.authGeneration },
    );
    assertWorkspaceContext(context);
    const normalizedSnapshot = parseEarningsSummary(snapshot, requestedPeriodKey);
    if (!normalizedSnapshot) throw new Error("Mobile earnings view is waiting for the canonical backend summary shape.");
    try {
      await withWorkspaceDatabase(context, async () => {
        // Do not let a late focus refresh replace a newer offline calculation.
        const saved = savedRequests.get(context.database!) || new Map<string, number>();
        if ((saved.get(requestedPeriodKey) || 0) > requestNumber) return;
        await saveEarningsSnapshot(normalizedSnapshot);
        saved.set(requestedPeriodKey, requestNumber);
        savedRequests.set(context.database!, saved);
      });
      assertWorkspaceContext(context);
    } catch (error) {
      assertWorkspaceContext(context);
      if (error instanceof SessionChangedError) throw error;
      return {
        snapshot: normalizedSnapshot,
        source: "online",
        message: "Current earnings are loaded, but their offline copy could not be updated.",
      };
    }
    return {
      snapshot: normalizedSnapshot,
      source: "online",
      message: null,
    };
  } catch (error) {
    assertWorkspaceContext(context);
    if (error instanceof SessionChangedError) throw error;
    let cached: InstallerEarningsSummary | null = null;
    try {
      cached = await withWorkspaceDatabase(context, () => getEarningsSnapshot(requestedPeriodKey));
      assertWorkspaceContext(context);
    } catch (cacheError) {
      assertWorkspaceContext(context);
      if (cacheError instanceof SessionChangedError) throw cacheError;
      return {
        snapshot: null,
        source: "unavailable",
        message: `Earnings for ${requestedPeriodKey} and their offline copy are temporarily unavailable.`,
      };
    }
    const validCached = parseEarningsSummary(cached, requestedPeriodKey);
    if (validCached) {
      return {
        snapshot: validCached,
        source: "cache",
        message:
          error instanceof NetworkError
            ? `Showing cached earnings for ${requestedPeriodKey} while the network is unavailable.`
            : `Showing cached earnings for ${requestedPeriodKey}.`,
      };
    }

    if (error instanceof ApiError && error.status === 404) {
      return {
        snapshot: null,
        source: "unavailable",
        message: "Earnings contract is not connected yet on the backend.",
      };
    }

    return {
      snapshot: null,
      source: "unavailable",
      message:
        error instanceof NetworkError
          ? `No cached earnings are available for ${requestedPeriodKey}.`
          : error instanceof Error
            ? error.message
            : "Failed to load earnings.",
    };
  }
}
