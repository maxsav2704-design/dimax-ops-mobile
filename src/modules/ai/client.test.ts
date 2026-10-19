import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { ApiError, NetworkError } from "@/lib/errors";
import { buildAiRoute, classifyAiFailure, parseAiContext, previewValue, proposalRows, sourceRoute, taskFailure } from "./client";

const PROJECT = "1f16d537-5617-4c4b-a944-dafba2bcead9";
const ISSUE = "02a16eea-5233-443a-a08e-58e3352e0626";

describe("DIMAX AI client helpers", () => {
  it("builds and parses the route context: the most specific object wins", () => {
    expect(buildAiRoute({ projectId: PROJECT, question: "Что не завершено?" })).toBe(`/ai?context=project%3A${PROJECT}&q=%D0%A7%D1%82%D0%BE+%D0%BD%D0%B5+%D0%B7%D0%B0%D0%B2%D0%B5%D1%80%D1%88%D0%B5%D0%BD%D0%BE%3F`);
    expect(buildAiRoute({ projectId: PROJECT, issueId: ISSUE })).toBe(`/ai?context=issue%3A${ISSUE}`);
    expect(buildAiRoute()).toBe("/ai");
    expect(parseAiContext(`door:${PROJECT}`)).toEqual({ kind: "door", id: PROJECT });
    expect(parseAiContext([`project:${PROJECT}`])).toEqual({ kind: "project", id: PROJECT });
    expect(parseAiContext("project:not-a-uuid")).toBeNull();
    expect(parseAiContext("installer:" + PROJECT)).toBeNull();
  });

  it("maps server sources to app routes without trusting server paths", () => {
    expect(sourceRoute({ kind: "project", id: PROJECT, label: "P", path: "/installer/projects/x" })).toBe(`/project/${PROJECT}`);
    expect(sourceRoute({ kind: "issue", id: ISSUE, label: "I", path: `/installer/issues?project_id=${PROJECT}&issue_id=${ISSUE}` }))
      .toBe(`/issues?projectId=${PROJECT}&issueId=${ISSUE}`);
    expect(sourceRoute({ kind: "door", id: ISSUE, label: "D", path: `/installer/projects/${PROJECT}` })).toBe(`/project/${PROJECT}?doorId=${ISSUE}`);
    expect(sourceRoute({ kind: "door", id: ISSUE, label: "D", path: "https://evil.test/x" })).toBeNull();
    expect(sourceRoute({ kind: "installer", id: ISSUE, label: "N", path: "/installers?installer_id=x" })).toBeNull();
  });

  it("classifies failures into stable reasons and never exposes bodies", () => {
    expect(classifyAiFailure(new NetworkError())).toBe("offline");
    expect(classifyAiFailure(new ApiError("x", 403, "private"))).toBe("access");
    expect(classifyAiFailure(new ApiError("x", 429, ""))).toBe("limit");
    expect(classifyAiFailure(new ApiError("x", 503, '{"error":{"code":"AI_NOT_CONFIGURED"}}'))).toBe("notConfigured");
    expect(classifyAiFailure(new ApiError("x", 503, '{"error":{"code":"AI_DEADLINE"}}'))).toBe("timeout");
    expect(classifyAiFailure(new Error("boom"))).toBe("unavailable");
    expect(taskFailure({ error_code: "AI_PROVIDER_LIMIT" } as never)).toBe("limit");
    expect(taskFailure({ error_code: "AI_ACCESS_CHANGED" } as never)).toBe("access");
    expect(taskFailure({ error_code: "AI_CONTEXT_NOT_FOUND" } as never)).toBe("contextMissing");
  });

  it("renders preview rows with changed flags and localized values", () => {
    const rows = proposalRows({ before: { door_status: "NOT_INSTALLED", issue_status: null }, after: { door_status: "ISSUE_OPEN", issue_status: "OPEN", title: "No access" } });
    expect(rows).toEqual([
      { key: "door_status", before: "NOT_INSTALLED", after: "ISSUE_OPEN", changed: true },
      { key: "issue_status", before: null, after: "OPEN", changed: true },
      { key: "title", before: undefined, after: "No access", changed: true },
    ]);
    expect(previewValue("ru", "ISSUE_OPEN")).toBe("Открыто замечание");
    expect(previewValue("he", null)).toBe("—");
    expect(previewValue("en", "Free text")).toBe("Free text");
  });
});
