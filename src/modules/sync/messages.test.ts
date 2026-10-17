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
});
