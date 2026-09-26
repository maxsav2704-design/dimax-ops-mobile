import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError, SessionChangedError } from "@/lib/errors";

const { apiFetchMock, identity, cacheRead, cacheWrite, openUrlMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  identity: { database: null as { ownerKey: string } | null, generation: 0 },
  cacheRead: vi.fn(),
  cacheWrite: vi.fn(),
  openUrlMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
  getAuthSessionGeneration: () => identity.generation,
}));
vi.mock("@/lib/db", () => ({
  getDatabaseContext: () => identity.database,
  withDatabaseContext: async (context: unknown, operation: () => Promise<unknown>) => {
    if (!context || context !== identity.database) throw new SessionChangedError();
    return operation();
  },
}));
vi.mock("expo-linking", () => ({ openURL: openUrlMock }));
vi.mock("@/modules/calendar/repository", () => ({
  getCalendarSnapshot: cacheRead,
  saveCalendarSnapshot: cacheWrite,
}));
vi.mock("@/modules/earnings/repository", () => ({
  getEarningsSnapshot: cacheRead,
  saveEarningsSnapshot: cacheWrite,
}));
vi.mock("@/modules/journal/repository", () => ({
  getJournalSnapshot: cacheRead,
  listJournalSnapshots: cacheRead,
  saveJournalSnapshot: cacheWrite,
  saveJournalSnapshots: cacheWrite,
}));
vi.mock("@/modules/projects/repository", () => ({ hydrateProjectDetails: cacheWrite }));
vi.mock("@/modules/sync/service", () => ({ getSyncQueueSummary: async () => ({ pending: 0, failed: 0, blocked: 0 }) }));

import { loadInstallerCalendar } from "@/modules/calendar/service";
import { loadInstallerEarnings } from "@/modules/earnings/service";
import {
  loadInstallerJournal, loadInstallerJournals, prepareInstallerJournal, refreshInstallerJournal,
  markInstallerJournalReady, openSignedJournalPdf,
} from "@/modules/journal/service";
import { refreshProjectDetails } from "@/modules/projects/service";

const earnings = {
  period_key: "2026-09", currency: "ILS", today_total: "100.00", month_total: "100.00",
  days: [], install_types: [], rows: [], generated_at: null,
};
const journal = { id: "journal-a", project_id: "project-a", doors: [], addon_items: [] };
const loads = [
  { name: "calendar", run: () => loadInstallerCalendar(), response: { items: [] } },
  { name: "earnings", run: () => loadInstallerEarnings("month", "2026-09-14"), response: earnings },
  { name: "journal list", run: () => loadInstallerJournals(), response: { items: [journal] } },
  { name: "journal details", run: () => loadInstallerJournal("journal-a"), response: journal },
];
const operations = [
  ...loads,
  { name: "prepare journal", run: () => prepareInstallerJournal("project-a"), response: journal },
  { name: "refresh journal", run: () => refreshInstallerJournal("journal-a"), response: journal },
  { name: "project details", run: () => refreshProjectDetails("project-a"), response: { id: "project-a" } },
];
const journalLinks = [
  { name: "mark journal ready", run: () => markInstallerJournalReady("journal-a"), response: { signing_url: "https://dimax.test/sign/a" } },
  { name: "open signed PDF", run: () => openSignedJournalPdf("journal-a"), response: { url: "https://dimax.test/pdf/a" } },
];
const requests = [...operations, ...journalLinks];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("authenticated mobile cache isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    identity.database = { ownerKey: "company-a:installer-a" };
    identity.generation = 10;
    cacheWrite.mockResolvedValue(undefined);
    cacheRead.mockResolvedValue(null);
  });

  describe.each(["database", "login", "logout", "return"])("after a %s change", (change) => {
    it.each(requests)("$name rejects a late response without cache or link side effects", async ({ run, response }) => {
      const started = deferred<void>();
      const reply = deferred<unknown>();
      apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
      const result = run().catch((error: unknown) => error);
      await started.promise;
      if (change === "login") identity.generation += 1;
      else if (change === "logout") identity.database = null;
      else identity.database = { ownerKey: change === "return" ? "company-a:installer-a" : "company-a:installer-b" };
      reply.resolve(response);

      expect(await result).toBeInstanceOf(SessionChangedError);
      expect(cacheWrite).not.toHaveBeenCalled();
      expect(cacheRead).not.toHaveBeenCalled();
      expect(openUrlMock).not.toHaveBeenCalled();
    });
  });

  it.each(loads)("$name never treats a rejected session as an offline fallback", async ({ run }) => {
    apiFetchMock.mockRejectedValueOnce(new SessionChangedError());

    await expect(run()).rejects.toBeInstanceOf(SessionChangedError);
    expect(cacheRead).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it.each(loads)("$name does not read the next account's cache after a late network failure", async ({ run }) => {
    const started = deferred<void>();
    const reply = deferred<unknown>();
    apiFetchMock.mockImplementationOnce(() => { started.resolve(); return reply.promise; });
    const result = run().catch((error: unknown) => error);
    await started.promise;
    identity.database = { ownerKey: "company-b:installer-b" };
    reply.reject(new NetworkError("offline"));

    expect(await result).toBeInstanceOf(SessionChangedError);
    expect(cacheRead).not.toHaveBeenCalled();
  });

  it.each(requests)("$name binds dispatch to the original login generation", async ({ run, response }) => {
    apiFetchMock.mockResolvedValueOnce(response);
    await run();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ expectedAuthGeneration: 10 }));
  });

  it.each(requests)("$name does not dispatch without an active database identity", async ({ run }) => {
    identity.database = null;
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(cacheRead).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it.each(operations)("$name does not return stale data if login changes during a cache write", async ({ run, response }) => {
    apiFetchMock.mockResolvedValueOnce(response);
    cacheWrite.mockImplementationOnce(async () => { identity.generation += 1; });
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError);
    expect(cacheRead).not.toHaveBeenCalled();
  });

  it.each(loads)("$name does not return stale cached data if login changes during a read", async ({ run }) => {
    apiFetchMock.mockRejectedValueOnce(new NetworkError("offline"));
    cacheRead.mockImplementationOnce(async () => { identity.generation += 1; return []; });
    await expect(run()).rejects.toBeInstanceOf(SessionChangedError);
  });
});
