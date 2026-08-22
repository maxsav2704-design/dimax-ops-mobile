# Mobile Visual QA Readiness

## Scope

This checkpoint covers device-readiness, runtime startup, branded native assets,
and physical Android evidence for the installer mobile app.

Routes planned for visual QA:

- `login`
- `workspace`
- `calendar`
- `earnings`
- `issues`
- `project/[id]`
- `sync-queue`
- `profile`

## Current validation

Validated locally with:

- `.\workspace.cmd preflight-mobile-device`
- `.\workspace.cmd preflight-mobile-native-build`
- `.\workspace.cmd smoke-mobile`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- Android `assembleDebug`
- Android resource inspection through `aapt`

Validated on device with:

- physical Android device attached over `adb`
- debug APK installed successfully
- Metro attached through `adb reverse`
- backend API attached through `adb reverse`
- app launched and passed live login

Current result:

- Android SDK tools detected
- AVDs detected
- Metro smoke started successfully
- physical Android device detected through `adb`
- Android debug APK installed and launched
- live app login passed on device
- `vitest`: `154 passed` across `20` test files
- `tsc --noEmit`: passed
- Expo production config contract: passed
- Android release network and manifest policy: passed

Current premium build validated locally on 2026-08-23:

- launcher icon replaced with the DIMAX mark
- Android adaptive icon present for every reported density
- white Expo placeholder removed from the splash screen
- transparent DIMAX splash artwork on `#080E15`
- Android debug build: passed
- application ID: `com.dimax.operations.installer`
- APK size: `132.55 MB`
- APK SHA-256: `2FF4362630E0E50412000F464FC9AED7341C5C659BD4C178ACB2C35AE61E7FA4`
- mobile source: clean release HEAD recorded by the native build gate in
  `artifacts/android/native-build-latest.json`
- APK permissions inspected through `aapt`; obsolete storage permissions are absent
- Metro Android bundle smoke: HTTP `200`, `8,542,853` bytes

## Physical-device pass

Exploratory visual pass on Xiaomi `2210129SG` on 2026-08-22:

- current debug APK installed successfully over the existing app data
- live cold resync completed without a timeout
- installer scope contained 21 assigned projects and 43 doors
- workspace totals reconciled to 19 installed, 24 remaining and 3 open issues
- dashboard, calendar, issues, earnings, profile, project detail and floor/door explorer were inspected
- primary bottom-navigation transitions were exercised
- backend was then stopped and the final APK reopened the saved workspace offline
- final offline evidence: `artifacts/device-qa/dashboard-final-apk-offline.png`

These screenshots are useful visual and offline-behavior evidence, but the device
session did not save a machine-verifiable binding between the installed APK and its
SHA-256. The canonical Android release report therefore correctly keeps the current
candidate `BLOCKED` until a fresh hash-bound device run is recorded.

The debug shell still requires Metro through `adb reverse tcp:8081`. This is a
development-client constraint and does not apply to a signed standalone release.
A final human tap-through on the signed release remains part of field acceptance.

## Readiness assessment

- toolchain readiness: ready
- Expo startup baseline: ready
- current premium APK physical startup: exploratory pass only; hash-bound rerun pending
- current core-route visual QA: passed
- offline saved-workspace startup: passed
- signed-release field acceptance: pending production URL and signing credentials

## Reliability hardening completed on 2026-08-22

- all protected routes now share one authentication guard
- rejected refresh sessions return immediately to login
- cold resync is blocked while unresolved offline work exists
- legacy bootstrap uses the canonical cursor-based sync contract
- duplicate pending status changes for one door are rejected transactionally
- SQLite migrations execute atomically
- calendar ranges include complete local days
- calendar and earnings DTO/cache failures produce controlled states
- confirmed project access revocation hides stale in-memory project data
- Waze, WhatsApp and phone actions enforce scheme and host allowlists
- add-on quantities match the backend `Numeric(12,2)` boundary

## Account isolation hardening completed on 2026-08-23

- API results are discarded when the active installer account changes in flight
- refresh rotation cannot overwrite another account's token pair
- rejected stale refreshes cannot clear a replacement account
- delayed login/logout operations cannot replace or deactivate the newer session
