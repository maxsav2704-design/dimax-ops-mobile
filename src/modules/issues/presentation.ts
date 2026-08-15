export type QueryParamValue = string | string[] | undefined;

export type IssueRouteParams = {
  projectId: string;
  doorId: string;
  issueId: string;
  compose: boolean;
};

export type IssueRouteStatusFilter = "OPEN" | "ALL";

export type IssueScopeLike = {
  issue: {
    id: string;
    status: string;
  };
  project: {
    id: string;
  };
};

export type ProjectLike = {
  id: string;
};

export type DoorLike = {
  id: string;
  project_id: string;
};

function queryValue(value: QueryParamValue): string {
  return Array.isArray(value)
    ? value[0]?.trim() || ""
    : typeof value === "string"
      ? value.trim()
      : "";
}

export function resolveIssueRouteParams(
  params: Record<string, QueryParamValue>,
): IssueRouteParams {
  return {
    projectId: queryValue(params.projectId) || queryValue(params.project_id),
    doorId: queryValue(params.doorId) || queryValue(params.door_id),
    issueId: queryValue(params.issueId) || queryValue(params.issue_id),
    compose: queryValue(params.compose) === "1",
  };
}

export function isIssueRouteProjectMissing(
  projects: ProjectLike[],
  projectId: string,
  loaded: boolean,
): boolean {
  return Boolean(
    projectId && loaded && !projects.some((project) => project.id === projectId),
  );
}

export function isIssueRouteDoorMissing(
  doors: DoorLike[],
  projectId: string,
  doorId: string,
  loaded: boolean,
): boolean {
  return Boolean(
    doorId &&
      loaded &&
      !doors.some(
        (door) =>
          door.id === doorId && (!projectId || door.project_id === projectId),
      ),
  );
}

export function isIssueRouteIssueMissing(
  scopes: IssueScopeLike[],
  issueId: string,
  projectId: string,
  loaded: boolean,
): boolean {
  return Boolean(
    issueId &&
      loaded &&
      !scopes.some(
        (scope) =>
          scope.issue.id === issueId &&
          (!projectId || scope.project.id === projectId),
      ),
  );
}

export function filterIssueScopesForRoute<T extends IssueScopeLike>(
  scopes: T[],
  options: {
    projectId: string;
    issueId: string;
    statusFilter: IssueRouteStatusFilter;
  },
): T[] {
  const projectScoped = options.projectId
    ? scopes.filter((scope) => scope.project.id === options.projectId)
    : scopes;

  if (options.issueId) {
    return projectScoped.filter((scope) => scope.issue.id === options.issueId);
  }

  return projectScoped.filter(
    (scope) =>
      options.statusFilter === "ALL" || scope.issue.status !== "CLOSED",
  );
}
