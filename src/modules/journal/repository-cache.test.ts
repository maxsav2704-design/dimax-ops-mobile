import { beforeEach, describe, expect, it, vi } from "vitest";
import { journalFixture as journal } from "./test-fixtures";

const db = vi.hoisted(() => ({ runAsync: vi.fn(), getFirstAsync: vi.fn(), getAllAsync: vi.fn(), withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()) }));
vi.mock("@/lib/db", () => ({ getDb: async () => db }));
import { getJournalSnapshot, listJournalSnapshots, removeJournalSnapshot, saveJournalSnapshots } from "./repository";
const stored = (payload: unknown = journal) => ({ id: journal.id, project_id: journal.project_id, status: journal.status, payload_json: JSON.stringify(payload), updated_at: "2026-09-27" });

beforeEach(() => {
  db.runAsync.mockReset().mockResolvedValue(undefined);
  db.getAllAsync.mockReset().mockResolvedValue([]);
  db.getFirstAsync.mockReset().mockResolvedValue(null);
  db.withTransactionAsync.mockClear();
});
describe("journal snapshot repository", () => {
  it("atomically removes entries outside the complete authorized list", async () => {
    db.getAllAsync.mockResolvedValue([{ id: "revoked" }, { id: journal.id }]);
    await saveJournalSnapshots([journal]);
    expect(db.withTransactionAsync).toHaveBeenCalledOnce();
    expect(db.runAsync).toHaveBeenCalledWith("DELETE FROM installer_journal_snapshots WHERE id = ?", ["revoked"]);
    expect(db.runAsync).not.toHaveBeenCalledWith("DELETE FROM installer_journal_snapshots WHERE id = ?", [journal.id]);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO installer_journal_snapshots"), expect.arrayContaining([journal.id, journal.project_id]));
  });
  it("removes all saved acts when the server returns an empty authorized set", async () => {
    db.getAllAsync.mockResolvedValue([{ id: "one" }, { id: "two" }]); await saveJournalSnapshots([]);
    expect(db.runAsync).toHaveBeenCalledTimes(2); expect(db.runAsync.mock.calls.every(([sql]) => sql.startsWith("DELETE"))).toBe(true);
  });
  it("ignores corrupt, mismatched and invalid rows", async () => {
    db.getAllAsync.mockResolvedValue([stored(), stored({ ...journal, id: "other" }), stored({ ...journal, status: "INVALID" }), { ...stored(), payload_json: "{" }]);
    expect(await listJournalSnapshots()).toEqual([journal]);
  });
  it("does not read summaries or malformed arrays as complete work", async () => {
    db.getFirstAsync.mockResolvedValueOnce(stored({ ...journal, doors: undefined })).mockResolvedValueOnce(stored({ ...journal, doors: [{}] })).mockResolvedValueOnce(stored());
    expect(await getJournalSnapshot(journal.id)).toBeNull(); expect(await getJournalSnapshot(journal.id)).toBeNull();
    expect(await getJournalSnapshot(journal.id)).toEqual(journal);
  });
  it("deletes only the specified snapshot after access revocation", async () => {
    await removeJournalSnapshot(journal.id);
    expect(db.runAsync).toHaveBeenCalledExactlyOnceWith("DELETE FROM installer_journal_snapshots WHERE id = ?", [journal.id]);
  });
});
