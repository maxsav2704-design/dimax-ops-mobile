import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { validateBundledInputs } from "./android-build-environment.mjs";

const base = { NODE_ENV: "production", EXPO_NO_DOTENV: "1", EXPO_PUBLIC_API_BASE_URL: "https://api.dimax.co.il" };
const acceptance = { ...base, EXPO_PUBLIC_BUILD_PROFILE: "acceptance", EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:8001" };

test("accepts explicit isolated input and production input without test credentials", () => {
  assert.deepEqual(validateBundledInputs(base, "release"), []);
  assert.deepEqual(validateBundledInputs(acceptance, "acceptance"), []);
});

test("cannot reuse acceptance inputs for release or vice versa", () => {
  assert.ok(validateBundledInputs(acceptance, "release").length);
  assert.ok(validateBundledInputs(base, "acceptance").length);
  assert.ok(validateBundledInputs(base, "unknown").length);
});

test("requires production JS and excludes dotenv files for both bundled variants", () => {
  for (const [env, variant] of [[base, "release"], [acceptance, "acceptance"]]) {
    for (const [key, value] of [["NODE_ENV", "development"], ["NODE_ENV", undefined], ["EXPO_NO_DOTENV", "0"], ["EXPO_NO_DOTENV", undefined]]) {
      assert.ok(validateBundledInputs({ ...env, [key]: value }, variant).length, `${variant} ${key}`);
    }
  }
});

test("rejects embedded identities, passwords and auto-login, without logging their values", () => {
  for (const variant of ["release", "acceptance"]) {
    const env = variant === "release" ? base : acceptance;
    for (const key of ["EXPO_PUBLIC_E2E_COMPANY_ID", "EXPO_PUBLIC_E2E_EMAIL", "EXPO_PUBLIC_E2E_PASSWORD", "EXPO_PUBLIC_E2E_AUTO_LOGIN"]) {
      const errors = validateBundledInputs({ ...env, [key]: "sensitive-sentinel" }, variant);
      assert.ok(errors.length);
      assert.ok(!errors.join(" ").includes("sensitive-sentinel"));
    }
  }
});

test("acceptance never targets another API or a URL carrying credentials", () => {
  for (const url of [undefined, "", "http://127.0.0.1:8000", "http://localhost:8001", "https://api.dimax.co.il", "http://user:pass@127.0.0.1:8001", "http://127.0.0.1:8001/path", "http://127.0.0.1:8001?token=test"]) {
    assert.ok(validateBundledInputs({ ...acceptance, EXPO_PUBLIC_API_BASE_URL: url }, "acceptance").length);
  }
});

test("native acceptance remains separate, non-debuggable and bundled", () => {
  const gradle = fs.readFileSync(new URL("../android/app/build.gradle", import.meta.url), "utf8");
  const buildTypes = gradle.slice(gradle.indexOf("    buildTypes {"));
  const profile = buildTypes.match(/        acceptance \{([\s\S]+?)^        \}/m)?.[1];
  assert.ok(profile);
  for (const line of ["initWith release", "applicationIdSuffix '.acceptance'", "signingConfig signingConfigs.debug", "debuggable false", "dimax-installer-acceptance"]) {
    assert.ok(profile.includes(line), line);
  }
  assert.match(gradle, /debuggableVariants = \["debug"\]/);
  assert.match(gradle, /taskGraph\.whenReady/);
  assert.match(gradle, /createBundleReleaseJsAndAssets.*createBundleAcceptanceJsAndAssets/);
  assert.match(gradle, /task\.inputs\.property\(key, System\.getenv\(key\)/);
  const release = buildTypes.match(/        release \{([\s\S]+?)^        \}/m)?.[1];
  assert.ok(release.includes("signingConfig signingConfigs.release"));
  assert.ok(!release.includes("signingConfigs.debug"));
  assert.ok(!release.includes("applicationIdSuffix"));
});

test("production denies HTTP while acceptance permits only loopback without subdomains", () => {
  const readPolicy = (profile) => fs.readFileSync(new URL(`../android/app/src/${profile}/res/xml/network_security_config.xml`, import.meta.url), "utf8");
  assert.ok(!readPolicy("main").includes('cleartextTrafficPermitted="true"'));
  const policy = readPolicy("acceptance");
  assert.match(policy, /base-config cleartextTrafficPermitted="false"/);
  assert.deepEqual([...policy.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map((match) => match[1]), ["127.0.0.1"]);
  assert.equal((policy.match(/<domain\s/g) || []).length, 1);
});

test("Expo metadata matches the isolated native package and keeps production unchanged", () => {
  const require = createRequire(import.meta.url);
  const configure = require("../app.config.js");
  const config = require("../app.json").expo;
  const previous = process.env.EXPO_PUBLIC_BUILD_PROFILE;
  try {
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE;
    assert.deepEqual(configure({ config }), config);
    process.env.EXPO_PUBLIC_BUILD_PROFILE = "acceptance";
    const result = configure({ config });
    assert.equal(result.name, "DIMAX Test");
    assert.equal(result.android.package, "com.dimax.operations.installer.acceptance");
    assert.equal(result.scheme, "dimax-installer-acceptance");
    assert.equal(config.android.package, "com.dimax.operations.installer");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_BUILD_PROFILE;
    else process.env.EXPO_PUBLIC_BUILD_PROFILE = previous;
  }
});
