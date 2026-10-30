import {
  getProject,
  listDoorTypes,
  listProjectAddonFacts,
  listProjectAddonTypes,
  listProjectDoorStages,
  listProjectDoors,
  listProjectIssues,
  listReasons,
} from "@/modules/projects/repository";
import type {
  DoorStage,
  DoorTypeOption,
  InstallerDoor,
  ProjectAddonFact,
  ProjectAddonTypeOption,
  ProjectIssue,
  ProjectListItem,
} from "@/modules/projects/types";
import { getSyncQueueSummary, listPendingEvents } from "@/modules/sync/service";
import type { PendingSyncEvent, SyncQueueSummary } from "@/modules/sync/types";
import { assertWorkspaceContext, captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";
import { SessionChangedError } from "@/lib/errors";
import { readFactoryPrices } from "@/modules/prices/repository";
import type { FactoryPriceReadState } from "@/modules/prices/contract";

export type LocalProjectWorkspace = {
  projectId: string;
  project: ProjectListItem | null;
  doors: InstallerDoor[];
  doorStages: DoorStage[];
  doorTypes: DoorTypeOption[];
  issues: ProjectIssue[];
  reasons: Array<{ id: string; code: string; name: string }>;
  addonTypes: ProjectAddonTypeOption[];
  addonFacts: ProjectAddonFact[];
  pendingEvents: PendingSyncEvent[];
  queueSummary: SyncQueueSummary | null;
  factoryPrices: FactoryPriceReadState;
};

export function createEmptyLocalProjectWorkspace(projectId = ""): LocalProjectWorkspace {
  return {
    projectId,
    project: null,
    doors: [],
    doorStages: [],
    doorTypes: [],
    issues: [],
    reasons: [],
    addonTypes: [],
    addonFacts: [],
    pendingEvents: [],
    queueSummary: null,
    factoryPrices: { status: "loading", snapshot: null },
  };
}

export async function loadLocalProjectWorkspace(projectId: string): Promise<LocalProjectWorkspace> {
  const context = captureWorkspaceContext();
  return withWorkspaceDatabase(context, async () => {
    const workspace = await readLocalProjectWorkspace(projectId);
    assertWorkspaceContext(context);
    return workspace;
  });
}

async function readLocalProjectWorkspace(projectId: string): Promise<LocalProjectWorkspace> {
  const [
    project,
    doors,
    doorStages,
    doorTypes,
    issues,
    reasons,
    addonTypes,
    addonFacts,
    pendingEvents,
    queueSummary,
    factoryPrices,
  ] = await Promise.all([
    getProject(projectId),
    listProjectDoors(projectId),
    listProjectDoorStages(projectId),
    listDoorTypes(),
    listProjectIssues(projectId),
    listReasons(),
    listProjectAddonTypes(projectId),
    listProjectAddonFacts(projectId),
    listPendingEvents(projectId),
    getSyncQueueSummary(projectId),
    readFactoryPrices().then(
      (snapshot): FactoryPriceReadState => ({ status: "ready", snapshot }),
      (error): FactoryPriceReadState => {
        if (error instanceof SessionChangedError) throw error;
        return { status: "unavailable", snapshot: null };
      },
    ),
  ]);

  return {
    projectId,
    project,
    doors,
    doorStages,
    doorTypes,
    issues,
    reasons,
    addonTypes,
    addonFacts,
    pendingEvents,
    queueSummary,
    factoryPrices,
  };
}
