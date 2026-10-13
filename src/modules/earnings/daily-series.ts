import { sumEarningsValues } from "@/modules/earnings/decimal";

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Recorded totals for the last `days` calendar days ending at `endDateKey`, zero where nothing was recorded. */
export function buildRecentDailyTotals(
  rows: ReadonlyArray<{ work_date: string; amount: string | number }>,
  endDateKey: string,
  days = 7,
): number[] {
  const byDay = new Map<string, Array<string | number>>();
  for (const row of rows) byDay.set(row.work_date, [...(byDay.get(row.work_date) || []), row.amount]);
  return Array.from({ length: days }, (_, index) => {
    const key = shiftDateKey(endDateKey, index - (days - 1));
    return sumEarningsValues(byDay.get(key) || []);
  });
}
