# DIMAX Mobile

Installer mobile workspace for the DIMAX Operations Suite.

## Scope

This app is the mobile/offline-first layer from the main project TZ:

- Expo / React Native shell
- SQLite local cache
- offline queue for installer actions
- cursor-based sync against `/api/v1/installer/sync`
- local project/door storage for work without network

## Current foundation

Implemented in this step:

- secure token storage via `expo-secure-store`
- local SQLite schema in `src/lib/db.ts`
- installer auth client in `src/lib/api.ts`
- online bootstrap from:
  - `GET /api/v1/auth/me`
  - `GET /api/v1/installer/projects`
  - `GET /api/v1/installer/projects/{project_id}`
- incremental sync/outbox via:
  - `POST /api/v1/installer/sync`
- offline actions:
  - `DOOR_SET_STATUS`
  - `ADDON_FACT_CREATE`
- auto sync on foreground + periodic interval
- local pending sync queue view
- retry backoff for transient sync failures
- blocked queue state for non-retryable sync errors
- SQLite schema versioning via `PRAGMA user_version`
- installer-facing `Sync Queue` screen with `Retry now` / `Drop event`
- `vitest` harness for sync retry policy and queue presentation rules
- project filters by:
  - `order_number`
  - `location_code`
- project issue warning banners
- add-on picker from local SQLite data instead of raw UUID input

## Important contract assumption

Cold snapshot must include `projects` with:

- `id`
- `name`
- `address`
- `status`
- `waze_url`

This was added in backend in the same step so the mobile app can recover full offline project navigation after `reset_required=true`.

## Implementation planning

- `MOBILE_INSTALLER_IMPLEMENTATION_PLAN.md`
- `MOBILE_INSTALLER_READINESS.md`
- `MOBILE_LOCALIZATION_READINESS.md`
- `MOBILE_VISUAL_QA_READINESS.md`

## Next mobile steps

1. Install dependencies in `mobile/`
2. Run quality gate:

```powershell
.\workspace.cmd test-mobile-gate
```

This now includes:

- verified `image-size` security patch
- complete Vitest discovery contract
- `vitest run`
- `expo config --json`
- `tsc --noEmit`

Expo 52 currently resolves `image-size@1.2.1`, while upstream has no patched
release for `GHSA-w3rx-r6r6-pgpr` and `GHSA-5p2g-fcmc-qvqq`. `npm ci` applies
the pinned ICNS/JXL/HEIF denial-of-service fix through
`scripts/patch-image-size.mjs`; the quality gate then runs malicious-buffer and
normal-PNG regressions. Any `image-size` version change fails closed until this
mitigation is reviewed or a fixed upstream release replaces it.

Expo doctor is also expected to pass. The project keeps a native `android/`
workspace for `expo run:android`, so the doctor check for unsynced managed app
config fields is disabled in `package.json`; native config changes must be
applied through prebuild/native Android changes before release builds.
`expo-doctor@1.20.2` is pinned in `devDependencies`; CI never downloads an
unreviewed latest doctor version through `npx`.

Every mobile pull request and push to `main` runs
`.github/workflows/mobile-quality-gate.yml`. Branch protection must require
`Mobile Quality Gate / quality-gate`; the workflow performs a clean `npm ci`,
the complete quality gate, and Expo Doctor.

3. Run Expo smoke:

```powershell
.\workspace.cmd smoke-mobile
```

The smoke gate uses Node `>=20.18 <21`, starts Metro on an isolated local port,
downloads the real Android JavaScript bundle, validates its response and size,
and always removes the temporary process tree and files. A running Expo process
without a valid bundle is not considered a pass.

4. Run Expo locally on device/emulator

Preflight Android toolchain first:

```powershell
.\workspace.cmd preflight-mobile-device
.\workspace.cmd preflight-mobile-native-build
```

For the local installer E2E session on an attached Android device:

```powershell
cd mobile
.\start-expo-e2e.cmd
```

The E2E launcher uses one Metro worker by default so it remains reliable on
low-memory development machines. Set `DIMAX_METRO_MAX_WORKERS` to a positive
integer only when the workstation has enough memory for parallel bundling.
Set `DIMAX_METRO_CLEAR_CACHE=1` only when a clean Metro cache is intentionally
required; routine device launches reuse the existing cache. The launcher fails
fast when the selected runtime is not Node `>=20.18 <21`.

Current baseline already validated:

- `.\workspace.cmd preflight-mobile-device`
- `.\workspace.cmd smoke-mobile`
- `.\workspace.cmd preflight-mobile-native-build`
- physical Android device:
  - debug APK install
  - live app launch
  - installer login success
  - assigned project list and project detail navigation
- first `expo run:android` needs `JAVA_HOME` and a cached Gradle `8.10.2` distribution or internet access to `services.gradle.org`

## Android release signing

The stable Android application ID is `com.dimax.operations.installer`.
Release tasks fail closed unless the real HTTPS API URL and all signing values
are provided through the build environment:

- `EXPO_PUBLIC_API_BASE_URL`

- `DIMAX_ANDROID_KEYSTORE_FILE`
- `DIMAX_ANDROID_KEYSTORE_PASSWORD`
- `DIMAX_ANDROID_KEY_ALIAS`
- `DIMAX_ANDROID_KEY_PASSWORD`

Do not commit the keystore or its credentials. A production bundle can be
created from `mobile/android` after the variables are present:

```powershell
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://api.your-domain.com'
npm.cmd run production-config-check
.\gradlew.bat --no-daemon bundleRelease
```

5. Run first device/emulator smoke with real navigation
6. Add deeper SQLite migrations if local schema expands beyond sync queue
7. Expand mobile tests from pure sync rules to screen flows

## Expected env

Use `EXPO_PUBLIC_API_BASE_URL` to point mobile to the API. Development keeps a
`http://127.0.0.1:8000` fallback for local/ADB-reverse smoke only. Production
has no fallback and accepts only a non-local HTTPS URL.

Development example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

Production values belong in `.env.production.local`; start from
`.env.production.example` and validate before building:

```powershell
npm.cmd run production-config-check -- --env-file .env.production.local
```
