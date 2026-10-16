import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarDayParam, calendarEventAppearance, calendarEventDay, compareCalendarEvents } from "./presentation";
import type { InstallerCalendarEvent } from "./types";

afterEach(() => vi.unstubAllEnvs());

describe("calendar presentation", () => {
  it("groups a UTC event by the same local day used for its displayed time", () => {
    vi.stubEnv("TZ", "Asia/Jerusalem");
    expect(calendarEventDay({ starts_at: "2026-09-26T22:30:00Z" })).toBe("2026-09-27");
  });

  it("sorts instants rather than timestamp strings with different offsets", () => {
    const earlier = { id: "early", starts_at: "2026-09-27T09:00:00+03:00" } as InstallerCalendarEvent;
    const later = { id: "late", starts_at: "2026-09-27T07:00:00Z" } as InstallerCalendarEvent;
    expect([later, earlier].sort(compareCalendarEvents).map((event) => event.id)).toEqual(["early", "late"]);
  });

  it.each(["2026-09-27", "2028-02-29"])("accepts a real local day: %s", (day) => {
    expect(calendarDayParam(day)).toBe(day);
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "invalid", "2026-1-1", undefined, ["2026-09-27"]])("rejects an invalid day: %j", (day) => {
    expect(calendarDayParam(day)).toBeNull();
  });

  it.each(["installation", "delivery", "meeting", "consultation", "inspection", "service"])("preserves the event type %s", (type) => {
    expect(calendarEventAppearance(type.toUpperCase()).label).toBe(type);
  });

  it("does not present an unknown event as an installation", () => {
    expect(calendarEventAppearance("OTHER")).toMatchObject({ label: "other", tone: "neutral" });
  });
});
