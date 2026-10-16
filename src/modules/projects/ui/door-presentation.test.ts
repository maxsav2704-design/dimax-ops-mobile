import { describe, expect, it } from "vitest";
import { breakableUnitLabel } from "./door-presentation";

describe("breakableUnitLabel", () => {
  it("lets long unit labels wrap after hyphens and slashes", () => {
    expect(breakableUnitLabel("B-2-201-dira-EN-201")).toBe("B-\u200B2-\u200B201-\u200Bdira-\u200BEN-\u200B201");
    expect(breakableUnitLabel("B-2-202-technical-FR-202/2")).toContain("202/\u200B2");
  });

  it("leaves labels without separators unchanged and is idempotent", () => {
    expect(breakableUnitLabel("A101")).toBe("A101");
    const once = breakableUnitLabel("A-1-101-dira-EN-101");
    expect(breakableUnitLabel(once)).toBe(once);
  });

  it("does not add a marker at a trailing separator or before whitespace", () => {
    expect(breakableUnitLabel("B-2-")).toBe("B-\u200B2-");
    expect(breakableUnitLabel("B-2 / 3")).toBe("B-\u200B2 / 3");
  });

  it("keeps the visible characters identical", () => {
    const label = "B-2-201-dira-EN-201";
    expect(breakableUnitLabel(label).replace(/\u200B/g, "")).toBe(label);
  });
});
