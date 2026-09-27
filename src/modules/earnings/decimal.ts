// The earnings API returns money and work quantities with at most two decimals.
export function earningsMinorUnits(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const units = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(units) ? (negative ? -units : units) : null;
}

export function sumEarningsValues(values: Iterable<string | number>): number {
  let total = 0;
  for (const value of values) {
    const units = earningsMinorUnits(value);
    if (units === null || !Number.isSafeInteger(total + units)) throw new Error("Invalid earnings decimal total.");
    total += units;
  }
  return total / 100;
}
