import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const e2eEnvironment = {
  EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8001",
  EXPO_PUBLIC_E2E_AUTO_LOGIN: "1",
  EXPO_PUBLIC_E2E_COMPANY_ID: "00000000-0000-4000-8000-000000000001",
  EXPO_PUBLIC_E2E_EMAIL: "installer@example.test",
  EXPO_PUBLIC_E2E_PASSWORD: "test-only-password",
};

function configureE2E() {
  for (const [key, value] of Object.entries(e2eEnvironment)) {
    vi.stubEnv(key, value);
  }
}

function readConfig() {
  return vi.importActual<typeof import("./config")>("./config");
}

describe("mobile automatic test login", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("__DEV__", true);
    for (const key of Object.keys(e2eEnvironment)) {
      vi.stubEnv(key, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to manual login without embedded account credentials", async () => {
    const { DEV_AUTO_LOGIN, API_BASE_URL } = await readConfig();
    expect(DEV_AUTO_LOGIN).toEqual({
      enabled: false,
      companyId: "",
      email: "",
      password: "",
    });
    expect(API_BASE_URL).toBe("http://127.0.0.1:8000");
  });

  it.each([undefined, "0", "false"])("requires opt-in (%s)", async (flag) => {
    configureE2E();
    vi.stubEnv("EXPO_PUBLIC_E2E_AUTO_LOGIN", flag);
    expect((await readConfig()).DEV_AUTO_LOGIN.enabled).toBe(false);
  });

  it.each(["1", "true", "TRUE"])("allows explicit test login (%s)", async (flag) => {
    configureE2E();
    vi.stubEnv("EXPO_PUBLIC_E2E_AUTO_LOGIN", flag);
    const { DEV_AUTO_LOGIN, API_BASE_URL } = await readConfig();
    expect(DEV_AUTO_LOGIN).toEqual({
      enabled: true,
      companyId: e2eEnvironment.EXPO_PUBLIC_E2E_COMPANY_ID,
      email: e2eEnvironment.EXPO_PUBLIC_E2E_EMAIL,
      password: e2eEnvironment.EXPO_PUBLIC_E2E_PASSWORD,
    });
    expect(API_BASE_URL).toBe("http://127.0.0.1:8001");
  });

  it.each([
    "EXPO_PUBLIC_API_BASE_URL",
    "EXPO_PUBLIC_E2E_COMPANY_ID",
    "EXPO_PUBLIC_E2E_EMAIL",
    "EXPO_PUBLIC_E2E_PASSWORD",
  ])("does not log in with missing or blank %s", async (key) => {
    for (const value of [undefined, "", "  "]) {
      vi.resetModules();
      configureE2E();
      vi.stubEnv(key, value);
      expect((await readConfig()).DEV_AUTO_LOGIN.enabled).toBe(false);
    }
  });

  it("never enables automatic login in a production build", async () => {
    configureE2E();
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.dimax.co.il");
    expect((await readConfig()).DEV_AUTO_LOGIN.enabled).toBe(false);
  });
});
