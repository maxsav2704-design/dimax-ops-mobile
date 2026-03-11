# Mobile Localization Readiness

## Scope

The mobile installer application now has a working multilingual baseline for:

- `en`
- `ru`
- `he`

This covers the installer-facing route set:

- `login`
- `workspace`
- `calendar`
- `earnings`
- `project/[id]`
- `sync-queue`

## What is localized

- navigator titles
- login screen
- workspace execution flow
- calendar execution flow
- earnings flow
- project execution flow
- sync queue flow

## Runtime behavior

- locale is stored with `expo-secure-store`
- locale is restored on app load
- screen text now resolves through the mobile i18n layer
- the installer mobile flow no longer depends on hardcoded English copy for core execution routes

## Validation

Validated locally with:

- `npm.cmd run typecheck`
- `npm.cmd run test`

Current result:

- `vitest`: `24 passed`
- `tsc --noEmit`: passed

## Remaining gaps

- full screen-level visual QA on device sizes
- stronger Hebrew/RTL layout polish at runtime on real devices
- future localization coverage for any new mobile screens introduced after this baseline

## Readiness assessment

- localization foundation: ready
- installer route coverage: strong
- persistence layer: ready
- production mobile localization polish: not final yet
