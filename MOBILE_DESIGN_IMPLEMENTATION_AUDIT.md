# DIMAX Mobile Design Implementation Audit

Date: 2026-06-21

## Source audit

The source folder `C:\Users\Hi-tech\Downloads\дизайн` was inspected recursively.

- 70 top-level source files
- 15 extracted review copies under `_review_extract`
- 85 files total
- ZIP archives inspected entry by entry
- XLSX workbook inspected as an Office Open XML archive
- duplicate brand and database documents identified by SHA-256

## Mobile design sources

| Source | Implementation |
| --- | --- |
| `dimax-installer-job-detail.html` | `app/project/[id].tsx`: project hero, progress, quick actions, floor groups and door matrix |
| `dimax-installer-door-detail.html` | `app/project/[id].tsx`: selected-door detail, status, issues, metadata and actions |
| `dimax-installer-doordetail.html` | Applied as door-detail behavior/specification reference |
| `dimax-installer-earnings.html` | `app/earnings.tsx`: dark finance hero, periods, work types, project accordions and rows |
| `dimax-installer-issue-flag.html` | `app/issues.tsx`: category, details, review and offline save flow |
| `dimax-installer-profile.html` | `app/profile.tsx`: account, device, locale and sync controls |
| `dimax-installer-sync-queue.html` | `app/sync-queue.tsx`: queue health, filters, resolution guidance and safe retry/drop |
| `dimax-installer-messages.html` | Not activated: no mobile messaging contract exists in the current project |
| `dimax-installer-onboarding.html` | Not activated: no persisted onboarding state or required installer-document contract exists |
| `dimax-installer-client-signoff.html` | Not activated: current business rule forbids building the workflow around signatures |
| `dimax-installer-signoff-implementation.html` | Not activated for the same business-rule and contract reasons |

Secondary sources applied:

- `dimax-brand-codex.html`
- `dimax-design-system-handoff.html`
- `dimax-component-library.html`
- `dimax-empty-states.html`
- `dimax-design-review.html`
- `dimax-login-redesign.html`

## Implemented routes

- `login`: branded installer sign-in
- `projects`: today workspace and assigned jobs
- `calendar`: seven-day field plan
- `issues`: installer issue list and offline-first issue creation
- `earnings`: read-only backend-calculated earnings
- `project/[id]`: project and door execution workspace
- `sync-queue`: offline outbox resolution
- `profile`: installer account and device state

## Business constraints preserved

- no mandatory photo confirmation
- no signature-dependent completion
- no logistics workflow added
- no client price exposed to installer
- earnings remain server-calculated
- installer actions remain limited to assigned projects and doors
- issue creation is stored locally first and synchronized through the outbox
- Waze, WhatsApp and phone actions are shown only when real project links exist

## Shared design system

The implementation uses:

- `src/lib/theme.ts`
- `src/components/mobile-ui.tsx`
- `src/components/installer-ui.tsx`
- `src/components/LocaleSwitcher.tsx`

The shared layer defines DIMAX colors, status tones, compact cards, touch targets,
screen heroes, metrics, segmented controls, actions, empty states and bottom navigation.

## Validation

- TypeScript: passed
- Vitest: 97 tests passed
- Expo config: passed
- Python compile check for backend sync changes: passed
- Native Android toolchain preflight: passed
- Native Android debug build: passed
- APK: `android/app/build/outputs/apk/debug/app-debug.apk` (132.22 MB)
- APK SHA-256: `C61DD68FC72055968902573DE33DE7CE6900D2AB77C342906ECEBDDD82151223`
- Physical-device installation and visual pass: passed on Xiaomi `2210129SG` (Android API 35)
- Device smoke: login refresh, installer sync, tabs, issue composer, project detail and door detail passed
