import type { InstallerCalendarEvent, InstallerCalendarViewModel } from "../src/modules/calendar/types";
import { addLocalDays, formatLocalDateKey } from "../src/lib/date-key";

let source: InstallerCalendarViewModel["source"] = "online";
export function setCalendarPreviewSource(value: InstallerCalendarViewModel["source"]) { source = value; }

export async function loadInstallerCalendar(_rangeKey: string, anchorDay?: string | null): Promise<InstallerCalendarViewModel> {
  const requestedSource = source;
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (requestedSource === "unavailable") return { snapshot: null, source: requestedSource, message: "TEST: no cached plan" };
  const day = anchorDay || formatLocalDateKey(new Date());
  const types = ["installation", "inspection", "meeting", "consultation", "delivery"];
  const titles = ["Tower A / Entrance doors, floor 2", "Tower A / Inspect reported positions", "Site meeting / Access to apartments and work sequence", "Door opening measurements", "Assigned delivery visit"];
  const items: InstallerCalendarEvent[] = types.map((event_type, index) => ({
    id: `preview-visit-${index}`, event_type, title: titles[index],
    starts_at: new Date(`${day}T${String(8 + index * 2).padStart(2, "0")}:00:00`).toISOString(),
    ends_at: new Date(`${day}T${String(9 + index * 2).padStart(2, "0")}:30:00`).toISOString(),
    project_id: event_type === "meeting" ? null : "preview-project", installer_ids: ["preview-installer"],
    location: "14 Herzl, Ashdod / Tower A, second floor",
    waze_url: "https://waze.com/ul?q=14+Herzl+Ashdod",
    description: "Apartment 201: entrance position. Apartment 202: verify access with the site contact before starting.\n\n".repeat(5),
  }));
  return {
    source: requestedSource, message: requestedSource === "cache" ? "TEST: offline" : null,
    snapshot: { range_key: "7d", starts_at: new Date(`${day}T00:00:00`).toISOString(), ends_at: addLocalDays(new Date(`${day}T00:00:00`), 7).toISOString(), generated_at: new Date().toISOString(), items },
  };
}
