import { beforeEach, describe, expect, it, vi } from "vitest";

const { databases, openDatabaseAsyncMock } = vi.hoisted(() => {
  const databases = new Map<string, any>();

  const createDatabase = (name: string) => {
    const state = new Map<string, string | null>();
    const database: any = {
      name,
      state,
      pendingEvents: new Set<string>(),
      userVersion: 7,
    };

    database.execAsync = vi.fn(async (sql: string) => {
      const versionMatch = String(sql).match(/PRAGMA user_version = (\d+)/);
      if (versionMatch) {
        database.userVersion = Number(versionMatch[1]);
      }
    });
    database.getFirstAsync = vi.fn(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("PRAGMA user_version")) {
        return { user_version: database.userVersion };
      }
      if (String(sql).includes("SELECT value FROM sync_state")) {
        const key = String(params?.[0]);
        return { value: state.get(key) ?? null };
      }
      return null;
    });
    database.getAllAsync = vi.fn(async () => []);
    database.runAsync = vi.fn(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("INSERT INTO sync_state")) {
        state.set(String(params?.[0]), (params?.[1] as string | null) ?? null);
      }
      return { changes: 1, lastInsertRowId: 0 };
    });
    database.closeAsync = vi.fn(async () => undefined);
    return database;
  };

  const openDatabaseAsyncMock = vi.fn(async (name: string) => {
    if (!databases.has(name)) {
      databases.set(name, createDatabase(name));
    }
    return databases.get(name);
  });

  return { databases, openDatabaseAsyncMock };
});

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: openDatabaseAsyncMock,
}));

describe("mobile SQLite schema and account isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    databases.clear();
    openDatabaseAsyncMock.mockClear();
  });

  it("keeps add-on plans price-free and binds the legacy database to its first owner", async () => {
    const { activateDbForIdentity, initDb } = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");

    await activateDbForIdentity("company-a", "user-a");
    await initDb();

    const database = databases.get("dimax_mobile.db");
    const executedSql = database.execAsync.mock.calls
      .map(([sql]: [unknown]) => String(sql))
      .join("\n");

    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS addon_plans");
    expect(executedSql).toContain("CREATE TABLE addon_plans_v8");
    expect(executedSql).toContain("PRAGMA user_version = 9");
    expect(executedSql).toContain("lifecycle_status TEXT NOT NULL");
    expect(executedSql).toContain("health_status TEXT NOT NULL");
    expect(executedSql).not.toContain("client_price");
    expect(executedSql).not.toContain("installer_price");
    expect(database.state.get("database_owner")).toBe("company-a:user-a");
  });

  it("does not expose a database before an authenticated identity is activated", async () => {
    const { getDb } = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");

    await expect(getDb()).rejects.toThrow(
      "Local database is not activated for an authenticated user"
    );
  });

  it("uses separate files per account and preserves each account outbox", async () => {
    const {
      activateDbForIdentity,
      getDb,
      getState,
      setState,
    } = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");

    await activateDbForIdentity("company-a", "user-a");
    const databaseA = (await getDb()) as any;
    databaseA.pendingEvents.add("event-a");
    await setState("cursor", "11");

    await activateDbForIdentity("company-a", "user-b");
    const databaseB = (await getDb()) as any;
    databaseB.pendingEvents.add("event-b");
    await setState("cursor", "22");

    expect(databaseB).not.toBe(databaseA);
    expect(databaseB.name).toBe("dimax_mobile_company-a_user-b.db");
    expect(await getState("cursor")).toBe("22");
    expect(databaseA.closeAsync).toHaveBeenCalledTimes(1);

    await activateDbForIdentity("company-a", "user-a");

    expect(await getDb()).toBe(databaseA);
    expect(await getState("cursor")).toBe("11");
    expect(databaseA.pendingEvents).toEqual(new Set(["event-a"]));
    expect(databaseB.pendingEvents).toEqual(new Set(["event-b"]));

    const allSql = [...databases.values()]
      .flatMap((database) => database.execAsync.mock.calls)
      .map(([sql]) => String(sql))
      .join("\n");
    expect(allSql).not.toContain("DELETE FROM pending_events");
    expect(allSql).not.toContain("DROP TABLE pending_events");
  });

  it("persists the legacy owner decision across an application restart", async () => {
    const firstRuntime = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
    await firstRuntime.activateDbForIdentity("company-a", "user-a");
    await firstRuntime.deactivateDb();

    vi.resetModules();
    openDatabaseAsyncMock.mockClear();

    const secondRuntime = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
    await secondRuntime.activateDbForIdentity("company-a", "user-b");

    expect(openDatabaseAsyncMock.mock.calls.map(([name]) => name)).toEqual([
      "dimax_mobile.db",
      "dimax_mobile_company-a_user-b.db",
    ]);
    expect(databases.get("dimax_mobile.db").state.get("database_owner")).toBe(
      "company-a:user-a"
    );
    expect(
      databases
        .get("dimax_mobile_company-a_user-b.db")
        .state.get("database_owner")
    ).toBe("company-a:user-b");
  });
});
