import { apiFetch } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/errors";
import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";
import { hydrateProjectDetails } from "@/modules/projects/repository";
import type { ProjectDetailsResponse } from "@/modules/projects/types";
import { getSyncQueueSummary } from "@/modules/sync/service";

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
  const context = captureWorkspaceContext();
  assertWorkspaceContext(context);
  const details = await apiFetch<ProjectDetailsResponse>(`/api/v1/installer/projects/${projectId}`, {
    expectedAuthGeneration: context.authGeneration,
  });
  await withWorkspaceDatabase(context, async () => {
    // A field update may have been queued while this network request was in flight.
    const queue = await getSyncQueueSummary(projectId);
    if (canRefreshProjectDetails(queue.pending + queue.failed)) {
      await hydrateProjectDetails(details);
    }
  });
  assertWorkspaceContext(context);
}
