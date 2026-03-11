import { getDb } from "@/lib/db";
import type { InstallerEarningsSummary } from "@/modules/earnings/types";

type EarningsSnapshotRow = {
  period_key: string;
  currency: string;
  today_total: string;
  month_total: string;
  payload_json: string;
  updated_at: string;
};

export async function saveEarningsSnapshot(payload: InstallerEarningsSummary): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO installer_earnings_snapshots(
       period_key, currency, today_total, month_total, payload_json, updated_at
     )
     VALUES(?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(period_key) DO UPDATE SET
       currency = excluded.currency,
       today_total = excluded.today_total,
       month_total = excluded.month_total,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      payload.period_key,
      payload.currency,
      payload.today_total,
      payload.month_total,
      JSON.stringify(payload),
    ]
  );
}

export async function getLatestEarningsSnapshot(): Promise<InstallerEarningsSummary | null> {
  const db = await getDb();
  const row =
    (await db.getFirstAsync<EarningsSnapshotRow>(
      `SELECT period_key, currency, today_total, month_total, payload_json, updated_at
       FROM installer_earnings_snapshots
       ORDER BY updated_at DESC
       LIMIT 1`
    )) ?? null;

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.payload_json) as InstallerEarningsSummary;
  } catch {
    return null;
  }
}
