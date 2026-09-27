import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, NetworkError } from "@/lib/errors";
import {
  loadInstallerJournal,
  loadInstallerJournals,
  markInstallerJournalReady,
  openJournalUrl,
  openSignedJournalPdf,
  prepareInstallerJournal,
  refreshInstallerJournal,
} from "@/modules/journal/service";
import type { InstallerJournalDetails } from "@/modules/journal/types";

const apiFetchMock = vi.fn();
const openUrlMock = vi.fn();
const getJournalSnapshotMock = vi.fn();
const listJournalSnapshotsMock = vi.fn();
const saveJournalSnapshotMock = vi.fn();
const saveJournalSnapshotsMock = vi.fn();
const removeJournalSnapshotMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  getAuthSessionGeneration: () => 0,
}));

vi.mock("@/lib/db", () => {
  const context = { ownerKey: "company:installer" };
  return {
    getDatabaseContext: () => context,
    withDatabaseContext: async (_context: unknown, operation: () => Promise<unknown>) => operation(),
  };
});

vi.mock("expo-linking", () => ({
  openURL: (...args: unknown[]) => openUrlMock(...args),
}));

vi.mock("@/modules/journal/repository", () => ({
  getJournalSnapshot: (...args: unknown[]) => getJournalSnapshotMock(...args),
  listJournalSnapshots: (...args: unknown[]) =>
    listJournalSnapshotsMock(...args),
  saveJournalSnapshot: (...args: unknown[]) => saveJournalSnapshotMock(...args),
  saveJournalSnapshots: (...args: unknown[]) =>
    saveJournalSnapshotsMock(...args),
  removeJournalSnapshot: (...args: unknown[]) => removeJournalSnapshotMock(...args),
}));

const journal: InstallerJournalDetails = {
  id: "journal-1",
  project_id: "project-1",
  project_name: "Azrieli North",
  project_address: "Tel Aviv",
  developer_company: "Builder Ltd",
  developer_email: "site@builder.test",
  status: "DRAFT",
  completed_doors: 2,
  completed_addons: 1,
  signed_at: null,
  signer_name: null,
  email_delivery_status: "NONE",
  email_last_error: null,
  can_submit: true,
  title: "Work acceptance",
  snapshot_version: 1,
  public_token_expires_at: null,
  signing_url: null,
  doors: [],
  addon_items: [],
};

describe("installer journal service", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    openUrlMock.mockReset();
    getJournalSnapshotMock.mockReset().mockResolvedValue(null);
    listJournalSnapshotsMock.mockReset().mockResolvedValue([]);
    removeJournalSnapshotMock.mockReset().mockResolvedValue(undefined);
    saveJournalSnapshotMock.mockReset().mockResolvedValue(undefined);
    saveJournalSnapshotsMock.mockReset().mockResolvedValue(undefined);
  });

  it("loads and stores the online journal list", async () => {
    apiFetchMock.mockResolvedValue({ items: [journal] });

    const result = await loadInstallerJournals();

    expect(result.source).toBe("online");
    expect(result.data).toEqual([journal]);
    expect(saveJournalSnapshotsMock).toHaveBeenCalledWith([journal]);
  });

  it("keeps fresh data when SQLite cannot save the offline copy", async () => {
    apiFetchMock.mockResolvedValue({ items: [journal] });
    saveJournalSnapshotsMock.mockRejectedValue(new Error("database busy"));

    const result = await loadInstallerJournals();

    expect(result.source).toBe("online");
    expect(result.data).toEqual([journal]);
    expect(result.message).toContain("could not be saved");
  });

  it("falls back to the saved journal on a network failure", async () => {
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getJournalSnapshotMock.mockResolvedValue(journal);

    const result = await loadInstallerJournal(journal.id);

    expect(result.source).toBe("cache");
    expect(result.data).toEqual(journal);
  });

  it("prepares a project journal without failing on a cache write error", async () => {
    apiFetchMock.mockResolvedValue(journal);
    saveJournalSnapshotMock.mockRejectedValue(new Error("database busy"));

    await expect(prepareInstallerJournal("project-1")).resolves.toEqual(
      journal,
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/journals/prepare",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the protected mark-ready endpoint", async () => {
    apiFetchMock.mockResolvedValue({
      signing_url: "https://app.dimax.test/acceptance/token",
      public_token_expires_at: "2026-09-01T12:00:00Z",
    });

    const response = await markInstallerJournalReady(journal.id);

    expect(response.signing_url).toContain("/acceptance/");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/journals/journal-1/mark-ready",
      { method: "POST", expectedAuthGeneration: 0 },
    );
  });

  it.each(["en", "ru", "he"] as const)("prepares the PDF in %s without changing the workspace guard", async (locale) => {
    const localized = { ...journal, pdf_locale: locale };
    apiFetchMock.mockResolvedValue(localized);
    await prepareInstallerJournal("project-1", locale);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/journals/prepare",
      { method: "POST", body: JSON.stringify({ project_id: "project-1", pdf_locale: locale }), expectedAuthGeneration: 0 },
    );
    expect(saveJournalSnapshotMock).toHaveBeenCalledWith(localized);
  });

  it("opens only HTTP(S) journal links", async () => {
    await openJournalUrl("https://app.dimax.test/acceptance/token");
    await expect(
      openJournalUrl("file:///private/document.pdf"),
    ).rejects.toThrow("HTTP or HTTPS");

    expect(openUrlMock).toHaveBeenCalledTimes(1);
  });

  it("requests a short-lived signed PDF link before opening it", async () => {
    apiFetchMock.mockResolvedValue({
      url: "https://api.dimax.test/api/v1/public/files/token",
      ttl_sec: 3600,
      uses: 3,
    });

    await openSignedJournalPdf(journal.id);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/installer/journals/journal-1/pdf-link",
      { method: "POST", expectedAuthGeneration: 0 },
    );
    expect(openUrlMock).toHaveBeenCalledWith(
      "https://api.dimax.test/api/v1/public/files/token",
    );
  });

  it.each([401, 403, 404])("does not reveal a cached act after HTTP %s", async (status) => {
    const error = new ApiError("denied", status, "");
    apiFetchMock.mockRejectedValue(error);
    getJournalSnapshotMock.mockResolvedValue(journal);
    await expect(loadInstallerJournal(journal.id)).rejects.toBe(error);
    expect(getJournalSnapshotMock).not.toHaveBeenCalled();
    expect(removeJournalSnapshotMock).toHaveBeenCalledTimes(status === 401 ? 0 : 1);
  });

  it("does not fall back to an authorized list after permission denial", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("forbidden", 403, ""));
    listJournalSnapshotsMock.mockResolvedValue([journal]);
    await expect(loadInstallerJournals()).rejects.toThrow("forbidden");
    expect(listJournalSnapshotsMock).not.toHaveBeenCalled();
    expect(saveJournalSnapshotsMock).toHaveBeenCalledWith([]);
  });

  it("does not store malformed nested rows or a different journal", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...journal, doors: [{}] }).mockResolvedValueOnce({ ...journal, id: "other" });
    await expect(loadInstallerJournal(journal.id)).rejects.toThrow("contract");
    await expect(loadInstallerJournal(journal.id)).rejects.toThrow("contract");
    expect(saveJournalSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not store a duplicate list or a mismatched prepared project", async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [journal, journal] }).mockResolvedValueOnce(journal);
    await expect(loadInstallerJournals()).rejects.toThrow("contract");
    await expect(prepareInstallerJournal("other-project")).rejects.toThrow("requested project");
    expect(saveJournalSnapshotsMock).not.toHaveBeenCalled();
    expect(saveJournalSnapshotMock).not.toHaveBeenCalled();
  });

  it("refuses a summary-only or wrong-ID cache as document details", async () => {
    apiFetchMock.mockRejectedValue(new NetworkError("offline"));
    getJournalSnapshotMock.mockResolvedValueOnce({ ...journal, doors: undefined }).mockResolvedValueOnce({ ...journal, id: "other" });
    await expect(loadInstallerJournal(journal.id)).rejects.toThrow("offline");
    await expect(loadInstallerJournal(journal.id)).rejects.toThrow("offline");
  });

  it("does not let an old detail response resurrect an act removed by a newer list", async () => {
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ items: [] });
    const old = loadInstallerJournal(journal.id);
    await loadInstallerJournals();
    resolve(journal); await old;
    expect(saveJournalSnapshotsMock).toHaveBeenCalledWith([]);
    expect(saveJournalSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not let an old list regress a newer refreshed snapshot", async () => {
    let resolve!: (value: unknown) => void;
    apiFetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ ...journal, snapshot_version: 5 });
    const old = loadInstallerJournals();
    await refreshInstallerJournal(journal.id);
    resolve({ items: [journal] }); await old;
    expect(saveJournalSnapshotsMock).not.toHaveBeenCalled();
    expect(saveJournalSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({ snapshot_version: 5 }));
  });

  it("stores the confirmed ACTIVE transition without re-fetching a stale draft", async () => {
    const link = { signing_url: "https://app.dimax.test/acceptance/token", public_token_expires_at: "2027-09-01T12:00:00Z" };
    apiFetchMock.mockResolvedValue(link); getJournalSnapshotMock.mockResolvedValue(journal);
    await markInstallerJournalReady(journal.id);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(saveJournalSnapshotMock).toHaveBeenCalledWith({ ...journal, ...link, status: "ACTIVE", can_submit: false });
  });
});
