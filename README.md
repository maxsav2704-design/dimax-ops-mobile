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
  - `POST /api/v1/installer/sync` (cold snapshot when the cursor is behind)
  - `GET /api/v1/installer/projects/{project_id}` (project detail refresh)
- incremental sync/outbox via:
  - `POST /api/v1/installer/sync`
- offline actions:
  - `DOOR_SET_STATUS`
  - `ADDON_FACT_CREATE`
  - `ISSUE_CREATE`
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

### Confirmed Installer Prices

Sync may include `factory_prices`: a receipt-validated active company version
with read-only installer rates, or `null` while factory pricing is inactive.
It is separate from project addon plans; those plans remain price-free locally.
`src/modules/prices` validates and stores this snapshot in the account-owned
SQLite `sync_state`. A missing field from an older server does not clear it.

New completed-work commands capture only `price_list_id`, never an amount or an
approval flag. Execution time and this reference survive retries/cold resync.
Existing versionless outbox rows are not backfilled from the current cache.
Server `CONFLICT_FACTORY_PRICE` keeps the work for administrator review rather
than silently repricing it. The queue explains this in all three languages and
disables retry/deletion for that conflict. Technical details retain the original
execution time and seen price-list ID; legacy records are explicitly unversioned.

Door and addon work cards show only this confirmed, saved rate. Addon totals are
quantity previews, not earnings; decimal HALF_UP matches the server's quote rules.
Completed doors link to project earnings instead of using today's rate, and
queued completions link to their work queue without repricing. Missing/damaged
price caches never appear as zero rates. The project snapshot and price read use
one account guard; a failed price read alone does not discard local door data.
Price editing, authorized conflict resolution and physical-device rollout
validation are not part of this installer-facing presentation.

No SQLite schema bump is required for this additive JSON contract. Deployment
does not activate factory prices; the activation route is not enabled yet.

### Cold Snapshot

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

Keep the device on the same API and company as the admin under verification.
The acceptance admin on port 4173 uses API port 8001; the normal workspace API
on port 8000 is a different database. Installer visibility remains assignment-based,
not a copy of the administrator's access. A local `.env.local` may pin
`EXPO_PUBLIC_API_BASE_URL` and disable `EXPO_PUBLIC_E2E_AUTO_LOGIN`. Local environment
files are ignored by Git; only example files belong in source control.
Before changing environments, sign out on the device while preserving its outbox.
Never erase SQLite or replay an old environment's events into the new server.
Verify the built bundle URL and USB reverse port, then sign in to the matching
company and compare assigned project/door IDs with the admin. After a temporary
automated test login, restart Metro with the test credentials removed and automatic
login disabled. An old offline cache is not evidence of a successful connection.

Manual login is the default, including development builds. Automated test login
requires explicit opt-in and a complete set of synthetic credentials. Configure
these environment variables in the launching shell before using the E2E launcher:

- `EXPO_PUBLIC_API_BASE_URL`: the isolated test API, for example
  `http://127.0.0.1:8001` for the workspace acceptance stack;
- `EXPO_PUBLIC_E2E_COMPANY_ID`: the synthetic company UUID;
- `EXPO_PUBLIC_E2E_EMAIL`: the synthetic installer account;
- `EXPO_PUBLIC_E2E_PASSWORD`: its test-only password.

The launcher enables `EXPO_PUBLIC_E2E_AUTO_LOGIN=1` for that session. When starting
Metro directly, set this flag explicitly only for an automated test session.
These `EXPO_PUBLIC_*` values are embedded in the development bundle: never use
real credentials, distribute a test-login bundle, or put them in release builds.
The launcher accepts only loopback HTTP(S) targets routed through ADB reverse;
it no longer selects the ordinary API or a seeded company automatically.

```powershell
cd mobile
.\start-expo-e2e.cmd -ValidateOnly
.\start-expo-e2e.cmd
```

`-ValidateOnly` checks configuration without starting Metro, changing ADB routing
or contacting a device. It prints only API/Metro connection details, not account
credentials. Test the launcher with `npm.cmd run test:e2e-launcher` (PowerShell
required; use `pwsh` on non-Windows hosts).

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
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_BUILD_PROFILE = 'production'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://api.your-domain.com'
npm.cmd run production-config-check
.\gradlew.bat --no-daemon bundleRelease
```

Both bundled variants reject embedded E2E identities/passwords and automatic
test login. Remove these variables from the build process, not just local files.
Gradle also validates aggregate tasks so `assemble` cannot bypass release guards.

## Standalone USB acceptance APK

This is a non-production, ARM64-only build for the isolated API on port 8001.
It bundles production JavaScript/Hermes and runs without Metro, but uses the
local debug signing key. Never distribute it as the production application.
Production still requires its own keystore and a real HTTPS API.

The package `com.dimax.operations.installer.acceptance`, label `DIMAX Test`, and
scheme `dimax-installer-acceptance` are separate from the existing installer app.
Installing it does not replace that app or share its tokens, SQLite or outbox.
Its network policy permits HTTP only to `127.0.0.1`; the build and runtime require
exactly `http://127.0.0.1:8001`. Do not point it at the ordinary database on 8000.

Use the project's Node 20, JDK 17 and Android SDK. From `mobile`:

```powershell
$env:NODE_ENV = 'production'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_BUILD_PROFILE = 'acceptance'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8001'
'EXPO_PUBLIC_E2E_AUTO_LOGIN','EXPO_PUBLIC_E2E_COMPANY_ID','EXPO_PUBLIC_E2E_EMAIL','EXPO_PUBLIC_E2E_PASSWORD' |
  ForEach-Object { Remove-Item -LiteralPath "Env:$_" -ErrorAction SilentlyContinue }
npm.cmd run test:android-build-contract
Set-Location android
.\gradlew.bat :app:assembleAcceptance --no-daemon --max-workers=1 '-PreactNativeArchitectures=arm64-v8a'
```

The APK is `android/app/build/outputs/apk/acceptance/app-acceptance.apk`.
Use `--offline` only after both release React Native and Hermes dependencies
are cached. Check the package, non-debuggable manifest, embedded bundle and APK
signature before installing. Do not commit APKs, build output or signing files.
Start the isolated backend, add `adb reverse tcp:8001 tcp:8001`, then sign in
normally with a synthetic installer. Never write tokens into the app's storage.

Acceptance must include a cold launch with no Metro listener, authenticated
sync/earnings against that backend, and a second cold launch after removing
the API reverse mapping. Merely reaching the login screen is not proof of the
complete offline workflow. Preserve queues and restore the prior device/server
state when finished. Test contracts with `npm.cmd run test:android-build-contract`.

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

Production values can be prepared in the ignored `.env.production.local`; start
from `.env.production.example` and validate before building:

```powershell
npm.cmd run production-config-check -- --env-file .env.production.local
```

That command validates the file; it does not export it into Gradle's environment.
Supply the reviewed values through the build process or trusted CI environment.
Bundled builds require `EXPO_NO_DOTENV=1` so Expo cannot silently load another
local environment file. Keystore secrets must not use `EXPO_PUBLIC_*` names.
