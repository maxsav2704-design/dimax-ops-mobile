import { apiFetch } from "@/lib/api";
import { MOBILE_APP_VERSION } from "@/lib/config";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { getDb, getState, initDb, setState } from "@/lib/db";
import { normalizeAddonQuantity } from "@/modules/addons/quantity";
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  computeRetryDelayMinutes,
  getSyncErrorMessage,
  isRetryableSyncError,
} from "@/modules/sync/policy";
import type { PendingSyncEvent, SyncChange, SyncQueueSummary, SyncResponse, SyncSnapshot } from "@/modules/sync/types";

const CURSOR_KEY = "sync_cursor";
const LAST_SYNC_AT_KEY = "last_sync_at";
let syncExecutionTail: Promise<void> = Promise.resolve();
let automaticSyncInFlight: Promise<SyncResponse> | null = null;

type PendingSyncEventRow = Omit<PendingSyncEvent, "payload"> & {
  payload_json: string;
};

function mapPendingEventRow(row: PendingSyncEventRow): PendingSyncEvent {
  const { payload_json: payloadJson, ...event } = row;
  return {
    ...event,
    payload: parsePendingPayload(payloadJson),
  };
}

function enqueueSync<T>(operation: () => Promise<T>): Promise<T> {
  const result = syncExecutionTail.then(operation);
  syncExecutionTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
const ASSIGNMENT_CHANGED_ERROR = "CONFLICT_ASSIGNMENT_CHANGED";

function createClientEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function parsePendingPayload(payloadJson: string): Record<string, unknown> {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return {};
  }
}

function toIsoAfterMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

type LocalDoorSyncState = {
  status: string | null;
  is_locked: number | boolean | string | null;
  version?: number | string | null;
};

function isLocalDoorLocked(row: LocalDoorSyncState): boolean {
  return row.status === "LOCKED" || toLocalLockValue(row.is_locked) === 1;
}

function toNullableNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toLocalLockValue(value: unknown): 0 | 1 {
  if (value === true || value === 1) {
    return 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" ? 1 : 0;
  }
  return 0;
}

function isLocalOptimisticDoorLock(row: LocalDoorSyncState, payload: Record<string, unknown>): boolean {
  const status = typeof payload.status === "string" ? payload.status : null;
  const previousVersion = toNullableNumber(payload.previous_version);
  const currentVersion = toNullableNumber(row.version);
  return (
    status === "INSTALLED" &&
    row.status === "INSTALLED" &&
    previousVersion !== null &&
    currentVersion === previousVersion + 1
  );
}

function canApplyPendingDoorStatus(row: LocalDoorSyncState, payload: Record<string, unknown>): boolean {
  return !isLocalDoorLocked(row) || isLocalOptimisticDoorLock(row, payload);
}

async function getLocalDoorSyncState(
  db: Awaited<ReturnType<typeof getDb>>,
  doorId: string
): Promise<LocalDoorSyncState | null> {
  return (await db.getFirstAsync<LocalDoorSyncState>(
    "SELECT status, is_locked, version FROM doors WHERE id = ?",
    [doorId]
  )) ?? null;
}

async function getPendingEvents(limit = 500, forceRetry = false): Promise<PendingSyncEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PendingSyncEventRow>(
    `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
     FROM pending_events
     WHERE status IN ('PENDING', 'FAILED')
       AND attempts < ?
       AND (? = 1 OR next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_AUTO_RETRY_ATTEMPTS, forceRetry ? 1 : 0, new Date().toISOString(), limit]
  );
  return rows.map(mapPendingEventRow);
}

export async function listPendingEvents(projectId?: string): Promise<PendingSyncEvent[]> {
  const db = await getDb();
  const rows = projectId
    ? await db.getAllAsync<PendingSyncEventRow>(
        `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
         FROM pending_events
         WHERE project_id = ?
         ORDER BY created_at DESC`,
        [projectId]
      )
    : await db.getAllAsync<PendingSyncEventRow>(
        `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
         FROM pending_events
         ORDER BY created_at DESC`
      );

  return rows.map(mapPendingEventRow);
}

export async function countPendingEvents(projectId?: string): Promise<number> {
  const db = await getDb();
  const row = projectId
    ? await db.getFirstAsync<{ total: number }>(
        "SELECT COUNT(*) as total FROM pending_events WHERE project_id = ? AND status != 'BLOCKED'",
        [projectId]
      )
    : await db.getFirstAsync<{ total: number }>(
        "SELECT COUNT(*) as total FROM pending_events WHERE status != 'BLOCKED'"
      );
  return Number(row?.total || 0);
}

export async function getSyncQueueSummary(projectId?: string): Promise<SyncQueueSummary> {
  const db = await getDb();
  const params = projectId ? [projectId] : [];
  const where = projectId ? "WHERE project_id = ?" : "";
  const counts = await db.getFirstAsync<{
    total: number;
    pending: number;
    failed: number;
    blocked: number;
    ready_to_send: number;
  }>(
    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE
              WHEN status IN ('PENDING', 'FAILED')
               AND attempts < ${MAX_AUTO_RETRY_ATTEMPTS}
               AND (next_retry_at IS NULL OR next_retry_at <= ?)
              THEN 1 ELSE 0 END) as ready_to_send
      FROM pending_events
      ${where}`,
    projectId ? [new Date().toISOString(), ...params] : [new Date().toISOString()]
  );

  const nextRetry = await db.getFirstAsync<{ next_retry_at: string | null }>(
    `SELECT next_retry_at
     FROM pending_events
     ${where ? `${where} AND` : "WHERE"}
       status = 'FAILED'
       AND next_retry_at IS NOT NULL
     ORDER BY next_retry_at ASC
     LIMIT 1`,
    params
  );

  return {
    total: Number(counts?.total || 0),
    pending: Number(counts?.pending || 0),
    failed: Number(counts?.failed || 0),
    blocked: Number(counts?.blocked || 0),
    ready_to_send: Number(counts?.ready_to_send || 0),
    next_retry_at: nextRetry?.next_retry_at ?? null,
  };
}

async function getPendingEventRow(clientEventId: string): Promise<{
  client_event_id: string;
  type: string;
  project_id: string;
  happened_at: string | null;
  payload_json: string;
} | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{
    client_event_id: string;
    type: string;
    project_id: string;
    happened_at: string | null;
    payload_json: string;
  }>(
    `SELECT client_event_id, type, project_id, happened_at, payload_json
     FROM pending_events
     WHERE client_event_id = ?`,
    [clientEventId]
  )) ?? null;
}

async function markAckResult(clientEventId: string, ok: boolean, error: string | null): Promise<void> {
  const db = await getDb();
  const eventRow = await getPendingEventRow(clientEventId);
  if (ok) {
    await db.withTransactionAsync(async () => {
      if (eventRow?.type === "ADDON_FACT_CREATE") {
        await deleteLocalAddonFact(db, clientEventId);
      }
      await db.runAsync("DELETE FROM pending_events WHERE client_event_id = ?", [clientEventId]);
    });
    return;
  }

  const payload = eventRow ? parsePendingPayload(eventRow.payload_json) : {};
  await db.withTransactionAsync(async () => {
    if (eventRow?.type === "DOOR_SET_STATUS") {
      await revertDoorStatus(db, payload);
    } else if (eventRow?.type === "ADDON_FACT_CREATE") {
      await deleteLocalAddonFact(db, clientEventId);
    } else if (eventRow?.type === "ISSUE_CREATE") {
      await deleteLocalIssue(db, clientEventId);
    }
    await db.runAsync(
      `UPDATE pending_events
       SET status = 'BLOCKED',
           error = ?,
           next_retry_at = NULL
       WHERE client_event_id = ?`,
      [error, clientEventId]
    );
  });
}

async function markEventsAttempted(clientEventIds: string[]): Promise<void> {
  if (!clientEventIds.length) {
    return;
  }

  const db = await getDb();
  const attemptedAt = new Date().toISOString();
  const placeholders = clientEventIds.map(() => "?").join(", ");
  await db.runAsync(
    `UPDATE pending_events
     SET attempts = attempts + 1,
         last_attempt_at = ?,
         error = NULL
     WHERE client_event_id IN (${placeholders})`,
    [attemptedAt, ...clientEventIds]
  );
}

async function scheduleRetry(clientEventIds: string[], error: string): Promise<void> {
  if (!clientEventIds.length) {
    return;
  }

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const clientEventId of clientEventIds) {
      const row = await db.getFirstAsync<{ attempts: number }>(
        "SELECT attempts FROM pending_events WHERE client_event_id = ?",
        [clientEventId]
      );
      const attempts = Number(row?.attempts || 0);
      if (attempts >= MAX_AUTO_RETRY_ATTEMPTS) {
        await db.runAsync(
          `UPDATE pending_events
           SET status = 'BLOCKED',
               error = ?,
               next_retry_at = NULL
           WHERE client_event_id = ?`,
          [`${error} (auto retry limit reached)`, clientEventId]
        );
        continue;
      }
      const nextRetryAt = toIsoAfterMinutes(computeRetryDelayMinutes(attempts));
      await db.runAsync(
        `UPDATE pending_events
         SET status = 'FAILED',
             error = ?,
             next_retry_at = ?
         WHERE client_event_id = ?`,
        [error, nextRetryAt, clientEventId]
      );
    }
  });
}

async function markEventsBlocked(clientEventIds: string[], error: string): Promise<void> {
  if (!clientEventIds.length) {
    return;
  }

  const db = await getDb();
  const placeholders = clientEventIds.map(() => "?").join(", ");
  await db.runAsync(
    `UPDATE pending_events
     SET status = 'BLOCKED',
         error = ?,
         next_retry_at = NULL
     WHERE client_event_id IN (${placeholders})`,
    [error, ...clientEventIds]
  );
}

async function revertDoorStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  payload: Record<string, unknown>
): Promise<void> {
  const doorId = typeof payload.door_id === "string" ? payload.door_id : null;
  if (!doorId) {
    return;
  }

  const previousStatus = typeof payload.previous_status === "string" ? payload.previous_status : null;
  const previousReasonId =
    typeof payload.previous_reason_id === "string"
      ? payload.previous_reason_id
      : payload.previous_reason_id === null
        ? null
        : null;
  const previousComment =
    typeof payload.previous_comment === "string"
      ? payload.previous_comment
      : payload.previous_comment === null
        ? null
        : null;

  if (!previousStatus) {
    return;
  }

  const currentDoor = await getLocalDoorSyncState(db, doorId);
  if (currentDoor && !canApplyPendingDoorStatus(currentDoor, payload)) {
    return;
  }

  const previousIsLocked = toLocalLockValue(payload.previous_is_locked);
  const previousVersion = toNullableNumber(payload.previous_version);
  if (previousVersion === null) {
    await db.runAsync(
      `UPDATE doors
       SET status = ?, reason_id = ?, comment = ?, is_locked = ?, updated_at = ?
       WHERE id = ?`,
      [previousStatus, previousReasonId, previousComment, previousIsLocked, new Date().toISOString(), doorId]
    );
    return;
  }

  await db.runAsync(
    `UPDATE doors
     SET status = ?, reason_id = ?, comment = ?, is_locked = ?, version = ?, updated_at = ?
     WHERE id = ?`,
    [previousStatus, previousReasonId, previousComment, previousIsLocked, previousVersion, new Date().toISOString(), doorId]
  );
}

function getLocalAddonFactId(clientEventId: string): string {
  return `local:${clientEventId}`;
}

async function applyLocalDoorStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  payload: Record<string, unknown>
): Promise<void> {
  const doorId = typeof payload.door_id === "string" ? payload.door_id : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  if (!doorId || !status) {
    return;
  }

  const reasonId =
    typeof payload.reason_id === "string"
      ? payload.reason_id
      : payload.reason_id === null
        ? null
        : null;
  const comment =
    typeof payload.comment === "string"
      ? payload.comment
      : payload.comment === null
        ? null
        : null;

  const optimisticIsLocked = status === "INSTALLED" ? 1 : 0;
  const previousVersion = toNullableNumber(payload.previous_version);
  if (previousVersion === null) {
    await db.runAsync(
      `UPDATE doors
       SET status = ?, reason_id = ?, comment = ?, is_locked = ?, updated_at = ?
       WHERE id = ?`,
      [status, reasonId, comment, optimisticIsLocked, new Date().toISOString(), doorId]
    );
    return;
  }

  await db.runAsync(
    `UPDATE doors
     SET status = ?, reason_id = ?, comment = ?, is_locked = ?, version = ?, updated_at = ?
     WHERE id = ?`,
    [status, reasonId, comment, optimisticIsLocked, previousVersion + 1, new Date().toISOString(), doorId]
  );
}

async function upsertLocalAddonFact(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    clientEventId: string;
    projectId: string;
    addonTypeId: string;
    qtyDone: string;
    doneAt: string;
    comment: string | null;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO addon_facts(id, project_id, addon_type_id, installer_id, qty_done, done_at, comment, source, updated_at)
     VALUES(?, ?, ?, NULL, ?, ?, ?, 'OFFLINE', ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       addon_type_id = excluded.addon_type_id,
       qty_done = excluded.qty_done,
       done_at = excluded.done_at,
       comment = excluded.comment,
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [
      getLocalAddonFactId(input.clientEventId),
      input.projectId,
      input.addonTypeId,
      input.qtyDone,
      input.doneAt,
      input.comment,
      input.doneAt,
    ]
  );
}

async function restoreLocalAddonFactFromPayload(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    clientEventId: string;
    projectId: string;
    happenedAt: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const payload = input.payload;
  const addonTypeId = typeof payload.addon_type_id === "string" ? payload.addon_type_id : null;
  const rawQtyDone = typeof payload.qty_done === "string" || typeof payload.qty_done === "number"
    ? String(payload.qty_done)
    : null;
  if (!addonTypeId || !rawQtyDone) {
    return;
  }

  const qtyDone = normalizeAddonQuantity(rawQtyDone);
  if (!qtyDone) {
    return;
  }

  const comment =
    typeof payload.comment === "string"
      ? payload.comment
      : payload.comment === null
        ? null
        : null;
  await upsertLocalAddonFact(db, {
    clientEventId: input.clientEventId,
    projectId: input.projectId,
    addonTypeId,
    qtyDone,
    doneAt: input.happenedAt || new Date().toISOString(),
    comment,
  });
}

async function restoreLocalAddonFactFromEvent(
  db: Awaited<ReturnType<typeof getDb>>,
  eventRow: NonNullable<Awaited<ReturnType<typeof getPendingEventRow>>>
): Promise<void> {
  await restoreLocalAddonFactFromPayload(db, {
    clientEventId: eventRow.client_event_id,
    projectId: eventRow.project_id,
    happenedAt: eventRow.happened_at,
    payload: parsePendingPayload(eventRow.payload_json),
  });
}

async function deleteLocalAddonFact(
  db: Awaited<ReturnType<typeof getDb>>,
  clientEventId: string
): Promise<void> {
  await db.runAsync("DELETE FROM addon_facts WHERE id = ?", [getLocalAddonFactId(clientEventId)]);
}

function getLocalIssueId(clientEventId: string): string {
  return `local:${clientEventId}`;
}

async function upsertLocalIssue(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    clientEventId: string;
    projectId: string;
    doorId: string;
    title: string | null;
    details: string | null;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO issues(id, door_id, project_id, status, title, details)
     VALUES(?, ?, ?, 'OPEN', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       door_id = excluded.door_id,
       project_id = excluded.project_id,
       status = excluded.status,
       title = excluded.title,
       details = excluded.details`,
    [
      getLocalIssueId(input.clientEventId),
      input.doorId,
      input.projectId,
      input.title,
      input.details,
    ]
  );
}

async function restoreLocalIssueFromPayload(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    clientEventId: string;
    projectId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const doorId = typeof input.payload.door_id === "string" ? input.payload.door_id : null;
  if (!doorId) {
    return;
  }
  await upsertLocalIssue(db, {
    clientEventId: input.clientEventId,
    projectId: input.projectId,
    doorId,
    title: typeof input.payload.title === "string" ? input.payload.title : null,
    details: typeof input.payload.details === "string" ? input.payload.details : null,
  });
}

async function deleteLocalIssue(
  db: Awaited<ReturnType<typeof getDb>>,
  clientEventId: string
): Promise<void> {
  await db.runAsync("DELETE FROM issues WHERE id = ?", [getLocalIssueId(clientEventId)]);
}

function normalizeStringSet(values: unknown): Set<string> {
  if (!Array.isArray(values)) {
    return new Set();
  }
  return new Set(values.filter((value): value is string => typeof value === "string"));
}

async function blockPendingEventsForRemovedAssignment(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    projectId: string;
    affectedDoorIds: Set<string>;
    projectFullyRemoved: boolean;
  }
): Promise<void> {
  const rows = await db.getAllAsync<{
    client_event_id: string;
    type: string;
    payload_json: string;
  }>(
    `SELECT client_event_id, type, payload_json
     FROM pending_events
     WHERE project_id = ?`,
    [input.projectId]
  );

  const blockedEventIds = new Set<string>();
  const localAddonFactIdsToDelete: string[] = [];
  for (const row of rows) {
    const payload = parsePendingPayload(row.payload_json);
    const doorId = typeof payload.door_id === "string" ? payload.door_id : null;
    const shouldBlockDoorEvent = row.type === "DOOR_SET_STATUS" && Boolean(doorId && input.affectedDoorIds.has(doorId));
    const shouldBlockProjectEvent = input.projectFullyRemoved;
    if (!shouldBlockDoorEvent && !shouldBlockProjectEvent) {
      continue;
    }
    blockedEventIds.add(row.client_event_id);
    if (row.type === "ADDON_FACT_CREATE") {
      localAddonFactIdsToDelete.push(row.client_event_id);
    }
  }

  for (const clientEventId of localAddonFactIdsToDelete) {
    await deleteLocalAddonFact(db, clientEventId);
  }

  if (!blockedEventIds.size) {
    return;
  }

  const placeholders = Array.from(blockedEventIds).map(() => "?").join(", ");
  await db.runAsync(
    `UPDATE pending_events
     SET status = 'BLOCKED',
         error = ?,
         next_retry_at = NULL
     WHERE client_event_id IN (${placeholders})`,
    [ASSIGNMENT_CHANGED_ERROR, ...Array.from(blockedEventIds)]
  );
}

async function isPendingEventScopeStillLocal(
  db: Awaited<ReturnType<typeof getDb>>,
  eventRow: NonNullable<Awaited<ReturnType<typeof getPendingEventRow>>>,
  payload: Record<string, unknown>
): Promise<boolean> {
  if (eventRow.type === "DOOR_SET_STATUS") {
    const doorId = typeof payload.door_id === "string" ? payload.door_id : null;
    if (!doorId) {
      return true;
    }
    const row = await getLocalDoorSyncState(db, doorId);
    return Boolean(row && canApplyPendingDoorStatus(row, payload));
  }

  if (eventRow.type === "ADDON_FACT_CREATE") {
    const row = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) as total FROM projects WHERE id = ?",
      [eventRow.project_id]
    );
    return Number(row?.total || 0) > 0;
  }

  if (eventRow.type === "ISSUE_CREATE") {
    const doorId = typeof payload.door_id === "string" ? payload.door_id : null;
    if (!doorId) {
      return false;
    }
    const row = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) as total FROM doors WHERE id = ? AND project_id = ?",
      [doorId, eventRow.project_id]
    );
    return Number(row?.total || 0) > 0;
  }

  return true;
}

export async function retryPendingEventNow(clientEventId: string): Promise<void> {
  const eventRow = await getPendingEventRow(clientEventId);
  if (!eventRow) {
    return;
  }

  const db = await getDb();
  const payload = parsePendingPayload(eventRow.payload_json);
  if (!(await isPendingEventScopeStillLocal(db, eventRow, payload))) {
    await db.runAsync(
      `UPDATE pending_events
       SET status = 'BLOCKED',
           error = ?,
           next_retry_at = NULL
       WHERE client_event_id = ?`,
      [ASSIGNMENT_CHANGED_ERROR, clientEventId]
    );
    return;
  }

  await db.withTransactionAsync(async () => {
    if (eventRow.type === "DOOR_SET_STATUS") {
      await applyLocalDoorStatus(db, payload);
    } else if (eventRow.type === "ADDON_FACT_CREATE") {
      await restoreLocalAddonFactFromEvent(db, eventRow);
    } else if (eventRow.type === "ISSUE_CREATE") {
      await restoreLocalIssueFromPayload(db, {
        clientEventId: eventRow.client_event_id,
        projectId: eventRow.project_id,
        payload,
      });
    }

    await db.runAsync(
      `UPDATE pending_events
       SET status = 'PENDING',
           error = NULL,
           attempts = 0,
           next_retry_at = NULL
       WHERE client_event_id = ?`,
      [clientEventId]
    );
  });
}

export async function dropPendingEvent(clientEventId: string): Promise<void> {
  const eventRow = await getPendingEventRow(clientEventId);
  if (!eventRow) {
    return;
  }

  const payload = parsePendingPayload(eventRow.payload_json);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (eventRow.type === "DOOR_SET_STATUS") {
      await revertDoorStatus(db, payload);
    } else if (eventRow.type === "ADDON_FACT_CREATE") {
      await deleteLocalAddonFact(db, clientEventId);
    } else if (eventRow.type === "ISSUE_CREATE") {
      await deleteLocalIssue(db, clientEventId);
    }
    await db.runAsync("DELETE FROM pending_events WHERE client_event_id = ?", [clientEventId]);
  });
}

async function reapplyPendingOptimisticChanges(events: PendingSyncEvent[]): Promise<void> {
  if (!events.length) {
    return;
  }

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const event of events) {
      if (event.type === "DOOR_SET_STATUS") {
        const doorId = typeof event.payload.door_id === "string" ? event.payload.door_id : null;
        if (!doorId) {
          continue;
        }
        const row = await getLocalDoorSyncState(db, doorId);
        if (!row || isLocalDoorLocked(row)) {
          continue;
        }
        await applyLocalDoorStatus(db, event.payload);
      } else if (event.type === "ADDON_FACT_CREATE") {
        await restoreLocalAddonFactFromPayload(db, {
          clientEventId: event.client_event_id,
          projectId: event.project_id,
          happenedAt: event.happened_at,
          payload: event.payload,
        });
      } else if (event.type === "ISSUE_CREATE") {
        await restoreLocalIssueFromPayload(db, {
          clientEventId: event.client_event_id,
          projectId: event.project_id,
          payload: event.payload,
        });
      }
    }
  });
}

async function upsertSnapshot(snapshot: SyncSnapshot): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM projects");
    await db.runAsync("DELETE FROM doors");
    await db.runAsync("DELETE FROM reasons");
    await db.runAsync("DELETE FROM door_types");
    await db.runAsync("DELETE FROM addon_types");
    await db.runAsync("DELETE FROM addon_plans");
    await db.runAsync("DELETE FROM addon_facts");
    await db.runAsync("DELETE FROM issues");

    for (const project of snapshot.projects) {
      await db.runAsync(
        `INSERT INTO projects(
           id, name, address, status, lifecycle_status, health_status,
           waze_url, updated_at
         )
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           status = excluded.status,
           lifecycle_status = excluded.lifecycle_status,
           health_status = excluded.health_status,
           waze_url = excluded.waze_url,
           updated_at = excluded.updated_at`,
        [
          project.id,
          project.name,
          project.address,
          project.status,
          project.lifecycle_status || "ACTIVE",
          project.health_status || "NORMAL",
          project.waze_url,
          project.updated_at || new Date().toISOString(),
        ]
      );
    }

    for (const reason of snapshot.reasons) {
      await db.runAsync(
        `INSERT INTO reasons(id, code, name) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name`,
        [reason.id, reason.code, reason.name]
      );
    }

    for (const doorType of snapshot.door_types) {
      await db.runAsync(
        `INSERT INTO door_types(id, code, name) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name`,
        [doorType.id, doorType.code, doorType.name]
      );
    }

    for (const addonType of snapshot.addon_types) {
      await db.runAsync(
        `INSERT INTO addon_types(id, name, unit) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, unit = excluded.unit`,
        [addonType.id, addonType.name, addonType.unit]
      );
    }

    for (const plan of snapshot.addon_plans) {
      await db.runAsync(
        `INSERT INTO addon_plans(project_id, addon_type_id, qty_planned)
         VALUES(?, ?, ?)
         ON CONFLICT(project_id, addon_type_id) DO UPDATE SET
           qty_planned = excluded.qty_planned`,
        [plan.project_id, plan.addon_type_id, plan.qty_planned]
      );
    }

    for (const fact of snapshot.addon_facts) {
      await db.runAsync(
        `INSERT INTO addon_facts(id, project_id, addon_type_id, installer_id, qty_done, done_at, comment, source, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           qty_done = excluded.qty_done,
           done_at = excluded.done_at,
           comment = excluded.comment,
           source = excluded.source,
           updated_at = excluded.updated_at`,
        [fact.id, fact.project_id, fact.addon_type_id, fact.installer_id, fact.qty_done, fact.done_at, fact.comment, fact.source, fact.updated_at || fact.done_at]
      );
    }

    for (const issue of snapshot.issues || []) {
      await db.runAsync(
        `INSERT INTO issues(id, door_id, project_id, status, title, details)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           door_id = excluded.door_id,
           project_id = excluded.project_id,
           status = excluded.status,
           title = excluded.title,
           details = excluded.details`,
        [
          issue.id,
          issue.door_id,
          issue.project_id,
          issue.status,
          issue.title,
          issue.details,
        ]
      );
    }

    for (const door of snapshot.doors) {
      await db.runAsync(
        `INSERT INTO doors(id, project_id, door_type_id, unit_label, order_number, house_number, floor_label, apartment_number, location_code, door_marking, status, reason_id, comment, is_locked, version, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           door_type_id = excluded.door_type_id,
           unit_label = excluded.unit_label,
           order_number = excluded.order_number,
           house_number = excluded.house_number,
           floor_label = excluded.floor_label,
           apartment_number = excluded.apartment_number,
           location_code = excluded.location_code,
           door_marking = excluded.door_marking,
           status = excluded.status,
           reason_id = excluded.reason_id,
           comment = excluded.comment,
           is_locked = excluded.is_locked,
           version = excluded.version,
           updated_at = excluded.updated_at`,
        [
          door.id,
          door.project_id,
          door.door_type_id,
          door.unit_label,
          door.order_number,
          door.house_number,
          door.floor_label,
          door.apartment_number,
          door.location_code,
          door.door_marking,
          door.status,
          door.reason_id ?? null,
          door.comment,
          door.is_locked ? 1 : 0,
          Number(door.version ?? 0),
          door.updated_at || new Date().toISOString(),
        ]
      );
    }
  });
}

async function applyChange(change: SyncChange): Promise<void> {
  const db = await getDb();
  const payload = change.payload;

  switch (change.change_type) {
    case "DOOR":
      await db.runAsync(
        `INSERT INTO doors(id, project_id, door_type_id, unit_label, order_number, house_number, floor_label, apartment_number, location_code, door_marking, status, reason_id, comment, is_locked, version, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           door_type_id = excluded.door_type_id,
           unit_label = excluded.unit_label,
           status = excluded.status,
           reason_id = excluded.reason_id,
           comment = excluded.comment,
           is_locked = excluded.is_locked,
           order_number = excluded.order_number,
           house_number = excluded.house_number,
           floor_label = excluded.floor_label,
           apartment_number = excluded.apartment_number,
           location_code = excluded.location_code,
           door_marking = excluded.door_marking,
           version = excluded.version,
           updated_at = excluded.updated_at`,
        [
          payload.id,
          payload.project_id,
          payload.door_type_id,
          payload.unit_label,
          payload.order_number,
          payload.house_number,
          payload.floor_label,
          payload.apartment_number,
          payload.location_code,
          payload.door_marking,
          payload.status,
          payload.reason_id ?? null,
          payload.comment,
          payload.is_locked ? 1 : 0,
          Number(payload.version ?? 0),
          payload.updated_at,
        ]
      );
      break;
    case "ADDON_FACT":
      await db.runAsync(
        `INSERT INTO addon_facts(id, project_id, addon_type_id, installer_id, qty_done, done_at, comment, source, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           qty_done = excluded.qty_done,
           done_at = excluded.done_at,
           comment = excluded.comment,
           source = excluded.source,
           updated_at = excluded.updated_at`,
        [payload.id, payload.project_id, payload.addon_type_id, payload.installer_id, payload.qty_done, payload.done_at, payload.comment, payload.source, payload.updated_at || payload.done_at]
      );
      break;
    case "PROJECT_ADDON_PLAN":
      if (payload.kind === "addon_plan_delete") {
        await db.runAsync(
          "DELETE FROM addon_plans WHERE project_id = ? AND addon_type_id = ?",
          [payload.project_id, payload.deleted_addon_type_id]
        );
      } else {
        for (const item of payload.plan_items || []) {
          await db.runAsync(
            `INSERT INTO addon_plans(project_id, addon_type_id, qty_planned)
             VALUES(?, ?, ?)
             ON CONFLICT(project_id, addon_type_id) DO UPDATE SET
               qty_planned = excluded.qty_planned`,
            [payload.project_id, item.addon_type_id, item.qty_planned]
          );
        }
      }
      break;
    case "PROJECT_ASSIGNMENTS":
      if (payload.kind === "removed_from_you") {
        const affectedDoorIds = normalizeStringSet(payload.affected_door_ids);
        for (const doorId of affectedDoorIds) {
          await db.runAsync("DELETE FROM doors WHERE id = ?", [doorId]);
          await db.runAsync("DELETE FROM issues WHERE door_id = ?", [doorId]);
        }

        const projectId = typeof payload.project_id === "string" ? payload.project_id : null;
        if (projectId) {
          const remaining = await db.getFirstAsync<{ total: number }>(
            "SELECT COUNT(*) as total FROM doors WHERE project_id = ?",
            [projectId]
          );
          const projectFullyRemoved = Number(remaining?.total || 0) === 0;
          if (projectFullyRemoved) {
            await db.runAsync("DELETE FROM issues WHERE project_id = ?", [projectId]);
            await db.runAsync("DELETE FROM addon_plans WHERE project_id = ?", [projectId]);
            await db.runAsync("DELETE FROM addon_facts WHERE project_id = ?", [projectId]);
            await db.runAsync("DELETE FROM projects WHERE id = ?", [projectId]);
          }
          await blockPendingEventsForRemovedAssignment(db, {
            projectId,
            affectedDoorIds,
            projectFullyRemoved,
          });
        }
      }
      break;
    case "PROJECT_BASE":
      await db.runAsync(
        `INSERT INTO projects(
           id, name, address, status, lifecycle_status, health_status,
           waze_url, updated_at
         )
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           status = excluded.status,
           lifecycle_status = excluded.lifecycle_status,
           health_status = excluded.health_status,
           waze_url = excluded.waze_url,
           updated_at = excluded.updated_at`,
        [
          payload.id,
          payload.name,
          payload.address,
          payload.status,
          payload.lifecycle_status || "ACTIVE",
          payload.health_status || "NORMAL",
          payload.waze_url,
          payload.updated_at || new Date().toISOString(),
        ]
      );
      break;
    case "CATALOG_ADDON_TYPES":
      for (const item of payload.items || []) {
        await db.runAsync(
          `INSERT INTO addon_types(id, name, unit) VALUES(?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, unit = excluded.unit`,
          [item.id, item.name, item.unit]
        );
      }
      break;
    default:
      break;
  }
}

export async function bootstrapOnlineData(): Promise<void> {
  await forceColdResync();
}

export function forceColdResync(): Promise<SyncResponse> {
  return enqueueSync(async () => {
    await initDb();
    const unresolvedEventCount = await countPendingEvents();
    if (unresolvedEventCount > 0) {
      throw new Error("Cold resync is blocked while unsynced work remains on this device.");
    }
    await setState(CURSOR_KEY, "0");
    return executeSync({ sinceCursor: 0, includeEvents: false });
  });
}

export function runSync(options?: {
  forceRetry?: boolean;
  sinceCursor?: number;
  includeEvents?: boolean;
}): Promise<SyncResponse> {
  const isAutomaticSync =
    !options?.forceRetry &&
    options?.sinceCursor === undefined &&
    options?.includeEvents === undefined;
  if (!isAutomaticSync) {
    return enqueueSync(() => executeSync(options));
  }
  if (automaticSyncInFlight) {
    return automaticSyncInFlight;
  }

  const operation = enqueueSync(() => executeSync(options));
  automaticSyncInFlight = operation;
  const clearAutomaticSync = () => {
    if (automaticSyncInFlight === operation) {
      automaticSyncInFlight = null;
    }
  };
  void operation.then(clearAutomaticSync, clearAutomaticSync);
  return operation;
}

async function executeSync(options?: {
  forceRetry?: boolean;
  sinceCursor?: number;
  includeEvents?: boolean;
}): Promise<SyncResponse> {
  await initDb();
  const sinceCursor = options?.sinceCursor ?? Number((await getState(CURSOR_KEY)) || "0");
  const pendingEvents =
    options?.includeEvents === false
      ? []
      : await getPendingEvents(500, Boolean(options?.forceRetry));
  const pendingEventIds = pendingEvents.map((event) => event.client_event_id);
  const deviceId = await getOrCreateDeviceId();

  if (pendingEventIds.length) {
    await markEventsAttempted(pendingEventIds);
  }

  let response: SyncResponse;
  try {
    response = await apiFetch<SyncResponse>("/api/v1/installer/sync", {
      method: "POST",
      timeoutMs: 30000,
      body: JSON.stringify({
        since_cursor: sinceCursor,
        ack_cursor: sinceCursor,
        app_version: `mobile-${MOBILE_APP_VERSION}`,
        device_id: deviceId,
        events: pendingEvents.map((event) => ({
          client_event_id: event.client_event_id,
          type: event.type,
          project_id: event.project_id,
          happened_at: event.happened_at,
          payload: event.payload,
        })),
      }),
    });
  } catch (error) {
    if (pendingEventIds.length) {
      if (isRetryableSyncError(error)) {
        await scheduleRetry(pendingEventIds, getSyncErrorMessage(error));
      } else {
        await markEventsBlocked(pendingEventIds, getSyncErrorMessage(error));
      }
    }
    throw error;
  }

  if (response.reset_required) {
    if (!response.snapshot) {
      const error = "Sync reset requested without snapshot";
      if (pendingEventIds.length) {
        await scheduleRetry(pendingEventIds, error);
      }
      throw new Error(error);
    }
    await upsertSnapshot(response.snapshot);
    await reapplyPendingOptimisticChanges(pendingEvents);
  }

  for (const change of response.changes) {
    await applyChange(change);
  }

  for (const ack of response.acks) {
    await markAckResult(ack.client_event_id, ack.ok, ack.error);
  }

  const ackedEventIds = new Set(response.acks.map((ack) => ack.client_event_id));
  const missingAckEventIds = pendingEventIds.filter((clientEventId) => !ackedEventIds.has(clientEventId));
  if (missingAckEventIds.length) {
    await scheduleRetry(missingAckEventIds, "Sync response missed event acknowledgement");
  }

  await setState(CURSOR_KEY, String(response.next_cursor));
  await setState(LAST_SYNC_AT_KEY, response.server_time);
  return response;
}

export async function queueDoorStatusEvent(input: {
  projectId: string;
  doorId: string;
  status: "INSTALLED" | "NOT_INSTALLED";
  reasonId?: string | null;
  comment?: string | null;
}): Promise<void> {
  const reasonId = input.reasonId?.trim() || null;
  if (input.status === "NOT_INSTALLED" && !reasonId) {
    throw new Error("reason_id is required for NOT_INSTALLED");
  }

  const db = await getDb();
  const clientEventId = createClientEventId();
  const happenedAt = new Date().toISOString();
  const previousDoorState = await db.getFirstAsync<{
    status: string | null;
    reason_id: string | null;
    comment: string | null;
    project_id: string;
    is_locked: number | boolean | string | null;
    version?: number | string | null;
  }>(
    "SELECT status, reason_id, comment, project_id, is_locked, version FROM doors WHERE id = ?",
    [input.doorId]
  );
  if (!previousDoorState || previousDoorState.project_id !== input.projectId) {
    throw new Error("Door is no longer assigned to you. Refresh data before continuing.");
  }
  if (isLocalDoorLocked(previousDoorState)) {
    throw new Error("Door is locked. Refresh data or contact the office before continuing.");
  }

  const payload = {
    door_id: input.doorId,
    status: input.status,
    reason_id: reasonId,
    comment: input.comment || null,
    previous_status: previousDoorState?.status || null,
    previous_reason_id: previousDoorState?.reason_id ?? null,
    previous_comment: previousDoorState?.comment ?? null,
    previous_is_locked: toLocalLockValue(previousDoorState?.is_locked),
    previous_version: Number(previousDoorState.version ?? 0),
  };

  await db.withTransactionAsync(async () => {
    const existingEvent = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM pending_events
       WHERE type = 'DOOR_SET_STATUS'
         AND json_extract(payload_json, '$.door_id') = ?`,
      [input.doorId]
    );
    if (Number(existingEvent?.total || 0) > 0) {
      throw new Error("A door status update is already waiting in the sync queue.");
    }

    await db.runAsync(
      `INSERT INTO pending_events(client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at)
       VALUES(?, 'DOOR_SET_STATUS', ?, ?, ?, 'PENDING', NULL, 0, NULL, NULL, ?)` ,
      [clientEventId, input.projectId, happenedAt, JSON.stringify(payload), happenedAt]
    );

    await applyLocalDoorStatus(db, payload);
  });
}

export async function queueAddonFactEvent(input: {
  projectId: string;
  addonTypeId: string;
  qtyDone: string;
  comment?: string | null;
}): Promise<void> {
  const db = await getDb();
  const clientEventId = createClientEventId();
  const happenedAt = new Date().toISOString();
  const addonTypeId = input.addonTypeId.trim();
  if (!addonTypeId) {
    throw new Error("addon_type_id is required");
  }
  const qtyDone = normalizeAddonQuantity(input.qtyDone);
  if (!qtyDone) {
    throw new Error("qty_done must be > 0 with at most 10 integer and 2 decimal digits");
  }
  const projectRow = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM projects WHERE id = ?",
    [input.projectId]
  );
  if (Number(projectRow?.total || 0) <= 0) {
    throw new Error("Project is no longer assigned to you. Refresh data before continuing.");
  }
  const addonTypeRow = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM addon_types WHERE id = ?",
    [addonTypeId]
  );
  if (Number(addonTypeRow?.total || 0) <= 0) {
    throw new Error("Add-on type is no longer available. Refresh data before continuing.");
  }

  const payload = {
    addon_type_id: addonTypeId,
    qty_done: qtyDone,
    comment: input.comment || null,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO pending_events(client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at)
       VALUES(?, 'ADDON_FACT_CREATE', ?, ?, ?, 'PENDING', NULL, 0, NULL, NULL, ?)` ,
      [clientEventId, input.projectId, happenedAt, JSON.stringify(payload), happenedAt]
    );

    await upsertLocalAddonFact(db, {
      clientEventId,
      projectId: input.projectId,
      addonTypeId,
      qtyDone,
      doneAt: happenedAt,
      comment: input.comment || null,
    });
  });
}

export async function queueIssueCreateEvent(input: {
  projectId: string;
  doorId: string;
  title?: string | null;
  details?: string | null;
}): Promise<void> {
  const projectId = input.projectId.trim();
  const doorId = input.doorId.trim();
  const title = input.title?.trim() || null;
  const details = input.details?.trim() || null;
  if (!projectId || !doorId) {
    throw new Error("project_id and door_id are required");
  }
  if (!title && !details) {
    throw new Error("Issue title or details is required");
  }
  if (title && title.length > 200) {
    throw new Error("Issue title must be at most 200 characters");
  }
  if (details && details.length > 2000) {
    throw new Error("Issue details must be at most 2000 characters");
  }

  const db = await getDb();
  const door = await db.getFirstAsync<{ project_id: string }>(
    "SELECT project_id FROM doors WHERE id = ?",
    [doorId]
  );
  if (!door || door.project_id !== projectId) {
    throw new Error("Door is no longer assigned to you. Refresh data before continuing.");
  }

  const clientEventId = createClientEventId();
  const happenedAt = new Date().toISOString();
  const payload = { door_id: doorId, title, details };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO pending_events(client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at)
       VALUES(?, 'ISSUE_CREATE', ?, ?, ?, 'PENDING', NULL, 0, NULL, NULL, ?)`,
      [clientEventId, projectId, happenedAt, JSON.stringify(payload), happenedAt]
    );
    await upsertLocalIssue(db, {
      clientEventId,
      projectId,
      doorId,
      title,
      details,
    });
  });
}

export async function getLastSyncAt(): Promise<string | null> {
  return getState(LAST_SYNC_AT_KEY);
}
