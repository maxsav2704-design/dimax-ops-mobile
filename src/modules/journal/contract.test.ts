import { describe, expect, it } from "vitest";
import { isJournalDetails, isJournalList, isJournalSummary } from "./contract";
import { journalFixture as journal } from "./test-fixtures";
import { journalGroups } from "./presentation";

describe("journal contracts", () => {
  it("accepts the documented server shape", () => {
    expect(isJournalDetails(journal)).toBe(true);
    expect(isJournalList({ items: [journal] })).toBe(true);
    expect(isJournalList({ items: [] })).toBe(true);
  });
  it.each([{ status: "UNKNOWN" }, { completed_doors: -1 }, { completed_addons: 1.5 }, { signed_at: "not-a-date" }, { can_submit: "true" }, { developer_email: undefined }])("rejects malformed summaries: %j", (patch) => {
    expect(isJournalSummary({ ...journal, ...patch })).toBe(false);
  });
  it.each([{ doors: [{}] }, { doors: null }, { snapshot_version: "2" }, { public_token_expires_at: "broken" }, { pdf_locale: "fr" }, { addon_items: [{ ...journal.addon_items[0], quantity: "NaN" }] }])("rejects malformed detail fields: %j", (patch) => {
    expect(isJournalDetails({ ...journal, ...patch })).toBe(false);
  });
  it("rejects duplicate document IDs but allows several acts per project", () => {
    expect(isJournalList({ items: [journal, journal] })).toBe(false);
    expect(isJournalList({ items: [journal, { ...journal, id: "second" }] })).toBe(true);
  });
  it("keeps every document per project and filters documents, not an arbitrary last entry", () => {
    const workspace = { projects: [], localUnavailable: false, journals: [journal, { ...journal, id: "signed", status: "ARCHIVED" as const }, { ...journal, id: "active", status: "ACTIVE" as const }] };
    expect(journalGroups(workspace, "ALL")[0].journals.map((item) => item.id)).toEqual(["active", "journal-a", "signed"]);
    expect(journalGroups(workspace, "DRAFT")[0].journals.map((item) => item.id)).toEqual(["journal-a"]);
    expect(journalGroups(workspace, "ARCHIVED")[0].journals.map((item) => item.id)).toEqual(["signed"]);
  });
});
