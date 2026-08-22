import type {
  InstallerJournalDetails,
  InstallerJournalSummary,
} from "@/modules/journal/types";

export function mergeJournalSnapshot(
  summary: InstallerJournalSummary,
  existing: InstallerJournalDetails | null,
): InstallerJournalSummary | InstallerJournalDetails {
  if (!existing) return summary;
  return { ...existing, ...summary };
}
