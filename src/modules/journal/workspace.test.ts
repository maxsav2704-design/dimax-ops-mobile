import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalFixture as journal } from "./test-fixtures";
import { SessionChangedError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ context: { ownerKey: "company:installer" }, projects: vi.fn(), doors: vi.fn(), journals: vi.fn() }));
vi.mock("@/lib/api", () => ({ getAuthSessionGeneration: () => 0 }));
vi.mock("@/lib/db", () => ({ getDatabaseContext: () => mocks.context, withDatabaseContext: async (_context: unknown, operation: () => Promise<unknown>) => operation() }));
vi.mock("@/modules/projects/repository", () => ({ listProjects: mocks.projects, listProjectDoors: mocks.doors }));
vi.mock("./service", () => ({ loadInstallerJournals: mocks.journals }));
import { loadJournalWorkspace } from "./workspace";

beforeEach(() => {
  mocks.context = { ownerKey: "company:installer" };
  mocks.projects.mockReset().mockResolvedValue([{ id: journal.project_id, name: journal.project_name, address: null }]);
  mocks.doors.mockReset().mockResolvedValue([{ status: "INSTALLED" }, { status: "PENDING" }]);
  mocks.journals.mockReset().mockResolvedValue({ data: [journal], source: "online", message: null });
});
describe("journal workspace", () => {
  it("keeps local counts separate from signed/server work snapshots", async () => {
    const result = await loadJournalWorkspace();
    expect(result.data.projects[0].installedLocally).toBe(1);
    expect(result.data.journals).toEqual([journal]);
  });
  it("still shows server acts when the local project database fails", async () => {
    mocks.projects.mockRejectedValue(new Error("database busy"));
    const result = await loadJournalWorkspace();
    expect(result.data.localUnavailable).toBe(true); expect(result.data.projects).toEqual([]); expect(result.data.journals).toEqual([journal]);
  });
  it("does not claim no acts when their source is unavailable", async () => {
    mocks.journals.mockRejectedValue(new Error("offline")); await expect(loadJournalWorkspace()).rejects.toThrow("offline");
  });
  it("discards local and remote data if the account changes during a read", async () => {
    mocks.journals.mockImplementation(async () => {
      mocks.context = { ownerKey: "other:installer" }; return { data: [journal], source: "online", message: null };
    });
    await expect(loadJournalWorkspace()).rejects.toBeInstanceOf(SessionChangedError);
  });
});
