import * as SQLite from "expo-sqlite";

const LEGACY_DB_NAME = "dimax_mobile.db";
const DB_OWNER_STATE_KEY = "database_owner";
const DB_SCHEMA_VERSION = 9;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let activeOwnerKey: string | null = null;
let activeDbName: string | null = null;
let legacyOwnerKey: string | null | undefined;
let activationTail: Promise<void> = Promise.resolve();

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise || !activeOwnerKey || !activeDbName) {
    throw new Error("Local database is not activated for an authenticated user");
  }
  return dbPromise;
}

async function createBaseSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
      health_status TEXT NOT NULL DEFAULT 'NORMAL',
      waze_url TEXT,
      whatsapp_url TEXT,
      call_url TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS doors (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      door_type_id TEXT NOT NULL,
      unit_label TEXT NOT NULL,
      order_number TEXT,
      house_number TEXT,
      floor_label TEXT,
      apartment_number TEXT,
      location_code TEXT,
      door_marking TEXT,
      status TEXT NOT NULL,
      reason_id TEXT,
      comment TEXT,
      is_locked INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_doors_project_id ON doors(project_id);
    CREATE INDEX IF NOT EXISTS idx_doors_order_number ON doors(order_number);

    CREATE TABLE IF NOT EXISTS reasons (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS door_types (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addon_types (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addon_plans (
      project_id TEXT NOT NULL,
      addon_type_id TEXT NOT NULL,
      qty_planned TEXT NOT NULL,
      PRIMARY KEY (project_id, addon_type_id)
    );

    CREATE TABLE IF NOT EXISTS addon_facts (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      addon_type_id TEXT NOT NULL,
      installer_id TEXT,
      qty_done TEXT NOT NULL,
      done_at TEXT NOT NULL,
      comment TEXT,
      source TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY NOT NULL,
      door_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_events (
      client_event_id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL,
      happened_at TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      last_attempt_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pending_events_status_retry
      ON pending_events(status, next_retry_at, created_at);

    CREATE TABLE IF NOT EXISTS installer_earnings_snapshots (
      period_key TEXT PRIMARY KEY NOT NULL,
      currency TEXT NOT NULL,
      today_total TEXT NOT NULL,
      month_total TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installer_calendar_snapshots (
      range_key TEXT PRIMARY KEY NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  ddl: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${ddl};`);
}

async function normalizeAddonPlansSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TABLE IF EXISTS addon_plans_v8;

    CREATE TABLE addon_plans_v8 (
      project_id TEXT NOT NULL,
      addon_type_id TEXT NOT NULL,
      qty_planned TEXT NOT NULL,
      PRIMARY KEY (project_id, addon_type_id)
    );

    INSERT OR REPLACE INTO addon_plans_v8(project_id, addon_type_id, qty_planned)
    SELECT project_id, addon_type_id, qty_planned
    FROM addon_plans;

    DROP TABLE addon_plans;
    ALTER TABLE addon_plans_v8 RENAME TO addon_plans;
  `);
}

async function migrateDb(db: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = Number(versionRow?.user_version || 0);

  if (currentVersion < 2) {
    await ensureColumn(db, "pending_events", "attempts", "attempts INTEGER NOT NULL DEFAULT 0");
    await ensureColumn(db, "pending_events", "next_retry_at", "next_retry_at TEXT");
    await ensureColumn(db, "pending_events", "last_attempt_at", "last_attempt_at TEXT");
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_pending_events_status_retry
        ON pending_events(status, next_retry_at, created_at);
    `);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS installer_earnings_snapshots (
        period_key TEXT PRIMARY KEY NOT NULL,
        currency TEXT NOT NULL,
        today_total TEXT NOT NULL,
        month_total TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  if (currentVersion < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS installer_calendar_snapshots (
        range_key TEXT PRIMARY KEY NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  if (currentVersion < 5) {
    await ensureColumn(db, "projects", "whatsapp_url", "whatsapp_url TEXT");
    await ensureColumn(db, "projects", "call_url", "call_url TEXT");
  }

  if (currentVersion < 7) {
    await ensureColumn(db, "doors", "version", "version INTEGER NOT NULL DEFAULT 0");
  }

  if (currentVersion < 8) {
    await normalizeAddonPlansSchema(db);
  }

  if (currentVersion < 9) {
    await ensureColumn(
      db,
      "projects",
      "lifecycle_status",
      "lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'"
    );
    await ensureColumn(
      db,
      "projects",
      "health_status",
      "health_status TEXT NOT NULL DEFAULT 'NORMAL'"
    );
  }

  if (currentVersion !== DB_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DB_SCHEMA_VERSION};`);
  }
}

function normalizeIdentityPart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`Invalid ${label} for local database activation`);
  }
  return normalized;
}

function buildOwnerKey(companyId: string, userId: string): string {
  return `${companyId}:${userId}`;
}

function buildAccountDbName(companyId: string, userId: string): string {
  return `dimax_mobile_${companyId}_${userId}.db`;
}

async function readDatabaseOwner(db: SQLite.SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = ?",
    [DB_OWNER_STATE_KEY]
  );
  return row?.value ?? null;
}

async function bindDatabaseOwner(
  db: SQLite.SQLiteDatabase,
  ownerKey: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_state(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [DB_OWNER_STATE_KEY, ownerKey]
  );
}

async function openInitializedDatabase(
  dbName: string
): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(dbName);
  try {
    await createBaseSchema(db);
    await migrateDb(db);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function closeActiveDatabase(): Promise<void> {
  const current = dbPromise;
  dbPromise = null;
  activeOwnerKey = null;
  activeDbName = null;
  if (current) {
    const db = await current;
    await db.closeAsync();
  }
}

async function selectDatabaseForOwner(
  ownerKey: string,
  companyId: string,
  userId: string
): Promise<{ db: SQLite.SQLiteDatabase; dbName: string }> {
  if (legacyOwnerKey === undefined) {
    const legacyDb = await openInitializedDatabase(LEGACY_DB_NAME);
    const storedOwner = await readDatabaseOwner(legacyDb);
    legacyOwnerKey = storedOwner;

    if (storedOwner === null) {
      await bindDatabaseOwner(legacyDb, ownerKey);
      legacyOwnerKey = ownerKey;
      return { db: legacyDb, dbName: LEGACY_DB_NAME };
    }
    if (storedOwner === ownerKey) {
      return { db: legacyDb, dbName: LEGACY_DB_NAME };
    }
    await legacyDb.closeAsync();
  } else if (legacyOwnerKey === ownerKey) {
    return {
      db: await openInitializedDatabase(LEGACY_DB_NAME),
      dbName: LEGACY_DB_NAME,
    };
  }

  const dbName = buildAccountDbName(companyId, userId);
  const db = await openInitializedDatabase(dbName);
  const storedOwner = await readDatabaseOwner(db);
  if (storedOwner !== null && storedOwner !== ownerKey) {
    await db.closeAsync();
    throw new Error("Local database owner does not match the authenticated user");
  }
  if (storedOwner === null) {
    await bindDatabaseOwner(db, ownerKey);
  }
  return { db, dbName };
}

async function activateDatabase(
  companyId: string,
  userId: string
): Promise<void> {
  const normalizedCompanyId = normalizeIdentityPart(companyId, "company ID");
  const normalizedUserId = normalizeIdentityPart(userId, "user ID");
  const ownerKey = buildOwnerKey(normalizedCompanyId, normalizedUserId);

  if (activeOwnerKey === ownerKey && dbPromise) {
    await dbPromise;
    return;
  }

  await closeActiveDatabase();
  const selected = await selectDatabaseForOwner(
    ownerKey,
    normalizedCompanyId,
    normalizedUserId
  );
  activeOwnerKey = ownerKey;
  activeDbName = selected.dbName;
  dbPromise = Promise.resolve(selected.db);
}

export function activateDbForIdentity(
  companyId: string,
  userId: string
): Promise<void> {
  const task = activationTail.then(() => activateDatabase(companyId, userId));
  activationTail = task.catch(() => undefined);
  return task;
}

export function deactivateDb(): Promise<void> {
  const task = activationTail.then(() => closeActiveDatabase());
  activationTail = task.catch(() => undefined);
  return task;
}

export async function initDb(): Promise<void> {
  await getDb();
}

export async function setState(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_state(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function getState(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}
