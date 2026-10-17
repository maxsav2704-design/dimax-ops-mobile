import { describe, expect, it } from "vitest";
import { localizeWorkflowMessage } from "./messages";

describe("workflow message localization", () => {
  it("translates the known offline workflow messages and passes unknown text through", () => {
    const message = "Door is locked. Refresh data or contact the office before continuing.";
    expect(localizeWorkflowMessage(message, "en")).toBe(message);
    expect(localizeWorkflowMessage(message, "ru")).toContain("заблокирована");
    expect(localizeWorkflowMessage(message, "he")).toContain("נעולה");
    expect(localizeWorkflowMessage("HTTP 500 from server", "ru")).toBe("HTTP 500 from server");
  });

  it("covers every message the offline workflow throws for issues", () => {
    for (const message of [
      "Issue title or details is required",
      "Issue title must be at most 200 characters",
      "Issue details must be at most 2000 characters",
      "project_id and door_id are required",
    ]) {
      expect(localizeWorkflowMessage(message, "ru")).not.toBe(message);
      expect(localizeWorkflowMessage(message, "he")).not.toBe(message);
    }
  });
});
