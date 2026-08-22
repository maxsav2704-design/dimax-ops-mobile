import { describe, expect, it } from "vitest";
import { resolveAuthRedirect } from "@/modules/auth/navigation";

describe("mobile auth navigation", () => {
  it("waits for session hydration before applying a redirect", () => {
    expect(resolveAuthRedirect(false, undefined, true)).toBeNull();
    expect(resolveAuthRedirect(false, "project", true)).toBeNull();
    expect(resolveAuthRedirect(true, "login", true)).toBeNull();
  });

  it("redirects every unauthenticated deep link to login", () => {
    expect(resolveAuthRedirect(false, "project")).toBe("/login");
    expect(resolveAuthRedirect(false, "earnings")).toBe("/login");
    expect(resolveAuthRedirect(false, "sync-queue")).toBe("/login");
    expect(resolveAuthRedirect(false, undefined)).toBe("/login");
  });

  it("keeps login available without a session", () => {
    expect(resolveAuthRedirect(false, "login")).toBeNull();
  });

  it("keeps authenticated users out of the login form", () => {
    expect(resolveAuthRedirect(true, "login")).toBe("/projects");
    expect(resolveAuthRedirect(true, "project")).toBeNull();
  });

  it("opens the installer workspace after restoring a session on cold start", () => {
    expect(resolveAuthRedirect(true, undefined)).toBe("/projects");
    expect(resolveAuthRedirect(true, "index")).toBe("/projects");
  });
});
