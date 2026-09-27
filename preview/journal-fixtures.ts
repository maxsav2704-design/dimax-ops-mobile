import type { InstallerJournalDetails, JournalLoadResult } from "../src/modules/journal/types";
import type { JournalWorkspace } from "../src/modules/journal/workspace";

let source: "online" | "cache" | "unavailable" = "online";
let documents: InstallerJournalDetails[];
export function setJournalPreviewSource(value: typeof source) { source = value; }
export function resetJournalPreview() {
  const draft: InstallerJournalDetails = {
    id: "draft-001", project_id: "preview-project", project_name: "DIMAX / Tower A", project_address: "14 Herzl, Ashdod",
    developer_company: "Preview Developer", developer_email: "developer@example.test", status: "DRAFT", completed_doors: 3, completed_addons: 1,
    signed_at: null, signer_name: null, email_delivery_status: "NONE", email_last_error: null, can_submit: true, title: "Acceptance", pdf_locale: "ru",
    snapshot_version: 2, public_token_expires_at: null, signing_url: null,
    doors: ["A-2-201-ENTRANCE-D1", "A-2-202-FIRE-RESISTANT-EXTRA-LONG-POSITION", "A-2-203-MAMAD-D3"].map((unit_label) => ({ unit_label, door_type_name: "Entrance / Fire / Mamad", installed_at: "2026-09-27T09:00:00Z" })),
    addon_items: [{ name: "Door adjustment / Регулировка двери / כיוון דלת", quantity: "1.25", unit: "h", done_at: "2026-09-27T10:00:00Z", comment: "Completed on site / Выполнено на объекте / בוצע באתר" }],
  };
  documents = [draft, { ...draft, id: "signed-002", status: "ARCHIVED", can_submit: false, signer_name: "Test Developer", signed_at: "2026-09-27T10:30:00Z", email_delivery_status: "FAILED" },
    { ...draft, id: "expired-003", status: "ACTIVE", can_submit: false, public_token_expires_at: "2026-01-01T00:00:00Z" }];
}
resetJournalPreview();
async function delay() { await new Promise((resolve) => setTimeout(resolve, 400)); if (source === "unavailable") throw new Error("TEST unavailable"); }
export async function loadJournalWorkspace(): Promise<JournalLoadResult<JournalWorkspace>> {
  await delay();
  return { data: { projects: [{ id: "preview-project", name: "DIMAX / Tower A", address: "14 Herzl, Ashdod", installedLocally: 4 }, { id: "new-project", name: "DIMAX / Tower B", address: null, installedLocally: 2 }], journals: structuredClone(documents), localUnavailable: false }, source: source === "cache" ? "cache" : "online", message: null };
}
export async function loadInstallerJournal(id: string): Promise<JournalLoadResult<InstallerJournalDetails>> {
  await delay(); const document = documents.find((item) => item.id === id); if (!document) throw new Error("TEST document not found");
  return { data: structuredClone(document), source: source === "cache" ? "cache" : "online", message: null };
}
export async function prepareInstallerJournal(projectId: string) {
  await delay();
  const document = { ...documents[0], id: "prepared-004", project_id: projectId, project_name: "DIMAX / Tower B", status: "DRAFT" as const, can_submit: true };
  documents.push(document); return structuredClone(document);
}
export async function refreshInstallerJournal(id: string) { return (await loadInstallerJournal(id)).data; }
export async function markInstallerJournalReady(id: string) {
  await delay();
  const document = documents.find((item) => item.id === id)!;
  const link = { signing_url: "https://example.test/acceptance/preview-only", public_token_expires_at: new Date(Date.now() + 86400000).toISOString() };
  Object.assign(document, link, { status: "ACTIVE", can_submit: false }); return link;
}
export async function openJournalUrl() { throw new Error("TEST: external signing is disabled"); }
export async function openSignedJournalPdf() { throw new Error("TEST: PDF launch is disabled"); }
