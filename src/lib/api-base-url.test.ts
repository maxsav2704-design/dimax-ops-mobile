import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "./api-base-url";

describe("resolveApiBaseUrl", () => {
  it("keeps the local fallback only for development", () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe("http://127.0.0.1:8000");
  });

  it("normalizes an explicitly configured development URL", () => {
    expect(resolveApiBaseUrl(" http://10.0.2.2:8000/ ", true)).toBe("http://10.0.2.2:8000");
  });

  it("requires an explicit URL for production", () => {
    expect(() => resolveApiBaseUrl(undefined, false)).toThrow("is required");
  });

  it("requires HTTPS for production", () => {
    expect(() => resolveApiBaseUrl("http://api.dimax.co.il", false)).toThrow("HTTPS");
  });

  it("rejects local and placeholder production hosts", () => {
    expect(() => resolveApiBaseUrl("https://localhost:8000", false)).toThrow("localhost");
    expect(() => resolveApiBaseUrl("https://api.example.com", false)).toThrow("placeholder");
  });

  it("rejects credentials, query strings, and fragments", () => {
    expect(() => resolveApiBaseUrl("https://user:pass@api.dimax.co.il", false)).toThrow("only an API origin");
    expect(() => resolveApiBaseUrl("https://api.dimax.co.il?tenant=1", false)).toThrow("only an API origin");
    expect(() => resolveApiBaseUrl("https://api.dimax.co.il#test", false)).toThrow("only an API origin");
  });

  it("accepts and normalizes a real production API URL", () => {
    expect(resolveApiBaseUrl("https://api.dimax.co.il/", false)).toBe("https://api.dimax.co.il");
  });
});
