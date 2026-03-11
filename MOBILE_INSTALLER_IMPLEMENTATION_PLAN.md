# Mobile Installer Implementation Plan

Date: March 11, 2026

## Goal

Bring the installer mobile app from sync/offline foundation to a real field workflow that matches the existing installer web contour:

- login
- workspace
- calendar
- project details
- issue continuity
- earnings

## Scope for the first mobile product cycle

Priority scope:

1. `Login`
2. `Workspace`
3. `Calendar`
4. `Project`
5. `Issues continuity`
6. `Earnings`

This cycle does **not** change backend business logic. Mobile consumes existing contracts and adds UI/navigation/state only.

## Screen map

### 1. Login

Route:

- `app/login.tsx`

Must support:

- `company_id`
- `email`
- `password`
- session bootstrap

### 2. Workspace

Current baseline:

- `app/projects.tsx`

Needs to evolve into:

- today priorities
- my projects
- next 7 days
- quick actions
- earnings summary

### 3. Calendar

New route:

- `app/calendar.tsx`

First version should provide:

- date range summary
- upcoming events list
- project context
- quick jump to project
- empty/loading/error states

### 4. Project details

Current baseline:

- `app/project/[id].tsx`

Needs to keep:

- door actions
- reasons
- add-on fact queue
- issue banners
- pending sync queue

Needs to add later:

- better issue continuity
- better door search
- sticky field summary

### 5. Earnings

New route:

- `app/earnings.tsx`

First version should provide:

- today earnings
- month earnings
- earnings by install type
- daily breakdown
- empty/loading/error states

## Data contracts

### Existing mobile-safe contracts already available

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/installer/projects`
- `GET /api/v1/installer/projects/{project_id}`
- `POST /api/v1/installer/sync`

### Earnings contract requirement

Mobile should **not** calculate installer money on-device.

Required backend payload shape for earnings view:

- daily rows
- monthly summary
- breakdown by install type
- total amount
- source operation date
- project / door / order context

Recommended response shape:

- `period`
- `today_total`
- `month_total`
- `days[]`
- `install_types[]`
- `rows[]`

## State strategy

### Online source of truth

- backend API

### Offline local source

- SQLite

### Queue rules

- keep offline actions queue isolated from earnings
- earnings is read-only in first cycle
- no local recalculation of money totals

## Delivery order

### Phase 1

- create screen routes for calendar and earnings
- wire navigation from workspace
- add stable placeholders and state surfaces

### Phase 2

- connect calendar route to local/online installer event source
- connect earnings route to backend contract once available

### Phase 3

- add issue continuity between workspace -> calendar -> project
- add mobile-specific polish and state persistence

## Done criteria for this cycle

- installer can sign in on mobile
- installer can open workspace
- installer can open calendar
- installer can open project
- installer can see issue-related context
- installer can open earnings and see:
  - daily totals
  - monthly total
  - breakdown by install type
- no business logic duplicated in mobile
- routes pass Expo config + typecheck + tests

## Immediate next implementation step

Create the route skeletons for:

- `app/calendar.tsx`
- `app/earnings.tsx`

and expose them from the workspace screen so mobile IA is in place before wiring deeper data.
