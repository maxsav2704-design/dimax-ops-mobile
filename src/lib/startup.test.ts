import { describe, expect, it } from "vitest";
import { isFontBootstrapReady } from "@/lib/startup";

describe("mobile font bootstrap", () => {
  it("waits while fonts are still loading", () => {
    expect(isFontBootstrapReady(false, null, false)).toBe(false);
  });

  it("allows the app shell after success, failure, or the safety timeout", () => {
    expect(isFontBootstrapReady(true, null, false)).toBe(true);
    expect(isFontBootstrapReady(false, new Error("font load failed"), false)).toBe(true);
    expect(isFontBootstrapReady(false, null, true)).toBe(true);
  });
});
