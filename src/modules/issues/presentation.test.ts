import { describe, expect, it } from "vitest";

import {
  filterIssueScopesForRoute,
  isIssueRouteDoorMissing,
  isIssueRouteIssueMissing,
  isIssueRouteProjectMissing,
  resolveIssueRouteParams,
} from "@/modules/issues/presentation";

const scopes = [
  {
    issue: { id: "issue-1", status: "OPEN" },
    project: { id: "project-1" },
  },
  {
    issue: { id: "issue-2", status: "CLOSED" },
    project: { id: "project-1" },
  },
  {
    issue: { id: "issue-3", status: "OPEN" },
    project: { id: "project-2" },
  },
];

describe("mobile issue route presentation", () => {
  it("resolves snake_case deep-link params and legacy camelCase params", () => {
    expect(
      resolveIssueRouteParams({
        project_id: " project-1 ",
        door_id: "door-1",
        issue_id: "issue-1",
        compose: "1",
      }),
    ).toEqual({
      projectId: "project-1",
      doorId: "door-1",
      issueId: "issue-1",
      compose: true,
    });

    expect(
      resolveIssueRouteParams({
        projectId: "project-2",
        doorId: "door-2",
        issueId: "issue-2",
      }),
    ).toMatchObject({
      projectId: "project-2",
      doorId: "door-2",
      issueId: "issue-2",
      compose: false,
    });
  });

  it("detects missing route entities without falling back silently", () => {
    expect(
      isIssueRouteProjectMissing([{ id: "project-1" }], "missing-project", true),
    ).toBe(true);
    expect(
      isIssueRouteDoorMissing(
        [{ id: "door-1", project_id: "project-1" }],
        "project-1",
        "missing-door",
        true,
      ),
    ).toBe(true);
    expect(
      isIssueRouteIssueMissing(scopes, "issue-3", "project-1", true),
    ).toBe(true);
  });

  it("filters by project_id and does not show another project when project is unavailable", () => {
    expect(
      filterIssueScopesForRoute(scopes, {
        projectId: "project-1",
        issueId: "",
        statusFilter: "OPEN",
      }).map((scope) => scope.issue.id),
    ).toEqual(["issue-1"]);

    expect(
      filterIssueScopesForRoute(scopes, {
        projectId: "missing-project",
        issueId: "",
        statusFilter: "OPEN",
      }),
    ).toEqual([]);
  });

  it("uses issue_id as an explicit focus even when the issue is closed", () => {
    expect(
      filterIssueScopesForRoute(scopes, {
        projectId: "project-1",
        issueId: "issue-2",
        statusFilter: "OPEN",
      }).map((scope) => scope.issue.id),
    ).toEqual(["issue-2"]);
  });

  it("does not resolve issue_id from a different project when project_id is scoped", () => {
    expect(
      filterIssueScopesForRoute(scopes, {
        projectId: "project-1",
        issueId: "issue-3",
        statusFilter: "ALL",
      }),
    ).toEqual([]);
  });
});
