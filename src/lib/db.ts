import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const DB_SCHEMA_VERSION = 3;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("dimax_mobile.db");
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
      waze_url TEXT,
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
      client_price TEXT NOT NULL,
      installer_price TEXT NOT NULL,
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

  if (currentVersion !== DB_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DB_SCHEMA_VERSION};`);
  }
}

export async function initDb(): Promise<void> {
  const db = await getDb();
  await createBaseSchema(db);
  await migrateDb(db);
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
