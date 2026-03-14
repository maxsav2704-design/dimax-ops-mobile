# Mobile Visual QA Readiness

## Scope

This checkpoint covers device-readiness, runtime startup, and a first live pass on a physical Android device for the installer mobile app.

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
- `.\workspace.cmd preflight-mobile-native-build`
- `.\workspace.cmd smoke-mobile`
- `npm.cmd run typecheck`
- `npm.cmd run test`

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
- `vitest`: `24 passed`
- `tsc --noEmit`: passed

## Live device notes

Observed during the device pass:

- the first debug launch required a running Metro instance
- the phone also needed `adb reverse` for:
  - `tcp:8081`
  - `tcp:8000`
- login failures during the first pass were caused by the backend API being down, not by invalid credentials
- once Metro and API were reachable from the device, the app opened and accepted installer login

## Readiness assessment

- toolchain readiness: ready
- Expo startup baseline: ready
- first live device pass: passed
- full screen-by-screen visual QA: next polish stage
