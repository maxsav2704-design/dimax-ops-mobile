export function formatLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentLocalDateKey(): string {
  return formatLocalDateKey(new Date());
}

export function parseLocalDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = dateKeyToLocalDate(day);
  return Number.isFinite(parsed.getTime()) && formatLocalDateKey(parsed) === day ? day : null;
}

export function dateKeyToLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}
