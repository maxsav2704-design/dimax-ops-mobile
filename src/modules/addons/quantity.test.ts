import { describe, expect, it } from "vitest";
import { normalizeAddonQuantity } from "@/modules/addons/quantity";

describe("add-on quantity", () => {
  it("normalizes positive decimal input used by the mobile outbox", () => {
    expect(normalizeAddonQuantity(" 02,50 ")).toBe("2.50");
    expect(normalizeAddonQuantity("0.25")).toBe("0.25");
  });

  it("matches the backend Numeric(12,2) boundary", () => {
    expect(normalizeAddonQuantity("9999999999.99")).toBe("9999999999.99");
    expect(normalizeAddonQuantity("10000000000")).toBeNull();
    expect(normalizeAddonQuantity("1.234")).toBeNull();
  });

  it("rejects zero, negative and malformed values", () => {
    expect(normalizeAddonQuantity("0")).toBeNull();
    expect(normalizeAddonQuantity("-1")).toBeNull();
    expect(normalizeAddonQuantity("1e2")).toBeNull();
  });
});
