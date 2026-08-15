import { apiFetch } from "@/lib/api";
import { hydrateProjectDetails } from "@/modules/projects/repository";
import type { ProjectDetailsResponse } from "@/modules/projects/types";

export async function refreshProjectDetails(projectId: string): Promise<void> {
  const details = await apiFetch<ProjectDetailsResponse>(`/api/v1/installer/projects/${projectId}`);
  await hydrateProjectDetails(details);
}
