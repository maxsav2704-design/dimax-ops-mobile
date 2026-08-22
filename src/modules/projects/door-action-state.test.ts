import { describe, expect, it } from "vitest";

import { buildAddonFactActionState, buildDoorActionState, normalizeAddonQty } from "@/modules/projects/door-action-state";

describe("door action state", () => {
  it("allows installer actions for an unlocked assigned door when a reason is selected", () => {
    expect(
      buildDoorActionState({
        door: { status: "NOT_INSTALLED", is_locked: false },
        busy: false,
        selectedReasonId: "reason-1",
      })
    ).toEqual({
      isLocked: false,
      hasPendingStatusEvent: false,
      needsNotInstalledReason: false,
      canMarkInstalled: true,
      canMarkNotInstalled: true,
    });
  });

  it("requires a reason before queueing a not-installed action", () => {
    expect(
      buildDoorActionState({
        door: { status: "NOT_INSTALLED", is_locked: false },
        busy: false,
        selectedReasonId: "",
      })
    ).toMatchObject({
      isLocked: false,
      needsNotInstalledReason: true,
      canMarkInstalled: true,
      canMarkNotInstalled: false,
    });
  });

  it("treats installed doors as locked even if stale local data missed the lock flag", () => {
    expect(
      buildDoorActionState({
        door: { status: "INSTALLED", is_locked: false },
        busy: false,
        selectedReasonId: "reason-1",
      })
    ).toMatchObject({
      isLocked: true,
      canMarkInstalled: false,
      canMarkNotInstalled: false,
    });
  });

  it("disables installer actions while a local operation is running", () => {
    expect(
      buildDoorActionState({
        door: { status: "NOT_INSTALLED", is_locked: false },
        busy: true,
        selectedReasonId: "reason-1",
      })
    ).toMatchObject({
      isLocked: false,
      canMarkInstalled: false,
      canMarkNotInstalled: false,
    });
  });

  it("disables another status action while the selected door is already queued", () => {
    expect(
      buildDoorActionState({
        door: { status: "NOT_INSTALLED", is_locked: false },
        busy: false,
        selectedReasonId: "reason-1",
        hasPendingStatusEvent: true,
      })
    ).toMatchObject({
      isLocked: false,
      hasPendingStatusEvent: true,
      canMarkInstalled: false,
      canMarkNotInstalled: false,
    });
  });

  it("normalizes add-on quantities before they reach the offline queue", () => {
    expect(normalizeAddonQty("2,50")).toBe("2.50");
    expect(normalizeAddonQty("0")).toBeNull();
    expect(normalizeAddonQty("abc")).toBeNull();
    expect(normalizeAddonQty("1.234")).toBeNull();
  });

  it("allows add-on queueing only for a valid catalog type and positive quantity", () => {
    expect(
      buildAddonFactActionState({
        addonTypes: [{ id: "addon-1" }],
        selectedAddonTypeId: "addon-1",
        qtyDone: "1,25",
        busy: false,
      })
    ).toEqual({
      hasAddonTypes: true,
      hasValidAddonType: true,
      hasValidQty: true,
      normalizedQtyDone: "1.25",
      canQueueAddonFact: true,
    });
  });

  it("blocks add-on queueing for stale selected types or invalid quantities", () => {
    expect(
      buildAddonFactActionState({
        addonTypes: [{ id: "addon-2" }],
        selectedAddonTypeId: "addon-1",
        qtyDone: "1",
        busy: false,
      })
    ).toMatchObject({
      hasValidAddonType: false,
      canQueueAddonFact: false,
    });

    expect(
      buildAddonFactActionState({
        addonTypes: [{ id: "addon-1" }],
        selectedAddonTypeId: "addon-1",
        qtyDone: "-5",
        busy: false,
      })
    ).toMatchObject({
      hasValidQty: false,
      canQueueAddonFact: false,
    });
  });
});
