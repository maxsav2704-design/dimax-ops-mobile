import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../start-expo-e2e.ps1", import.meta.url));
const environment = {
  NODE_ENV: "development",
  EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8001",
  EXPO_PUBLIC_E2E_COMPANY_ID: "00000000-0000-4000-8000-000000000001",
  EXPO_PUBLIC_E2E_EMAIL: "installer@example.test",
  EXPO_PUBLIC_E2E_PASSWORD: "test-only-password",
};

function validate(overrides = {}) {
  const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", script, "-ValidateOnly",
  ], {
    env: { ...process.env, ...environment, ...overrides },
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  return result;
}

test("validates the selected API without contacting a device or exposing credentials", () => {
  const result = validate({ EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8012/" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    ApiBaseUrl: "http://127.0.0.1:8012", ApiPort: 8012, MetroPort: 8081,
  });
  for (const key of ["EXPO_PUBLIC_E2E_PASSWORD", "EXPO_PUBLIC_E2E_EMAIL", "EXPO_PUBLIC_E2E_COMPANY_ID"]) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(environment[key]));
  }
});

for (const key of Object.keys(environment).filter((key) => key !== "NODE_ENV")) {
  test(`rejects missing ${key} before starting ADB or Metro`, () => {
    const result = validate({ [key]: "" });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(`${key} is required`));
    assert.ok(!result.stderr.includes(environment.EXPO_PUBLIC_E2E_PASSWORD));
  });
}

for (const url of [
  "not-a-url", "ftp://127.0.0.1:8001", "https://api.dimax.co.il",
  "http://user:secret@127.0.0.1:8001", "http://127.0.0.1:8001?token=secret",
  "http://127.0.0.1:8001#secret",
]) {
  test(`rejects an unsafe test target: ${url}`, () => {
    const result = validate({ EXPO_PUBLIC_API_BASE_URL: url });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes("explicit loopback HTTP(S) API URL"));
    assert.ok(!result.stderr.includes("user:secret"));
  });
}

test("rejects production mode", () => {
  const result = validate({ NODE_ENV: "production" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("development-only"));
});

test("rejects invalid company IDs", () => {
  const result = validate({ EXPO_PUBLIC_E2E_COMPANY_ID: "not-a-company" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("test company UUID"));
});

test("rejects an API port shared with Metro", () => {
  const result = validate({ EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8081" });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("different ports"));
});
