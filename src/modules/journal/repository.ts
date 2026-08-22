import { getDb } from "@/lib/db";
import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
} from "@/modules/journal/types";
import { mergeJournalSnapshot } from "@/modules/journal/snapshot";

type JournalSnapshotRow = {
  id: string;
  project_id: string;
  status: string;
  payload_json: string;
  updated_at: string;
};

function parseSnapshot<T extends InstallerJournalSummary>(
  row: JournalSnapshotRow | null,
): T | null {
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export async function saveJournalSnapshot(
  item: InstallerJournalSummary | InstallerJournalDetails,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO installer_journal_snapshots(id, project_id, status, payload_json, updated_at)
     VALUES(?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       status = excluded.status,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [item.id, item.project_id, item.status, JSON.stringify(item)],
  );
}

export async function saveJournalSnapshots(
  items: InstallerJournalSummary[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      const existingRow =
        (await db.getFirstAsync<JournalSnapshotRow>(
          `SELECT id, project_id, status, payload_json, updated_at
           FROM installer_journal_snapshots WHERE id = ? LIMIT 1`,
          [item.id],
        )) ?? null;
      const parsed = parseSnapshot<InstallerJournalDetails>(existingRow);
      const existingDetails =
        parsed &&
        Array.isArray(parsed.doors) &&
        Array.isArray(parsed.addon_items)
          ? parsed
          : null;
      const payload = mergeJournalSnapshot(item, existingDetails);
      await db.runAsync(
        `INSERT INTO installer_journal_snapshots(id, project_id, status, payload_json, updated_at)
         VALUES(?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           status = excluded.status,
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [item.id, item.project_id, item.status, JSON.stringify(payload)],
      );
    }
  });
}

export async function listJournalSnapshots(): Promise<
  InstallerJournalSummary[]
> {
  const db = await getDb();
  const rows = await db.getAllAsync<JournalSnapshotRow>(
    `SELECT id, project_id, status, payload_json, updated_at
     FROM installer_journal_snapshots
     ORDER BY updated_at DESC`,
  );
  return rows
    .map((row) => parseSnapshot<InstallerJournalSummary>(row))
    .filter((item): item is InstallerJournalSummary => item !== null);
}

export async function getJournalSnapshot(
  journalId: string,
): Promise<InstallerJournalDetails | null> {
  const db = await getDb();
  const row =
    (await db.getFirstAsync<JournalSnapshotRow>(
      `SELECT id, project_id, status, payload_json, updated_at
       FROM installer_journal_snapshots WHERE id = ? LIMIT 1`,
      [journalId],
    )) ?? null;
  const parsed = parseSnapshot<InstallerJournalDetails>(row);
  return parsed &&
    Array.isArray(parsed.doors) &&
    Array.isArray(parsed.addon_items)
    ? parsed
    : null;
}
