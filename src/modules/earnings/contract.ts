import { parseLocalDateKey } from "@/lib/date-key";
import { earningsMinorUnits, sumEarningsValues } from "./decimal";
import type { InstallerEarningsSummary } from "./types";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const nullableText = (value: unknown) => value === null || typeof value === "string";
const money = (value: unknown) => typeof value === "string" && earningsMinorUnits(value) !== null;
const quantity = (value: unknown) => earningsMinorUnits(value) !== null && Number(value) >= 0;
const date = (value: unknown) => typeof value === "string" && parseLocalDateKey(value) === value;

export function parseEarningsSummary(value: unknown, periodKey: string): InstallerEarningsSummary | null {
  if (!record(value) || value.period_key !== periodKey || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)
    || !money(value.today_total) || !money(value.month_total)
    || !(value.generated_at === null || (typeof value.generated_at === "string" && Number.isFinite(Date.parse(value.generated_at))))
    || !Array.isArray(value.days) || !Array.isArray(value.install_types) || !Array.isArray(value.rows)) return null;

  if (!value.days.every((day) => record(day) && date(day.date) && money(day.amount) && quantity(day.jobs_count) && Number.isInteger(Number(day.jobs_count)))
    || !value.install_types.every((type) => record(type) && text(type.code) && text(type.label) && money(type.amount) && quantity(type.quantity))
    || !value.rows.every((row) => record(row) && text(row.id) && date(row.work_date)
      && nullableText(row.project_id) && nullableText(row.project_name) && nullableText(row.door_label)
      && text(row.install_type_code) && text(row.install_type_label)
      && quantity(row.quantity) && Number(row.quantity) > 0 && money(row.rate) && money(row.amount))) return null;

  const payload = value as unknown as InstallerEarningsSummary;
  if (new Set(payload.rows.map((row) => row.id)).size !== payload.rows.length) return null;
  if (payload.rows.some((row) => periodKey.includes("..")
    ? row.work_date < periodKey.split("..")[0] || row.work_date > periodKey.split("..")[1]
    : !row.work_date.startsWith(periodKey))) return null;
  try {
    sumEarningsValues(payload.rows.map((row) => row.amount));
    sumEarningsValues(payload.rows.map((row) => row.quantity));
  } catch { return null; }

  return {
    ...payload,
    days: payload.days.map((day) => ({ ...day, jobs_count: Number(day.jobs_count) })),
    install_types: payload.install_types.map((type) => ({ ...type, quantity: Number(type.quantity) })),
    rows: payload.rows.map((row) => ({ ...row, quantity: Number(row.quantity) })),
  };
}
