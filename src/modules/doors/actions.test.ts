import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: { ownerKey: "company-a:installer-a" },
  generation: 1,
  queueDoor: vi.fn(), queueAddon: vi.fn(),
  localTask: null as null | (() => Promise<unknown>),
}));
vi.mock("@/lib/api", () => ({ getAuthSessionGeneration: () => mocks.generation }));
vi.mock("@/lib/db", () => ({
  getDatabaseContext: () => mocks.context,
  withDatabaseContext: (_context: unknown, operation: () => Promise<unknown>) => {
    // Model the real database queue: work starts only after earlier local work ends.
    return new Promise((resolve, reject) => {
      mocks.localTask = async () => {
        try { resolve(await operation()); } catch (error) { reject(error); }
      };
    });
  },
}));
vi.mock("@/modules/sync/service", () => ({ queueDoorStatusEvent: mocks.queueDoor, queueAddonFactEvent: mocks.queueAddon }));

import { addAddonFact, markDoorInstalled, markDoorNotInstalled } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context = { ownerKey: "company-a:installer-a" };
  mocks.generation = 1;
  mocks.localTask = null;
});

describe("field work serialization", () => {
  const actions = [
    { name: "installed", run: () => markDoorInstalled("project-a", "door-a"), queue: mocks.queueDoor, payload: { projectId: "project-a", doorId: "door-a", status: "INSTALLED" } },
    { name: "not installed", run: () => markDoorNotInstalled("project-a", "door-a", "reason-a", "No access"), queue: mocks.queueDoor, payload: { projectId: "project-a", doorId: "door-a", status: "NOT_INSTALLED", reasonId: "reason-a", comment: "No access" } },
    { name: "add-on", run: () => addAddonFact("project-a", "addon-a", "2", "Adjustment"), queue: mocks.queueAddon, payload: { projectId: "project-a", addonTypeId: "addon-a", qtyDone: "2", comment: "Adjustment" } },
  ];

  it.each(actions)("serializes $name with sync and account activation", async ({ run, queue, payload }) => {
    const result = run();
    expect(queue).not.toHaveBeenCalled();
    await mocks.localTask!();
    await result;
    expect(queue).toHaveBeenCalledExactlyOnceWith(payload);
  });

  it.each(actions)("rejects $name if the account changes before its local turn", async ({ run, queue }) => {
    const result = run();
    const rejected = expect(result).rejects.toThrow();
    mocks.context = { ownerKey: "company-b:installer-b" };
    mocks.generation += 1;
    await mocks.localTask!();
    await rejected;
    expect(queue).not.toHaveBeenCalled();
  });
});
