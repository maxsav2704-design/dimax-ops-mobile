import { describe, expect, it } from "vitest";

import { mergeJournalSnapshot } from "@/modules/journal/snapshot";
import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
} from "@/modules/journal/types";

const summary: InstallerJournalSummary = {
  id: "journal-1",
  project_id: "project-1",
  project_name: "North Tower",
  project_address: "Tel Aviv",
  developer_company: "Builder Ltd",
  developer_email: "builder@example.com",
  status: "ACTIVE",
  completed_doors: 1,
  completed_addons: 0,
  signed_at: null,
  signer_name: null,
  email_delivery_status: "NONE",
  email_last_error: null,
  can_submit: false,
};

describe("mergeJournalSnapshot", () => {
  it("preserves detailed completed work while refreshing summary state", () => {
    const details: InstallerJournalDetails = {
      ...summary,
      status: "DRAFT",
      title: "Acceptance",
      snapshot_version: 2,
      public_token_expires_at: null,
      signing_url: null,
      doors: [
        {
          unit_label: "A-101",
          door_type_name: "Fire door",
          installed_at: "2026-08-29T08:00:00Z",
        },
      ],
      addon_items: [],
    };

    const merged = mergeJournalSnapshot(summary, details);

    expect(merged.status).toBe("ACTIVE");
    expect("doors" in merged && merged.doors).toEqual(details.doors);
    expect("snapshot_version" in merged && merged.snapshot_version).toBe(2);
  });

  it("uses a new summary when no detailed cache exists", () => {
    expect(mergeJournalSnapshot(summary, null)).toEqual(summary);
  });
});
