import { getDb } from "@/lib/db";
import type { InstallerCalendarSnapshot } from "@/modules/calendar/types";

type CalendarSnapshotRow = {
  range_key: string;
  starts_at: string;
  ends_at: string;
  payload_json: string;
  updated_at: string;
};

export async function saveCalendarSnapshot(payload: InstallerCalendarSnapshot): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO installer_calendar_snapshots(range_key, starts_at, ends_at, payload_json, updated_at)
     VALUES(?, ?, ?, ?, datetime('now'))
     ON CONFLICT(range_key) DO UPDATE SET
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [payload.range_key, payload.starts_at, payload.ends_at, JSON.stringify(payload)]
  );
}

export async function getCalendarSnapshot(
  rangeKey: string
): Promise<InstallerCalendarSnapshot | null> {
  const db = await getDb();
  const row =
    (await db.getFirstAsync<CalendarSnapshotRow>(
      `SELECT range_key, starts_at, ends_at, payload_json, updated_at
       FROM installer_calendar_snapshots
       WHERE range_key = ?`,
      [rangeKey]
    )) ?? null;

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.payload_json) as InstallerCalendarSnapshot;
  } catch {
    return null;
  }
}
