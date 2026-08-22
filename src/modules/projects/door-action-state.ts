import type { InstallerDoor, ProjectAddonTypeOption } from "@/modules/projects/types";
import { normalizeAddonQuantity } from "@/modules/addons/quantity";

type DoorActionInput = {
  door: Pick<InstallerDoor, "status" | "is_locked">;
  busy: boolean;
  selectedReasonId?: string | null;
  hasPendingStatusEvent?: boolean;
};

export type DoorActionState = {
  isLocked: boolean;
  needsNotInstalledReason: boolean;
  canMarkInstalled: boolean;
  canMarkNotInstalled: boolean;
  hasPendingStatusEvent: boolean;
};

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
  const hasPendingStatusEvent = Boolean(input.hasPendingStatusEvent);
  const needsNotInstalledReason = !input.selectedReasonId?.trim();
  return {
    isLocked,
    hasPendingStatusEvent,
    needsNotInstalledReason,
    canMarkInstalled: !input.busy && !isLocked && !hasPendingStatusEvent,
    canMarkNotInstalled: !input.busy && !isLocked && !hasPendingStatusEvent && !needsNotInstalledReason,
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
