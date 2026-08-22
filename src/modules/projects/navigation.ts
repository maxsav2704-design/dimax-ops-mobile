import type { InstallerCalendarEvent } from "@/modules/calendar/types";
import type { ProjectListItem } from "@/modules/projects/types";

function buildProjectPath(projectId: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value && value.trim()) {
      search.set(key, value.trim());
    }
  });
  const query = search.toString();
  return query ? `/project/${projectId}?${query}` : `/project/${projectId}`;
}

export function buildProjectRoute(projectId: string) {
  return buildProjectPath(projectId);
}

export function buildIssueProjectRoute(projectId: string, options?: { doorSearch?: string }) {
  return buildProjectPath(projectId, {
    issueStatus: "OPEN",
    doorStatus: "ALL",
    doorSearch: options?.doorSearch,
  });
}

export function buildDoorPrepRoute(projectId: string) {
  return buildProjectPath(projectId, {
    doorStatus: "NOT_INSTALLED",
  });
}

export function buildProjectRouteFromCalendarEvent(event: InstallerCalendarEvent) {
  if (!event.project_id) {
    return null;
  }
  if (event.event_type.trim().toUpperCase() === "SERVICE") {
    return buildIssueProjectRoute(event.project_id, { doorSearch: event.title });
  }
  return buildProjectRoute(event.project_id);
}

export function buildDashboardPrimaryAction(events: InstallerCalendarEvent[]) {
  const nextAssignedEvent = [...events]
    .filter((event) => Boolean(event.project_id))
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))[0];
  const route = nextAssignedEvent ? buildProjectRouteFromCalendarEvent(nextAssignedEvent) : null;

  return route
    ? { kind: "SCHEDULED_PROJECT" as const, route }
    : { kind: "CALENDAR" as const, route: "/calendar" as const };
}

export function buildIssueRouteFromCalendarEvent(event: InstallerCalendarEvent) {
  if (!event.project_id) {
    return null;
  }
  return buildIssueProjectRoute(event.project_id, { doorSearch: event.title });
}

export function buildPriorityRoute(priority: { projectId: string; eventType?: string; title?: string }) {
  if ((priority.eventType || "").trim().toUpperCase() === "SERVICE") {
    return buildIssueProjectRoute(priority.projectId, { doorSearch: priority.title });
  }
  return buildProjectRoute(priority.projectId);
}

export function buildProblemProjectRoute(project: ProjectListItem) {
  return buildIssueProjectRoute(project.id, { doorSearch: project.name });
}
