import {
  getProject,
  listDoorTypes,
  listProjectAddonFacts,
  listProjectAddonTypes,
  listProjectDoors,
  listProjectIssues,
  listReasons,
} from "@/modules/projects/repository";
import type {
  DoorTypeOption,
  InstallerDoor,
  ProjectAddonFact,
  ProjectAddonTypeOption,
  ProjectIssue,
  ProjectListItem,
} from "@/modules/projects/types";
import { getSyncQueueSummary, listPendingEvents } from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";

export type LocalProjectWorkspace = {
  projectId: string;
  project: ProjectListItem | null;
  doors: InstallerDoor[];
  doorTypes: DoorTypeOption[];
  issues: ProjectIssue[];
  reasons: Array<{ id: string; code: string; name: string }>;
  addonTypes: ProjectAddonTypeOption[];
  addonFacts: ProjectAddonFact[];
  pendingEvents: PendingSyncEvent[];
  queueSummary: SyncQueueSummary | null;
};

export function createEmptyLocalProjectWorkspace(projectId = ""): LocalProjectWorkspace {
  return {
    projectId,
    project: null,
    doors: [],
    doorTypes: [],
    issues: [],
    reasons: [],
    addonTypes: [],
    addonFacts: [],
    pendingEvents: [],
    queueSummary: null,
  };
}

export async function loadLocalProjectWorkspace(projectId: string): Promise<LocalProjectWorkspace> {
  const [
    project,
    doors,
    doorTypes,
    issues,
    reasons,
    addonTypes,
    addonFacts,
    pendingEvents,
    queueSummary,
  ] = await Promise.all([
    getProject(projectId),
    listProjectDoors(projectId),
    listDoorTypes(),
    listProjectIssues(projectId),
    listReasons(),
    listProjectAddonTypes(projectId),
    listProjectAddonFacts(projectId),
    listPendingEvents(projectId),
    getSyncQueueSummary(projectId),
  ]);

  return {
    projectId,
    project,
    doors,
    doorTypes,
    issues,
    reasons,
    addonTypes,
    addonFacts,
    pendingEvents,
    queueSummary,
  };
}
