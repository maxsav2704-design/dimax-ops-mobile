import fs from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const PLACEHOLDER_PATTERN = /example\.com|replace|placeholder|changeme|change-me|todo/iu;

function parseEnvFile(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function validateApiBaseUrl(value) {
  const errors = [];
  const candidate = String(value || "").trim();
  if (!candidate) {
    return ["EXPO_PUBLIC_API_BASE_URL is required"];
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return ["EXPO_PUBLIC_API_BASE_URL must be an absolute URL"];
  }

  if (parsed.protocol !== "https:") {
    errors.push("EXPO_PUBLIC_API_BASE_URL must use HTTPS in production");
  }
  if (!parsed.hostname || LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    errors.push("EXPO_PUBLIC_API_BASE_URL must not point to localhost in production");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    errors.push("EXPO_PUBLIC_API_BASE_URL must contain only an API origin and optional path");
  }
  if (PLACEHOLDER_PATTERN.test(candidate)) {
    errors.push("EXPO_PUBLIC_API_BASE_URL must not use a placeholder production host");
  }
  return errors;
}

function validateAndroidNetworkSecurity(projectRoot = process.cwd()) {
  const errors = [];
  const mainPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "res",
    "xml",
    "network_security_config.xml",
  );
  const debugPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "debug",
    "res",
    "xml",
    "network_security_config.xml",
  );

  if (!fs.existsSync(mainPath)) {
    errors.push("Android release network security config is missing");
  } else {
    const content = fs.readFileSync(mainPath, "utf8");
    if (!/<base-config\s+cleartextTrafficPermitted="false"\s*\/>/u.test(content)) {
      errors.push("Android release network policy must deny cleartext traffic");
    }
    if (/cleartextTrafficPermitted="true"/u.test(content)) {
      errors.push("Android release network policy must not allow cleartext domains");
    }
  }

  if (!fs.existsSync(debugPath)) {
    errors.push("Android debug network security config is missing");
  } else {
    const content = fs.readFileSync(debugPath, "utf8");
    if (!/<domain-config\s+cleartextTrafficPermitted="true">/u.test(content)) {
      errors.push("Android debug network policy must allow its local Metro domain group");
    }
    for (const host of ["localhost", "127.0.0.1", "10.0.2.2"]) {
      const escapedHost = host.replaceAll(".", "\\.");
      const pattern = new RegExp(`<domain[^>]*>${escapedHost}</domain>`, "u");
      if (!pattern.test(content)) {
        errors.push(`Android debug network policy is missing ${host}`);
      }
    }
  }

  return errors;
}

function validateAndroidManifest(projectRoot = process.cwd()) {
  const errors = [];
  const mainPath = path.join(projectRoot, "android", "app", "src", "main", "AndroidManifest.xml");
  const debugPath = path.join(projectRoot, "android", "app", "src", "debug", "AndroidManifest.xml");

  if (!fs.existsSync(mainPath)) {
    return ["Android release manifest is missing"];
  }

  const main = fs.readFileSync(mainPath, "utf8");
  if (!/android:name="android\.permission\.INTERNET"/u.test(main)) {
    errors.push("Android release manifest must allow internet access");
  }
  for (const permission of ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "VIBRATE"]) {
    const declaration = main.match(
      new RegExp(
        `<uses-permission\\b[^>]*android:name="android\\.permission\\.${permission}"[^>]*/?>`,
        "u",
      ),
    )?.[0];
    if (!declaration?.includes('tools:node="remove"')) {
      errors.push(`Android release manifest must remove inherited ${permission}`);
    }
  }
  if (main.includes("android.permission.SYSTEM_ALERT_WINDOW")) {
    errors.push("Android release manifest must not request SYSTEM_ALERT_WINDOW");
  }
  if (!/android:allowBackup="false"/u.test(main)) {
    errors.push("Android release manifest must disable backup for the offline work database");
  }
  const schemeMatches = main.match(/android:scheme="dimax-installer"/gu) || [];
  if (schemeMatches.length !== 1) {
    errors.push("Android release manifest must declare the DIMAX deep-link scheme exactly once");
  }

  if (!fs.existsSync(debugPath)) {
    errors.push("Android debug manifest is missing");
  } else if (!fs.readFileSync(debugPath, "utf8").includes("android.permission.SYSTEM_ALERT_WINDOW")) {
    errors.push("Android debug manifest must retain the Expo development overlay permission");
  }

  return errors;
}

function parseArgs(args) {
  const result = { envFile: "", selfTest: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--self-test") {
      result.selfTest = true;
      continue;
    }
    if (arg === "--env-file") {
      const value = args[index + 1];
      if (!value) throw new Error("--env-file requires a path");
      result.envFile = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function runSelfTest() {
  const cases = [
    { value: "", valid: false },
    { value: "http://api.dimax.co.il", valid: false },
    { value: "https://localhost:8000", valid: false },
    { value: "https://api.example.com", valid: false },
    { value: "https://user:pass@api.dimax.co.il", valid: false },
    { value: "https://api.dimax.co.il", valid: true },
    { value: "https://api.dimax.co.il/root/", valid: true },
  ];

  for (const testCase of cases) {
    const valid = validateApiBaseUrl(testCase.value).length === 0;
    if (valid !== testCase.valid) {
      throw new Error(`Production API validator self-test failed for: ${testCase.value || "<empty>"}`);
    }
  }
  const networkErrors = validateAndroidNetworkSecurity();
  const manifestErrors = validateAndroidManifest();
  const androidErrors = [...networkErrors, ...manifestErrors];
  if (androidErrors.length > 0) {
    throw new Error(`Android production contract failed: ${androidErrors.join("; ")}`);
  }
  console.log(
    `Mobile production contract passed (${cases.length} API cases + Android network/manifest policy).`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }

  let values = process.env;
  if (options.envFile) {
    const envPath = path.resolve(options.envFile);
    if (!fs.existsSync(envPath)) {
      throw new Error(`Production env file does not exist: ${envPath}`);
    }
    values = { ...process.env, ...parseEnvFile(envPath) };
  }

  const errors = [
    ...validateApiBaseUrl(values.EXPO_PUBLIC_API_BASE_URL),
    ...validateAndroidNetworkSecurity(),
    ...validateAndroidManifest(),
  ];
  if (errors.length > 0) {
    console.error("Mobile production config validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Mobile production config is valid.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
