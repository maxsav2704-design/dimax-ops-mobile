import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/errors";
import { hydrateProjectDetails } from "@/modules/projects/repository";
import type { ProjectDetailsResponse } from "@/modules/projects/types";

export function canRefreshProjectDetails(pendingEventCount: number): boolean {
  return pendingEventCount === 0;
}

export function canUseProjectCacheAfterSyncFailure(
  error: unknown,
  cachedProjectCount: number,
): boolean {
  return error instanceof NetworkError && cachedProjectCount > 0;
}

export function isProjectAccessRevoked(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export async function refreshProjectDetails(projectId: string): Promise<void> {
  const details = await apiFetch<ProjectDetailsResponse>(`/api/v1/installer/projects/${projectId}`);
  await hydrateProjectDetails(details);
}
