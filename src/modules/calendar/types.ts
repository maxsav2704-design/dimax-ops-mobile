export type InstallerCalendarEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  waze_url: string | null;
  description: string | null;
  project_id: string | null;
  installer_ids: string[];
};

export type InstallerCalendarSnapshot = {
  range_key: string;
  starts_at: string;
  ends_at: string;
  items: InstallerCalendarEvent[];
  generated_at: string | null;
};

export type InstallerCalendarViewModel = {
  snapshot: InstallerCalendarSnapshot | null;
  source: "online" | "cache" | "unavailable";
  message: string | null;
};
