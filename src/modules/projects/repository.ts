import { getDb } from "@/lib/db";
import { deriveProjectExternalLinks } from "@/modules/projects/external-actions";
import type {
  DoorTypeOption,
  ProjectAddonFact,
  InstallerDoor,
  ProjectAddonTypeOption,
  ProjectDetailsResponse,
  ProjectIssue,
  ProjectListItem,
} from "@/modules/projects/types";

export async function replaceProjects(items: ProjectListItem[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO projects(
           id, name, address, status, lifecycle_status, health_status,
           waze_url, whatsapp_url, call_url, updated_at
         )
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           address = excluded.address,
           status = excluded.status,
           lifecycle_status = excluded.lifecycle_status,
           health_status = excluded.health_status,
           waze_url = excluded.waze_url,
           whatsapp_url = COALESCE(excluded.whatsapp_url, projects.whatsapp_url),
           call_url = COALESCE(excluded.call_url, projects.call_url),
           updated_at = excluded.updated_at`,
        [
          item.id,
          item.name,
          item.address,
          item.status,
          item.lifecycle_status,
          item.health_status,
          item.waze_url,
          item.whatsapp_url ?? null,
          item.call_url ?? null,
        ]
      );
    }
  });
}

export async function hydrateProjectDetails(payload: ProjectDetailsResponse): Promise<void> {
  const db = await getDb();
  const externalLinks = deriveProjectExternalLinks(payload);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO projects(
         id, name, address, status, lifecycle_status, health_status,
         waze_url, whatsapp_url, call_url, updated_at
       )
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         address = excluded.address,
         status = excluded.status,
         lifecycle_status = excluded.lifecycle_status,
         health_status = excluded.health_status,
         waze_url = excluded.waze_url,
         whatsapp_url = excluded.whatsapp_url,
         call_url = excluded.call_url,
         updated_at = excluded.updated_at`,
      [
        payload.id,
        payload.name,
        payload.address,
        payload.status,
        payload.lifecycle_status,
        payload.health_status,
        externalLinks.waze_url,
        externalLinks.whatsapp_url,
        externalLinks.call_url,
        payload.server_time,
      ]
    );

    await db.runAsync("DELETE FROM doors WHERE project_id = ?", [payload.id]);
    await db.runAsync("DELETE FROM issues WHERE project_id = ?", [payload.id]);
    await db.runAsync("DELETE FROM addon_plans WHERE project_id = ?", [payload.id]);

    for (const doorType of payload.door_types_catalog) {
      await db.runAsync(
        `INSERT INTO door_types(id, code, name) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name`,
        [doorType.id, doorType.code, doorType.name]
      );
    }

    for (const reason of payload.reasons_catalog) {
      await db.runAsync(
        `INSERT INTO reasons(id, code, name) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name`,
        [reason.id, reason.code, reason.name]
      );
    }

    for (const addonType of payload.addons.types) {
      await db.runAsync(
        `INSERT INTO addon_types(id, name, unit) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, unit = excluded.unit`,
        [addonType.id, addonType.name, addonType.unit]
      );
    }

    for (const plan of payload.addons.plan) {
      await db.runAsync(
        `INSERT INTO addon_plans(project_id, addon_type_id, qty_planned)
         VALUES(?, ?, ?)
         ON CONFLICT(project_id, addon_type_id) DO UPDATE SET
           qty_planned = excluded.qty_planned`,
        [payload.id, plan.addon_type_id, plan.qty_planned]
      );
    }

    for (const fact of payload.addons.facts) {
      await db.runAsync(
        `INSERT INTO addon_facts(id, project_id, addon_type_id, installer_id, qty_done, done_at, comment, source, updated_at)
         VALUES(?, ?, ?, NULL, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           qty_done = excluded.qty_done,
           done_at = excluded.done_at,
           comment = excluded.comment,
           source = excluded.source,
           updated_at = excluded.updated_at`,
        [fact.id, payload.id, fact.addon_type_id, fact.qty_done, fact.done_at, fact.comment, fact.source, fact.done_at]
      );
    }

    for (const issue of payload.issues_open) {
      await db.runAsync(
        `INSERT INTO issues(id, door_id, project_id, status, title, details)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, title = excluded.title, details = excluded.details`,
        [issue.id, issue.door_id, payload.id, issue.status, issue.title, issue.details]
      );
    }

    for (const door of payload.doors) {
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
          payload.id,
          door.door_type_id,
          door.unit_label,
          door.order_number,
          door.house_number,
          door.floor_label,
          door.apartment_number,
          door.location_code,
          door.door_marking,
          door.status,
          door.reason_id,
          door.comment,
          door.is_locked ? 1 : 0,
          Number(door.version ?? 0),
          payload.server_time,
        ]
      );
    }
  });
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProjectListItem>(
    "SELECT id, name, address, status, waze_url, whatsapp_url, call_url FROM projects ORDER BY name ASC"
  );
  return rows;
}

export async function getProject(projectId: string): Promise<ProjectListItem | null> {
  const db = await getDb();
  return (await db.getFirstAsync<ProjectListItem>(
    "SELECT id, name, address, status, waze_url, whatsapp_url, call_url FROM projects WHERE id = ?",
    [projectId]
  )) ?? null;
}

export async function listProjectDoors(projectId: string): Promise<InstallerDoor[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT id, project_id, door_type_id, unit_label, order_number, house_number, floor_label,
            apartment_number, location_code, door_marking, status, reason_id, comment, is_locked, version, updated_at
     FROM doors WHERE project_id = ?
     ORDER BY floor_label ASC, apartment_number ASC, unit_label ASC`,
    [projectId]
  );
  return rows.map((row) => ({
    ...row,
    is_locked: Boolean(row.is_locked),
    version: Number(row.version ?? 0),
  })) as InstallerDoor[];
}

export async function listProjectIssues(projectId: string): Promise<ProjectIssue[]> {
  const db = await getDb();
  return db.getAllAsync<ProjectIssue>(
    "SELECT id, door_id, project_id, status, title, details FROM issues WHERE project_id = ? ORDER BY title ASC",
    [projectId]
  );
}

export async function listReasons(): Promise<Array<{ id: string; code: string; name: string }>> {
  const db = await getDb();
  return db.getAllAsync("SELECT id, code, name FROM reasons ORDER BY code ASC");
}

export async function listDoorTypes(): Promise<DoorTypeOption[]> {
  const db = await getDb();
  return db.getAllAsync<DoorTypeOption>(
    "SELECT id, code, name FROM door_types ORDER BY name ASC"
  );
}

export async function listProjectAddonTypes(projectId: string): Promise<ProjectAddonTypeOption[]> {
  const db = await getDb();
  return db.getAllAsync<ProjectAddonTypeOption>(
    `SELECT
       addon_types.id,
       addon_types.name,
       addon_types.unit,
       addon_plans.qty_planned
     FROM addon_types
     LEFT JOIN addon_plans
       ON addon_plans.addon_type_id = addon_types.id
      AND addon_plans.project_id = ?
     ORDER BY
       CASE WHEN addon_plans.project_id IS NULL THEN 1 ELSE 0 END ASC,
       addon_types.name ASC`,
    [projectId]
  );
}

export async function listProjectAddonFacts(projectId: string): Promise<ProjectAddonFact[]> {
  const db = await getDb();
  return db.getAllAsync<ProjectAddonFact>(
    `SELECT
       addon_facts.id,
       addon_facts.project_id,
       addon_facts.addon_type_id,
       COALESCE(addon_types.name, addon_facts.addon_type_id) AS addon_name,
       COALESCE(addon_types.unit, '') AS unit,
       addon_facts.qty_done,
       addon_facts.done_at,
       addon_facts.comment,
       addon_facts.source,
       addon_facts.updated_at
     FROM addon_facts
     LEFT JOIN addon_types ON addon_types.id = addon_facts.addon_type_id
     WHERE addon_facts.project_id = ?
     ORDER BY addon_facts.done_at DESC, addon_facts.updated_at DESC`,
    [projectId]
  );
}
