import { queueAddonFactEvent, queueDoorStatusEvent } from "@/modules/sync/service";

export async function markDoorInstalled(projectId: string, doorId: string) {
  return queueDoorStatusEvent({ projectId, doorId, status: "INSTALLED" });
}

export async function markDoorNotInstalled(
  projectId: string,
  doorId: string,
  reasonId: string,
  comment?: string
) {
  return queueDoorStatusEvent({
    projectId,
    doorId,
    status: "NOT_INSTALLED",
    reasonId,
    comment,
  });
}

export async function addAddonFact(
  projectId: string,
  addonTypeId: string,
  qtyDone: string,
  comment?: string
) {
  return queueAddonFactEvent({
    projectId,
    addonTypeId,
    qtyDone,
    comment,
  });
}
