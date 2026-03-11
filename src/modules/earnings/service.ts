import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/errors";
import { getLatestEarningsSnapshot, saveEarningsSnapshot } from "@/modules/earnings/repository";
import type { InstallerEarningsSummary, InstallerEarningsViewModel } from "@/modules/earnings/types";

export async function loadInstallerEarnings(
  periodKey?: string
): Promise<InstallerEarningsViewModel> {
  const suffix = periodKey ? `?period=${encodeURIComponent(periodKey)}` : "";

  try {
    const snapshot = await apiFetch<InstallerEarningsSummary>(
      `/api/v1/installer/earnings/summary${suffix}`
    );
    await saveEarningsSnapshot(snapshot);
    return {
      snapshot,
      source: "online",
      message: null,
    };
  } catch (error) {
    const cached = await getLatestEarningsSnapshot();
    if (cached) {
      return {
        snapshot: cached,
        source: "cache",
        message:
          error instanceof NetworkError
            ? "Showing cached earnings while the network is unavailable."
            : "Showing last cached earnings snapshot.",
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
      message: error instanceof Error ? error.message : "Failed to load earnings.",
    };
  }
}
