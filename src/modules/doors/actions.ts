import { queueAddonFactEvent, queueDoorStageCompleteEvent, queueDoorStatusEvent } from "@/modules/sync/service";
import { captureWorkspaceContext, withWorkspaceDatabase } from "@/lib/workspace-context";

export async function markDoorInstalled(projectId: string, doorId: string) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () =>
    queueDoorStatusEvent({ projectId, doorId, status: "INSTALLED" })
  );
}

export async function markDoorNotInstalled(
  projectId: string,
  doorId: string,
  reasonId: string,
  comment?: string
) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () => queueDoorStatusEvent({
    projectId,
    doorId,
    status: "NOT_INSTALLED",
    reasonId,
    comment,
  }));
}

/** Records one stage of a door installed in stages. The server values it; the device sends no price. */
export async function completeDoorStage(projectId: string, doorId: string, stageCode: string) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () =>
    queueDoorStageCompleteEvent({ projectId, doorId, stageCode })
  );
}

export async function addAddonFact(
  projectId: string,
  addonTypeId: string,
  qtyDone: string,
  comment?: string
) {
  return withWorkspaceDatabase(captureWorkspaceContext(), () => queueAddonFactEvent({
    projectId,
    addonTypeId,
    qtyDone,
    comment,
  }));
}
