import { describe, expect, it } from "vitest";
import {
  buildDoorPrepRoute,
  buildIssueProjectRoute,
  buildIssueRouteFromCalendarEvent,
  buildPriorityRoute,
  buildProblemProjectRoute,
  buildProjectRouteFromCalendarEvent,
} from "@/modules/projects/navigation";

describe("project navigation continuity", () => {
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
