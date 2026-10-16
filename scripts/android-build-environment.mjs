import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateBundledInputs(env, variant) {
  const errors = [];
  if (!["release", "acceptance"].includes(variant)) return ["Unknown bundled Android variant"];
  if (env.NODE_ENV !== "production") errors.push("Bundled Android builds require NODE_ENV=production");
  if (env.EXPO_NO_DOTENV !== "1") errors.push("Set EXPO_NO_DOTENV=1 to exclude local env files from the APK");
  const profile = env.EXPO_PUBLIC_BUILD_PROFILE || "production";
  if (profile !== (variant === "acceptance" ? "acceptance" : "production")) {
    errors.push("Build profile does not match the native Android variant");
  }
  if (variant === "acceptance" && env.EXPO_PUBLIC_API_BASE_URL !== "http://127.0.0.1:8001") {
    errors.push("Acceptance APK requires exactly the isolated USB API http://127.0.0.1:8001");
  }
  for (const key of ["EXPO_PUBLIC_E2E_COMPANY_ID", "EXPO_PUBLIC_E2E_EMAIL", "EXPO_PUBLIC_E2E_PASSWORD"]) {
    if (env[key]) errors.push(`${key} must be absent from bundled Android builds`);
  }
  if (![undefined, "", "0", "false"].includes(env.EXPO_PUBLIC_E2E_AUTO_LOGIN)) {
    errors.push("Automatic test login is forbidden in bundled Android builds");
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateBundledInputs(process.env, process.argv[2]);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Bundled ${process.argv[2]} inputs verified (no embedded test credentials).`);
  }
}
