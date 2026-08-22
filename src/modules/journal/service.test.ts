import { beforeEach, describe, expect, it, vi } from "vitest";

import { NetworkError } from "@/lib/errors";
import {
  loadInstallerJournal,
  loadInstallerJournals,
  markInstallerJournalReady,
  openJournalUrl,
  openSignedJournalPdf,
  prepareInstallerJournal,
} from "@/modules/journal/service";
import type { InstallerJournalDetails } from "@/modules/journal/types";

const apiFetchMock = vi.fn();
const openUrlMock = vi.fn();
const getJournalSnapshotMock = vi.fn();
const listJournalSnapshotsMock = vi.fn();
const saveJournalSnapshotMock = vi.fn();
const saveJournalSnapshotsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

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
    getJournalSnapshotMock.mockReset();
    listJournalSnapshotsMock.mockReset();
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
      { method: "POST" },
    );
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
      { method: "POST" },
    );
    expect(openUrlMock).toHaveBeenCalledWith(
      "https://api.dimax.test/api/v1/public/files/token",
    );
  });
});
