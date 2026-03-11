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

## Next mobile steps

1. Install dependencies in `mobile/`
2. Run quality gate:

```powershell
.\workspace.cmd test-mobile-gate
```

This now includes:

- `vitest run`
- `expo config --json`
- `tsc --noEmit`

3. Run Expo smoke:

```powershell
.\workspace.cmd smoke-mobile
```

4. Run Expo locally on device/emulator

Preflight Android toolchain first:

```powershell
.\workspace.cmd preflight-mobile-device
```

5. Run first device/emulator smoke with real navigation
6. Add deeper SQLite migrations if local schema expands beyond sync queue
7. Expand mobile tests from pure sync rules to screen flows

## Expected env

Use `EXPO_PUBLIC_API_BASE_URL` to point mobile to the API.

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```
