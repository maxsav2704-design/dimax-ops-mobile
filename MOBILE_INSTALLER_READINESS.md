# Mobile Installer Readiness

## Current status

The mobile installer application is now a working read-only / offline-capable execution baseline built on Expo, React Native, SQLite, and the existing DIMAX backend contracts.

## Implemented flows

### Workspace

- `Today tasks`
- `Today earnings`
- `This month`
- `Today execution lane`
- `Readiness summary`
- `Service lane`
- `Problem projects lane`
- `Earnings by install type`
- `Today earnings lane`

### Calendar

- read-only installer calendar snapshot
- local cache fallback
- `Day focus`
- `Day quick summary`
- `Project lanes`
- `Service lane`
- continuity to:
  - project
  - issue context
  - earnings day focus

### Earnings

- read-only earnings summary contract
- cache fallback
- `Today / Month / Selected day`
- `Day drilldown`
- `By install type`
- `Project lanes`
- `Day lanes`
- continuity to:
  - project
  - issue context
  - calendar day focus

### Project

- door search
- door status filter
- issue summary chips
- issue continuity from workspace and calendar
- `Priority doors`
- `Floor lanes`
- `Project action hub`
- `Project completion lane`
- `Project earnings context`
- `Today / Month` project earnings scope

## Contract posture

- money logic remains on backend
- mobile does not invent earnings values
- calendar and earnings are read-only consumers of backend summaries
- project execution actions still use queued offline events and sync policy

## Validation

Validated locally with:

- `npm.cmd run quality-gate`
- clean Node `20.20.2` CI contract in `Mobile Quality Gate / quality-gate`
- `vitest`: `118 passed`
- `expo config --json`
- `tsc --noEmit`
- pinned `expo-doctor@1.20.2`: `17/17` checks
- `.\workspace.cmd preflight-mobile-device`
- `.\workspace.cmd preflight-mobile-native-build`
- `.\workspace.cmd smoke-mobile`
- physical Android device pass:
  - APK install
  - app launch
  - live installer login
  - assigned installer project list
  - assigned project detail navigation
  - no fatal Android or JavaScript runtime errors
- mobile visual/device readiness is tracked in:
  - `MOBILE_VISUAL_QA_READINESS.md`

## Localization baseline

- mobile locale foundation is implemented
- core installer routes are localized for:
  - `en`
  - `ru`
  - `he`
- readiness details are tracked in:
  - `MOBILE_LOCALIZATION_READINESS.md`

## Remaining gaps before production mobile release

- provision the real `EXPO_PUBLIC_API_BASE_URL` HTTPS endpoint; release builds
  now fail closed when it is missing, local, insecure, or a placeholder
- provision the owner-controlled Android release keystore and signing variables
- install the current release-candidate APK on a physical device and repeat the
  critical installer route smoke with evidence bound to that APK SHA-256

Historical Android execution, Waze, WhatsApp, locale-specific prefill, and crash
checks are green. They do not replace fresh device evidence for the current APK;
its artifact binding remains open. The canonical result is
`../artifacts/release/android-qa-report-latest.md` and currently reports
`BLOCKED` until that run is completed.

## Non-blocking follow-up

- broaden screen-level navigation tests beyond the current release-critical paths
- add more small-screen and device-matrix visual coverage
- define a push/notification strategy only when the operational process requires it
- continue improving auth/session refresh UX without changing the offline data model

## Readiness assessment

- engineering baseline: strong
- execution flow: strong
- backend contract dependence: explicit and safe
- production release readiness: blocked by production API environment, release
  signing, and fresh physical-device evidence for the current APK
- mobile product baseline: code-ready with historical device proof; current APK
  confirmation remains pending
