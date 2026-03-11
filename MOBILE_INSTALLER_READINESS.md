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
- `vitest`: `24 passed`
- `expo config --json`
- `tsc --noEmit`
- `.\workspace.cmd preflight-mobile-device`
- `.\workspace.cmd smoke-mobile`
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

- real in-app navigation smoke on Android emulator / physical device
- screen-level tests for navigation and continuity
- visual QA on small devices
- push / notification strategy, if required
- stronger auth/session refresh UX on mobile

## Readiness assessment

- engineering baseline: strong
- execution flow: strong
- backend contract dependence: explicit and safe
- production release readiness: not final yet
- mobile product baseline: ready for next validation stage
