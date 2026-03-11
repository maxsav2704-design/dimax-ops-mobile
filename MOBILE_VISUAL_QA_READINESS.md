# Mobile Visual QA Readiness

## Scope

This checkpoint covers device-readiness and runtime startup for the installer mobile app.

Routes planned for visual QA:

- `login`
- `workspace`
- `calendar`
- `earnings`
- `project/[id]`
- `sync-queue`

## Current validation

Validated locally with:

- `.\workspace.cmd preflight-mobile-device`
- `.\workspace.cmd smoke-mobile`
- `npm.cmd run typecheck`
- `npm.cmd run test`

Current result:

- Android SDK tools detected
- AVDs detected
- Metro smoke started successfully
- `vitest`: `24 passed`
- `tsc --noEmit`: passed

## Current blocker for full visual QA

No emulator/device was attached during this pass.

Observed state:

- `adb devices` returned no active devices
- the app is device-ready
- a full screen-by-screen visual pass still requires:
  - Android emulator launch, or
  - physical device connection

## Readiness assessment

- toolchain readiness: ready
- Expo startup baseline: ready
- full visual QA on device: pending
