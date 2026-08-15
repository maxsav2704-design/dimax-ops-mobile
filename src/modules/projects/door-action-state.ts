import type { InstallerDoor, ProjectAddonTypeOption } from "@/modules/projects/types";

type DoorActionInput = {
  door: Pick<InstallerDoor, "status" | "is_locked">;
  busy: boolean;
  selectedReasonId?: string | null;
};

export type DoorActionState = {
  isLocked: boolean;
  needsNotInstalledReason: boolean;
  canMarkInstalled: boolean;
  canMarkNotInstalled: boolean;
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
  const needsNotInstalledReason = !input.selectedReasonId?.trim();
  return {
    isLocked,
    needsNotInstalledReason,
    canMarkInstalled: !input.busy && !isLocked,
    canMarkNotInstalled: !input.busy && !isLocked && !needsNotInstalledReason,
  };
}

export function normalizeAddonQty(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(",", ".") || "";
  if (!/^\d+(\.\d+)?$/.test(normalized) || Number.parseFloat(normalized) <= 0) {
    return null;
  }
  return normalized;
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
