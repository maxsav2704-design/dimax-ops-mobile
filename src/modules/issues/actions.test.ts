import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queue: vi.fn(), guarded: 0, context: { ownerKey: "company-a:installer-a" } }));
vi.mock("@/lib/api", () => ({ getAuthSessionGeneration: () => 1 }));
vi.mock("@/lib/db", () => ({
  // The guard compares the captured database context by identity.
  getDatabaseContext: () => mocks.context,
  withDatabaseContext: (_context: unknown, operation: () => Promise<unknown>) => {
    mocks.guarded += 1;
    return operation();
  },
}));
vi.mock("@/modules/sync/service", () => ({ queueIssueCreateEvent: mocks.queue, queueIssueFixReportEvent: mocks.queue }));

import { createIssue } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guarded = 0;
});

describe("issue creation", () => {
  it("queues the issue under the workspace database guard like door actions", async () => {
    // Regression (audit A4): the issues screen called the sync service directly.
    mocks.queue.mockResolvedValue(undefined);
    const input = { projectId: "project-a", doorId: "door-a", title: "Scratch", details: "Left panel" };
    await createIssue(input);
    expect(mocks.guarded).toBe(1);
    expect(mocks.queue).toHaveBeenCalledWith(input);
  });
});
