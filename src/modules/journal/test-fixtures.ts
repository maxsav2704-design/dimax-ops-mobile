import type { InstallerJournalDetails } from "./types";

export const journalFixture: InstallerJournalDetails = {
  id: "journal-a", project_id: "project-a", project_name: "Tower A", project_address: "Test address",
  developer_company: "Test Developer", developer_email: "developer@example.test", status: "DRAFT",
  completed_doors: 1, completed_addons: 1, signed_at: null, signer_name: null,
  email_delivery_status: "NONE", email_last_error: null, can_submit: true, title: "Work acceptance", pdf_locale: "en",
  snapshot_version: 2, public_token_expires_at: null, signing_url: null,
  doors: [{ unit_label: "A-2-201-EN-201", door_type_name: "Entrance door", installed_at: "2026-09-27T09:00:00Z" }],
  addon_items: [{ name: "Door adjustment", quantity: "1.25", unit: "hours", done_at: "2026-09-27T10:00:00Z", comment: "Test completed work" }],
};
