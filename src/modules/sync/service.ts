import { apiFetch } from "@/lib/api";
import { getDb, getState, initDb, setState } from "@/lib/db";
import { hydrateProjectDetails, replaceProjects } from "@/modules/projects/repository";
import {
  MAX_AUTO_RETRY_ATTEMPTS,
  computeRetryDelayMinutes,
  getSyncErrorMessage,
  isRetryableSyncError,
} from "@/modules/sync/policy";
import type { ProjectDetailsResponse, ProjectListItem } from "@/modules/projects/types";
import type { PendingSyncEvent, SyncChange, SyncQueueSummary, SyncResponse, SyncSnapshot } from "@/modules/sync/types";

const CURSOR_KEY = "sync_cursor";
const LAST_SYNC_AT_KEY = "last_sync_at";

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

async function getPendingEvents(limit = 500, forceRetry = false): Promise<PendingSyncEvent[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
     FROM pending_events
     WHERE status IN ('PENDING', 'FAILED')
       AND attempts < ?
       AND (? = 1 OR next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [MAX_AUTO_RETRY_ATTEMPTS, forceRetry ? 1 : 0, new Date().toISOString(), limit]
  );
  return rows.map((row) => ({
    ...row,
    payload: parsePendingPayload(row.payload_json),
  })) as PendingSyncEvent[];
}

export async function listPendingEvents(projectId?: string): Promise<PendingSyncEvent[]> {
  const db = await getDb();
  const rows = projectId
    ? await db.getAllAsync<any>(
        `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
         FROM pending_events
         WHERE project_id = ?
         ORDER BY created_at DESC`,
        [projectId]
      )
    : await db.getAllAsync<any>(
        `SELECT client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at
         FROM pending_events
         ORDER BY created_at DESC`
      );

  return rows.map((row) => ({
    ...row,
    payload: parsePendingPayload(row.payload_json),
  })) as PendingSyncEvent[];
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
  payload_json: string;
} | null> {
  const db = await getDb();
  return (await db.getFirstAsync<{
    client_event_id: string;
    type: string;
    project_id: string;
    payload_json: string;
  }>(
    `SELECT client_event_id, type, project_id, payload_json
     FROM pending_events
     WHERE client_event_id = ?`,
    [clientEventId]
  )) ?? null;
}

async function markAckResult(clientEventId: string, ok: boolean, error: string | null): Promise<void> {
  const db = await getDb();
  if (ok) {
    await db.runAsync("DELETE FROM pending_events WHERE client_event_id = ?", [clientEventId]);
    return;
  }

  await db.runAsync(
    `UPDATE pending_events
     SET status = 'BLOCKED',
         error = ?,
         next_retry_at = NULL
     WHERE client_event_id = ?`,
    [error, clientEventId]
  );
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

async function revertDroppedDoorStatus(payload: Record<string, unknown>): Promise<void> {
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

  const db = await getDb();
  await db.runAsync(
    `UPDATE doors
     SET status = ?, reason_id = ?, comment = ?, updated_at = ?
     WHERE id = ?`,
    [previousStatus, previousReasonId, previousComment, new Date().toISOString(), doorId]
  );
}

export async function retryPendingEventNow(clientEventId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pending_events
     SET status = 'PENDING',
         error = NULL,
         attempts = 0,
         next_retry_at = NULL
     WHERE client_event_id = ?`,
    [clientEventId]
  );
}

export async function dropPendingEvent(clientEventId: string): Promise<void> {
  const eventRow = await getPendingEventRow(clientEventId);
  if (!eventRow) {
    return;
  }

  const payload = parsePendingPayload(eventRow.payload_json);
  if (eventRow.type === "DOOR_SET_STATUS") {
    await revertDroppedDoorStatus(payload);
  }

  const db = await getDb();
  await db.runAsync("DELETE FROM pending_events WHERE client_event_id = ?", [clientEventId]);
}

async function upsertSnapshot(snapshot: SyncSnapshot): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const project of snapshot.projects) {
      await db.runAsync(
        `INSERT INTO projects(id, name, address, status, waze_url, updated_at)
         VALUES(?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           status = excluded.status,
           waze_url = excluded.waze_url,
           updated_at = excluded.updated_at`,
        [project.id, project.name, project.address, project.status, project.waze_url]
      );
    }

    await db.runAsync("DELETE FROM doors");
    await db.runAsync("DELETE FROM reasons");
    await db.runAsync("DELETE FROM door_types");
    await db.runAsync("DELETE FROM addon_types");
    await db.runAsync("DELETE FROM addon_plans");
    await db.runAsync("DELETE FROM addon_facts");
    await db.runAsync("DELETE FROM issues");

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
        `INSERT INTO addon_plans(project_id, addon_type_id, qty_planned, client_price, installer_price)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(project_id, addon_type_id) DO UPDATE SET
           qty_planned = excluded.qty_planned,
           client_price = excluded.client_price,
           installer_price = excluded.installer_price`,
        [plan.project_id, plan.addon_type_id, plan.qty_planned, plan.client_price, plan.installer_price]
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

    for (const door of snapshot.doors) {
      await db.runAsync(
        `INSERT INTO doors(id, project_id, door_type_id, unit_label, order_number, house_number, floor_label, apartment_number, location_code, door_marking, status, reason_id, comment, is_locked, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)
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
           comment = excluded.comment,
           updated_at = excluded.updated_at`,
        [door.id, door.project_id, door.door_type_id, door.unit_label, door.order_number, door.house_number, door.floor_label, door.apartment_number, door.location_code, door.door_marking, door.status, door.comment, door.updated_at || new Date().toISOString()]
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
        `INSERT INTO doors(id, project_id, door_type_id, unit_label, order_number, house_number, floor_label, apartment_number, location_code, door_marking, status, reason_id, comment, is_locked, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           comment = excluded.comment,
           order_number = excluded.order_number,
           house_number = excluded.house_number,
           floor_label = excluded.floor_label,
           apartment_number = excluded.apartment_number,
           location_code = excluded.location_code,
           door_marking = excluded.door_marking,
           updated_at = excluded.updated_at`,
        [payload.id, payload.project_id, payload.door_type_id, payload.unit_label, payload.order_number, payload.house_number, payload.floor_label, payload.apartment_number, payload.location_code, payload.door_marking, payload.status, payload.comment, payload.updated_at]
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
            `INSERT INTO addon_plans(project_id, addon_type_id, qty_planned, client_price, installer_price)
             VALUES(?, ?, ?, ?, ?)
             ON CONFLICT(project_id, addon_type_id) DO UPDATE SET
               qty_planned = excluded.qty_planned,
               client_price = excluded.client_price,
               installer_price = excluded.installer_price`,
            [payload.project_id, item.addon_type_id, item.qty_planned, item.client_price, item.installer_price]
          );
        }
      }
      break;
    case "PROJECT_ASSIGNMENTS":
      if (payload.kind === "removed_from_you") {
        for (const doorId of payload.affected_door_ids || []) {
          await db.runAsync("DELETE FROM doors WHERE id = ?", [doorId]);
          await db.runAsync("DELETE FROM issues WHERE door_id = ?", [doorId]);
        }
      }
      break;
    case "PROJECT_BASE":
      await db.runAsync(
        `INSERT INTO projects(id, name, address, status, waze_url, updated_at)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           status = excluded.status,
           waze_url = excluded.waze_url,
           updated_at = excluded.updated_at`,
        [payload.id, payload.name, payload.address, payload.status, payload.waze_url, payload.updated_at || new Date().toISOString()]
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
  await initDb();
  const projects = await apiFetch<{ items: ProjectListItem[] }>("/api/v1/installer/projects");
  await replaceProjects(projects.items);

  for (const project of projects.items) {
    const details = await apiFetch<ProjectDetailsResponse>(`/api/v1/installer/projects/${project.id}`);
    await hydrateProjectDetails(details);
  }
}

export async function runSync(options?: { forceRetry?: boolean }): Promise<SyncResponse> {
  await initDb();
  const sinceCursor = Number((await getState(CURSOR_KEY)) || "0");
  const pendingEvents = await getPendingEvents(500, Boolean(options?.forceRetry));
  const pendingEventIds = pendingEvents.map((event) => event.client_event_id);

  if (pendingEventIds.length) {
    await markEventsAttempted(pendingEventIds);
  }

  let response: SyncResponse;
  try {
    response = await apiFetch<SyncResponse>("/api/v1/installer/sync", {
      method: "POST",
      body: JSON.stringify({
        since_cursor: sinceCursor,
        ack_cursor: sinceCursor,
        app_version: "mobile-v0",
        device_id: "expo-device",
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

  if (response.reset_required && response.snapshot) {
    await upsertSnapshot(response.snapshot);
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
  const db = await getDb();
  const clientEventId = createClientEventId();
  const happenedAt = new Date().toISOString();
  const previousDoorState = await db.getFirstAsync<{
    status: string | null;
    reason_id: string | null;
    comment: string | null;
  }>(
    "SELECT status, reason_id, comment FROM doors WHERE id = ?",
    [input.doorId]
  );
  const payload = {
    door_id: input.doorId,
    status: input.status,
    reason_id: input.reasonId || null,
    comment: input.comment || null,
    previous_status: previousDoorState?.status || null,
    previous_reason_id: previousDoorState?.reason_id ?? null,
    previous_comment: previousDoorState?.comment ?? null,
  };

  await db.runAsync(
    `INSERT INTO pending_events(client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at)
     VALUES(?, 'DOOR_SET_STATUS', ?, ?, ?, 'PENDING', NULL, 0, NULL, NULL, ?)` ,
    [clientEventId, input.projectId, happenedAt, JSON.stringify(payload), happenedAt]
  );

  await db.runAsync(
    `UPDATE doors
     SET status = ?, reason_id = ?, comment = ?, updated_at = ?
     WHERE id = ?`,
    [input.status, input.reasonId || null, input.comment || null, happenedAt, input.doorId]
  );
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
  const payload = {
    addon_type_id: input.addonTypeId,
    qty_done: input.qtyDone,
    comment: input.comment || null,
  };

  await db.runAsync(
    `INSERT INTO pending_events(client_event_id, type, project_id, happened_at, payload_json, status, error, attempts, next_retry_at, last_attempt_at, created_at)
     VALUES(?, 'ADDON_FACT_CREATE', ?, ?, ?, 'PENDING', NULL, 0, NULL, NULL, ?)` ,
    [clientEventId, input.projectId, happenedAt, JSON.stringify(payload), happenedAt]
  );
}

export async function getLastSyncAt(): Promise<string | null> {
  return getState(LAST_SYNC_AT_KEY);
}
