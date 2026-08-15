import { describe, expect, it } from "vitest";
import { addLocalDays, dateKeyToLocalDate, formatLocalDateKey } from "@/lib/date-key";

describe("date-key", () => {
  it("formats the local calendar date without UTC conversion", () => {
    expect(formatLocalDateKey(new Date(2026, 4, 8, 0, 30))).toBe("2026-05-08");
  });

  it("adds calendar days across month boundaries", () => {
    const nextDay = addLocalDays(dateKeyToLocalDate("2026-05-31"), 1);

    expect(formatLocalDateKey(nextDay)).toBe("2026-06-01");
  });
});
