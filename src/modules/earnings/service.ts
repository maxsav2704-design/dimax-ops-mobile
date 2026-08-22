import { apiFetch } from "@/lib/api";
import { addLocalDays, currentLocalDateKey, dateKeyToLocalDate, formatLocalDateKey } from "@/lib/date-key";
import { ApiError, NetworkError } from "@/lib/errors";
import { getEarningsSnapshot, saveEarningsSnapshot } from "@/modules/earnings/repository";
import type { InstallerEarningsSummary, InstallerEarningsViewModel } from "@/modules/earnings/types";

function isInstallerEarningsSummary(payload: unknown): payload is InstallerEarningsSummary {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.period_key === "string" &&
    typeof candidate.currency === "string" &&
    typeof candidate.today_total === "string" &&
    typeof candidate.month_total === "string" &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.install_types) &&
    Array.isArray(candidate.rows)
  );
}

function numericValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInstallerEarningsSummary(
  payload: InstallerEarningsSummary
): InstallerEarningsSummary {
  return {
    ...payload,
    days: payload.days.map((item) => ({
      ...item,
      jobs_count: numericValue(item.jobs_count),
    })),
    install_types: payload.install_types.map((item) => ({
      ...item,
      quantity: numericValue(item.quantity),
    })),
    rows: payload.rows.map((item) => ({
      ...item,
      quantity: numericValue(item.quantity),
    })),
  };
}

function anchorDateValue(anchorDate?: string | null): string {
  const trimmed = anchorDate?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return currentLocalDateKey();
}

function periodKeyFor(period: "day" | "week" | "month", anchorDate?: string | null): string {
  const day = anchorDateValue(anchorDate);
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
  const requestedPeriodKey = periodKeyFor(period, anchorDate);
  const params = new URLSearchParams({ period });
  if (anchorDate) {
    params.set("date", anchorDate);
  }
  const suffix = `?${params.toString()}`;

  try {
    const snapshot = await apiFetch<unknown>(
      `/api/v1/installer/earnings/summary${suffix}`
    );
    if (!isInstallerEarningsSummary(snapshot)) {
      return {
        snapshot: null,
        source: "unavailable",
        message: "Mobile earnings view is waiting for the canonical backend summary shape.",
      };
    }
    const normalizedSnapshot = normalizeInstallerEarningsSummary(snapshot);
    try {
      await saveEarningsSnapshot(normalizedSnapshot);
    } catch {
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
    let cached: InstallerEarningsSummary | null = null;
    try {
      cached = await getEarningsSnapshot(requestedPeriodKey);
    } catch {
      return {
        snapshot: null,
        source: "unavailable",
        message: `Earnings for ${requestedPeriodKey} and their offline copy are temporarily unavailable.`,
      };
    }
    if (cached && isInstallerEarningsSummary(cached)) {
      return {
        snapshot: normalizeInstallerEarningsSummary(cached),
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
