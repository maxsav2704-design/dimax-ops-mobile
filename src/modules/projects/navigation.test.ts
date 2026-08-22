import { describe, expect, it } from "vitest";
import {
  buildDashboardPrimaryAction,
  buildDoorPrepRoute,
  buildIssueProjectRoute,
  buildIssueRouteFromCalendarEvent,
  buildPriorityRoute,
  buildProblemProjectRoute,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";

describe("project navigation continuity", () => {
  it("opens the calendar when today has no assigned project", () => {
    expect(buildDashboardPrimaryAction([])).toEqual({
      kind: "CALENDAR",
      route: "/calendar",
    });
    expect(
      buildDashboardPrimaryAction([
        {
          id: "office-event",
          title: "Office briefing",
          event_type: "OTHER",
          starts_at: "2026-08-22T08:00:00Z",
          ends_at: "2026-08-22T09:00:00Z",
          location: null,
          waze_url: null,
          description: null,
          project_id: null,
          installer_ids: [],
        },
      ])
    ).toEqual({ kind: "CALENDAR", route: "/calendar" });
  });

  it("opens the earliest assigned event with its business context", () => {
    expect(
      buildDashboardPrimaryAction([
        {
          id: "later-install",
          title: "Install floor 4",
          event_type: "INSTALLATION",
          starts_at: "2026-08-22T12:00:00Z",
          ends_at: "2026-08-22T14:00:00Z",
          location: null,
          waze_url: null,
          description: null,
          project_id: "project-install",
          installer_ids: [],
        },
        {
          id: "first-service",
          title: "Door A-401",
          event_type: "SERVICE",
          starts_at: "2026-08-22T09:00:00Z",
          ends_at: "2026-08-22T10:00:00Z",
          location: null,
          waze_url: null,
          description: null,
          project_id: "project-service",
          installer_ids: [],
        },
      ])
    ).toEqual({
      kind: "SCHEDULED_PROJECT",
      route: "/project/project-service?issueStatus=OPEN&doorStatus=ALL&doorSearch=Door+A-401",
    });
  });

  it("builds issue continuity route for service events", () => {
    expect(
      buildIssueRouteFromCalendarEvent({
        id: "evt-1",
        title: "Door 12 blocked",
        event_type: "SERVICE",
        starts_at: "",
        ends_at: "",
        location: null,
        waze_url: null,
        description: null,
        project_id: "project-1",
        installer_ids: [],
      })
    ).toBe("/project/project-1?issueStatus=OPEN&doorStatus=ALL&doorSearch=Door+12+blocked");
  });

  it("builds prep route for non-service calendar actions", () => {
    expect(buildDoorPrepRoute("project-2")).toBe("/project/project-2?doorStatus=NOT_INSTALLED");
  });

  it("builds priority routes with issue context when needed", () => {
    expect(
      buildPriorityRoute({
        projectId: "project-3",
        eventType: "SERVICE",
        title: "Service follow-up",
      })
    ).toBe("/project/project-3?issueStatus=OPEN&doorStatus=ALL&doorSearch=Service+follow-up");
  });

  it("builds problem project routes with issue continuity", () => {
    expect(
      buildProblemProjectRoute({
        id: "project-4",
        name: "Tower A",
        address: null,
        status: "PROBLEM",
        lifecycle_status: "ACTIVE",
        health_status: "BLOCKED",
        waze_url: null,
      })
    ).toBe("/project/project-4?issueStatus=OPEN&doorStatus=ALL&doorSearch=Tower+A");
  });

  it("returns basic project route for non-service events", () => {
    expect(
      buildProjectRouteFromCalendarEvent({
        id: "evt-2",
        title: "Install 8",
        event_type: "INSTALLATION",
        starts_at: "",
        ends_at: "",
        location: null,
        waze_url: null,
        description: null,
        project_id: "project-5",
        installer_ids: [],
      })
    ).toBe("/project/project-5");
  });

  it("allows explicit issue routes with search", () => {
    expect(buildIssueProjectRoute("project-6", { doorSearch: "A-15" })).toBe(
      "/project/project-6?issueStatus=OPEN&doorStatus=ALL&doorSearch=A-15"
    );
  });
});
