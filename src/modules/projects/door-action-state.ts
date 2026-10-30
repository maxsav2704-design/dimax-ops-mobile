import type { DoorStage, InstallerDoor, ProjectAddonTypeOption } from "@/modules/projects/types";
import { normalizeAddonQuantity } from "@/modules/addons/quantity";

type DoorActionInput = {
  door: Pick<InstallerDoor, "status" | "is_locked">;
  busy: boolean;
  selectedReasonId?: string | null;
  hasPendingStatusEvent?: boolean;
  /** The office split this door into stages: whole-door actions are never offered, only the installer's stages. */
  installedByStages?: boolean;
};

export type DoorActionState = {
  isLocked: boolean;
  installedByStages: boolean;
  needsNotInstalledReason: boolean;
  /** The reason form may open before a reason is chosen; only the confirmation needs one. */
  canOpenNotInstalled: boolean;
  canMarkInstalled: boolean;
  canMarkNotInstalled: boolean;
  hasPendingStatusEvent: boolean;
};

type StageActionInput = {
  stage: Pick<DoorStage, "assigned_to_me" | "completed_at">;
  door: Pick<InstallerDoor, "status" | "is_locked">;
  busy: boolean;
  hasPendingStageEvent?: boolean;
};

export type StageActionState = {
  isMine: boolean;
  isDone: boolean;
  hasPendingStageEvent: boolean;
  canComplete: boolean;
};

/** One stage of a staged door: only the assigned installer can record it, once, while the door is open. */
export function buildStageActionState(input: StageActionInput): StageActionState {
  const isLocked = input.door.is_locked || input.door.status === "LOCKED" || input.door.status === "INSTALLED";
  const isMine = Boolean(input.stage.assigned_to_me);
  const isDone = Boolean(input.stage.completed_at);
  const hasPendingStageEvent = Boolean(input.hasPendingStageEvent);
  return {
    isMine,
    isDone,
    hasPendingStageEvent,
    canComplete: !input.busy && !isLocked && isMine && !isDone && !hasPendingStageEvent,
  };
}

type AddonFactActionInput = {
  addonTypes: Array<Pick<ProjectAddonTypeOption, "id">>;
  selectedAddonTypeId?: string | null;
  qtyDone?: string | null;
  busy: boolean;
};

export type AddonFactActionState = {
  hasAddonTypes: boolean;
  hasValidAddonType: boolean;
  hasValidQty: boolean;
  normalizedQtyDone: string | null;
  canQueueAddonFact: boolean;
};

export function buildDoorActionState(input: DoorActionInput): DoorActionState {
  const isLocked = input.door.is_locked || input.door.status === "LOCKED" || input.door.status === "INSTALLED";
  const installedByStages = Boolean(input.installedByStages);
  const hasPendingStatusEvent = Boolean(input.hasPendingStatusEvent);
  const needsNotInstalledReason = !input.selectedReasonId?.trim();
  const wholeDoorOpen = !input.busy && !isLocked && !hasPendingStatusEvent && !installedByStages;
  return {
    isLocked,
    installedByStages,
    hasPendingStatusEvent,
    needsNotInstalledReason,
    canMarkInstalled: wholeDoorOpen,
    canOpenNotInstalled: wholeDoorOpen,
    canMarkNotInstalled: wholeDoorOpen && !needsNotInstalledReason,
  };
}

export function normalizeAddonQty(value: string | null | undefined): string | null {
  return normalizeAddonQuantity(value);
}

export function buildAddonFactActionState(input: AddonFactActionInput): AddonFactActionState {
  const selectedAddonTypeId = input.selectedAddonTypeId?.trim() || "";
  const hasAddonTypes = input.addonTypes.length > 0;
  const hasValidAddonType = input.addonTypes.some((addonType) => addonType.id === selectedAddonTypeId);
  const normalizedQtyDone = normalizeAddonQty(input.qtyDone);
  const hasValidQty = normalizedQtyDone !== null;
  return {
    hasAddonTypes,
    hasValidAddonType,
    hasValidQty,
    normalizedQtyDone,
    canQueueAddonFact: !input.busy && hasAddonTypes && hasValidAddonType && hasValidQty,
  };
}
